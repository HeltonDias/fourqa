package com.fourqa.api.azure;

import com.fourqa.api.config.Env;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Azure/sync configuration from the environment (port of {@code fourqa.azure.config}). */
public final class SyncConfig {
  private SyncConfig() {}

  public static class SyncConfigError extends RuntimeException {
    public final List<String> missing;

    public SyncConfigError(String message) {
      this(message, List.of());
    }

    public SyncConfigError(String message, List<String> missing) {
      super(message);
      this.missing = missing == null ? List.of() : missing;
    }
  }

  static Object jsonEnv(String name) {
    String raw = Env.value(name);
    if (raw.isEmpty()) return null;
    try {
      return PyJson.loads(raw);
    } catch (PyJson.DecodeException e) {
      throw new SyncConfigError("A variável " + name + " do .env não é um JSON válido (mantenha em uma única linha).");
    }
  }

  static boolean yes(Object value) {
    return List.of("sim", "s", "yes", "true", "1").contains(AzureUtil.normalize(value));
  }

  public static Map<String, Object> readSyncSettings() {
    List<String> warnings = new ArrayList<>();
    Object plansRaw = jsonEnv("SYNC_TEST_PLANS");
    if (plansRaw == null) plansRaw = new ArrayList<>();
    if (!(plansRaw instanceof List<?>)) {
      warnings.add("SYNC_TEST_PLANS inválido.");
      plansRaw = new ArrayList<>();
    }
    List<Map<String, Object>> plans = new ArrayList<>();
    for (Object item : Py.list(plansRaw)) {
      Map<String, Object> plan = Py.map(item);
      if (plan == null) continue;
      Map<String, Object> p = new LinkedHashMap<>();
      p.put("planKey", Py.orText(plan.get("PlanKey"), "").strip());
      p.put("planId", Py.toLong(plan.get("PlanId")));
      p.put("planName", Py.orText(plan.get("PlanName"), "").strip());
      p.put("suiteNameFilter", Py.orText(plan.get("SuiteNameFilter"), "").strip());
      p.put("maxSuites", Py.toLong(plan.get("MaxSuites")));
      p.put("load", plan.get("Carregar") != null ? yes(plan.get("Carregar")) : true);
      if (!((String) p.get("planKey")).isEmpty() || (long) p.get("planId") > 0) plans.add(p);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("organization", Env.value("AZURE_DEVOPS_ORG"));
    out.put("project", Env.value("AZURE_DEVOPS_PROJECT"));
    out.put("apiVersion", Env.value("AZURE_DEVOPS_API_VERSION").isEmpty() ? "7.1" : Env.value("AZURE_DEVOPS_API_VERSION"));
    out.put("credentialConfigured", !Env.value("AZURE_DEVOPS_PAT").isEmpty());
    String kpi = Env.value("SYNC_KPI_PLAN_KEY");
    if (kpi.isEmpty()) kpi = Env.value("KPI_PLAN_KEY");
    if (kpi.isEmpty()) kpi = plans.isEmpty() ? "" : (String) plans.get(0).get("planKey");
    out.put("kpiPlanKey", kpi);
    out.put("plans", plans);
    out.put("hierarchy", new ArrayList<>());
    out.put("responsibilities", new ArrayList<>());
    out.put("executionFields", new ArrayList<>());
    out.put("failureFields", new ArrayList<>());
    out.put("warning", warnings.isEmpty() ? null : String.join("; ", warnings));
    return out;
  }

  public static Map<String, Object> loadSyncConfig(Map<String, Object> override) {
    List<String> missing = new ArrayList<>();
    for (String n : List.of("AZURE_DEVOPS_ORG", "AZURE_DEVOPS_PROJECT", "AZURE_DEVOPS_PAT")) if (Env.value(n).isEmpty()) missing.add(n);
    if (!missing.isEmpty())
      throw new SyncConfigError(
          "Configuração do Azure DevOps incompleta: preencha " + String.join(", ", missing)
              + " no arquivo .env (veja .env.example) e tente novamente.",
          missing);
    Object plansRaw = Py.or(jsonEnv("SYNC_TEST_PLANS"), new ArrayList<>());
    List<Map<String, Object>> plans = new ArrayList<>();
    for (Object item : plansRaw instanceof List<?> ? Py.list(plansRaw) : List.of()) {
      Map<String, Object> p = Py.map(item);
      if (p == null) continue;
      boolean carregar = p.get("Carregar") != null ? yes(p.get("Carregar")) : true;
      long planId = Py.toLong(p.get("PlanId"));
      String planKey = Py.orText(p.get("PlanKey"), "").strip();
      if (carregar && planId > 0 && !planKey.isEmpty()) {
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("planKey", planKey);
        plan.put("planId", planId);
        plan.put("planName", Py.orText(p.get("PlanName"), ""));
        plan.put("suiteNameFilter", Py.orText(p.get("SuiteNameFilter"), ""));
        plan.put("maxSuites", Py.toLong(p.get("MaxSuites")));
        plans.add(plan);
      }
    }
    if (plans.isEmpty()) throw new SyncConfigError("Nenhum Test Plan ativo em SYNC_TEST_PLANS (Carregar = \"SIM\").");
    Object hierarchy = override != null ? override.get("hierarchy") : null;
    if (hierarchy == null) hierarchy = new ArrayList<>();
    Object kpi = override == null ? null : override.get("kpiPlanKey");
    if (!Py.truthy(kpi)) kpi = Env.value("SYNC_KPI_PLAN_KEY");
    if (!Py.truthy(kpi)) kpi = plans.get(0).get("planKey");
    Map<String, Object> azure = new LinkedHashMap<>();
    azure.put("organization", Env.value("AZURE_DEVOPS_ORG"));
    azure.put("project", Env.value("AZURE_DEVOPS_PROJECT"));
    azure.put("apiVersion", Env.value("AZURE_DEVOPS_API_VERSION").isEmpty() ? "7.1" : Env.value("AZURE_DEVOPS_API_VERSION"));
    azure.put("pat", Env.value("AZURE_DEVOPS_PAT"));
    List<String> fronts = new ArrayList<>();
    for (String s : Env.value("SYNC_FRENTES_VALIDAS").split(",")) if (!s.strip().isEmpty()) fronts.add(s.strip());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("azure", azure);
    out.put("plans", plans);
    out.put("hierarchy", hierarchy);
    out.put("responsibilities", Py.or(override == null ? null : override.get("responsibilities"), new LinkedHashMap<>()));
    out.put("validFronts", fronts);
    out.put("kpiPlanKey", Py.str(kpi).strip());
    return out;
  }
}
