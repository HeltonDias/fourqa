package com.fourqa.api.persistence;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** {@code workbook_meta} store (Postgres: advisory locks for compare-and-set; SQLite: single writer). */
public final class JdbcMetaStore implements MetaStore {
  static final String UPSERT =
      "INSERT INTO workbook_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value";

  private final Database db;

  public JdbcMetaStore(Database db) {
    this.db = db;
  }

  private static String cell(Map<String, Object> row) {
    if (row == null) return null;
    Object v = row.get("value");
    return v == null ? null : String.valueOf(v);
  }

  @Override
  public String get(String key) {
    return cell(db.one("SELECT value FROM workbook_meta WHERE key = ?", MetaScope.scopedMetaKey(key)));
  }

  @Override
  public Map<String, String> getMany(List<String> keys) {
    List<String> unique = new ArrayList<>(new LinkedHashSet<>(keys));
    Map<String, String> out = new LinkedHashMap<>();
    for (String k : unique) out.put(k, null);
    if (unique.isEmpty()) return out;
    Map<String, String> storedToKey = new LinkedHashMap<>();
    for (String k : unique) storedToKey.put(MetaScope.scopedMetaKey(k), k);
    String placeholders = String.join(", ", java.util.Collections.nCopies(storedToKey.size(), "?"));
    List<Map<String, Object>> rows =
        db.query("SELECT key, value FROM workbook_meta WHERE key IN (" + placeholders + ")", storedToKey.keySet().toArray());
    for (Map<String, Object> row : rows) {
      Object stored = row.get("key");
      String key = stored == null ? null : storedToKey.get(String.valueOf(stored));
      if (key == null) continue;
      out.put(key, row.get("value") == null ? null : String.valueOf(row.get("value")));
    }
    return out;
  }

  @Override
  public void set(String key, String value) {
    db.execute(UPSERT, MetaScope.scopedMetaKey(key), value);
  }

  @Override
  public void setMany(Map<String, String> entries) {
    db.tx(conn -> {
      for (var e : entries.entrySet()) conn.execute(UPSERT, MetaScope.scopedMetaKey(e.getKey()), e.getValue());
      return null;
    });
  }

  private void lockKey(Database.Conn conn, String key) throws SQLException {
    if (conn.dialect == Database.Dialect.POSTGRES)
      conn.execute("SELECT pg_advisory_xact_lock(hashtext(?))", "fourqa-meta:" + key);
  }

  private static String read(Database.Conn conn, String key) throws SQLException {
    return cell(conn.one("SELECT value FROM workbook_meta WHERE key = ?", key));
  }

  @Override
  public void replaceHeaderIf(
      String expectedTitle, String expectedSubtitle, String title, String subtitle, String defaultTitle, String defaultSubtitle) {
    String kTitle = MetaScope.scopedMetaKey("cabecalho_titulo");
    String kLegacy = MetaScope.scopedMetaKey("title");
    String kSubtitle = MetaScope.scopedMetaKey("cabecalho_subtitulo");
    db.tx(conn -> {
      List<String> keys = new ArrayList<>(List.of(kSubtitle, kTitle, kLegacy));
      java.util.Collections.sort(keys);
      for (String k : keys) lockKey(conn, k);
      String saved = read(conn, kTitle);
      String legacy = read(conn, kLegacy);
      String subSaved = read(conn, kSubtitle);
      String effectiveTitle = firstNonEmpty(saved, legacy, defaultTitle).strip();
      String effectiveSubtitle = firstNonEmpty(subSaved, defaultSubtitle).strip();
      if (!effectiveTitle.equals(expectedTitle.strip()) || !effectiveSubtitle.equals(expectedSubtitle.strip()))
        throw new PlanningConflictError(PlanningConflictError.HEADER_CHANGED);
      conn.execute(UPSERT, kTitle, title.strip());
      conn.execute(UPSERT, kSubtitle, subtitle.strip());
      return null;
    });
  }

  @Override
  public void replacePeriodIf(String expectedInicio, String expectedFim, String inicio, String fim) {
    String kInicio = MetaScope.scopedMetaKey("data_inicio");
    String kFim = MetaScope.scopedMetaKey("data_fim");
    db.tx(conn -> {
      List<String> keys = new ArrayList<>(List.of(kFim, kInicio));
      java.util.Collections.sort(keys);
      for (String k : keys) lockKey(conn, k);
      String a = read(conn, kInicio);
      String b = read(conn, kFim);
      String currentInicio = a == null ? "" : a;
      String currentFim = b == null ? "" : b;
      if (!currentInicio.equals(expectedInicio) || !currentFim.equals(expectedFim))
        throw new PlanningConflictError(PlanningConflictError.PERIOD_CHANGED);
      conn.execute(UPSERT, kInicio, inicio);
      conn.execute(UPSERT, kFim, fim);
      return null;
    });
  }

  static String firstNonEmpty(String... values) {
    for (String v : values) if (v != null && !v.isEmpty()) return v;
    return values[values.length - 1] == null ? "" : values[values.length - 1];
  }
}
