package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Port of {@code fourqa.domain.planning}. */
public final class Planning {
  public static final int SUITE_FILL_MAX_LENGTH = 80;
  private static final Pattern HEAD = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})");

  private Planning() {}

  public static String scopeGroupKey(Map<String, Object> item, int index) {
    if (item.get("suite_id") != null) return "suite:" + Py.str(item.get("suite_id"));
    if (item.get("test_point_id") != null) return "point:" + Py.str(item.get("test_point_id"));
    return "loose:" + index;
  }

  public static String previousFillKey(Map<String, Object> item) {
    if (item.get("suite_id") != null) return "suite:" + Py.str(item.get("suite_id"));
    if (item.get("test_point_id") != null) return "point:" + Py.str(item.get("test_point_id"));
    return null;
  }

  public static String normalizeSuiteFill(String value) {
    if (value == null) return null;
    String trimmed = value.strip();
    if (trimmed.isEmpty()) return null;
    if (trimmed.codePointCount(0, trimmed.length()) > SUITE_FILL_MAX_LENGTH)
      throw new IllegalArgumentException("Responsável e prioridade aceitam no máximo 80 caracteres.");
    return trimmed;
  }

  public static List<Map<String, Object>> scheduleItemsForScope(
      List<Map<String, Object>> scope,
      Map<Object, String> suiteNames,
      List<Map<String, Object>> previous,
      Function<String, Map<String, Object>> inherited) {
    Map<String, Map<String, Object>> groups = new LinkedHashMap<>();
    for (int index = 0; index < scope.size(); index++) {
      Map<String, Object> item = scope.get(index);
      String key = scopeGroupKey(item, index);
      Map<String, Object> found = groups.get(key);
      if (found != null) {
        found.put("count", (Long) found.get("count") + 1);
        continue;
      }
      boolean withSuite = item.get("suite_id") != null;
      Map<String, Object> g = new LinkedHashMap<>();
      g.put("suite_id", item.get("suite_id"));
      g.put("test_point_id", withSuite ? null : item.get("test_point_id"));
      g.put("test_case_id", withSuite ? null : item.get("test_case_id"));
      g.put("count", 1L);
      groups.put(key, g);
    }
    Map<String, Map<String, Object>> prevMap = new LinkedHashMap<>();
    List<Map<String, Object>> loosePrevious = new ArrayList<>();
    for (Map<String, Object> item : previous) {
      String key = previousFillKey(item);
      if (key != null) prevMap.put(key, item);
      else loosePrevious.add(item);
    }
    long looseGroups = groups.values().stream().filter(g -> previousFillKey(g) == null).count();
    Map<String, Object> loneLoose = loosePrevious.size() == 1 && looseGroups == 1 ? loosePrevious.get(0) : null;
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> group : groups.values()) {
      String key = previousFillKey(group);
      Map<String, Object> kept = key != null ? prevMap.get(key) : loneLoose;
      Object suiteId = group.get("suite_id");
      String suiteName = Py.isInt(suiteId) ? suiteNames.get(((Number) suiteId).longValue()) : null;
      Map<String, Object> inheritedDates = null;
      if (inherited != null && suiteName != null && !suiteName.isEmpty()) inheritedDates = inherited.apply(suiteName);
      Map<String, Object> draft = new LinkedHashMap<>();
      draft.put("suite_id", group.get("suite_id"));
      draft.put("test_point_id", group.get("test_point_id"));
      draft.put("test_case_id", group.get("test_case_id"));
      draft.put("suite_name", suiteName);
      boolean keptTruthy = Py.truthy(kept);
      draft.put("planned_start", keptTruthy ? kept.get("planned_start") : null);
      draft.put("planned_end", keptTruthy ? kept.get("planned_end") : null);
      draft.put("responsavel", keptTruthy && Py.truthy(suiteId) ? kept.get("responsavel") : null);
      draft.put("prioridade", keptTruthy && Py.truthy(suiteId) ? kept.get("prioridade") : null);
      draft.put("baseline_quantity", group.get("count"));
      List<Map<String, Object>> allocations = new ArrayList<>();
      if (keptTruthy) {
        for (Map<String, Object> a : Py.rows(Py.or(kept.get("allocations"), List.of()))) {
          allocations.add(Py.obj("date", a.get("date"), "quantity", a.get("quantity")));
        }
      }
      draft.put("allocations", allocations);
      out.add(draft);
      if (Py.truthy(inheritedDates)) {
        if (!Py.truthy(draft.get("planned_start"))) draft.put("planned_start", inheritedDates.get("start"));
        if (!Py.truthy(draft.get("planned_end"))) draft.put("planned_end", inheritedDates.get("end"));
      }
    }
    return out;
  }

  public static Map<String, Object> matchScheduleItem(List<Map<String, Object>> items, Map<String, Object> input) {
    Object suiteId = input.get("suite_id");
    Object testPointId = input.get("test_point_id");
    if (suiteId != null) {
      for (Map<String, Object> row : items) if (Py.eq(row.get("suite_id"), suiteId)) return row;
      return null;
    }
    if (testPointId != null) {
      for (Map<String, Object> row : items)
        if (row.get("suite_id") == null && Py.eq(row.get("test_point_id"), testPointId)) return row;
      return null;
    }
    List<Map<String, Object>> loose = new ArrayList<>();
    for (Map<String, Object> row : items)
      if (row.get("suite_id") == null && row.get("test_point_id") == null) loose.add(row);
    return loose.size() == 1 ? loose.get(0) : null;
  }

  private static String orEmpty(Object v) {
    return Py.truthy(v) ? Py.str(v) : "";
  }

  public static String scopeIdentity(Map<String, Object> ref) {
    return orEmpty(ref.get("plan_id")) + "|" + orEmpty(ref.get("suite_id")) + "|" + orEmpty(ref.get("test_point_id")) + "|"
        + orEmpty(ref.get("test_case_id"));
  }

  public static Map<String, Object> diffScope(List<Map<String, Object>> baseline, List<Map<String, Object>> source) {
    Map<String, Map<String, Object>> base = new LinkedHashMap<>();
    for (Map<String, Object> item : baseline) base.put(scopeIdentity(item), item);
    Map<String, Map<String, Object>> current = new LinkedHashMap<>();
    for (Map<String, Object> item : source) current.put(scopeIdentity(item), item);
    List<Map<String, Object>> added = new ArrayList<>();
    for (var e : current.entrySet()) if (!base.containsKey(e.getKey())) added.add(e.getValue());
    List<Map<String, Object>> removed = new ArrayList<>();
    for (var e : base.entrySet()) if (!current.containsKey(e.getKey())) removed.add(e.getValue());
    Set<Long> baseSuites = suiteIds(baseline);
    Set<Long> sourceSuites = suiteIds(source);
    long addedSuites = sourceSuites.stream().filter(s -> !baseSuites.contains(s)).count();
    long removedSuites = baseSuites.stream().filter(s -> !sourceSuites.contains(s)).count();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("baseline_count", (long) baseline.size());
    out.put("source_count", (long) source.size());
    out.put("added_count", (long) added.size());
    out.put("removed_count", (long) removed.size());
    out.put("scope_delta", (long) (added.size() - removed.size()));
    out.put("added_items", added);
    out.put("removed_items", removed);
    out.put("added_suites", addedSuites);
    out.put("removed_suites", removedSuites);
    return out;
  }

  private static Set<Long> suiteIds(List<Map<String, Object>> items) {
    Set<Long> out = new HashSet<>();
    for (Map<String, Object> i : items) if (i.get("suite_id") != null) out.add(Py.toLong(i.get("suite_id")));
    return out;
  }

  public static String calendarDate(Object value) {
    if (!Py.truthy(value)) return null;
    String s = Py.str(value).strip();
    Matcher head = HEAD.matcher(s);
    if (head.find()) return PlanPeriod.parseCalendarDay(head.group(1));
    return PlanPeriod.parseCalendarDay(s);
  }

  public static Map<String, Object> scheduleOf(
      long baselineCount, List<Map<String, Object>> allocations, String asOf, long finalizedCount) {
    long distributed = 0;
    for (Map<String, Object> row : allocations) distributed += Py.toLong(row.get("planned_quantity"));
    String asOfDay = calendarDate(asOf);
    if (asOfDay == null) asOfDay = asOf;
    long plannedToDate = 0;
    for (Map<String, Object> row : allocations) {
      Object date = row.get("date");
      String day = calendarDate(date == null ? "" : Py.str(date));
      if (day != null && day.compareTo(asOfDay) <= 0) plannedToDate += Py.toLong(row.get("planned_quantity"));
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("baseline_count", baselineCount);
    out.put("distributed_count", distributed);
    out.put("distribution_gap", distributed - baselineCount);
    out.put("planned_to_date", plannedToDate);
    out.put("finalized_count", finalizedCount);
    out.put("schedule_delta", finalizedCount - plannedToDate);
    out.put("backlog", Math.max(plannedToDate - finalizedCount, 0));
    out.put("ahead_of_plan", Math.max(finalizedCount - plannedToDate, 0));
    return out;
  }

  public static List<String> datesBetween(Object start, Object end) {
    String a = calendarDate(start);
    String b = calendarDate(end);
    if (a == null || b == null || a.compareTo(b) > 0) return new ArrayList<>();
    if (PlanPeriod.calendarDaySpanInclusive(a, b) > PlanPeriod.MAX_DAYS) return new ArrayList<>();
    List<String> out = new ArrayList<>();
    LocalDate cursor = LocalDate.parse(a);
    LocalDate last = LocalDate.parse(b);
    while (!cursor.isAfter(last)) {
      out.add(cursor.toString());
      cursor = cursor.plusDays(1);
    }
    return out;
  }

  private static String lnorm(Object v) {
    return Py.norm(v).toLowerCase();
  }

  public static Map<String, String> assessPoint(Map<String, Object> point) {
    String outcome = lnorm(point.get("outcome"));
    String testCase = lnorm(point.get("test_case_state"));
    String classification = Formulas.classifyExecution(point);
    if (outcome.equals("passed") && testCase.equals("bug"))
      return Map.of("classification", classification, "integrity", "inconsistent");
    boolean knownOutcome = Set.of("passed", "failed", "blocked", "notapplicable").contains(outcome);
    boolean knownCase = Set.of("design", "não atribuído", "nao atribuido").contains(testCase);
    boolean ready = lnorm(point.get("test_point_state")).equals("ready") && !knownOutcome;
    if (knownOutcome || knownCase || ready) return Map.of("classification", classification, "integrity", "consistent");
    return Map.of("classification", "unclassified", "integrity", "unmapped");
  }

  public static Map<String, Object> countAssessments(List<Map<String, Object>> points) {
    long classified = 0, unclassified = 0, inconsistent = 0, finalized = 0;
    for (Map<String, Object> p : points) {
      Map<String, String> row = assessPoint(p);
      if (!row.get("classification").equals("unclassified")) classified++;
      if (row.get("integrity").equals("unmapped")) unclassified++;
      if (row.get("integrity").equals("inconsistent")) inconsistent++;
      if (row.get("classification").equals("passed") || row.get("classification").equals("na")) finalized++;
    }
    return Py.obj(
        "classified_count", classified,
        "unclassified_count", unclassified,
        "inconsistent_count", inconsistent,
        "finalized_count", finalized);
  }

  public static String scopeIntegrityMessage(boolean snapshotAvailable, long added, long removed) {
    if (!snapshotAvailable)
      return "Baseline legado sem snapshot dos CTs. Não há informação suficiente para validar o que entrou ou saiu.";
    if (added == 0 && removed == 0) return null;
    List<String> parts = new ArrayList<>();
    if (added == 1) parts.add("1 CT foi adicionado após a confirmação do baseline");
    else if (added > 1) parts.add(added + " CTs foram adicionados após a confirmação do baseline");
    if (removed == 1) parts.add("1 CT foi removido da fonte");
    else if (removed > 1) parts.add(removed + " CTs foram removidos da fonte");
    return String.join(". ", parts) + ".";
  }

  private static String countText(double value) {
    return value == Math.rint(value) ? String.valueOf((long) value) : Py.floatRepr(value);
  }

  public static String scheduleIntegrityMessage(double baseline, double distributed) {
    double gap = distributed - baseline;
    if (gap == 0) return null;
    if (gap < 0) {
      String suffix = gap == -1 ? "" : "s";
      return countText(-gap) + " cenário" + suffix + " ainda não distribuído" + suffix + " no cronograma";
    }
    String suffix = gap == 1 ? "" : "s";
    return countText(gap) + " cenário" + suffix + " distribuído" + suffix + " além do baseline";
  }

  public static String classificationIntegrityMessage(long unclassified, long inconsistent) {
    List<String> parts = new ArrayList<>();
    if (unclassified > 0) {
      String suffix = unclassified == 1 ? "" : "s";
      parts.add(unclassified + " cenário" + suffix + " não classificado" + suffix);
    }
    if (inconsistent > 0) parts.add(inconsistent + " combinação inconsistente");
    return parts.isEmpty() ? null : String.join(". ", parts) + ".";
  }

  public static Map<String, Object> nextRevision(
      Map<String, Object> previous, String at, String reason, List<Map<String, Object>> scope, boolean adoptSource) {
    List<Map<String, Object>> scopeCopy = new ArrayList<>();
    List<Map<String, Object>> from = previous != null && !adoptSource ? Py.rows(previous.get("scope")) : scope;
    for (Map<String, Object> item : from) scopeCopy.add(new LinkedHashMap<>(item));
    Map<String, Object> current = new LinkedHashMap<>();
    current.put("version", (previous != null ? Py.toLong(previous.get("version")) : 0) + 1);
    current.put("created_at", at);
    current.put("reason", reason.strip());
    current.put("baseline_origin", "motor");
    current.put("scope_snapshot_available", true);
    current.put("scope", scopeCopy);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("previous", previous);
    out.put("current", current);
    return out;
  }
}
