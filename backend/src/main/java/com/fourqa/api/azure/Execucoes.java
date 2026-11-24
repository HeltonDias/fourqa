package com.fourqa.api.azure;

import com.fourqa.api.domain.Dates;
import com.fourqa.api.domain.Dimensions;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Test plan executions from Azure DevOps (port of {@code fourqa.azure.execucoes}). */
public final class Execucoes {
  static final String CASE_PRIORITY_REFERENCE = "Microsoft.VSTS.Common.Priority";
  static final int SUITE_CONCURRENCY = 4;
  static final int POINTS_PAGE = 1000;

  private Execucoes() {}

  @SuppressWarnings("unchecked")
  static List<Map<String, Object>> path(Map<String, Object> sp) {
    return (List<Map<String, Object>>) sp.get("path");
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> suite(Map<String, Object> sp) {
    return (Map<String, Object>) sp.get("suite");
  }

  static long id(Map<String, Object> node) {
    return node == null ? 0 : Py.toLong(node.get("id"));
  }

  static String name(Map<String, Object> node) {
    return Py.orText(node.get("name"), "");
  }

  public static Map<String, Object> loadPlanExecutions(
      AzureClient client, Map<String, Object> plan, List<Map<String, Object>> hierarchy, Report report, List<String> knownFronts) {
    String planKey = Py.str(plan.get("planKey"));
    report.step("Execuções (" + planKey + "): lendo árvore de suítes", null, null);
    Map<String, Object> treeData = Py.map(client.get(client.url("/_apis/testplan/Plans/" + plan.get("planId") + "/suites", Py.obj("asTreeView", true))));
    List<Map<String, Object>> tree = Py.rows(Py.or(treeData.get("value"), List.of()));
    List<Map<String, Object>> allPaths = flattenSuiteTree(tree);
    List<Map<String, Object>> suites = new ArrayList<>();
    for (Map<String, Object> s : allPaths) if (!Py.truthy(suite(s).get("children"))) suites.add(s);
    String filterRaw = Py.orText(plan.get("suiteNameFilter"), "");
    if (!filterRaw.strip().isEmpty()) {
      String filt = AzureUtil.normalize(filterRaw);
      suites.removeIf(s -> !AzureUtil.normalize(suite(s).get("name")).contains(filt));
    }
    long maxSuites = Py.toLong(plan.get("maxSuites"));
    if (maxSuites > 0 && suites.size() > maxSuites) suites = new ArrayList<>(suites.subList(0, (int) maxSuites));

    List<Map<String, Object>> detectPaths = new ArrayList<>();
    List<Map<String, Object>> pathContexts = new ArrayList<>();
    for (Map<String, Object> s : suites) {
      List<Map<String, Object>> ancestors = new ArrayList<>();
      List<String> names = new ArrayList<>();
      for (Map<String, Object> n : path(s)) {
        ancestors.add(Py.obj("name", name(n)));
        names.add(name(n).strip());
      }
      detectPaths.add(Py.obj("ancestors", ancestors));
      List<Map<String, Object>> p = path(s);
      pathContexts.add(Dimensions.context(names, name(p.get(p.size() - 1)).strip()));
    }
    List<Map<String, Object>> suggestions =
        Dimensions.detectDimensions(detectPaths, Py.obj("known_fronts", knownFronts == null ? List.of() : knownFronts));
    List<Map<String, Object>> definitions = Dimensions.definitionsForPlan(planKey, hierarchy);
    List<Map<String, Object>> dimensions = Dimensions.buildDimensionCatalog(definitions, suggestions, pathContexts);

    List<List<Map<String, Object>>> perSuite = AzureUtil.mapInBatches(
        suites,
        SUITE_CONCURRENCY,
        sp -> {
          long suiteId = id(suite(sp));
          if (suiteId == 0) return List.of();
          List<Map<String, Object>> out = new ArrayList<>();
          for (Map<String, Object> p : getTestPoints(client, plan.get("planId"), suiteId))
            out.add(buildRecord(client, plan, definitions, dimensions, suggestions, sp, p));
          return out;
        },
        (d, t) -> report.step("Execuções (" + planKey + "): suítes", d, t));
    List<Map<String, Object>> rows = new ArrayList<>();
    for (List<Map<String, Object>> batch : perSuite) rows.addAll(batch);
    List<Map<String, Object>> suiteRefs = new ArrayList<>();
    for (Map<String, Object> s : allPaths) {
      if (id(suite(s)) <= 0) continue;
      List<Map<String, Object>> p = path(s);
      Map<String, Object> ref = new LinkedHashMap<>();
      ref.put("suite_id", id(suite(s)));
      ref.put("parent_suite_id", p.size() >= 2 ? (Object) id(p.get(p.size() - 2)) : null);
      suiteRefs.add(ref);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("plan", plan);
    out.put("rows", rows);
    out.put("suitesProcessed", (long) suites.size());
    out.put("suites", suiteRefs);
    out.put("dimensions", dimensions);
    return out;
  }

  static List<Map<String, Object>> flattenSuiteTree(List<Map<String, Object>> roots) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> root : roots) {
      List<Map<String, Object>> children = Py.rows(Py.or(root.get("children"), List.of()));
      if (children.isEmpty()) walk(root, List.of(), out);
      else for (Map<String, Object> child : children) walk(child, List.of(), out);
    }
    return out;
  }

