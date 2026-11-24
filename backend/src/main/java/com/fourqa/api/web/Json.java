package com.fourqa.api.web;

import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * JSON in and out with the value model of the Python API: bodies parse into LinkedHashMap / Long / Double, responses
 * are written by {@link PyJson} so int and float keep their Python form.
 */
public final class Json {
  private Json() {}

  public static ResponseEntity<byte[]> ok(Object body) {
    return status(200, body);
  }

  public static ResponseEntity<byte[]> status(int status, Object body) {
    return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(bytes(body));
  }

  public static ResponseEntity<byte[]> status(int status, Object body, HttpHeaders headers) {
    return ResponseEntity.status(status).headers(headers).contentType(MediaType.APPLICATION_JSON).body(bytes(body));
  }

  public static byte[] bytes(Object body) {
    return PyJson.dumpsResponse(body).getBytes(StandardCharsets.UTF_8);
  }

  static HttpError validation(String type, List<Object> loc, String msg, Object input) {
    Map<String, Object> item = new LinkedHashMap<>();
    item.put("type", type);
    item.put("loc", loc);
    item.put("msg", msg);
    item.put("input", input);
    List<Object> detail = new ArrayList<>();
    detail.add(item);
    return HttpError.detail(422, detail);
  }

  /** Raw body decoded before dependencies run, as FastAPI does (invalid JSON is 422 ahead of auth). */
  public static Object parse(String raw) {
    if (raw == null || raw.isEmpty()) return null;
    try {
      return PyJson.loads(raw);
    } catch (PyJson.DecodeException e) {
      throw validation("json_invalid", List.of("body", 0L), "JSON decode error", new LinkedHashMap<>());
    }
  }

  /** FastAPI {@code body: dict[str, Any]}: required JSON object, else 422. */
  public static Map<String, Object> dict(Object parsed) {
    Map<String, Object> out = optionalDict(parsed);
    if (out == null) throw validation("missing", List.of("body"), "Field required", null);
    return out;
  }

  /** FastAPI {@code body: dict[str, Any] | None = None}. */
  public static Map<String, Object> optionalDict(Object parsed) {
    if (parsed == null) return null;
    Map<String, Object> map = Py.map(parsed);
    if (map == null) throw validation("dict_type", List.of("body"), "Input should be a valid dictionary", parsed);
    return map;
  }

  public static Map<String, Object> body(String raw) {
    return dict(parse(raw));
  }

  /** FastAPI {@code int} path or query parameter. */
  public static long intParam(String value, String where, String name) {
    try {
      return Long.parseLong(value.strip());
    } catch (NumberFormatException e) {
      throw validation(
          "int_parsing", List.of(where, name), "Input should be a valid integer, unable to parse string as an integer", value);
    }
  }

  public static Long optionalIntQuery(String value, String name) {
    if (value == null) return null;
    return intParam(value, "query", name);
  }
}
