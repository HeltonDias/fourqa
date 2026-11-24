package com.fourqa.api.persistence;

import com.fourqa.api.config.Env;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Pool + dialect switch shared by every JDBC store (Postgres operational, SQLite local/tests). */
public final class Database implements AutoCloseable {
  public enum Dialect {
    POSTGRES,
    SQLITE
  }

  private static final Pattern PG_URL = Pattern.compile("postgres(?:ql)?://\\S+", Pattern.CASE_INSENSITIVE);
  private static final Pattern PASSWORD = Pattern.compile("password[=:]\\s*\\S+", Pattern.CASE_INSENSITIVE);
  private static volatile Database instance;

  public final Dialect dialect;
  private final HikariDataSource dataSource;

  private Database(Dialect dialect, HikariDataSource dataSource) {
    this.dialect = dialect;
    this.dataSource = dataSource;
  }

  @FunctionalInterface
  public interface TxWork<T> {
    T run(Conn conn) throws SQLException;
  }

  public static class PersistenceProviderError extends RuntimeException {
    public PersistenceProviderError(String message) {
      super(message);
    }
  }

  public static String publicDbError(Throwable err) {
    String message = err == null || err.getMessage() == null ? "erro de banco" : err.getMessage();
    message = PG_URL.matcher(message).replaceAll("postgresql://***");
    return PASSWORD.matcher(message).replaceAll("password=***");
  }

  public static Dialect resolveProvider(String value) {
    String name = value == null ? "" : value.strip().toLowerCase();
    if (name.isEmpty() || name.equals("sqlite")) return Dialect.SQLITE;
    if (name.equals("postgres")) return Dialect.POSTGRES;
    throw new PersistenceProviderError("DB_PROVIDER \"" + value.strip() + "\" is not supported.");
  }

  public static Database get() {
    Database db = instance;
    if (db != null) return db;
    synchronized (Database.class) {
      if (instance == null) instance = open();
      return instance;
    }
  }

  public static synchronized void reset() {
    if (instance != null) instance.close();
    instance = null;
    Migrations.resetCache();
  }

  private static Database open() {
    Dialect dialect = resolveProvider(Env.value("DB_PROVIDER"));
    HikariConfig cfg = new HikariConfig();
    cfg.setPoolName("fourqa-" + dialect.name().toLowerCase());
    cfg.setConnectionTimeout(15_000);
    if (dialect == Dialect.SQLITE) {
      Path path = sqlitePath();
      try {
        if (path.getParent() != null) Files.createDirectories(path.getParent());
      } catch (IOException e) {
        throw new PersistenceProviderError(e.getMessage());
      }
      cfg.setJdbcUrl("jdbc:sqlite:" + path.toAbsolutePath());
      cfg.setMaximumPoolSize(1);
      cfg.addDataSourceProperty("journal_mode", "WAL");
      cfg.addDataSourceProperty("busy_timeout", "10000");
      cfg.addDataSourceProperty("foreign_keys", "true");
    } else {
      String url = Env.value("DATABASE_URL");
      if (url.isEmpty()) throw new PersistenceProviderError("DATABASE_URL is required when DB_PROVIDER=postgres");
      PostgresUrl pg = PostgresUrl.parse(url);
      cfg.setJdbcUrl(pg.jdbcUrl());
      if (pg.user() != null) cfg.setUsername(pg.user());
      if (pg.password() != null) cfg.setPassword(pg.password());
      cfg.setMinimumIdle(Env.hosted() ? 1 : 4);
      cfg.setMaximumPoolSize(Env.hosted() ? 4 : 10);
    }
    return new Database(dialect, new HikariDataSource(cfg));
  }

