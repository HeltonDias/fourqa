package com.fourqa.api.util;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** JSON text compatible with Python {@code json.dumps} defaults (stored in the database and shared with the Python API). */
public final class PyJson {
  private static final ObjectMapper MAPPER =
      JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

  private PyJson() {}

  public static final class DecodeException extends RuntimeException {
    public DecodeException(String message) {
      super(message);
    }
  }

  public static String dumps(Object value) {
    StringBuilder sb = new StringBuilder();
    write(sb, value, ", ", ": ", true);
    return sb.toString();
  }

  public static String dumpsCompact(Object value) {
    StringBuilder sb = new StringBuilder();
    write(sb, value, ",", ":", true);
    return sb.toString();
  }

  /** Starlette {@code JSONResponse.render}: compact, {@code ensure_ascii=False}, {@code allow_nan=False}. */
  public static String dumpsResponse(Object value) {
    StringBuilder sb = new StringBuilder();
    write(sb, value, ",", ":", false);
    return sb.toString();
  }

  /** Parse JSON text into LinkedHashMap / ArrayList / Long / Double / String / Boolean / null. */
  public static Object loads(String text) {
    if (text == null) throw new DecodeException("null");
    try {
      Object raw = MAPPER.readValue(text, Object.class);
      return normalize(raw);
    } catch (JacksonException e) {
      throw new DecodeException(e.getOriginalMessage());
    }
  }

  @SuppressWarnings("unchecked")
  private static Object normalize(Object raw) {
    if (raw instanceof Map<?, ?> m) {
      Map<String, Object> out = new LinkedHashMap<>();
      for (Map.Entry<?, ?> e : m.entrySet()) out.put(String.valueOf(e.getKey()), normalize(e.getValue()));
      return out;
    }
    if (raw instanceof List<?> l) {
      List<Object> out = new ArrayList<>(l.size());
      for (Object o : l) out.add(normalize(o));
      return out;
    }
    if (raw instanceof Integer i) return i.longValue();
    if (raw instanceof java.math.BigInteger b) return b.longValue();
    if (raw instanceof java.math.BigDecimal d) return d.doubleValue();
    if (raw instanceof Float f) return f.doubleValue();
    return raw;
  }

  private static void write(StringBuilder sb, Object v, String itemSep, String keySep, boolean ascii) {
    if (v == null) {
      sb.append("null");
    } else if (v instanceof Boolean b) {
      sb.append(b ? "true" : "false");
    } else if (v instanceof Double || v instanceof Float) {
      double d = ((Number) v).doubleValue();
      if (!ascii && (Double.isNaN(d) || Double.isInfinite(d))) throw new IllegalArgumentException("Out of range float values are not JSON compliant");
      if (Double.isNaN(d)) sb.append("NaN");
      else if (Double.isInfinite(d)) sb.append(d > 0 ? "Infinity" : "-Infinity");
      else sb.append(Py.floatRepr(d));
    } else if (v instanceof Number n) {
      sb.append(n.longValue());
    } else if (v instanceof CharSequence s) {
      quote(sb, s.toString(), ascii);
    } else if (v instanceof Map<?, ?> m) {
      sb.append('{');
      boolean first = true;
      for (Map.Entry<?, ?> e : m.entrySet()) {
        if (!first) sb.append(itemSep);
        first = false;
        quote(sb, String.valueOf(e.getKey()), ascii);
        sb.append(keySep);
        write(sb, e.getValue(), itemSep, keySep, ascii);
      }
      sb.append('}');
    } else if (v instanceof Collection<?> c) {
      sb.append('[');
      boolean first = true;
      for (Object o : c) {
        if (!first) sb.append(itemSep);
        first = false;
        write(sb, o, itemSep, keySep, ascii);
      }
      sb.append(']');
    } else {
      quote(sb, v.toString(), ascii);
    }
  }

  private static void quote(StringBuilder sb, String s, boolean ascii) {
    sb.append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"' -> sb.append("\\\"");
        case '\\' -> sb.append("\\\\");
        case '\n' -> sb.append("\\n");
        case '\r' -> sb.append("\\r");
        case '\t' -> sb.append("\\t");
        case '\b' -> sb.append("\\b");
        case '\f' -> sb.append("\\f");
        default -> {
          if (c < 0x20 || (ascii && c > 0x7e)) sb.append(String.format("\\u%04x", (int) c));
          else sb.append(c);
        }
      }
    }
    sb.append('"');
  }
}
