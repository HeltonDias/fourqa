package com.fourqa.api.util;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Helpers that reproduce the Python semantics the API was written with (truthiness, str(), float()). */
public final class Py {
  private Py() {}

  public static boolean truthy(Object v) {
    if (v == null) return false;
    if (v instanceof Boolean b) return b;
    if (v instanceof Number n) return n.doubleValue() != 0;
    if (v instanceof CharSequence s) return !s.isEmpty();
    if (v instanceof Collection<?> c) return !c.isEmpty();
    if (v instanceof Map<?, ?> m) return !m.isEmpty();
    return true;
  }

  /** {@code (v or "").strip()} for text values. */
  public static String norm(Object v) {
    if (!truthy(v)) return "";
    return str(v).strip();
  }

  /** Python {@code str(v)}. */
  public static String str(Object v) {
    if (v == null) return "None";
    if (v instanceof Boolean b) return b ? "True" : "False";
    if (v instanceof Double || v instanceof Float) return floatRepr(((Number) v).doubleValue());
    return String.valueOf(v);
  }

  /** Text or null, like {@code as_text}. */
  public static String text(Object v) {
    if (v == null) return null;
    if (v instanceof String s) return s;
    return str(v);
  }

  public static String floatRepr(double d) {
    if (Double.isNaN(d)) return "nan";
    if (Double.isInfinite(d)) return d > 0 ? "inf" : "-inf";
    if (d == 0) return (1 / d < 0) ? "-0.0" : "0.0";
    double abs = Math.abs(d);
    String shortest = Double.toString(d);
    if (abs >= 1e16 || abs < 1e-4) {
      BigDecimal bd = new BigDecimal(shortest);
      String unscaled = bd.unscaledValue().abs().toString();
      int exp = unscaled.length() - 1 - bd.scale();
      String digits = unscaled.replaceAll("0+$", "");
      if (digits.isEmpty()) digits = "0";
      String mantissa = digits.length() == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
      String sign = d < 0 ? "-" : "";
      String expText = (exp < 0 ? "-" : "+") + (Math.abs(exp) < 10 ? "0" : "") + Math.abs(exp);
      return sign + mantissa + "e" + expText;
    }
    String plain = new BigDecimal(shortest).toPlainString();
    if (!plain.contains(".")) plain = plain + ".0";
    return plain;
  }

  public static double toDouble(Object v) {
    if (!truthy(v)) return 0;
    if (v instanceof Number n) return n.doubleValue();
    if (v instanceof Boolean b) return b ? 1 : 0;
    return Double.parseDouble(str(v).strip());
  }

  public static long toLong(Object v) {
    if (!truthy(v)) return 0;
    if (v instanceof Number n) return (long) n.doubleValue();
    if (v instanceof Boolean b) return b ? 1 : 0;
    return (long) Double.parseDouble(str(v).strip());
  }

  public static Long longOrNull(Object v) {
    if (v == null) return null;
    if (v instanceof Number n) return n.longValue();
    String s = str(v).strip();
    if (s.isEmpty()) return null;
    return (long) Double.parseDouble(s);
  }

  public static boolean isInt(Object v) {
    return v instanceof Integer || v instanceof Long || v instanceof Short || v instanceof Byte;
  }

  public static boolean isNumber(Object v) {
    return v instanceof Number && !(v instanceof Boolean);
  }

  /** Python int/float equality with numeric coercion; other values use equals. */
  public static boolean eq(Object a, Object b) {
    if (a == null || b == null) return a == b;
    if (isNumber(a) && isNumber(b)) return ((Number) a).doubleValue() == ((Number) b).doubleValue();
    return a.equals(b);
  }

  /** Number that keeps the int/float distinction of the source: integral doubles stay doubles. */
  public static Object num(double d) {
    return d;
  }

  /** Python {@code int(total) if total == int(total) else total}. */
  public static Object intIfWhole(double d) {
    if (d == Math.rint(d) && !Double.isInfinite(d)) return (long) d;
    return d;
  }

  /** Python round(): banker's rounding to the nearest integer. */
  public static long round(double d) {
    return (long) Math.rint(d);
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> map(Object v) {
    return v instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
  }

  @SuppressWarnings("unchecked")
  public static List<Object> list(Object v) {
    return v instanceof List<?> l ? (List<Object>) l : null;
  }

  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> rows(Object v) {
    if (!(v instanceof List<?> l)) return new ArrayList<>();
    return (List<Map<String, Object>>) l;
  }

  public static Map<String, Object> obj(Object... kv) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (int i = 0; i + 1 < kv.length; i += 2) out.put((String) kv[i], kv[i + 1]);
    return out;
  }

  public static Map<String, Object> copy(Map<String, Object> src) {
    return src == null ? new LinkedHashMap<>() : new LinkedHashMap<>(src);
  }

  /** Python {@code a or b}. */
  public static Object or(Object a, Object b) {
    return truthy(a) ? a : b;
  }

  public static String orText(Object a, String b) {
    return truthy(a) ? str(a) : b;
  }

  public static int lowerCompare(String a, String b) {
    return a.toLowerCase().compareTo(b.toLowerCase());
  }
}
