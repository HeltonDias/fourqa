package com.fourqa.api.web;

import com.fourqa.api.util.Py;
import java.util.LinkedHashMap;
import java.util.Map;

/** Ports of {@code fourqa.http.meta_base}, {@code page_query} and {@code planning_cell_base}. */
public final class HttpInputs {
  public static final int PAGE_MIN = 1;
  public static final int PAGE_MAX = 200;
  public static final int PAGE_DEFAULT = 50;

  private HttpInputs() {}

  /** Python {@code isinstance(v, int)}: bool counts, coerced to 1/0. */
  public static Long pyInt(Object v) {
    if (v instanceof Boolean b) return b ? 1L : 0L;
    if (Py.isInt(v)) return ((Number) v).longValue();
    return null;
  }

  /** Python {@code isinstance(v, (int, float))}. */
  public static Object pyNumber(Object v) {
    if (v instanceof Boolean b) return b ? 1L : 0L;
    return Py.isNumber(v) ? v : null;
  }

  public static String pyStr(Object v) {
    return v instanceof String s ? s : null;
  }

  public record PairBase(boolean present, boolean valid, String a, String b) {}

  public static PairBase parseMetaPair(Map<String, Object> body, String keyA, String keyB) {
    if (!body.containsKey(keyA) && !body.containsKey(keyB)) return new PairBase(false, true, "", "");
    if (body.get(keyA) instanceof String va && body.get(keyB) instanceof String vb) return new PairBase(true, true, va, vb);
    return new PairBase(true, false, "", "");
  }

  static int intOr(String raw, int dflt) {
    if (raw == null) return dflt;
    try {
      double d = Double.parseDouble(raw.strip().replace("_", ""));
      if (Double.isNaN(d) || Double.isInfinite(d)) return dflt;
      return (int) Math.max(Integer.MIN_VALUE, Math.min(Integer.MAX_VALUE, (long) d));
    } catch (NumberFormatException e) {
      return dflt;
    }
  }

  public static Map<String, Object> parsePageQuery(String limit, String offset, String q, String planKey) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("plan_key", planKey);
    out.put("limit", (long) Math.min(PAGE_MAX, Math.max(PAGE_MIN, intOr(limit, PAGE_DEFAULT))));
    out.put("offset", (long) Math.max(0, intOr(offset, 0)));
    String text = "";
    if (q != null) {
      text = q.strip();
      if (text.codePointCount(0, text.length()) > 200) text = text.substring(0, text.offsetByCodePoints(0, 200));
    }
    out.put("q", text);
    return out;
  }

  /** Returns {guard, expected_text, expected_quantity} or null when the base is malformed. */
  public static Map<String, Object> parsePlanningCellBase(Map<String, Object> body, String field) {
    if ("day".equals(field)) {
      if (!body.containsKey("baseQuantity")) return base(false, null, 0L);
      Object q = pyNumber(body.get("baseQuantity"));
      if (q == null) return null;
      double d = ((Number) q).doubleValue();
      if (Double.isNaN(d) || d < 0) return null;
      return base(true, null, d);
    }
    String key = "start".equals(field) || "end".equals(field) ? "baseDate" : "baseValue";
    if (!body.containsKey(key)) return base(false, null, 0L);
    Object v = body.get(key);
    if (v != null && !(v instanceof String)) return null;
    return base(true, (String) v, 0L);
  }

  private static Map<String, Object> base(boolean guard, String text, Object quantity) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("guard", guard);
    out.put("expected_text", text);
    out.put("expected_quantity", quantity);
    return out;
  }
}
