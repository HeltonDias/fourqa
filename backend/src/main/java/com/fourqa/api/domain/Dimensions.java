package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Port of {@code fourqa.domain.dimensions}. Dimensions/definitions are plain maps (JSON shape). */
public final class Dimensions {
  public static final Pattern PRIORITY_NAME = Pattern.compile("^(prioridade\\s*\\d+|p\\s*\\d+)$", Pattern.CASE_INSENSITIVE);
  private static final Pattern TRAILING_DIGITS = Pattern.compile("(\\d+)$");
  public static final Comparator<String> LOWER = Comparator.comparing(String::toLowerCase);

  private Dimensions() {}

  static String roleFromColumn(String name) {
    String n = name.strip().toLowerCase();
    if (n.isEmpty() || n.startsWith("nvl") || n.startsWith("nivel") || n.startsWith("nível")) return null;
    if (n.contains("subprocess")) return "subprocess";
    if (n.contains("prior")) return "priority";
    if (n.contains("frente") || n.equals("front")) return "front";
    if (n.contains("process")) return "process";
    return null;
  }

  static String definitionKey(String role, String columnName) {
    switch (role) {
      case "priority":
      case "front":
      case "process":
      case "subprocess":
        return role;
      default:
        break;
    }
    String slug = columnName.strip().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
    return slug.isEmpty() ? "dim-" + role : "dim-" + slug;
  }

  /** context: path_names (List&lt;String&gt;), current_suite_name (String). */
  static String resolveSourceValue(Map<String, Object> context, Map<String, Object> source) {
    if ("current_suite".equals(source.get("type"))) return Py.str(context.get("current_suite_name")).strip();
    @SuppressWarnings("unchecked")
    List<String> names = (List<String>) context.get("path_names");
    int index = (int) Py.toLong(source.get("level")) - 1;
    if (index < 0 || index >= names.size()) return "";
    String v = names.get(index);
    return v == null ? "" : v.strip();
  }

  private static Object entry(Map<String, Object> e, String snake, String camel) {
    return e.containsKey(snake) ? e.get(snake) : e.get(camel);
  }

