package com.fourqa.api.persistence;

import com.fourqa.api.util.Py;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Durable Azure snapshot ({@code execucoes}, {@code falhas}, batch {@code workbook_meta}). */
public final class JdbcAzureSnapshotStore implements AzureSnapshotStore {
  public static final List<String> EXECUCAO_COLUMNS = List.of(
      "plan_key", "plan_id", "plan_name", "frente", "atalho", "processo", "suite_id", "suite_name",
      "parent_suite_id", "suite_depth", "suite_path", "dimensions_json", "test_point_id", "test_case_id",
      "test_case_title", "responsabilidade", "test_case_state", "test_point_state", "outcome",
      "date_completed", "run_by", "last_updated_date", "last_test_run_id", "last_result_id",
      "test_case_link", "test_case_tags");
  public static final List<String> FALHA_COLUMNS = List.of(
      "plan_key", "responsavel", "ambiente", "categoria", "bug_id", "impacto", "frente",
      "titulo", "status", "criacao", "fechamento", "links", "tags");
  static final Set<String> EXEC_INT = Set.of(
      "id", "plan_id", "suite_id", "parent_suite_id", "suite_depth", "test_point_id", "test_case_id",
      "last_test_run_id", "last_result_id");
  static final Set<String> FALHA_NUM = Set.of("id", "bug_id", "impacto");
  public static final List<String> EXEC_SEARCH = List.of(
      "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
      "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags");
  public static final List<String> FALHA_SEARCH = List.of(
      "plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags");
  static final String REPLACE_LOCK = "LOCK TABLE execucoes, falhas, workbook_meta IN EXCLUSIVE MODE";

  private final Database db;

  public JdbcAzureSnapshotStore(Database db) {
    this.db = db;
  }

  static String likeParam(String q) {
    return "%" + q.replaceAll("([\\\\%_])", "\\\\$1") + "%";
  }

  static Object number(Object v) {
    if (v == null) return null;
    if (Py.isNumber(v)) return v;
    String s = Py.str(v).strip();
    if (s.isEmpty()) throw new IllegalArgumentException("Valor numérico inválido vindo do PostgreSQL");
    double d = Double.parseDouble(s);
    return Py.intIfWhole(d);
  }

  static Map<String, Object> execOf(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (var e : row.entrySet())
      out.put(e.getKey(), EXEC_INT.contains(e.getKey()) ? number(e.getValue()) : PyTime.text(e.getValue()));
    return out;
  }

  static Map<String, Object> falhaOf(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (var e : row.entrySet())
      out.put(e.getKey(), FALHA_NUM.contains(e.getKey()) ? number(e.getValue()) : PyTime.text(e.getValue()));
    return out;
  }

  private static void insertRows(Database.Conn conn, String table, List<String> columns, List<Map<String, Object>> rows)
      throws SQLException {
    String sql = "INSERT INTO " + table + " (" + String.join(", ", columns) + ") VALUES ("
        + String.join(", ", java.util.Collections.nCopies(columns.size(), "?")) + ")";
    try (var ps = conn.raw().prepareStatement(sql)) {
      int pending = 0;
      for (Map<String, Object> row : rows) {
        for (int i = 0; i < columns.size(); i++) {
          Object v = row.get(columns.get(i));
          if (v instanceof Boolean b) v = b ? 1 : 0;
          ps.setObject(i + 1, v);
        }
        ps.addBatch();
        if (++pending >= 500) {
          ps.executeBatch();
          pending = 0;
        }
      }
      if (pending > 0) ps.executeBatch();
    }
  }

  @SuppressWarnings("unchecked")
  public static void applySnapshotOnClient(Database.Conn conn, Map<String, Object> input) throws SQLException {
    if (input.containsKey("plan_keys")) {
      List<String> keys = new ArrayList<>();
      for (Object k : (List<Object>) input.get("plan_keys")) {
        String s = Py.str(k).strip().toLowerCase();
        if (!s.isEmpty()) keys.add(s);
      }
      if (!keys.isEmpty()) {
        String ph = String.join(", ", java.util.Collections.nCopies(keys.size(), "?"));
        conn.execute("DELETE FROM execucoes WHERE lower(plan_key) IN (" + ph + ")", keys.toArray());
        conn.execute("DELETE FROM falhas WHERE lower(plan_key) IN (" + ph + ")", keys.toArray());
      }
    } else {
      conn.execute("DELETE FROM execucoes");
      conn.execute("DELETE FROM falhas");
    }
    insertRows(conn, "execucoes", EXECUCAO_COLUMNS, Py.rows(input.get("execucoes")));
    insertRows(conn, "falhas", FALHA_COLUMNS, Py.rows(input.get("falhas")));
    Map<String, Object> meta = Py.map(input.get("meta"));
    if (meta != null) {
      for (var e : meta.entrySet()) {
        if (e.getKey().equals("sync_job")) continue;
        conn.execute(JdbcMetaStore.UPSERT, e.getKey(), e.getValue() == null ? null : String.valueOf(e.getValue()));
      }
    }
  }

  @Override
  public void replaceSnapshot(Map<String, Object> snapshot) {
    db.tx(conn -> {
      applySnapshotOnClient(conn, snapshot);
      return null;
    }, REPLACE_LOCK);
  }

  @Override
  public List<Map<String, Object>> listExecucoes(String planKey) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : db.query("SELECT * FROM execucoes WHERE plan_key = ? ORDER BY id", planKey)) out.add(execOf(r));
    return out;
  }

  @Override
  public List<Map<String, Object>> listFalhas(String planKey) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : db.query("SELECT * FROM falhas WHERE plan_key = ? ORDER BY id", planKey)) out.add(falhaOf(r));
    return out;
  }

  private Map<String, Object> page(String table, List<String> columns, Map<String, Object> params, boolean exec) {
    List<String> where = new ArrayList<>(List.of("plan_key = ?"));
    List<Object> args = new ArrayList<>();
    args.add(PlanKeys.requiredPlanKey(Py.text(params.get("plan_key"))));
    String q = Py.truthy(params.get("q")) ? Py.str(params.get("q")) : "";
    if (!q.isEmpty()) {
      String like = likeParam(q);
      String op = db.isPostgres() ? "ILIKE" : "LIKE";
      List<String> parts = new ArrayList<>();
      for (String column : columns) {
        args.add(like);
        parts.add(column + " " + op + " ? ESCAPE '\\'");
      }
      where.add("(" + String.join(" OR ", parts) + ")");
    }
    String clause = "WHERE " + String.join(" AND ", where);
    Map<String, Object> totalRow = db.one("SELECT COUNT(*) AS n FROM " + table + " " + clause, args.toArray());
    long total = totalRow == null ? 0 : Py.toLong(totalRow.get("n"));
    args.add(params.get("limit"));
    args.add(params.get("offset"));
    List<Map<String, Object>> rows = db.query("SELECT * FROM " + table + " " + clause + " ORDER BY id LIMIT ? OFFSET ?", args.toArray());
    List<Map<String, Object>> mapped = new ArrayList<>();
    for (Map<String, Object> r : rows) mapped.add(exec ? execOf(r) : falhaOf(r));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("total", total);
    out.put("limit", params.get("limit"));
    out.put("offset", params.get("offset"));
    out.put("rows", mapped);
    return out;
  }

  @Override
  public Map<String, Object> queryExecucoes(Map<String, Object> params) {
    return page("execucoes", EXEC_SEARCH, params, true);
  }

  @Override
  public Map<String, Object> queryFalhas(Map<String, Object> params) {
    return page("falhas", FALHA_SEARCH, params, false);
  }
}
