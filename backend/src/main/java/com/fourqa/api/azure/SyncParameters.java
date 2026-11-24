package com.fourqa.api.azure;

import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Sync parameters edited in the UI (port of {@code fourqa.azure.sync_parameters}). */
public final class SyncParameters {
  public static final String SYNC_PARAMETERS_KEY = "sync_parameters";
  public static final List<String> EXECUTION_FIELD_CATALOG = List.of(
      "PlanKey", "PlanId", "PlanName", "Frente", "Atalho", "SuiteId", "SuiteName", "TestPointId", "TestCaseId",
      "TestCaseTitle", "Prioridade", "Responsabilidade", "TestCaseState", "TestPointState", "Outcome",
      "DateCompleted", "RunBy", "LastUpdatedDate", "LastTestRunId", "LastResultId", "TestCaseLink", "TestCaseTags");
  public static final List<String> FAILURE_FIELD_CATALOG = List.of(
      "PlanKey", "Responsavel", "Ambiente", "Categoria", "ID", "Impacto", "Frente", "Título", "Status",
      "Criada por", "Criação", "Fechada por", "Fechamento", "Links", "Tags");

  private SyncParameters() {}

  public static class ParametersError extends IllegalArgumentException {
    public ParametersError(String message) {
      super(message);
    }
  }

  public static Map<String, Object> decodeStoredParameters(String raw) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (raw == null || raw.strip().isEmpty()) {
      out.put("draft", null);
      out.put("warning", null);
      return out;
    }
    try {
      out.put("draft", parseSyncParameters(PyJson.loads(raw)));
      out.put("warning", null);
    } catch (PyJson.DecodeException | ParametersError e) {
      out.put("draft", null);
      out.put("warning", "A configuração gravada está inválida. O ambiente voltou a valer.");
    }
    return out;
  }

  public static Map<String, Object> parseSyncParameters(Object body) {
    Map<String, Object> raw = Py.map(body);
    if (raw == null) throw new ParametersError("Informe os parâmetros.");
    String kpi = text(raw.get("kpiPlanKey"), "O PlanKey dos KPIs", 80);
    if (!(raw.get("hierarchy") instanceof List<?>)) throw new ParametersError("Informe a hierarquia.");
    if (!(raw.get("responsibilities") instanceof List<?>)) throw new ParametersError("Informe as categorias.");
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("kpiPlanKey", kpi);
    out.put("hierarchy", raw.get("hierarchy"));
    out.put("responsibilities", raw.get("responsibilities"));
    out.put("executionFields", fields(raw.get("executionFields"), "execuções", EXECUTION_FIELD_CATALOG));
    out.put("failureFields", fields(raw.get("failureFields"), "falhas", FAILURE_FIELD_CATALOG));
    return out;
  }

  static String text(Object value, String label, int maxLen) {
    if (!(value instanceof String s)) throw new ParametersError(label + " precisa ser texto.");
    String trimmed = s.strip();
    if (trimmed.isEmpty()) throw new ParametersError(label + " não pode ficar vazio.");
    if (trimmed.codePointCount(0, trimmed.length()) > maxLen)
      throw new ParametersError(label + " aceita no máximo " + maxLen + " caracteres.");
    return trimmed;
  }

  static List<String> fields(Object value, String label, List<String> catalog) {
    if (!(value instanceof List<?> list) || list.isEmpty()) throw new ParametersError("Selecione ao menos um campo de " + label + ".");
    Set<String> chosen = new HashSet<>();
    for (Object item : list) {
      if (!(item instanceof String s) || !catalog.contains(s)) throw new ParametersError("Campo de " + label + " desconhecido.");
      chosen.add(s);
    }
    List<String> out = new ArrayList<>();
    for (String name : catalog) if (chosen.contains(name)) out.add(name);
    return out;
  }

  public static Map<String, Object> parametersToOverride(Map<String, Object> draft) {
    Map<String, Object> responsibilities = new LinkedHashMap<>();
    for (Object item : Py.rows(Py.or(draft.get("responsibilities"), List.of()))) {
      Map<String, Object> row = Py.map(item);
      if (row != null) responsibilities.put(AzureUtil.normalize(row.get("category")), row.get("responsibility"));
    }
    List<Map<String, Object>> hierarchy = new ArrayList<>();
    for (Object item : Py.rows(Py.or(draft.get("hierarchy"), List.of()))) {
      Map<String, Object> row = Py.map(item);
      if (row == null) continue;
      Map<String, Object> h = new LinkedHashMap<>();
      h.put("order", row.get("order"));
      h.put("columnName", row.get("columnName"));
      h.put("sourceLevel", row.get("sourceLevel"));
      h.put("active", Boolean.TRUE.equals(row.get("active")));
      h.put("planKey", Py.truthy(row.get("planKey")) ? row.get("planKey") : null);
      h.put("sourceType", "current_suite".equals(row.get("source")) ? "current_suite" : "hierarchy_level");
      hierarchy.add(h);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("kpiPlanKey", draft.get("kpiPlanKey"));
    out.put("hierarchy", hierarchy);
    out.put("responsibilities", responsibilities);
    return out;
  }

  public static Map<String, Object> presentParameters(Map<String, Object> envView, Map<String, Object> stored, String warning) {
    Map<String, Object> out = new LinkedHashMap<>(envView);
    if (!Py.truthy(stored)) {
      out.put("executionCatalog", new ArrayList<>(EXECUTION_FIELD_CATALOG));
      out.put("failureCatalog", new ArrayList<>(FAILURE_FIELD_CATALOG));
      out.put("source", "environment");
      out.put("warning", Py.truthy(warning) ? warning : envView.get("warning"));
      return out;
    }
    out.put("kpiPlanKey", stored.get("kpiPlanKey"));
    out.put("hierarchy", stored.get("hierarchy"));
    out.put("responsibilities", stored.get("responsibilities"));
    out.put("executionFields", stored.get("executionFields"));
    out.put("failureFields", stored.get("failureFields"));
    out.put("executionCatalog", new ArrayList<>(EXECUTION_FIELD_CATALOG));
    out.put("failureCatalog", new ArrayList<>(FAILURE_FIELD_CATALOG));
    out.put("source", "saved");
    out.put("warning", warning);
    return out;
  }
}
