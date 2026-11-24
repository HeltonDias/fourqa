package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of {@code fourqa.domain.formulas}. */
public final class Formulas {
  public static final String DEFAULT_PLAN_KEY = "EndToEnd";

  public static final Map<String, String> STATUS_COLUNA = new LinkedHashMap<>();

  static {
    STATUS_COLUNA.put("passed", "cts_passeds");
    STATUS_COLUNA.put("na", "cts_na");
    STATUS_COLUNA.put("falhado", "cts_falhados");
    STATUS_COLUNA.put("bloqueado", "cts_bloqueados");
    STATUS_COLUNA.put("design", "cts_design");
    STATUS_COLUNA.put("naoLiberado", "cts_nao_liberados");
    STATUS_COLUNA.put("liberado", "cts_liberados");
  }

  private Formulas() {}

  static String norm(Object v) {
    return Py.norm(v);
  }

  public static String estadoPonto(Map<String, Object> r) {
    String outcome = norm(r.get("outcome"));
    String sw = outcome.toLowerCase();
    switch (sw) {
      case "passed":
        return "Passed";
      case "failed":
        return "Failed";
      case "blocked":
        return "Blocked";
      case "notapplicable":
        return "Closed";
      default:
        break;
    }
    String state = norm(r.get("test_point_state"));
    if (state.toLowerCase().equals("ready")) return "Ready";
    return state.isEmpty() ? "" : "Unspecified";
  }

  public static boolean matchContains(String haystack, String needle) {
    return haystack.toUpperCase().contains(needle.toUpperCase());
  }

  /** Filter keys: planKey, suiteName, suiteId, testPointState, testCaseState, outcome, responsabilidade. */
  public static int countExecucoes(List<Map<String, Object>> rows, Map<String, Object> f) {
    int n = 0;
    for (Map<String, Object> r : rows) {
      Object planKey = f.get("planKey");
      if (Py.truthy(planKey) && !norm(r.get("plan_key")).equals(planKey)) continue;
      if (f.get("suiteName") != null && !norm(r.get("suite_name")).equals(norm(Py.str(f.get("suiteName"))))) continue;
      if (f.get("suiteId") != null) {
        Object sid = r.get("suite_id");
        String rowSuite = Py.truthy(sid) ? Py.str(sid) : "";
        if (!rowSuite.equals(Py.str(f.get("suiteId")))) continue;
      }
      if (f.get("testPointState") != null && !estadoPonto(r).equals(f.get("testPointState"))) continue;
      if (f.get("testCaseState") != null && !norm(r.get("test_case_state")).equals(f.get("testCaseState"))) continue;
      if (f.get("outcome") != null && !norm(r.get("outcome")).equals(f.get("outcome"))) continue;
      if (f.get("responsabilidade") != null && !norm(r.get("responsabilidade")).equals(f.get("responsabilidade")))
        continue;
      n++;
    }
    return n;
  }

  public static String classifyExecution(Map<String, Object> r) {
    String ponto = estadoPonto(r);
    switch (ponto) {
      case "Passed":
        return "passed";
      case "Closed":
        return "na";
      case "Failed":
        return "falhado";
      case "Blocked":
        return "bloqueado";
      default:
        break;
    }
    String tc = norm(r.get("test_case_state")).toLowerCase();
    if (tc.equals("design")) return "design";
    if (tc.equals("não atribuído") || tc.equals("nao atribuido")) return "naoLiberado";
    return ponto.equals("Ready") ? "liberado" : "naoLiberado";
  }

  public static String statusCenario(Map<String, Object> r) {
    return classifyExecution(r);
  }

  private static Map<String, Object> emptyMetrics() {
    Map<String, Object> out = new LinkedHashMap<>();
    for (String v : STATUS_COLUNA.values()) out.put(v, 0L);
    return out;
  }

  public static Map<String, Object> metricasPorProcesso(List<Map<String, Object>> rows, String planKey, String processo) {
    if (processo == null || processo.isEmpty()) {
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("cts_passeds", 0L);
      out.put("cts_na", 0L);
      out.put("cts_falhados", 0L);
      out.put("cts_bloqueados", 0L);
      out.put("cts_liberados", 0L);
      out.put("cts_design", 0L);
      out.put("cts_nao_liberados", 0L);
      return out;
    }
    Map<String, Object> out = emptyMetrics();
    for (Map<String, Object> r : rows) {
      if (!norm(r.get("plan_key")).equals(planKey) || !norm(r.get("suite_name")).equals(norm(processo))) continue;
      String col = STATUS_COLUNA.get(classifyExecution(r));
      out.put(col, (Long) out.get(col) + 1);
    }
    return out;
  }