  /** Accepts snake_case rows (store) and camelCase overrides (sync parameters). */
  public static List<Map<String, Object>> definitionsForPlan(String planKey, List<Map<String, Object>> entries) {
    String target = planKey.strip().toLowerCase();
    List<Map<String, Object>> keyed = new ArrayList<>();
    for (Map<String, Object> e : entries) {
      Object pk = entry(e, "plan_key", "planKey");
      if (Py.truthy(e.get("active")) && Py.truthy(pk) && Py.str(pk).strip().toLowerCase().equals(target)) keyed.add(e);
    }
    List<Map<String, Object>> chosen = keyed;
    if (keyed.isEmpty()) {
      chosen = new ArrayList<>();
      for (Map<String, Object> e : entries) {
        Object pk = entry(e, "plan_key", "planKey");
        if (Py.truthy(e.get("active")) && Py.norm(pk).isEmpty()) chosen.add(e);
      }
    }
    List<Map<String, Object>> sorted = new ArrayList<>(chosen);
    sorted.sort(Comparator.comparingDouble(e -> Py.toDouble(e.get("order"))));
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> e : sorted) {
      String label = Py.str(entry(e, "column_name", "columnName")).strip();
      String role = roleFromColumn(label);
      if (role == null) role = "generic";
      Map<String, Object> source;
      if ("current_suite".equals(entry(e, "source_type", "sourceType"))) {
        source = Py.obj("type", "current_suite");
      } else {
        long level = Math.max(1, Py.truthy(entry(e, "source_level", "sourceLevel")) ? Py.toLong(entry(e, "source_level", "sourceLevel")) : 1);
        source = Py.obj("type", "hierarchy_level", "level", level);
      }
      out.add(Py.obj("key", definitionKey(role, label), "label", label, "role", role, "source", source));
    }
    return out;
  }

  public static Map<String, Object> context(List<String> pathNames, String currentSuiteName) {
    return Py.obj("path_names", pathNames, "current_suite_name", currentSuiteName);
  }

  @SuppressWarnings("unchecked")
  public static Map<String, String> resolveDimensionValues(
      Map<String, Object> context, List<Map<String, Object>> definitions, List<Map<String, Object>> suggestions) {
    if (suggestions == null) suggestions = List.of();
    Map<String, String> out = new LinkedHashMap<>();
    Set<Long> explicitLevels = new HashSet<>();
    for (Map<String, Object> defn : definitions) {
      Map<String, Object> source = (Map<String, Object>) defn.get("source");
      String value = resolveSourceValue(context, source);
      if (value.isEmpty()) continue;
      out.put((String) defn.get("key"), value);
      if ("hierarchy_level".equals(source.get("type"))) explicitLevels.add(Py.toLong(source.get("level")));
    }
    List<String> names = (List<String>) context.get("path_names");
    for (Map<String, Object> dim : suggestions) {
      String key = (String) dim.get("key");
      if (Py.truthy(out.get(key))) continue;
      Object levelObj = dim.get("level");
      if (levelObj != null && explicitLevels.contains(Py.toLong(levelObj))) continue;
      long level = levelObj == null ? 0 : Py.toLong(levelObj);
      if (level - 1 < names.size()) {
        int idx = (int) (level - 1);
        if (idx < 0) idx = names.size() + idx;
        if (idx < 0) continue;
        String name = names.get(idx);
        name = name == null ? "" : name.strip();
        if (!name.isEmpty()) out.put(key, name);
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> buildDimensionCatalog(
      List<Map<String, Object>> definitions, List<Map<String, Object>> suggestions, List<Map<String, Object>> paths) {
    Map<String, Set<String>> valuesByKey = new HashMap<>();
    for (Map<String, Object> path : paths) {
      Map<String, String> resolved = resolveDimensionValues(path, definitions, suggestions);
      for (var e : resolved.entrySet()) valuesByKey.computeIfAbsent(e.getKey(), k -> new LinkedHashSet<>()).add(e.getValue());
    }
    Set<String> explicitKeys = new HashSet<>();
    for (Map<String, Object> d : definitions) explicitKeys.add((String) d.get("key"));
    List<Map<String, Object>> explicitDims = new ArrayList<>();
    for (Map<String, Object> defn : definitions) {
      Map<String, Object> source = (Map<String, Object>) defn.get("source");
      long level = "hierarchy_level".equals(source.get("type")) ? Py.toLong(source.get("level")) : 0;
      List<String> values = new ArrayList<>(valuesByKey.getOrDefault((String) defn.get("key"), Set.of()));
      values.sort(LOWER);
      Map<String, Object> dim = new LinkedHashMap<>();
      dim.put("key", defn.get("key"));
      dim.put("label", defn.get("label"));
      dim.put("role", defn.get("role"));
      dim.put("level", level);
      dim.put("values", values);
      dim.put("confidence", 1.0);
      dim.put("visible", true);
      explicitDims.add(dim);
    }
    List<Map<String, Object>> suggested = new ArrayList<>();
    for (Map<String, Object> dim : suggestions) {
      if (explicitKeys.contains(dim.get("key"))) continue;
      long level = dim.get("level") == null ? 0 : Py.toLong(dim.get("level"));
      boolean clash = false;
      for (Map<String, Object> e : explicitDims) {
        if (Py.eq(e.get("level"), dim.get("level")) && level > 0) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      Set<String> base = valuesByKey.get((String) dim.get("key"));
      List<String> values = new ArrayList<>(base != null ? base : new LinkedHashSet<>(stringList(dim.get("values"))));
      values = new ArrayList<>(new LinkedHashSet<>(values));
      values.sort(LOWER);
      Map<String, Object> copy = new LinkedHashMap<>(dim);
      copy.put("values", values);
      suggested.add(copy);
    }
    List<Map<String, Object>> out = new ArrayList<>(explicitDims);
    out.addAll(suggested);
    return out;
  }

  @SuppressWarnings("unchecked")
  static List<String> stringList(Object v) {
    if (v instanceof List<?> l) return (List<String>) l;
    return List.of();
  }

  public static String legacyRoleValue(
      String role, Map<String, String> classificacao, List<Map<String, Object>> definitions, List<Map<String, Object>> catalog) {
    List<String> keys = new ArrayList<>();
    for (Map<String, Object> d : definitions) if (role.equals(d.get("role"))) keys.add((String) d.get("key"));
    for (Map<String, Object> d : catalog) if (role.equals(d.get("role"))) keys.add((String) d.get("key"));
    Set<String> seen = new HashSet<>();
    for (String key : keys) {
      if (!seen.add(key)) continue;
      String value = classificacao.get(key);
      value = value == null ? "" : value.strip();
      if (!value.isEmpty()) return value;
    }
    return "";
  }

  static String labelFor(String role, long level, String columnName) {
    if (columnName != null && !columnName.isEmpty() && !role.equals("generic")) return columnName;
    return switch (role) {
      case "priority" -> "Prioridade";
      case "front" -> "Frente";
      case "process" -> "Processo";
      case "subprocess" -> "Subprocesso";
      default -> "Nível " + level;
    };
  }

  /** paths: [{ancestors: [{name}]}]; hints: {known_fronts: [...]}. */
  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> detectDimensions(List<Map<String, Object>> paths, Map<String, Object> hints) {
    TreeMap<Integer, Set<String>> byLevel = new TreeMap<>();
    for (Map<String, Object> path : paths) {
      List<Map<String, Object>> nodes = Py.rows(Py.or(path.get("ancestors"), List.of()));
      for (int index = 0; index < nodes.size(); index++) {
        if (index == nodes.size() - 1 && nodes.size() > 1) continue;
        String name = Py.norm(nodes.get(index).get("name"));
        if (name.isEmpty()) continue;
        byLevel.computeIfAbsent(index + 1, k -> new LinkedHashSet<>()).add(name);
      }
    }
    Set<String> fronts = new HashSet<>();
    if (hints != null) {
      for (String s : stringList(hints.get("known_fronts"))) if (!s.strip().isEmpty()) fronts.add(s.strip().toUpperCase());
    }
    List<Map<String, Object>> found = new ArrayList<>();
    for (var entry : byLevel.entrySet()) {
      int level = entry.getKey();
      List<String> values = new ArrayList<>(entry.getValue());
      values.sort(LOWER);
      if (values.isEmpty()) continue;
      double priorityRatio = values.stream().filter(v -> PRIORITY_NAME.matcher(v.strip()).find()).count() / (double) values.size();
      double frontRatio = 0;
      if (!fronts.isEmpty()) {
        frontRatio = values.stream().filter(v -> matchesFront(v, fronts)).count() / (double) values.size();
      }
      String role = "generic";
      double confidence = 0.2;
      if (priorityRatio >= 0.7) {
        role = "priority";
        confidence = 0.9;
      } else if (frontRatio >= 0.7) {
        role = "front";
        confidence = 0.85;
      }
      Map<String, Object> d = new LinkedHashMap<>();
      d.put("key", !role.equals("generic") ? role : "nivel-" + level);
      d.put("label", labelFor(role, level, null));
      d.put("level", (long) level);
      d.put("values", values);
      d.put("role", role);
      d.put("confidence", confidence);
      d.put("visible", true);
      found.add(d);
    }
    Map<String, Integer> seen = new HashMap<>();
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> d : found) {
      String key = (String) d.get("key");
      int n = seen.getOrDefault(key, 0) + 1;
      seen.put(key, n);
      if (n == 1) out.add(d);
      else {
        Map<String, Object> copy = new LinkedHashMap<>(d);
        copy.put("key", key + "-" + d.get("level"));
        out.add(copy);
      }
    }
    return out;
  }

  private static boolean matchesFront(String value, Set<String> fronts) {
    String up = value.strip().toUpperCase();
    if (fronts.contains(up)) return true;
    for (String token : up.split("[^A-Z0-9]+")) if (!token.isEmpty() && fronts.contains(token)) return true;
    return false;
  }

  /** overrides: [{column_name, source_level, active}]. */
  public static List<Map<String, Object>> applyHierarchyOverrides(
      List<Map<String, Object>> dims, List<Map<String, Object>> overrides) {
    List<Map<String, Object>> result = new ArrayList<>();
    for (Map<String, Object> dim : dims) {
      Map<String, Object> manual = null;
      for (Map<String, Object> h : overrides) {
        if (Py.truthy(h.get("active")) && Py.str(h.get("source_level")).equals(Py.str(dim.get("level")))) {
          manual = h;
          break;
        }
      }
      if (manual == null) {
        result.add(dim);
        continue;
      }
      String column = Py.str(manual.get("column_name"));
      String role = roleFromColumn(column);
      Map<String, Object> copy = new LinkedHashMap<>(dim);
      if (role == null) {
        String label = column.strip();
        copy.put("label", label.isEmpty() ? dim.get("label") : label);
        copy.put("confidence", 1.0);
        result.add(copy);
        continue;
      }
      copy.put("role", role);
      copy.put("key", role);
      copy.put("label", labelFor(role, dim.get("level") == null ? 0 : Py.toLong(dim.get("level")), column.strip()));
      copy.put("confidence", 1.0);
      copy.put("visible", true);
      result.add(copy);
    }
    return result;
  }

  public static Map<String, String> valuesForPath(List<Map<String, Object>> ancestors, List<Map<String, Object>> dims) {
    List<String> pathNames = new ArrayList<>();
    for (Map<String, Object> a : ancestors) pathNames.add(Py.truthy(a.get("name")) ? Py.str(a.get("name")) : "");
    String leaf = pathNames.isEmpty() ? "" : pathNames.get(pathNames.size() - 1);
    return resolveDimensionValues(context(pathNames, leaf), List.of(), dims);
  }

  public static List<Map<String, Object>> inferDimensions(List<Map<String, Object>> rows) {
    Map<String, Set<String>> fromJson = new LinkedHashMap<>();
    for (Map<String, Object> row : rows) {
      Object raw = row.get("dimensions_json");
      if (!Py.truthy(raw)) continue;
      Object parsed;
      try {
        parsed = PyJson.loads(Py.str(raw));
      } catch (PyJson.DecodeException e) {
        continue;
      }
      Map<String, Object> m = Py.map(parsed);
      if (m == null) continue;
      for (var e : m.entrySet()) {
        if (e.getValue() instanceof String s && !s.strip().isEmpty())
          fromJson.computeIfAbsent(e.getKey(), k -> new LinkedHashSet<>()).add(s.strip());
      }
    }
    if (!fromJson.isEmpty()) {
      List<Map<String, Object>> out = new ArrayList<>();
      for (var e : fromJson.entrySet()) {
        String key = e.getKey();
        Matcher m = TRAILING_DIGITS.matcher(key);
        long level = m.find() ? Long.parseLong(m.group(1)) : 1;
        String role;
        if (key.startsWith("priority")) role = "priority";
        else if (key.startsWith("front")) role = "front";
        else if (key.startsWith("process")) role = "process";
        else if (key.startsWith("subprocess")) role = "subprocess";
        else role = "generic";
        List<String> values = new ArrayList<>(e.getValue());
        values.sort(LOWER);
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("key", key);
        d.put("label", labelFor(role, level, null));
        d.put("level", level);
        d.put("values", values);
        d.put("role", role);
        d.put("confidence", role.equals("generic") ? 0.2 : 0.9);
        d.put("visible", true);
        out.add(d);
      }
      return out;
    }
    Set<String> set = new LinkedHashSet<>();
    for (Map<String, Object> r : rows) {
      String f = Py.norm(r.get("frente"));
      if (!f.isEmpty()) set.add(f);
    }
    List<String> values = new ArrayList<>(set);
    values.sort(LOWER);
    if (values.isEmpty()) return new ArrayList<>();
    double priorityRatio = values.stream().filter(v -> PRIORITY_NAME.matcher(v).find()).count() / (double) values.size();
    Map<String, Object> d = new LinkedHashMap<>();
    if (priorityRatio >= 0.7) {
      d.put("key", "priority");
      d.put("label", "Prioridade");
      d.put("level", 1L);
      d.put("values", values);
      d.put("role", "priority");
      d.put("confidence", 0.9);
      d.put("visible", true);
    } else {
      d.put("key", "nivel-1");
      d.put("label", "Nível 1");
      d.put("level", 1L);
      d.put("values", values);
      d.put("role", "generic");
      d.put("confidence", 0.2);
      d.put("visible", true);
    }
    List<Map<String, Object>> out = new ArrayList<>();
    out.add(d);
    return out;
  }
}