  static Path sqlitePath() {
    String configured = Env.raw("FOURQA_DB");
    if (configured != null && !configured.isBlank()) return Path.of(configured.strip());
    for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
      if (Files.exists(dir.resolve("package.json")) && Files.isDirectory(dir.resolve("frontend")))
        return dir.resolve("data").resolve("fourqa.db");
    }
    return Path.of("data", "fourqa.db");
  }

  public boolean isPostgres() {
    return dialect == Dialect.POSTGRES;
  }

  @Override
  public void close() {
    dataSource.close();
  }

  public List<Map<String, Object>> query(String sql, Object... params) {
    try (Connection c = dataSource.getConnection()) {
      c.setAutoCommit(true);
      return new Conn(c, dialect).query(sql, params);
    } catch (SQLException e) {
      throw new DbException(e);
    }
  }

  public Map<String, Object> one(String sql, Object... params) {
    List<Map<String, Object>> rows = query(sql, params);
    return rows.isEmpty() ? null : rows.get(0);
  }

  public int execute(String sql, Object... params) {
    try (Connection c = dataSource.getConnection()) {
      c.setAutoCommit(true);
      return new Conn(c, dialect).execute(sql, params);
    } catch (SQLException e) {
      throw new DbException(e);
    }
  }

  public <T> T tx(TxWork<T> work) {
    return tx(work, null);
  }

  public <T> T tx(TxWork<T> work, String postgresLockSql) {
    try (Connection c = dataSource.getConnection()) {
      c.setAutoCommit(false);
      try {
        Conn conn = new Conn(c, dialect);
        if (postgresLockSql != null && dialect == Dialect.POSTGRES) conn.execute(postgresLockSql);
        T out = work.run(conn);
        c.commit();
        return out;
      } catch (SQLException | RuntimeException e) {
        c.rollback();
        throw e;
      } finally {
        c.setAutoCommit(true);
      }
    } catch (SQLException e) {
      throw new DbException(e);
    }
  }

  public static class DbException extends RuntimeException {
    public DbException(SQLException cause) {
      super(cause.getMessage(), cause);
    }
  }

  /** One JDBC connection with Python-shaped row mapping. */
  public static final class Conn {
    private final Connection c;
    public final Dialect dialect;

    Conn(Connection c, Dialect dialect) {
      this.c = c;
      this.dialect = dialect;
    }

    public Connection raw() {
      return c;
    }

    public List<Map<String, Object>> query(String sql, Object... params) throws SQLException {
      try (PreparedStatement ps = c.prepareStatement(sql)) {
        bind(ps, params);
        try (ResultSet rs = ps.executeQuery()) {
          return rows(rs);
        }
      }
    }

    public Map<String, Object> one(String sql, Object... params) throws SQLException {
      List<Map<String, Object>> rows = query(sql, params);
      return rows.isEmpty() ? null : rows.get(0);
    }

    public int execute(String sql, Object... params) throws SQLException {
      if (params.length == 0) {
        try (Statement st = c.createStatement()) {
          if (st.execute(sql)) return 0;
          return Math.max(st.getUpdateCount(), 0);
        }
      }
      try (PreparedStatement ps = c.prepareStatement(sql)) {
        bind(ps, params);
        if (ps.execute()) return 0;
        return Math.max(ps.getUpdateCount(), 0);
      }
    }

    /** {@code INSERT ... RETURNING id}. */
    public long insertReturningId(String sql, Object... params) throws SQLException {
      Map<String, Object> row = one(sql + " RETURNING id", params);
      if (row == null) throw new IllegalStateException("INSERT RETURNING id não retornou linha");
      return ((Number) row.get("id")).longValue();
    }

    public Array textArray(List<String> values) throws SQLException {
      return c.createArrayOf("text", values.toArray());
    }

    private void bind(PreparedStatement ps, Object[] params) throws SQLException {
      for (int i = 0; i < params.length; i++) {
        Object v = params[i];
        if (v instanceof Boolean b && dialect == Dialect.SQLITE) ps.setObject(i + 1, b ? 1 : 0);
        else if (v instanceof OffsetDateTime odt && dialect == Dialect.SQLITE) ps.setString(i + 1, PyTime.isoformat(odt));
        else ps.setObject(i + 1, v);
      }
    }

    private static List<Map<String, Object>> rows(ResultSet rs) throws SQLException {
      ResultSetMetaData md = rs.getMetaData();
      int n = md.getColumnCount();
      List<Map<String, Object>> out = new ArrayList<>();
      while (rs.next()) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 1; i <= n; i++) {
          String type = md.getColumnTypeName(i);
          Object v;
          if ("timestamptz".equalsIgnoreCase(type) || "timestamp".equalsIgnoreCase(type)) {
            OffsetDateTime odt = rs.getObject(i, OffsetDateTime.class);
            v = odt == null ? null : odt.withOffsetSameInstant(ZoneOffset.UTC);
          } else {
            v = rs.getObject(i);
          }
          row.put(md.getColumnLabel(i).toLowerCase(), normalize(v));
        }
        out.add(row);
      }
      return out;
    }

    private static Object normalize(Object v) {
      if (v instanceof Integer i) return i.longValue();
      if (v instanceof Short s) return s.longValue();
      if (v instanceof Float f) return f.doubleValue();
      if (v instanceof java.math.BigDecimal d) return d.doubleValue();
      if (v instanceof java.math.BigInteger b) return b.longValue();
      if (v instanceof Timestamp t) return t.toInstant().atOffset(ZoneOffset.UTC);
      return v;
    }
  }

  record PostgresUrl(String jdbcUrl, String user, String password) {
    private static final List<String> SSL_KEYS = List.of("sslmode", "ssl", "uselibpqcompat", "sslrootcert", "sslcert", "sslkey");

    static PostgresUrl parse(String url) {
      URI uri = URI.create(url);
      String host = uri.getHost();
      if (host == null) throw new PersistenceProviderError("DATABASE_URL inválida");
      String user = null;
      String password = null;
      if (uri.getRawUserInfo() != null) {
        String[] parts = uri.getRawUserInfo().split(":", 2);
        user = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
        if (parts.length > 1) password = URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
      }
      Map<String, String> query = new LinkedHashMap<>();
      if (uri.getRawQuery() != null) {
        for (String kv : uri.getRawQuery().split("&")) {
          if (kv.isEmpty()) continue;
          String[] p = kv.split("=", 2);
          query.put(URLDecoder.decode(p[0], StandardCharsets.UTF_8), p.length > 1 ? URLDecoder.decode(p[1], StandardCharsets.UTF_8) : "");
        }
      }
      String mode = query.getOrDefault("sslmode", "").toLowerCase();
      String sslFlag = query.getOrDefault("ssl", "").toLowerCase();
      String caFile = caFile(query);
      boolean ssl = sslEnabled(host, mode, sslFlag);
      StringBuilder jdbc = new StringBuilder("jdbc:postgresql://").append(host);
      if (uri.getPort() > 0) jdbc.append(':').append(uri.getPort());
      String path = uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/postgres" : uri.getRawPath();
      jdbc.append(path).append("?stringtype=unspecified&ApplicationName=fourqa-api");
      for (var e : query.entrySet()) {
        if (SSL_KEYS.contains(e.getKey().toLowerCase())) continue;
        jdbc.append('&').append(e.getKey()).append('=').append(e.getValue());
      }
      if (ssl) {
        if (caFile != null) jdbc.append("&sslmode=verify-ca&sslrootcert=").append(caFile);
        else jdbc.append("&sslmode=require");
      } else {
        jdbc.append("&sslmode=disable");
      }
      return new PostgresUrl(jdbc.toString(), user, password);
    }

    static boolean sslEnabled(String host, String mode, String flag) {
      if (mode.equals("disable") || flag.equals("0") || flag.equals("false")) return false;
      if (mode.equals("no-verify") || flag.equals("no-verify")) return true;
      boolean verifies = List.of("require", "verify-ca", "verify-full", "prefer", "allow").contains(mode)
          || flag.equals("1") || flag.equals("true");
      if (!mode.isEmpty() && !verifies) throw new PersistenceProviderError("sslmode da DATABASE_URL não é suportado");
      if (!flag.isEmpty() && !verifies) throw new PersistenceProviderError("parâmetro ssl da DATABASE_URL não é suportado");
      String h = host.toLowerCase();
      return verifies || h.endsWith(".supabase.co") || h.endsWith(".supabase.com");
    }

    static String caFile(Map<String, String> query) {
      String inline = Env.value("DATABASE_SSL_CA");
      try {
        if (!inline.isEmpty()) {
          if (!inline.contains("BEGIN CERTIFICATE")) throw new PersistenceProviderError("Certificado CA do PostgreSQL não está em PEM");
          Path target = Path.of(System.getProperty("java.io.tmpdir"), "fourqa-pg-ca.pem");
          Files.writeString(target, inline, StandardCharsets.UTF_8);
          return target.toString();
        }
        String configured = Env.value("DATABASE_SSL_CA_FILE");
        if (configured.isEmpty()) configured = query.getOrDefault("sslrootcert", "").strip();
        if (configured.isEmpty()) return null;
        Path p = Path.of(configured);
        if (!p.isAbsolute()) p = repoRoot().resolve(configured);
        if (!Files.isRegularFile(p)) throw new PersistenceProviderError("Arquivo CA não encontrado: " + p);
        return p.toString();
      } catch (IOException e) {
        throw new PersistenceProviderError(e.getMessage());
      }
    }

    static Path repoRoot() {
      for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent())
        if (Files.exists(dir.resolve("package.json"))) return dir;
      return Path.of("").toAbsolutePath();
    }
  }
}