  public static Map<String, Object> metricasDosPontos(List<Map<String, Object>> rows) {
    Map<String, Object> out = emptyMetrics();
    for (Map<String, Object> r : rows) {
      String col = STATUS_COLUNA.get(classifyExecution(r));
      out.put(col, (Long) out.get(col) + 1);
    }
    return out;
  }

  public static long totalRealizadoLinha(Map<String, Object> metrics) {
    return Py.toLong(metrics.get("cts_passeds")) + Py.toLong(metrics.get("cts_na"));
  }

  public static double finalizadosComCancelados(Map<String, Object> metrics, double cancelados) {
    return Py.toLong(metrics.get("cts_passeds")) + Py.toLong(metrics.get("cts_na")) + cancelados;
  }

  public static int impactoTotalTestPoint(List<Map<String, Object>> rows, String planKey) {
    return countExecucoes(rows, Py.obj("planKey", planKey, "testPointState", "Failed"))
        + countExecucoes(rows, Py.obj("planKey", planKey, "testPointState", "Blocked"));
  }

  private static boolean isOpenBugStatus(String status) {
    String s = status.toLowerCase();
    return s.equals("new") || s.equals("active");
  }

  public static Map<String, Object> classificarImpactosKpi(
      List<Map<String, Object>> execRows, List<Map<String, Object>> falhas, String planKey) {
    long foursys = 0, cliente = 0, reteste = 0;
    for (Map<String, Object> c : execRows) {
      if (!norm(c.get("plan_key")).equals(planKey)) continue;
      String outcome = norm(c.get("outcome")).toLowerCase();
      if (!outcome.equals("failed") && !outcome.equals("blocked")) continue;
      String tags = norm(c.get("test_case_tags"));
      boolean classified = false;
      for (Map<String, Object> f : falhas) {
        if (!norm(f.get("plan_key")).equals(planKey) || !Py.truthy(f.get("bug_id"))) continue;
        if (!isOpenBugStatus(norm(f.get("status")))) continue;
        boolean frenteMatch = !tags.isEmpty() && Py.truthy(f.get("frente")) && matchContains(tags, norm(f.get("frente")));
        String titulo = norm(c.get("test_case_title"));
        boolean tituloMatch = !titulo.isEmpty()
            && Py.truthy(f.get("titulo"))
            && matchContains(norm(f.get("titulo")), prefix(titulo, 20));
        if (!frenteMatch && !tituloMatch) continue;
        String resp = norm(f.get("responsavel"));
        if (resp.contains("Foursys")) {
          foursys++;
          classified = true;
          break;
        }
        if (resp.contains("Cliente") || resp.contains("CVP")) {
          cliente++;
          classified = true;
          break;
        }
      }
      if (!classified) reteste++;
    }
    return Py.obj("foursys", foursys, "cliente", cliente, "reteste", reteste);
  }

  /** Python {@code s[:n]} over code points. */
  static String prefix(String s, int n) {
    int count = s.codePointCount(0, s.length());
    if (count <= n) return s;
    return s.substring(0, s.offsetByCodePoints(0, n));
  }

  /** Filter keys: planKey, frenteContains, responsavel, status, statusNot, fechamentoEmpty, fechamentoNotEmpty, criacaoEmpty, idNotEmpty. */
  public static int countFalhas(List<Map<String, Object>> rows, Map<String, Object> f) {
    int n = 0;
    for (Map<String, Object> r : rows) {
      if (!norm(r.get("plan_key")).equals(f.get("planKey"))) continue;
      Object frente = f.get("frenteContains");
      if (Py.truthy(frente) && !matchContains(norm(r.get("frente")), Py.str(frente))) continue;
      if (f.get("responsavel") != null && !norm(r.get("responsavel")).equals(f.get("responsavel"))) continue;
      if (f.get("status") != null && !norm(r.get("status")).equals(f.get("status"))) continue;
      if (f.get("statusNot") != null && norm(r.get("status")).equals(f.get("statusNot"))) continue;
      if (Py.truthy(f.get("fechamentoEmpty")) && !norm(r.get("fechamento")).isEmpty()) continue;
      if (Py.truthy(f.get("fechamentoNotEmpty")) && norm(r.get("fechamento")).isEmpty()) continue;
      if (Py.truthy(f.get("criacaoEmpty")) && !norm(r.get("criacao")).isEmpty()) continue;
      if (Py.truthy(f.get("idNotEmpty")) && (r.get("bug_id") == null || Py.eq(r.get("bug_id"), 0L))) continue;
      n++;
    }
    return n;
  }

  public static Object sumifFrente(List<Map<String, Object>> rows, String frenteNeedle, String field) {
    double total = 0;
    for (Map<String, Object> row : rows) {
      if (!matchContains(norm(row.get("frente")), frenteNeedle)) continue;
      total += Py.toDouble(row.get(field));
    }
    return Py.intIfWhole(total);
  }
}
