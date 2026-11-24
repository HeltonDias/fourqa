package com.fourqa.api.persistence;

import com.fourqa.api.domain.Planning;
import com.fourqa.api.util.Py;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Planning revisions, schedule items, allocations and change log. */
public final class PlanningStore {
  static final String REVISION_SQL = "SELECT r.id, r.version, r.created_at, r.reason, r.baseline_origin, r.scope_snapshot"
      + " FROM planning_revision r JOIN planning p ON p.id = r.planning_id WHERE p.plan_key = ?";
  public static final String BATCH_HISTORY_UNAVAILABLE = "Histórico de planejamento indisponível. Nenhuma alteração foi gravada.";

  private final Database db;

  public PlanningStore(Database db) {
    this.db = db;
  }

  private static Long intOrNull(Object v) {
    Object n = JdbcAzureSnapshotStore.number(v);
    return n == null ? null : Py.toLong(n);
  }

  private static String textOr(Object v) {
    String t = PyTime.text(v);
    return t == null ? "" : t;
  }

  static Map<String, Object> revisionOf(Map<String, Object> row) {
    if (row == null) return null;
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", Py.toLong(row.get("id")));
    out.put("version", Py.toLong(row.get("version")));
    out.put("created_at", textOr(row.get("created_at")));
    out.put("reason", textOr(row.get("reason")));
    out.put("baseline_origin", textOr(row.get("baseline_origin")));
    Object flag = row.get("scope_snapshot");
    out.put("scope_snapshot", flag instanceof Boolean b ? (b ? 1L : 0L) : Py.toLong(flag));
    return out;
  }

  public Map<String, Object> latestRevision(String planKey) {
    return revisionOf(db.one(REVISION_SQL + " ORDER BY r.version DESC LIMIT 1", planKey));
  }

  public Map<String, Object> revisionByVersion(String planKey, long version) {
    return revisionOf(db.one(REVISION_SQL + " AND r.version = ?", planKey, version));
  }

