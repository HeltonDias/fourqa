package com.fourqa.api.persistence;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/** Schema bootstrap: Postgres {@code 001..006} (same files as the Python API) and SQLite {@code v1..v10}. */
public final class Migrations {
  public static final int PLANNING_CHANGE_LOG_VERSION = 4;
  public static final int SQLITE_SCHEMA_VERSION = 10;
  private static volatile boolean ensured;

  private Migrations() {}

  static void resetCache() {
    ensured = false;
  }

  public static synchronized void ensure(Database db) {
    if (ensured) return;
    if (db.isPostgres()) postgres(db);
    else sqlite(db);
    ensured = true;
  }

  private static void postgres(Database db) {
    db.tx(conn -> {
      conn.execute(
          "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      Resource[] files;
      try {
        files = new PathMatchingResourcePatternResolver().getResources("classpath:db/postgres/*.sql");
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
      java.util.Arrays.sort(files, java.util.Comparator.comparing(Resource::getFilename));
      for (Resource file : files) {
        String name = file.getFilename();
        int version = Integer.parseInt(name.split("_", 2)[0]);
        if (conn.one("SELECT 1 AS ok FROM schema_migrations WHERE version = ?", version) != null) continue;
        String sql;
        try (InputStream in = file.getInputStream()) {
          sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
          throw new IllegalStateException(e);
        }
        conn.execute(sql);
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", version, PyTime.nowMillisZ());
      }
      return null;
    });
  }

  public static int sqliteSchemaVersion(Database db) {
    try {
      Map<String, Object> row = db.one("SELECT MAX(version) AS v FROM schema_migrations");
      return row == null || row.get("v") == null ? 0 : ((Number) row.get("v")).intValue();
    } catch (RuntimeException e) {
      return 0;
    }
  }

  private static void sqlite(Database db) {
    db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    int current = sqliteSchemaVersion(db);
    for (int version = current + 1; version <= SQLITE_SCHEMA_VERSION; version++) {
      final int v = version;
      db.tx(conn -> {
        sqliteStep(conn, v);
        conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", v, PyTime.isoformat(OffsetDateTime.now(java.time.ZoneOffset.UTC)));
        return null;
      });
    }
    db.tx(conn -> {
      for (String[] col : HIERARCHY_COLUMNS) addColumn(conn, "execucoes", col[0], col[1]);
      indexIf(conn, "idx_exec_point", "execucoes", List.of("plan_key", "test_point_id"));
      return null;
    });
  }

  private static final String[][] HIERARCHY_COLUMNS = {
    {"parent_suite_id", "INTEGER"}, {"suite_depth", "INTEGER"}, {"suite_path", "TEXT"}, {"dimensions_json", "TEXT"}
  };

  private static Set<String> columns(Database.Conn conn, String table) throws SQLException {
    Set<String> cols = new HashSet<>();
    for (Map<String, Object> r : conn.query("PRAGMA table_info(" + table + ")")) cols.add(String.valueOf(r.get("name")));
    return cols;
  }

  private static void indexIf(Database.Conn conn, String name, String table, List<String> cols) throws SQLException {
    if (!columns(conn, table).containsAll(cols)) return;
    conn.execute("CREATE INDEX IF NOT EXISTS " + name + " ON " + table + "(" + String.join(", ", cols) + ")");
  }

  private static void addColumn(Database.Conn conn, String table, String column, String type) throws SQLException {
    Set<String> cols = columns(conn, table);
    if (!cols.isEmpty() && !cols.contains(column)) conn.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + type);
  }

  private static void script(Database.Conn conn, String sql) throws SQLException {
    for (String stmt : sql.split(";")) if (!stmt.isBlank()) conn.execute(stmt.strip());
  }

  private static void sqliteStep(Database.Conn conn, int version) throws SQLException {
    switch (version) {
      case 1 -> {
        script(conn, """
            CREATE TABLE IF NOT EXISTS execucoes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              plan_key TEXT, plan_id INTEGER, plan_name TEXT, frente TEXT, atalho TEXT, processo TEXT,
              suite_id INTEGER, suite_name TEXT, test_point_id INTEGER, test_case_id INTEGER,
              test_case_title TEXT, responsabilidade TEXT, test_case_state TEXT, test_point_state TEXT,
              outcome TEXT, date_completed TEXT, run_by TEXT, last_updated_date TEXT,
              last_test_run_id INTEGER, last_result_id INTEGER, test_case_link TEXT, test_case_tags TEXT
            );
            CREATE TABLE IF NOT EXISTS falhas (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              plan_key TEXT, responsavel TEXT, ambiente TEXT, categoria TEXT, bug_id INTEGER,
              impacto REAL, frente TEXT, titulo TEXT, status TEXT, criacao TEXT, fechamento TEXT,
              links TEXT, tags TEXT
            );
            CREATE TABLE IF NOT EXISTS planejamento_linhas (
              row_num INTEGER PRIMARY KEY, qa TEXT, prioridades TEXT, frente TEXT, processo TEXT,
              data_inicio TEXT, data_fim TEXT, replanejamento REAL, qtd_cts_plan REAL,
              cts_plan_dia REAL, cts_cancelados REAL
            );
            CREATE TABLE IF NOT EXISTS workbook_meta (key TEXT PRIMARY KEY, value TEXT)
            """);
        indexIf(conn, "idx_exec_plan", "execucoes", List.of("plan_key"));
        indexIf(conn, "idx_exec_suite", "execucoes", List.of("suite_name"));
        indexIf(conn, "idx_falhas_plan", "falhas", List.of("plan_key"));
        indexIf(conn, "idx_falhas_frente", "falhas", List.of("frente"));
      }
      case 2 -> {
        for (String[] col : HIERARCHY_COLUMNS) addColumn(conn, "execucoes", col[0], col[1]);
        indexIf(conn, "idx_exec_point", "execucoes", List.of("plan_key", "test_point_id"));
      }
      case 3 -> {
        script(conn, """
            CREATE TABLE IF NOT EXISTS planning (
              id INTEGER PRIMARY KEY AUTOINCREMENT, plan_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS planning_revision (
              id INTEGER PRIMARY KEY AUTOINCREMENT, planning_id INTEGER NOT NULL, version INTEGER NOT NULL,
              created_at TEXT NOT NULL, reason TEXT NOT NULL, baseline_origin TEXT NOT NULL,
              scope_snapshot INTEGER NOT NULL DEFAULT 0, UNIQUE (planning_id, version)
            );
            CREATE TABLE IF NOT EXISTS planning_item (
              id INTEGER PRIMARY KEY AUTOINCREMENT, revision_id INTEGER NOT NULL, suite_id INTEGER,
              suite_name TEXT, planned_start TEXT, planned_end TEXT, baseline_quantity REAL
            );
            CREATE TABLE IF NOT EXISTS planning_scope_item (
              id INTEGER PRIMARY KEY AUTOINCREMENT, revision_id INTEGER NOT NULL, plan_id INTEGER,
              suite_id INTEGER, test_point_id INTEGER, test_case_id INTEGER, label TEXT
            );
            CREATE TABLE IF NOT EXISTS planning_allocation (
              id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, alloc_date TEXT NOT NULL,
              planned_quantity REAL NOT NULL, UNIQUE (item_id, alloc_date)
            )
            """);
        indexIf(conn, "idx_plan_rev", "planning_revision", List.of("planning_id", "version"));
        indexIf(conn, "idx_plan_item_rev", "planning_item", List.of("revision_id"));
        indexIf(conn, "idx_plan_scope_rev", "planning_scope_item", List.of("revision_id", "test_point_id"));
        indexIf(conn, "idx_plan_alloc_item", "planning_allocation", List.of("item_id", "alloc_date"));
      }
      case 4 -> conn.execute(
          "UPDATE workbook_meta SET value = ? WHERE key = 'data_inicio' AND value = ?", "2026-08-03", "0939-08-03");
      case 5 -> {
        Map<String, Object> row = conn.one("SELECT value FROM workbook_meta WHERE key = ?", "planejamento_legado_plan_key");
        if (row != null && row.get("value") != null && !String.valueOf(row.get("value")).isBlank()) return;
        if (conn.one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'planejamento_linhas'") == null) return;
        Map<String, Object> count = conn.one("SELECT COUNT(*) AS n FROM planejamento_linhas");
        if (count == null || ((Number) count.get("n")).longValue() == 0) return;
        conn.execute("INSERT INTO workbook_meta (key, value) VALUES (?, ?)", "planejamento_legado_plan_key", "EndToEnd");
      }
      case 6 -> {
        Set<String> cols = columns(conn, "planning_item");
        if (cols.isEmpty()) return;
        for (String col : List.of("test_point_id", "test_case_id"))
          if (!cols.contains(col)) conn.execute("ALTER TABLE planning_item ADD COLUMN " + col + " INTEGER");
        script(conn, """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item_suite
              ON planning_item (revision_id, suite_id) WHERE suite_id IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item_point
              ON planning_item (revision_id, test_point_id) WHERE suite_id IS NULL AND test_point_id IS NOT NULL
            """);
      }
      case 7 -> {
        Set<String> cols = columns(conn, "planning_item");
        if (cols.isEmpty()) return;
        for (String col : List.of("responsavel", "prioridade"))
          if (!cols.contains(col)) conn.execute("ALTER TABLE planning_item ADD COLUMN " + col + " TEXT");
      }
      case 8 -> {
        script(conn, """
            CREATE TABLE IF NOT EXISTS planning_change_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT, planning_id INTEGER NOT NULL, created_at TEXT NOT NULL,
              actor TEXT, suite_id INTEGER, test_point_id INTEGER, suite_name TEXT, field TEXT NOT NULL,
              alloc_date TEXT, old_value TEXT, new_value TEXT
            )
            """);
        indexIf(conn, "idx_plan_change_log", "planning_change_log", List.of("planning_id", "created_at"));
      }
      case 9 -> {
        script(conn, """
            CREATE TABLE IF NOT EXISTS app_user (
              id INTEGER PRIMARY KEY AUTOINCREMENT, ado_profile_id TEXT NOT NULL UNIQUE, email TEXT,
              display_name TEXT, global_role TEXT NOT NULL DEFAULT 'qa', created_at TEXT NOT NULL,
              last_login_at TEXT
            );
            CREATE TABLE IF NOT EXISTS user_credential (
              user_id INTEGER PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
              pat_encrypted TEXT NOT NULL, org_hint TEXT, validated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS qa_connection (
              id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, project TEXT NOT NULL,
              test_plan_id INTEGER NOT NULL, test_plan_name TEXT, plan_key TEXT NOT NULL UNIQUE,
              title TEXT, legacy INTEGER NOT NULL DEFAULT 0,
              created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL, created_at TEXT NOT NULL,
              UNIQUE (org, project, test_plan_id)
            );
            CREATE TABLE IF NOT EXISTS connection_member (
              connection_id INTEGER NOT NULL REFERENCES qa_connection(id) ON DELETE CASCADE,
              user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
              role TEXT, added_at TEXT NOT NULL, PRIMARY KEY (connection_id, user_id)
            )
            """);
        indexIf(conn, "idx_connection_member_user", "connection_member", List.of("user_id"));
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_connection_plan_key_lower ON qa_connection (lower(plan_key))");
      }
      case 10 -> {
        script(conn, """
            CREATE TABLE IF NOT EXISTS connection_invite (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              connection_id INTEGER NOT NULL REFERENCES qa_connection(id) ON DELETE CASCADE,
              email TEXT NOT NULL,
              role TEXT NOT NULL,
              invited_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
              created_at TEXT NOT NULL,
              UNIQUE (connection_id, email)
            )
            """);
        indexIf(conn, "idx_connection_invite_email", "connection_invite", List.of("email"));
      }
      default -> throw new IllegalArgumentException("versão desconhecida " + version);
    }
  }
}
