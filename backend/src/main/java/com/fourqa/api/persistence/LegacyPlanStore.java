package com.fourqa.api.persistence;

import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Read-only {@code planejamento_linhas} (legacy spreadsheet plan). */
public final class LegacyPlanStore {
  private final Database db;

  public LegacyPlanStore(Database db) {
    this.db = db;
  }

  private static Object numberOr(Object v, Object fallback) {
    Object n = JdbcAzureSnapshotStore.number(v);
    return Py.truthy(n) ? n : fallback;
  }

  public List<Map<String, Object>> listBase() {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> row : db.query(
        "SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim, replanejamento, qtd_cts_plan, cts_plan_dia,"
            + " cts_cancelados FROM planejamento_linhas ORDER BY row_num")) {
      Map<String, Object> r = new LinkedHashMap<>();
      Object rowNum = JdbcAzureSnapshotStore.number(row.get("row_num"));
      r.put("row_num", Py.truthy(rowNum) ? (Object) Py.toLong(rowNum) : (Object) 0L);
      r.put("qa", PyTime.text(row.get("qa")));
      r.put("prioridades", PyTime.text(row.get("prioridades")));
      r.put("frente", PyTime.text(row.get("frente")));
      r.put("processo", PyTime.text(row.get("processo")));
      r.put("data_inicio", PyTime.text(row.get("data_inicio")));
      r.put("data_fim", PyTime.text(row.get("data_fim")));
      r.put("replanejamento", numberOr(row.get("replanejamento"), 0L));
      r.put("qtd_cts_plan", JdbcAzureSnapshotStore.number(row.get("qtd_cts_plan")));
      r.put("cts_plan_dia", JdbcAzureSnapshotStore.number(row.get("cts_plan_dia")));
      r.put("cts_cancelados", numberOr(row.get("cts_cancelados"), 0L));
      out.add(r);
    }
    return out;
  }
}