  public List<Map<String, Object>> listRevisions(String planKey) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> row : db.query(
        "SELECT r.version, r.created_at, r.reason FROM planning_revision r JOIN planning p ON p.id = r.planning_id"
            + " WHERE p.plan_key = ? ORDER BY r.version",
        planKey)) {
      out.add(Py.obj("version", Py.toLong(row.get("version")), "createdAt", textOr(row.get("created_at")), "reason", textOr(row.get("reason"))));
    }
    return out;
  }

  public List<Map<String, Object>> loadScope(long revisionId) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> row : db.query(
        "SELECT plan_id, suite_id, test_point_id, test_case_id, label FROM planning_scope_item WHERE revision_id = ?", revisionId)) {
      Map<String, Object> r = new LinkedHashMap<>();
      r.put("plan_id", intOrNull(row.get("plan_id")));
      r.put("suite_id", intOrNull(row.get("suite_id")));
      r.put("test_point_id", intOrNull(row.get("test_point_id")));
      r.put("test_case_id", intOrNull(row.get("test_case_id")));
      r.put("label", PyTime.text(row.get("label")));
      out.add(r);
    }
    return out;
  }

  public List<Map<String, Object>> loadSchedule(long revisionId) {
    List<Map<String, Object>> items = db.query(
        "SELECT id, suite_id, suite_name, test_point_id, test_case_id, planned_start, planned_end, baseline_quantity, responsavel,"
            + " prioridade FROM planning_item WHERE revision_id = ?",
        revisionId);
    List<Map<String, Object>> allocs = db.query(
        "SELECT a.item_id, a.alloc_date, a.planned_quantity FROM planning_allocation a JOIN planning_item i ON i.id = a.item_id"
            + " WHERE i.revision_id = ?",
        revisionId);
    Map<Long, List<Map<String, Object>>> byItem = new LinkedHashMap<>();
    for (Map<String, Object> row : allocs) {
      long itemId = Py.toLong(row.get("item_id"));
      byItem.computeIfAbsent(itemId, k -> new ArrayList<>())
          .add(Py.obj("date", textOr(row.get("alloc_date")), "quantity", JdbcAzureSnapshotStore.number(row.get("planned_quantity"))));
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> item : items) {
      long id = Py.toLong(item.get("id"));
      Map<String, Object> r = new LinkedHashMap<>();
      r.put("id", id);
      r.put("suite_id", intOrNull(item.get("suite_id")));
      r.put("suite_name", PyTime.text(item.get("suite_name")));
      r.put("test_point_id", intOrNull(item.get("test_point_id")));
      r.put("test_case_id", intOrNull(item.get("test_case_id")));
      r.put("planned_start", PyTime.text(item.get("planned_start")));
      r.put("planned_end", PyTime.text(item.get("planned_end")));
      r.put("baseline_quantity", JdbcAzureSnapshotStore.number(item.get("baseline_quantity")));
      r.put("responsavel", PyTime.text(item.get("responsavel")));
      r.put("prioridade", PyTime.text(item.get("prioridade")));
      r.put("allocations", byItem.getOrDefault(id, new ArrayList<>()));
      out.add(r);
    }
    return out;
  }

  /** input: plan_key, created_at, version, reason, baseline_origin, scope_snapshot, scope, items. */
  public long commitRevision(Map<String, Object> input) {
    return db.tx(conn -> {
      Map<String, Object> existing = conn.one("SELECT id FROM planning WHERE plan_key = ?", input.get("plan_key"));
      long planningId = existing != null
          ? Py.toLong(existing.get("id"))
          : conn.insertReturningId("INSERT INTO planning (plan_key, created_at) VALUES (?, ?)", input.get("plan_key"), input.get("created_at"));
      long revisionId = conn.insertReturningId(
          "INSERT INTO planning_revision (planning_id, version, created_at, reason, baseline_origin, scope_snapshot) VALUES (?, ?, ?, ?, ?, ?)",
          planningId, input.get("version"), input.get("created_at"), input.get("reason"), input.get("baseline_origin"), input.get("scope_snapshot"));
      for (Map<String, Object> item : Py.rows(Py.or(input.get("scope"), List.of()))) {
        conn.execute(
            "INSERT INTO planning_scope_item (revision_id, plan_id, suite_id, test_point_id, test_case_id, label) VALUES (?, ?, ?, ?, ?, ?)",
            revisionId, item.get("plan_id"), item.get("suite_id"), item.get("test_point_id"), item.get("test_case_id"), item.get("label"));
      }
      for (Map<String, Object> item : Py.rows(Py.or(input.get("items"), List.of()))) {
        long itemId = conn.insertReturningId(
            "INSERT INTO planning_item (revision_id, suite_id, suite_name, test_point_id, test_case_id, planned_start, planned_end,"
                + " baseline_quantity, responsavel, prioridade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            revisionId, item.get("suite_id"), item.get("suite_name"), item.get("test_point_id"), item.get("test_case_id"),
            item.get("planned_start"), item.get("planned_end"), toDoubleOrNull(item.get("baseline_quantity")),
            Planning.normalizeSuiteFill(Py.text(item.get("responsavel"))), Planning.normalizeSuiteFill(Py.text(item.get("prioridade"))));
        for (Map<String, Object> alloc : Py.rows(Py.or(item.get("allocations"), List.of()))) {
          conn.execute(
              "INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)",
              itemId, alloc.get("date"), toDoubleOrNull(alloc.get("quantity")));
        }
      }
      return revisionId;
    });
  }

  private static Object toDoubleOrNull(Object v) {
    return v == null ? null : (Object) Py.toDouble(v);
  }

  private void applyCell(Database.Conn conn, Map<String, Object> input) throws SQLException {
    String field = Py.str(input.get("field"));
    Object itemId = input.get("item_id");
    switch (field) {
      case "day" -> {
        conn.execute("DELETE FROM planning_allocation WHERE item_id = ? AND alloc_date = ?", itemId, input.get("date"));
        if (Py.toDouble(input.get("quantity")) > 0)
          conn.execute(
              "INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)",
              itemId, input.get("date"), Py.toDouble(input.get("quantity")));
      }
      case "responsavel" -> conn.execute(
          "UPDATE planning_item SET responsavel = ? WHERE id = ?", Planning.normalizeSuiteFill(Py.text(input.get("value"))), itemId);
      case "prioridade" -> conn.execute(
          "UPDATE planning_item SET prioridade = ? WHERE id = ?", Planning.normalizeSuiteFill(Py.text(input.get("value"))), itemId);
      case "start" -> conn.execute("UPDATE planning_item SET planned_start = ? WHERE id = ?", input.get("date"), itemId);
      case "end" -> conn.execute("UPDATE planning_item SET planned_end = ? WHERE id = ?", input.get("date"), itemId);
      default -> throw new IllegalArgumentException("Campo de planejamento não suportado ('" + field + "')");
    }
  }

  private static Long planningIdForKey(Database.Conn conn, Object planKey) throws SQLException {
    Map<String, Object> row = conn.one("SELECT id FROM planning WHERE plan_key = ?", planKey);
    return row == null ? null : Py.toLong(row.get("id"));
  }

  private static void insertChangeLog(Database.Conn conn, Map<String, Object> input) throws SQLException {
    Long planningId = planningIdForKey(conn, input.get("plan_key"));
    if (planningId == null) return;
    Object createdAt = conn.dialect == Database.Dialect.POSTGRES ? PyTime.nowUtc() : PyTime.nowIso();
    Object actor = Py.truthy(input.get("actor")) ? input.get("actor") : MetaScope.currentActorName();
    conn.execute(
        "INSERT INTO planning_change_log (planning_id, created_at, actor, suite_id, test_point_id, suite_name, field, alloc_date,"
            + " old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        planningId, createdAt, actor, input.get("suite_id"), input.get("test_point_id"), input.get("suite_name"),
        input.get("field"), input.get("alloc_date"), input.get("old_value"), input.get("new_value"));
  }

  /** input: field, item_id, date, quantity, value, change_log. */
  public void saveCell(Map<String, Object> input) {
    db.tx(conn -> {
      applyCell(conn, input);
      Map<String, Object> log = Py.map(input.get("change_log"));
      if (Py.truthy(log)) insertChangeLog(conn, log);
      return null;
    });
  }

  private void assertBatch(Database.Conn conn, List<Map<String, Object>> inputs) throws SQLException {
    for (Map<String, Object> inp : inputs) if (inp.get("change_log") == null) throw new IllegalStateException(BATCH_HISTORY_UNAVAILABLE);
    String planKey = null;
    Object revisionId = null;
    for (Map<String, Object> inp : inputs) {
      if (planKey == null && Py.truthy(inp.get("plan_key"))) planKey = Py.str(inp.get("plan_key"));
      if (revisionId == null && inp.get("revision_id") != null) revisionId = inp.get("revision_id");
    }
    if (planKey != null && revisionId != null) {
      Map<String, Object> latest = revisionOf(conn.one(REVISION_SQL + " ORDER BY r.version DESC LIMIT 1", planKey));
      if (latest == null || !Py.eq(latest.get("id"), revisionId)) throw new PlanningConflictError(PlanningConflictError.BASELINE_REVISED);
    }
    for (Map<String, Object> inp : inputs) {
      if (revisionId != null
          && conn.one("SELECT 1 AS ok FROM planning_item WHERE id = ? AND revision_id = ?", inp.get("item_id"), revisionId) == null)
        throw new PlanningConflictError(PlanningConflictError.ITEM_OUT_OF_REVISION);
      if (!Py.truthy(inp.get("guard"))) continue;
      Object field = inp.get("field");
      if ("day".equals(field)) {
        Map<String, Object> row = conn.one(
            "SELECT planned_quantity FROM planning_allocation WHERE item_id = ? AND alloc_date = ?", inp.get("item_id"), inp.get("date"));
        double qty = row == null ? 0 : Py.toDouble(row.get("planned_quantity"));
        if (Math.abs(qty - Py.toDouble(inp.get("expected_quantity"))) > 1e-9) throw new PlanningConflictError(PlanningConflictError.CELL_CHANGED);
      } else if ("start".equals(field) || "end".equals(field)) {
        String column = "start".equals(field) ? "planned_start" : "planned_end";
        Map<String, Object> row = conn.one("SELECT " + column + " AS value FROM planning_item WHERE id = ?", inp.get("item_id"));
        Object stored = row == null ? null : row.get("value");
        String storedText = stored == null || "".equals(stored) ? "" : Planning.calendarDate(Py.str(stored));
        String expectedText = Py.truthy(inp.get("expected_text")) ? Planning.calendarDate(Py.str(inp.get("expected_text"))) : "";
        if (!java.util.Objects.equals(storedText, expectedText)) throw new PlanningConflictError(PlanningConflictError.CELL_CHANGED);
      }
    }
  }

  public void saveCells(List<Map<String, Object>> inputs) {
    if (inputs.isEmpty()) return;
    db.tx(conn -> {
      assertBatch(conn, inputs);
      for (Map<String, Object> inp : inputs) {
        applyCell(conn, inp);
        Map<String, Object> log = Py.map(inp.get("change_log"));
        if (!Py.truthy(log) || planningIdForKey(conn, log.get("plan_key")) == null)
          throw new IllegalStateException(BATCH_HISTORY_UNAVAILABLE);
        insertChangeLog(conn, log);
      }
      return null;
    });
  }

  public void appendChangeLog(Map<String, Object> input) {
    db.tx(conn -> {
      insertChangeLog(conn, input);
      return null;
    });
  }

  public List<Map<String, Object>> listChangeLog(String planKey, int limit) {
    Map<String, Object> p = db.one("SELECT id FROM planning WHERE plan_key = ?", planKey);
    if (p == null) return new ArrayList<>();
    int cap = Math.min(Math.max(1, limit), 1000);
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> row : db.query(
        "SELECT id, created_at, actor, suite_id, test_point_id, suite_name, field, alloc_date, old_value, new_value"
            + " FROM planning_change_log WHERE planning_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        Py.toLong(p.get("id")), cap)) {
      Map<String, Object> r = new LinkedHashMap<>();
      r.put("id", Py.toLong(row.get("id")));
      r.put("created_at", textOr(row.get("created_at")));
      r.put("actor", PyTime.text(row.get("actor")));
      r.put("suite_id", intOrNull(row.get("suite_id")));
      r.put("test_point_id", intOrNull(row.get("test_point_id")));
      r.put("suite_name", PyTime.text(row.get("suite_name")));
      r.put("field", textOr(row.get("field")));
      r.put("alloc_date", PyTime.text(row.get("alloc_date")));
      r.put("old_value", PyTime.text(row.get("old_value")));
      r.put("new_value", PyTime.text(row.get("new_value")));
      out.add(r);
    }
    return out;
  }

  public boolean changeLogSupported() {
    if (db.isPostgres())
      return db.one("SELECT 1 AS ok FROM schema_migrations WHERE version = ?", Migrations.PLANNING_CHANGE_LOG_VERSION) != null;
    return db.one("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'planning_change_log'") != null;
  }
}
