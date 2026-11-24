package com.fourqa.api.azure;

import com.fourqa.api.domain.ValidateSync;
import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Builds the validated Azure refresh draft (port of {@code fourqa.azure.azure_data_refresh}). */
public final class AzureDataRefresh {
  public static final String KPI_META_PREFIX = "kpi_impactos:";

  private AzureDataRefresh() {}

  public static boolean planKeyMatch(String a, String b) {
    return a.strip().toLowerCase().equals(b.strip().toLowerCase());
  }

  /** Returns {draft, artifacts}. */
  @SuppressWarnings("unchecked")
  public static Map<String, Object>[] buildAzureRefreshDraft(AzureClient client, Map<String, Object> cfg, Report report) {
    if (report == null) report = Report.NONE;
    List<Map<String, Object>> execucoes = new ArrayList<>();
    List<Map<String, Object>> suiteRefs = new ArrayList<>();
    Map<String, Object> dimensoesMeta = new LinkedHashMap<>();
    Map<String, Map<String, Object>> perPlanExec = new LinkedHashMap<>();
    long suites = 0;
    List<Map<String, Object>> plans = (List<Map<String, Object>>) cfg.get("plans");
    List<Map<String, Object>> hierarchy = Py.rows(cfg.get("hierarchy"));
    List<String> fronts = (List<String>) Py.or(cfg.get("validFronts"), List.of());
    String kpiPlanKey = Py.str(cfg.get("kpiPlanKey"));
    for (Map<String, Object> plan : plans) {
      Map<String, Object> load = Execucoes.loadPlanExecutions(client, plan, hierarchy, report, fronts);
      String planKey = Py.str(plan.get("planKey"));
      perPlanExec.put(planKey, load);
      execucoes.addAll(Py.rows(load.get("rows")));
      suiteRefs.addAll(Py.rows(load.get("suites")));
      suites += Py.toLong(load.get("suitesProcessed"));
      dimensoesMeta.put("dimensoes_catalog:" + planKey, PyJson.dumps(load.get("dimensions")));
    }
    List<Map<String, Object>> planFalhas = Falhas.loadFalhas(client, cfg, report);
    List<Map<String, Object>> falhas = new ArrayList<>();
    long runs = 0;
    for (Map<String, Object> p : planFalhas) {
      falhas.addAll(Py.rows(p.get("rows")));
      runs += Py.toLong(p.get("runCount"));
    }
    Map<String, Object> kpiPlan = null;
    for (Map<String, Object> p : planFalhas) {
      if (planKeyMatch(Py.str(Py.map(p.get("plan")).get("planKey")), kpiPlanKey)) {
        kpiPlan = p;
        break;
      }
    }
    Map<Long, Map<String, Object>> bugMeta =
        kpiPlan != null ? (Map<Long, Map<String, Object>>) kpiPlan.get("bugMeta") : new LinkedHashMap<>();
    List<Map<String, Object>> kpiExecs = new ArrayList<>();
    for (Map<String, Object> e : execucoes) if (planKeyMatch(Py.orText(e.get("plan_key"), ""), kpiPlanKey)) kpiExecs.add(e);
    Map<String, Object> kpi = Kpis.calculateKpiImpactos(client, kpiExecs, bugMeta, report);
    ValidateSync.validateSyncResult(execucoes, falhas, suiteRefs);
    String fetchedAt = PyTime.isoformat(PyTime.nowUtc());
    List<Map<String, Object>> draftPlans = new ArrayList<>();
    for (Map<String, Object> plan : plans) {
      String planKey = Py.str(plan.get("planKey"));
      Map<String, Object> execLoad = perPlanExec.get(planKey);
      Map<String, Object> failLoad = null;
      for (Map<String, Object> p : planFalhas) {
        if (planKeyMatch(Py.str(Py.map(p.get("plan")).get("planKey")), planKey)) {
          failLoad = p;
          break;
        }
      }
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("planKey", planKey);
      entry.put("execucoes", execLoad.get("rows"));
      entry.put("falhas", failLoad != null ? failLoad.get("rows") : new ArrayList<>());
      entry.put("dimensions", execLoad.get("dimensions"));
      entry.put("kpi", planKeyMatch(planKey, kpiPlanKey) ? kpi : null);
      draftPlans.add(entry);
    }
    Map<String, Object> workbookMeta = new LinkedHashMap<>();
    workbookMeta.put(KPI_META_PREFIX + kpiPlanKey, PyJson.dumps(kpi));
    workbookMeta.put("kpi_plan_key", kpiPlanKey);
    workbookMeta.put("ultima_sincronizacao_azure", fetchedAt);
    workbookMeta.putAll(dimensoesMeta);
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("execucoes", (long) execucoes.size());
    summary.put("falhas", (long) falhas.size());
    summary.put("suites", suites);
    summary.put("runs", runs);
    summary.put("kpi", kpi);
    Map<String, Object> artifacts = new LinkedHashMap<>();
    artifacts.put("fetchedAt", fetchedAt);
    artifacts.put("dimensoesMeta", dimensoesMeta);
    artifacts.put("workbookMeta", workbookMeta);
    artifacts.put("summary", summary);
    Map<String, Object> draft = new LinkedHashMap<>();
    draft.put("kpiPlanKey", kpiPlanKey);
    draft.put("plans", draftPlans);
    draft.put("suiteRefs", suiteRefs);
    return new Map[] {draft, artifacts};
  }
}
