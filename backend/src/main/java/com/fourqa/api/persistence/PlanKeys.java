package com.fourqa.api.persistence;

import java.util.List;
import java.util.regex.Pattern;

/** Port of {@code fourqa.persistence.plan_key}. Query values arrive as the list of repeated parameters. */
public final class PlanKeys {
  private static final Pattern CONTROL = Pattern.compile("[\\u0000-\\u001f\\u007f]");

  private PlanKeys() {}

  public static String requiredPlanKey(String planKey) {
    String key = planKey == null ? "" : planKey.strip();
    if (key.isEmpty()) throw new IllegalArgumentException("planKey obrigatório");
    return key;
  }

  public static String planKeyFromRaw(String q, String fallback) {
    if (q != null && !q.strip().isEmpty()) return q.strip();
    return requiredPlanKey(fallback);
  }

  public static String explicitPlanKeyFromQuery(List<String> values) {
    if (values == null || values.size() != 1) return null;
    String q = values.get(0);
    if (q == null) return null;
    String trimmed = q.strip();
    if (trimmed.isEmpty()) return null;
    if (CONTROL.matcher(trimmed).find()) return null;
    return trimmed;
  }

  public static String planKeyWriteError(List<String> values) {
    if (values != null && values.size() > 1) return "planKey ambíguo.";
    if (values != null && values.size() == 1 && values.get(0) != null && CONTROL.matcher(values.get(0)).find())
      return "planKey inválido.";
    return "Informe o planKey.";
  }
}
