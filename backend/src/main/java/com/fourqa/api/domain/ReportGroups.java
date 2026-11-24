package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of {@code fourqa.domain.report_groups}. Group: rows, classificacao, frente, processo. */
public final class ReportGroups {
  public static final String SUITE_FALLBACK = "(sem suíte)";

  private ReportGroups() {}

  static List<Map<String, Object>> visibleDimensions(List<Map<String, Object>> dims) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> d : dims) if (!Boolean.FALSE.equals(d.getOrDefault("visible", true))) out.add(d);
    return out;
  }

  static Map<String, String> parseDimensions(Map<String, Object> row) {
    Object raw = row.get("dimensions_json");
    if (!Py.truthy(raw)) return new LinkedHashMap<>();
    try {
      Map<String, Object> parsed = Py.map(PyJson.loads(Py.str(raw)));
      if (parsed == null) return new LinkedHashMap<>();
      Map<String, String> out = new LinkedHashMap<>();
      for (var e : parsed.entrySet())
        if (e.getValue() instanceof String s && !s.strip().isEmpty()) out.put(e.getKey(), s.strip());
      return out;
    } catch (PyJson.DecodeException e) {
      return new LinkedHashMap<>();
    }
  }

  static String dimensionValue(Map<String, Object> row, Map<String, Object> dim, Map<String, String> parsed) {
    String fromJson = parsed.get((String) dim.get("key"));
    fromJson = fromJson == null ? "" : fromJson.strip();
    if (!fromJson.isEmpty()) return fromJson;
    Object role = dim.get("role");
    if ("front".equals(role)) return Py.norm(row.get("frente"));
    if ("process".equals(role)) return Py.norm(Py.or(row.get("processo"), row.get("suite_name")));
    return "";
  }

  public static List<Map<String, Object>> groupExecucoesForReport(
      List<Map<String, Object>> execRows, List<Map<String, Object>> dimensoes) {
    List<Map<String, Object>> visible = visibleDimensions(dimensoes);
    Map<String, Object> processDim = null;
    Map<String, Object> frontDim = null;
    for (Map<String, Object> d : visible) {
      if (processDim == null && "process".equals(d.get("role"))) processDim = d;
      if (frontDim == null && "front".equals(d.get("role"))) frontDim = d;
    }
    Map<String, Map<String, Object>> groups = new LinkedHashMap<>();
    for (Map<String, Object> row : execRows) {
      Map<String, String> parsed = parseDimensions(row);
      if (processDim == null) {
        String processo = Py.norm(row.get("suite_name"));
        if (processo.isEmpty()) processo = SUITE_FALLBACK;
        String key = "suite:" + processo.toLowerCase();
        Map<String, Object> found = groups.get(key);
        if (found != null) {
          Py.rows(found.get("rows")).add(row);
          continue;
        }
        Map<String, String> classificacao = parsed;
        if (classificacao.isEmpty() && !visible.isEmpty() && !Py.norm(row.get("frente")).isEmpty()) {
          classificacao = new LinkedHashMap<>();
          classificacao.put((String) visible.get(0).get("key"), Py.str(row.get("frente")).strip());
        }
        groups.put(key, group(row, classificacao, row.get("frente"), processo));
        continue;
      }
      Map<String, String> classificacao = new LinkedHashMap<>();
      List<String> parts = new ArrayList<>();
      for (Map<String, Object> dim : visible) {
        String value = dimensionValue(row, dim, parsed);
        if (!value.isEmpty()) classificacao.put((String) dim.get("key"), value);
        parts.add(dim.get("key") + "=" + value);
      }
      String key = String.join("\u001f", parts);
      Map<String, Object> found = groups.get(key);
      if (found != null) {
        Py.rows(found.get("rows")).add(row);
        continue;
      }
      String processo = classificacao.get((String) processDim.get("key"));
      if (processo == null || processo.isEmpty()) processo = Py.norm(row.get("suite_name"));
      if (processo.isEmpty()) processo = SUITE_FALLBACK;
      String frontValue = frontDim != null ? classificacao.get((String) frontDim.get("key")) : null;
      groups.put(key, group(row, classificacao, Py.truthy(frontValue) ? frontValue : row.get("frente"), processo));
    }
    return new ArrayList<>(groups.values());
  }

  private static Map<String, Object> group(Map<String, Object> row, Map<String, String> classificacao, Object frente, String processo) {
    List<Map<String, Object>> rows = new ArrayList<>();
    rows.add(row);
    Map<String, Object> g = new LinkedHashMap<>();
    g.put("rows", rows);
    g.put("classificacao", classificacao);
    g.put("frente", frente);
    g.put("processo", processo);
    return g;
  }
}
