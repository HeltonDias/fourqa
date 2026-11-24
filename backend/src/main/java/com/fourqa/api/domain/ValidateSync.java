package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Port of {@code fourqa.domain.validate_sync}. */
public final class ValidateSync {
  private ValidateSync() {}

  public static class SyncValidationError extends RuntimeException {
    public final List<String> errors;

    public SyncValidationError(List<String> errors) {
      super(String.join(" ", errors));
      this.errors = errors;
    }
  }

  public static void validateSyncResult(
      List<Map<String, Object>> execucoes, List<Map<String, Object>> falhas, List<Map<String, Object>> suites) {
    List<String> errors = new ArrayList<>();
    if (execucoes.isEmpty())
      errors.add("Nenhum Test Point retornado. A sincronização foi cancelada para não apagar os dados atuais.");
    Set<String> points = new HashSet<>();
    int classified = 0;
    for (Map<String, Object> row : execucoes) {
      if (Py.norm(row.get("plan_key")).isEmpty() || !Py.truthy(row.get("plan_id"))) {
        errors.add("Execução sem PlanKey ou PlanId.");
        break;
      }
      if (!Py.truthy(row.get("suite_id"))) {
        Object tp = row.containsKey("test_point_id") ? row.get("test_point_id") : "?";
        errors.add("Test point " + Py.str(tp) + " sem suíte.");
        break;
      }
      Object tp = row.get("test_point_id");
      if (Py.truthy(tp)) {
        String key = Py.str(row.get("plan_key")) + ":" + Py.str(tp);
        if (points.contains(key))
          errors.add("TestPointId duplicado no plano " + Py.str(row.get("plan_key")) + ": " + Py.str(tp) + ".");
        points.add(key);
      }
      Formulas.classifyExecution(row);
      classified++;
    }
    if (!execucoes.isEmpty() && classified != execucoes.size())
      errors.add("Invariante de status violada: classificados " + classified + ", execuções " + execucoes.size() + ".");
    Set<String> bugs = new HashSet<>();
    for (Map<String, Object> row : falhas) {
      Object bugId = row.get("bug_id");
      Object planKey = row.get("plan_key");
      if (!Py.truthy(bugId) || !Py.truthy(planKey)) continue;
      String key = Py.str(planKey) + ":" + Py.str(bugId);
      if (bugs.contains(key)) errors.add("BugId duplicado no plano " + Py.str(planKey) + ": " + Py.str(bugId) + ".");
      bugs.add(key);
    }
    Set<Long> suiteIds = new HashSet<>();
    for (Map<String, Object> s : suites) suiteIds.add(Py.toLong(s.get("suite_id")));
    for (Map<String, Object> suite : suites) {
      Object parent = suite.get("parent_suite_id");
      if (parent != null && !suiteIds.contains(Py.toLong(parent))) {
        errors.add("Suíte " + Py.str(suite.get("suite_id")) + " aponta para o pai " + Py.str(parent) + ", que não está na árvore.");
        break;
      }
    }
    if (!errors.isEmpty()) throw new SyncValidationError(new ArrayList<>(new LinkedHashSet<>(errors)));
  }
}