  private static void walk(Map<String, Object> suite, List<Map<String, Object>> parent, List<Map<String, Object>> out) {
    List<Map<String, Object>> current = new ArrayList<>(parent);
    current.add(suite);
    out.add(Py.obj("suite", suite, "path", current));
    for (Map<String, Object> child : Py.rows(Py.or(suite.get("children"), List.of()))) walk(child, current, out);
  }

  static List<Map<String, Object>> getTestPoints(AzureClient client, Object planId, long suiteId) {
    List<Map<String, Object>> all = new ArrayList<>();
    long skip = 0;
    while (true) {
      Map<String, Object> query = new LinkedHashMap<>();
      query.put("witFields", "System.Title,System.State,System.Tags," + CASE_PRIORITY_REFERENCE);
      query.put("includePointDetails", true);
      query.put("$skip", skip);
      query.put("$top", (long) POINTS_PAGE);
      Map<String, Object> data = Py.map(client.get(client.url("/_apis/test/Plans/" + planId + "/Suites/" + suiteId + "/points", query)));
      List<Map<String, Object>> page = Py.rows(Py.or(data.get("value"), List.of()));
      all.addAll(page);
      if (page.size() < POINTS_PAGE) break;
      skip += POINTS_PAGE;
    }
    return all;
  }

  static Map<String, Object> buildRecord(
      AzureClient client,
      Map<String, Object> plan,
      List<Map<String, Object>> definitions,
      List<Map<String, Object>> catalog,
      List<Map<String, Object>> suggestions,
      Map<String, Object> sp,
      Map<String, Object> point) {
    List<Map<String, Object>> p = path(sp);
    List<String> pathNames = new ArrayList<>();
    for (Map<String, Object> s : p) pathNames.add(name(s).strip());
    Map<String, Object> leaf = p.get(p.size() - 1);
    Map<String, Object> parent = p.size() >= 2 ? p.get(p.size() - 2) : null;
    String suiteName = name(leaf).strip();
    Map<String, String> classificacao = Dimensions.resolveDimensionValues(Dimensions.context(pathNames, suiteName), definitions, suggestions);
    List<Map<String, Object>> suitePath = new ArrayList<>();
    for (int i = 0; i < p.size(); i++) {
      Map<String, Object> node = new LinkedHashMap<>();
      node.put("suiteId", id(p.get(i)));
      node.put("name", name(p.get(i)));
      node.put("parentSuiteId", i > 0 ? (Object) id(p.get(i - 1)) : null);
      node.put("depth", (long) (i + 1));
      suitePath.add(node);
    }
    Map<String, Object> testCase = Py.map(Py.or(point.get("testCase"), Map.of()));
    long testCaseId = id(testCase);
    Map<String, Object> lastResult = Py.map(Py.or(point.get("lastResultDetails"), Map.of()));
    long leafId = id(leaf);
    long pointId = id(point);
    Map<String, Object> r = new LinkedHashMap<>();
    r.put("plan_key", plan.get("planKey"));
    r.put("plan_id", plan.get("planId"));
    r.put("plan_name", AzureUtil.emptyToNull(Py.orText(plan.get("planName"), "")));
    r.put("frente", AzureUtil.emptyToNull(Dimensions.legacyRoleValue("front", classificacao, definitions, catalog)));
    r.put("atalho", AzureUtil.emptyToNull(extractAtalho(suiteName)));
    r.put("processo", AzureUtil.emptyToNull(Dimensions.legacyRoleValue("process", classificacao, definitions, catalog)));
    r.put("suite_id", leafId != 0 ? (Object) leafId : null);
    r.put("suite_name", AzureUtil.emptyToNull(suiteName));
    r.put("parent_suite_id", parent != null ? (Object) id(parent) : null);
    r.put("suite_depth", (long) p.size());
    r.put("suite_path", PyJson.dumps(suitePath));
    r.put("dimensions_json", PyJson.dumps(classificacao));
    r.put("test_point_id", pointId != 0 ? (Object) pointId : null);
    r.put("test_case_id", testCaseId != 0 ? (Object) testCaseId : null);
    r.put("test_case_title", AzureUtil.emptyToNull(Py.orText(testCase.get("name"), "")));
    r.put("case_priority", null);
    r.put("responsabilidade", null);
    r.put("test_case_state", null);
    r.put("test_point_state", AzureUtil.emptyToNull(Py.orText(point.get("state"), "")));
    r.put("outcome", AzureUtil.emptyToNull(Py.orText(point.get("outcome"), "")));
    r.put("date_completed", AzureUtil.emptyToNull(Dates.persistTimestamp(Py.or(lastResult.get("dateCompleted"), ""))));
    r.put("run_by", null);
    r.put("last_updated_date", AzureUtil.emptyToNull(Dates.persistTimestamp(Py.or(point.get("lastUpdatedDate"), ""))));
    r.put("last_test_run_id", null);
    r.put("last_result_id", null);
    String link = testCaseId != 0 ? Py.orText(testCase.get("webUrl"), client.workItemLink(testCaseId)) : "";
    r.put("test_case_link", AzureUtil.emptyToNull(link));
    r.put("test_case_tags", null);
    return r;
  }

  static String extractAtalho(String name) {
    String text = name.strip();
    if (text.isEmpty()) return "";
    int idx = text.indexOf(" - ");
    return idx >= 0 ? text.substring(0, idx).strip() : text;
  }
}
