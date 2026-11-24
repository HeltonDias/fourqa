package com.fourqa.api.azure;

import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Failures import from Azure DevOps runs (port of {@code fourqa.azure.falhas}). */
public final class Falhas {
  static final int RUN_CONCURRENCY = 5;
  static final int RUNS_PAGE = 1000;
  static final int RESULTS_PAGE = 200;

  private Falhas() {}

  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> loadFalhas(AzureClient client, Map<String, Object> cfg, Report report) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> plan : (List<Map<String, Object>>) cfg.get("plans")) {
      Map<Long, Set<String>> impacts = new LinkedHashMap<>();
      long[] counts = collectBugImpacts(client, plan, report, impacts);
      List<Map<String, Object>> rows = new ArrayList<>();
      Map<Long, Map<String, Object>> bugMeta = new LinkedHashMap<>();
      for (var e : impacts.entrySet()) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("plan_key", plan.get("planKey"));
        row.put("responsavel", null);
        row.put("ambiente", null);
        row.put("categoria", null);
        row.put("bug_id", e.getKey());
        row.put("impacto", (long) e.getValue().size());
        row.put("frente", null);
        row.put("titulo", null);
        row.put("status", null);
        row.put("criacao", null);
        row.put("fechamento", null);
        row.put("links", null);
        row.put("tags", null);
        rows.add(row);
        bugMeta.put(e.getKey(), Py.obj("bugId", e.getKey(), "responsavel", "", "status", "", "criacaoMs", 0L));
      }
      out.add(Py.obj("plan", plan, "rows", rows, "bugMeta", bugMeta, "runCount", counts[0], "resultCount", counts[1]));
    }
    return out;
  }

  public static List<Map<String, Object>> getRunResultsWithBugs(AzureClient client, long runId) {
    List<Map<String, Object>> all = new ArrayList<>();
    long skip = 0;
    while (true) {
      Map<String, Object> query = new LinkedHashMap<>();
      query.put("detailsToInclude", "WorkItems,Point");
      query.put("$top", (long) RESULTS_PAGE);
      query.put("$skip", skip);
      Map<String, Object> data = Py.map(client.get(client.url("/_apis/test/Runs/" + runId + "/results", query)));
      List<Map<String, Object>> page = Py.rows(Py.or(data.get("value"), List.of()));
      all.addAll(page);
      if (page.size() < RESULTS_PAGE) break;
      skip += RESULTS_PAGE;
    }
    return all;
  }

  private static long[] collectBugImpacts(AzureClient client, Map<String, Object> plan, Report report, Map<Long, Set<String>> impacts) {
    List<Map<String, Object>> runs = getRuns(client, plan.get("planId"));
    List<Long> runIds = new ArrayList<>();
    for (Map<String, Object> r : runs) if (Py.toLong(r.get("id")) > 0) runIds.add(Py.toLong(r.get("id")));
    String planKey = Py.str(plan.get("planKey"));
    List<List<Map<String, Object>>> batches = AzureUtil.mapInBatches(
        runIds, RUN_CONCURRENCY, runId -> getRunResultsWithBugs(client, runId), (d, t) -> report.step("Falhas (" + planKey + "): runs", d, t));
    long resultCount = 0;
    for (List<Map<String, Object>> results : batches) {
      resultCount += results.size();
      for (Map<String, Object> result : results) {
        for (Map<String, Object> bug : Py.rows(Py.or(result.get("associatedBugs"), List.of()))) {
          long bugId = Py.toLong(bug.get("id"));
          if (bugId == 0) continue;
          Map<String, Object> point = Py.map(Py.or(result.get("testPoint"), Map.of()));
          String key = "PLAN:" + Py.str(plan.get("planId")) + "|POINT:" + Py.toLong(point.get("id"));
          impacts.computeIfAbsent(bugId, k -> new LinkedHashSet<>()).add(key);
        }
      }
    }
    return new long[] {runs.size(), resultCount};
  }

  static List<Map<String, Object>> getRuns(AzureClient client, Object planId) {
    List<Map<String, Object>> all = new ArrayList<>();
    long skip = 0;
    while (true) {
      Map<String, Object> query = new LinkedHashMap<>();
      query.put("planId", planId);
      query.put("$top", (long) RUNS_PAGE);
      query.put("$skip", skip);
      Map<String, Object> data = Py.map(client.get(client.url("/_apis/test/runs", query)));
      List<Map<String, Object>> page = Py.rows(Py.or(data.get("value"), List.of()));
      all.addAll(page);
      if (page.size() < RUNS_PAGE) break;
      skip += RUNS_PAGE;
    }
    return all;
  }
}
