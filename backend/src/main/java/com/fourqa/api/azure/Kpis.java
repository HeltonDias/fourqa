package com.fourqa.api.azure;

import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/** Home KPI impact calculation (port of {@code fourqa.azure.kpis}). */
public final class Kpis {
  static final int KPI_RUN_CONCURRENCY = 4;

  private Kpis() {}

  public static Map<String, Object> calculateKpiImpactos(
      AzureClient client, List<Map<String, Object>> execRows, Map<Long, Map<String, Object>> bugMeta, Report report) {
    List<long[]> scenarios = new ArrayList<>();
    for (Map<String, Object> r : execRows) {
      String outcome = AzureUtil.normalize(Py.or(r.get("outcome"), ""));
      if (outcome.equals("failed") || outcome.equals("blocked"))
        scenarios.add(new long[] {Py.toLong(r.get("last_test_run_id")), Py.toLong(r.get("last_result_id"))});
    }
    Map<String, Object> stats = new LinkedHashMap<>();
    stats.put("total", (long) scenarios.size());
    stats.put("foursys", 0L);
    stats.put("cliente", 0L);
    stats.put("reteste", 0L);
    stats.put("semResultadoMapeado", 0L);
    stats.put("calculadoEm", PyTime.isoformat(PyTime.nowUtc()));
    if (scenarios.isEmpty()) return stats;
    TreeSet<Long> runSet = new TreeSet<>();
    for (long[] s : scenarios) if (s[0] > 0) runSet.add(s[0]);
    List<Long> runIds = new ArrayList<>(runSet);
    Map<String, List<Long>> bugsByResult = new LinkedHashMap<>();
    List<List<Map<String, Object>>> perRun = AzureUtil.mapInBatches(
        runIds, KPI_RUN_CONCURRENCY, runId -> Falhas.getRunResultsWithBugs(client, runId), (d, t) -> report.step("KPIs da Home: runs", d, t));
    for (int i = 0; i < runIds.size(); i++) {
      long runId = runIds.get(i);
      for (Map<String, Object> result : perRun.get(i)) {
        long rid = Py.toLong(result.get("id"));
        if (rid <= 0) continue;
        TreeSet<Long> ids = new TreeSet<>();
        for (Map<String, Object> b : Py.rows(Py.or(result.get("associatedBugs"), List.of())))
          if (Py.toLong(b.get("id")) > 0) ids.add(Py.toLong(b.get("id")));
        bugsByResult.put(runId + "|" + rid, new ArrayList<>(ids));
      }
    }
    for (long[] s : scenarios) {
      List<Long> ids = s[0] > 0 && s[1] > 0 ? bugsByResult.get(s[0] + "|" + s[1]) : null;
      if (ids == null || ids.isEmpty()) {
        bump(stats, "reteste");
        bump(stats, "semResultadoMapeado");
        continue;
      }
      List<Map<String, Object>> bugs = new ArrayList<>();
      for (Long id : ids) if (bugMeta.containsKey(id)) bugs.add(bugMeta.get(id));
      String bucket = classifyBugs(bugs);
      bump(stats, switch (bucket) {
        case "Foursys" -> "foursys";
        case "Cliente" -> "cliente";
        default -> "reteste";
      });
    }
    return stats;
  }

  private static void bump(Map<String, Object> stats, String key) {
    stats.put(key, (long) stats.get(key) + 1);
  }

  static String classifyBugs(List<Map<String, Object>> bugs) {
    List<Map<String, Object>> open = new ArrayList<>();
    for (Map<String, Object> b : bugs) {
      String status = AzureUtil.normalize(Py.or(b.get("status"), ""));
      if (status.equals("new") || status.equals("active")) open.add(b);
    }
    open.sort(Comparator.<Map<String, Object>>comparingDouble(b -> Py.toDouble(b.get("criacaoMs")))
        .thenComparingDouble(b -> Py.toDouble(b.get("bugId")))
        .reversed());
    if (open.isEmpty()) return "Reteste";
    String resp = AzureUtil.normalize(Py.or(open.get(0).get("responsavel"), ""));
    if (resp.contains("foursys")) return "Foursys";
    if (resp.contains("cliente") || resp.contains("cvp")) return "Cliente";
    return "Reteste";
  }
}
