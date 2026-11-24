package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Port of {@code fourqa.domain.evolucao_qa} (DEC-037). */
public final class EvolucaoQa {
  public static final String UNATTRIBUTED_KEY = "__nao_atribuivel__";
  private static final Pattern SPLIT = Pattern.compile("[,;/&+]|\\s+e\\s+", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CHARACTER_CLASS);
  private static final Pattern DAY = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})");
  private static final String[] METRICS = {"passed", "na", "failed", "blocked", "released", "design", "notReleased"};

  private EvolucaoQa() {}

  /** [owner, reason]. */
  public static String[] ownerOf(Object responsavel) {
    String text = Py.norm(responsavel);
    if (text.isEmpty()) return new String[] {null, "sem_responsavel"};
    List<String> parts = new ArrayList<>();
    for (String p : SPLIT.split(text, -1)) if (!p.strip().isEmpty()) parts.add(p.strip());
    if (parts.size() != 1) return new String[] {null, "compartilhada"};
    return new String[] {parts.get(0), null};
  }

  static String day(Object value) {
    if (!Py.truthy(value)) return null;
    Matcher m = DAY.matcher(Py.str(value).strip());
    return m.find() ? m.group(1) : null;
  }

  static List<String> days(String start, String end) {
    LocalDate a = LocalDate.parse(start);
    LocalDate b = LocalDate.parse(end);
    List<String> out = new ArrayList<>();
    for (; !a.isAfter(b); a = a.plusDays(1)) out.add(a.toString());
    return out;
  }

  static String itemKey(Map<String, Object> item) {
    if (item.get("suiteId") != null) return "s:" + Py.str(item.get("suiteId"));
    if (item.get("testPointId") != null) return "p:" + Py.str(item.get("testPointId"));
    return null;
  }

  static String rowKey(Map<String, Object> row) {
    if (row.get("suite_id") != null) return "s:" + Py.str(row.get("suite_id"));
    if (row.get("test_point_id") != null) return "p:" + Py.str(row.get("test_point_id"));
    return null;
  }

  private static final class Bucket {
    final Map<String, Object> data = new LinkedHashMap<>();
    final Map<String, Double> plannedByDay = new HashMap<>();
    final Map<String, Double> finalizedByDay = new HashMap<>();
    final Map<String, Double> executedByDay = new HashMap<>();

    Bucket(String key, String name, boolean attributable) {
      data.put("key", key);
      data.put("name", name);
      data.put("attributable", attributable);
      data.put("suites", new ArrayList<Map<String, Object>>());
      for (String k : new String[] {"baseline", "planned", "plannedToDate", "finalized", "executed"}) data.put(k, 0.0);
      for (String k : METRICS) data.put(k, 0.0);
      data.put("finalizedInRange", 0.0);
      data.put("reasons", Py.obj("sem_responsavel", 0L, "compartilhada", 0L));
    }

    double get(String k) {
      return (Double) data.get(k);
    }

    void add(String k, double v) {
      data.put(k, get(k) + v);
    }
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> build(
      List<Map<String, Object>> items, List<Map<String, Object>> execRows, String start, String end, String asOf) {
    List<String> days = start.compareTo(end) <= 0 ? days(start, end) : new ArrayList<>();
    String cutoff = asOf.compareTo(end) <= 0 ? asOf : end;
    Map<String, Bucket> buckets = new LinkedHashMap<>();
    Map<String, String> ownerByKey = new HashMap<>();
    for (Map<String, Object> item : items) {
      String[] or = ownerOf(item.get("responsavel"));
      String owner = or[0];
      String reason = or[1];
      Bucket bucket;
      if (owner == null) bucket = buckets.computeIfAbsent(UNATTRIBUTED_KEY, k -> new Bucket(k, "Não atribuível", false));
      else bucket = buckets.computeIfAbsent(owner.toLowerCase(), k -> new Bucket(k, owner, true));
      if (reason != null) {
        Map<String, Object> reasons = (Map<String, Object>) bucket.data.get("reasons");
        reasons.put(reason, (Long) reasons.get(reason) + 1);
      }
      String key = itemKey(item);
      if (key != null) ownerByKey.put(key, (String) bucket.data.get("key"));
      Map<String, Object> suite = new LinkedHashMap<>();
      suite.put("suiteId", item.get("suiteId"));
      suite.put("testPointId", item.get("testPointId"));
      suite.put("suiteName", item.get("suiteName"));
      suite.put("responsavel", item.get("responsavel"));
      suite.put("dimensions", Py.or(item.get("dimensions"), new LinkedHashMap<>()));
      ((List<Map<String, Object>>) bucket.data.get("suites")).add(suite);
      bucket.add("baseline", Py.toDouble(item.get("baselineCount")));
      for (String metric : METRICS) bucket.add(metric, Py.toDouble(item.get(metric)));
      Map<String, Object> allocations = Py.map(item.get("allocations"));
      if (allocations != null) {
        for (var e : allocations.entrySet()) {
          String d = day(e.getKey());
          if (d == null || d.compareTo(start) < 0 || d.compareTo(end) > 0) continue;
          double q = Py.toDouble(e.getValue());
          bucket.add("planned", q);
          bucket.plannedByDay.merge(d, q, Double::sum);
          if (d.compareTo(cutoff) <= 0) bucket.add("plannedToDate", q);
        }
      }
    }
    for (Map<String, Object> row : execRows) {
      String key = rowKey(row);
      String bucketKey = ownerByKey.get(key == null ? "" : key);
      if (bucketKey == null) continue;
      String status = Formulas.classifyExecution(row);
      if (!status.equals("passed") && !status.equals("na") && !status.equals("falhado")) continue;
      String d = day(row.get("date_completed"));
      if (d == null) d = day(row.get("last_updated_date"));
      if (d == null || d.compareTo(start) < 0 || d.compareTo(cutoff) > 0) continue;
      Bucket bucket = buckets.get(bucketKey);
      bucket.executedByDay.merge(d, 1.0, Double::sum);
      if (status.equals("passed") || status.equals("na")) {
        bucket.add("finalizedInRange", 1);
        bucket.finalizedByDay.merge(d, 1.0, Double::sum);
      }
    }
    for (Bucket b : buckets.values()) {
      b.data.put("finalized", b.get("passed") + b.get("na"));
      b.data.put("executed", b.get("passed") + b.get("na") + b.get("failed"));
    }
    List<Map<String, Object>> finished = new ArrayList<>();
    for (Bucket b : buckets.values()) finished.add(finish(b, days, asOf));
    List<Map<String, Object>> qas = new ArrayList<>();
    Map<String, Object> unattributed = null;
    for (Map<String, Object> b : finished) {
      if (Boolean.TRUE.equals(b.get("attributable"))) qas.add(b);
      else if (unattributed == null) unattributed = b;
    }
    qas.sort((a, b) -> ((String) a.get("name")).toLowerCase().compareTo(((String) b.get("name")).toLowerCase()));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("range", Py.obj("from", start, "to", end, "asOf", asOf));
    out.put("qas", qas);
    out.put("unattributed", unattributed);
    return out;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> finish(Bucket bucket, List<String> days, String asOf) {
    List<Map<String, Object>> series = new ArrayList<>();
    double accPlan = 0, accFin = 0;
    for (String d : days) {
      accPlan += bucket.plannedByDay.getOrDefault(d, 0.0);
      accFin += bucket.finalizedByDay.getOrDefault(d, 0.0);
      Map<String, Object> p = new LinkedHashMap<>();
      p.put("date", d);
      p.put("planned", bucket.plannedByDay.getOrDefault(d, 0.0));
      p.put("finalized", bucket.finalizedByDay.getOrDefault(d, 0.0));
      p.put("executed", bucket.executedByDay.getOrDefault(d, 0.0));
      p.put("plannedCumulative", accPlan);
      p.put("finalizedCumulative", d.compareTo(asOf) <= 0 ? accFin : null);
      series.add(p);
    }
    double gap = bucket.get("plannedToDate") - bucket.get("finalizedInRange");
    Map<String, Object> data = bucket.data;
    data.put("gap", gap);
    data.put(
        "status",
        Boolean.TRUE.equals(data.get("attributable"))
            ? StatusFrente.statusEvolucao(gap, bucket.get("baseline"), bucket.get("finalized"), bucket.get("na"))
            : null);
    data.put("suiteCount", (long) ((List<Object>) data.get("suites")).size());
    data.put("daily", series);
    return data;
  }
}
