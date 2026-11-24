package com.fourqa.api.services;

import com.fourqa.api.domain.Dimensions;
import com.fourqa.api.domain.Distribute;
import com.fourqa.api.domain.Formulas;
import com.fourqa.api.domain.PlanPeriod;
import com.fourqa.api.domain.Planning;
import com.fourqa.api.domain.StatusFrente;
import com.fourqa.api.persistence.PlanningStore;
import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.persistence.ScheduleFingerprint;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/** Planning service (port of {@code fourqa.services.planning_service}). Validation errors are IllegalArgumentException (Python ValueError). */
public final class PlanningService {
  private static final Pattern LINHA_TOTAIS = Pattern.compile("valores\\s+totais", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

  private PlanningService() {}

  static Stores stores() {
    return Stores.get();
  }

  static PlanningStore planning() {
    return stores().planning;
  }

  public static String hojeLocal() {
    return LocalDate.now().toString();
  }

  static List<Map<String, Object>> legacyBase(String planKey, Map<String, String> bag) {
    String owner = bag != null ? bag.get("planejamento_legado_plan_key") : stores().meta.get("planejamento_legado_plan_key");
    if (!StatusFrente.isLegacyPlanOwner(planKey, owner)) return new ArrayList<>();
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : stores().legacyPlan.listBase())
      if (!LINHA_TOTAIS.matcher(Py.orText(r.get("processo"), "")).find()) out.add(r);
    return out;
  }

  static Map<String, Object> dimsOf(Map<String, Object> row) {
    Object raw = row.get("dimensions_json");
    Map<String, Object> out = new LinkedHashMap<>();
    if (!Py.truthy(raw)) return out;
    try {
      Map<String, Object> parsed = Py.map(PyJson.loads(Py.str(raw)));
      if (parsed == null) return out;
      for (var e : parsed.entrySet())
        if (e.getValue() instanceof String s && !s.strip().isEmpty()) out.put(e.getKey(), s.strip());
    } catch (PyJson.DecodeException ignored) {
      // invalid dimensions_json reads as no dimensions
    }
    return out;
  }

  static String scopeNote(String origin, boolean snapshot, long added, long removed) {
    if (origin.equals("ausente")) return "Planejamento ainda não confirmado. A fonte atual é sugestão e não entra no baseline.";
    return Planning.scopeIntegrityMessage(snapshot, added, removed);
  }

  static List<Map<String, Object>> scopeOfGroup(Map<String, Object> sample, List<Map<String, Object>> scope) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (!Py.truthy(sample)) return out;
    if (sample.get("suite_id") != null) {
      for (Map<String, Object> s : scope) if (Py.eq(s.get("suite_id"), sample.get("suite_id"))) out.add(s);
      return out;
    }
    if (sample.get("test_point_id") != null) {
      for (Map<String, Object> s : scope)
        if (s.get("suite_id") == null && Py.eq(s.get("test_point_id"), sample.get("test_point_id"))) out.add(s);
    }
    return out;
  }

  static List<Map<String, Object>> sourceScopeOf(List<Map<String, Object>> execRows, String labelField) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : execRows) {
      if (r.get("test_point_id") == null) continue;
      Map<String, Object> s = new LinkedHashMap<>();
      s.put("plan_id", r.get("plan_id"));
      s.put("suite_id", r.get("suite_id"));
      s.put("test_point_id", r.get("test_point_id"));
      s.put("test_case_id", r.get("test_case_id"));
      s.put("label", r.get(labelField));
      out.add(s);
    }
    return out;
  }

  static Map<String, Object> fillKeyRef(Object suiteId, Object testPointId) {
    Map<String, Object> ref = new LinkedHashMap<>();
    ref.put("suite_id", suiteId);
    ref.put("test_point_id", testPointId);
    return ref;
  }

  static long countIntegrity(List<Map<String, String>> points, String integrity) {
    return points.stream().filter(p -> integrity.equals(p.get("integrity"))).count();
  }

  public static Map<String, Object> getPlanningView(String planKey) {
    return getPlanningView(planKey, null);
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> getPlanningView(String planKey, Long version) {
    Map<String, String> bag = stores().meta.getMany(List.of("data_inicio", "data_fim", "planejamento_legado_plan_key", "dimensoes_catalog:" + planKey));
    PlanPeriod.assertStoredPlanningPeriod(bag.get("data_inicio"), bag.get("data_fim"));
    PlanningStore planning = planning();
    List<Map<String, Object>> execRows = stores().azureSnapshot.listExecucoes(planKey);
    String asOf = hojeLocal();
    Map<String, Object> revision = version != null ? planning.revisionByVersion(planKey, version) : planning.latestRevision(planKey);
    boolean editable = version == null;
    boolean snapshot = revision != null && Py.eq(revision.get("scope_snapshot"), 1L);
    List<Map<String, Object>> baselineScope = snapshot ? planning.loadScope(Py.toLong(revision.get("id"))) : new ArrayList<>();
    List<Map<String, Object>> sourceScope = sourceScopeOf(execRows, "test_case_title");
    Map<String, Object> diff;
    if (snapshot) diff = Planning.diffScope(baselineScope, sourceScope);
    else {
      diff = new LinkedHashMap<>();
      diff.put("baseline_count", 0L);
      diff.put("source_count", (long) sourceScope.size());
      diff.put("added_count", 0L);
      diff.put("removed_count", 0L);
      diff.put("scope_delta", 0L);
      diff.put("added_items", new ArrayList<>());
      diff.put("removed_items", new ArrayList<>());
      diff.put("added_suites", 0L);
      diff.put("removed_suites", 0L);
    }
    List<Map<String, Object>> legacyRows = legacyBase(planKey, bag);
    Map<String, Map<String, Object>> legacy = new LinkedHashMap<>();
    for (Map<String, Object> r : legacyRows) legacy.put(Py.orText(r.get("processo"), "").strip().toLowerCase(), r);
    Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
    for (int index = 0; index < execRows.size(); index++) {
      Map<String, Object> row = execRows.get(index);
      String key = Planning.previousFillKey(fillKeyRef(row.get("suite_id"), row.get("suite_id") == null ? row.get("test_point_id") : null));
      if (key == null) key = "loose:" + index;
      groups.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
    }
    Map<String, Map<String, Object>> allocBySuite = new LinkedHashMap<>();
    Map<String, Map<String, Object>> periodBySuite = new LinkedHashMap<>();
    if (revision != null) {
      for (Map<String, Object> item : planning.loadSchedule(Py.toLong(revision.get("id")))) {
        String key = Planning.previousFillKey(fillKeyRef(item.get("suite_id"), item.get("test_point_id")));
        if (key == null) key = "loose:" + item.get("id");
        boolean withSuite = item.get("suite_id") != null;
        Map<String, Object> period = new LinkedHashMap<>();
        period.put("start", item.get("planned_start"));
        period.put("end", item.get("planned_end"));
        period.put("qty", item.get("baseline_quantity"));
        period.put("name", item.get("suite_name"));
        period.put("responsavel", withSuite ? item.get("responsavel") : null);
        period.put("prioridade", withSuite ? item.get("prioridade") : null);
        periodBySuite.put(key, period);
        Map<String, Object> allocs = new LinkedHashMap<>();
        for (Map<String, Object> a : Py.rows(Py.or(item.get("allocations"), List.of()))) allocs.put(Py.str(a.get("date")), a.get("quantity"));
        allocBySuite.put(key, allocs);
      }
    }
    if (!snapshot && !legacyRows.isEmpty()) return legacyPlanningView(planKey, asOf, legacyRows, execRows, sourceScope.size());
    List<Map<String, Object>> items = new ArrayList<>();
    long classified = 0, unclassified = 0, inconsistent = 0;
    for (var g : groups.entrySet()) {
      String key = g.getKey();
      List<Map<String, Object>> rows = g.getValue();
      Map<String, Object> sample = rows.get(0);
      String name = Py.orText(sample.get("suite_name"), "").strip();
      Map<String, Object> legacyRow = legacy.get(name.toLowerCase());
      Map<String, Object> period = periodBySuite.get(key);
      List<Map<String, String>> points = new ArrayList<>();
      for (Map<String, Object> r : rows) points.add(Planning.assessPoint(r));
      classified += points.stream().filter(p -> !"unclassified".equals(p.get("classification"))).count();
      long itemUnmapped = countIntegrity(points, "unmapped");
      long itemInconsistent = countIntegrity(points, "inconsistent");
      unclassified += itemUnmapped;
      inconsistent += itemInconsistent;
      Map<String, Object> metrics = Formulas.metricasDosPontos(rows);
      long baseFinal = Py.toLong(metrics.get("cts_passeds")) + Py.toLong(metrics.get("cts_na"));
      Object finalized = legacyRow != null ? (Object) (baseFinal + Py.toDouble(legacyRow.get("cts_cancelados"))) : (Object) baseFinal;
      List<Map<String, Object>> suiteScope = scopeOfGroup(sample, baselineScope);
      List<Map<String, Object>> suiteSource = scopeOfGroup(sample, sourceScope);
      Map<String, Object> suiteDiff = snapshot ? Planning.diffScope(suiteScope, suiteSource) : null;
      Object baselineCount = snapshot ? (Object) (long) suiteScope.size()
          : legacyRow != null ? (Object) Py.toDouble(legacyRow.get("qtd_cts_plan")) : null;
      Map<String, Object> allocations = allocBySuite.getOrDefault(key, new LinkedHashMap<>());
      List<Map<String, Object>> allocRows = new ArrayList<>();
      for (var a : allocations.entrySet()) allocRows.add(Py.obj("date", a.getKey(), "planned_quantity", a.getValue()));
      Map<String, Object> math = Planning.scheduleOf(
          (long) Py.toDouble(baselineCount), allocRows, asOf, (long) Py.toDouble(finalized));
      boolean withSuite = sample.get("suite_id") != null;
      Map<String, Object> periodOrEmpty = period != null ? period : Map.of();
      Map<String, Object> legacyOrEmpty = legacyRow != null ? legacyRow : Map.of();
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("suiteId", sample.get("suite_id"));
      item.put("testPointId", withSuite ? null : sample.get("test_point_id"));
      item.put("suiteName", name.isEmpty() ? "(sem suíte)" : name);
      item.put("responsavel", period != null && withSuite ? period.get("responsavel") : null);
      item.put("prioridade", period != null && withSuite ? period.get("prioridade") : null);
      item.put("dimensions", dimsOf(sample));
      item.put("plannedStart", Planning.calendarDate(Py.or(periodOrEmpty.get("start"), legacyOrEmpty.get("data_inicio"))));
      item.put("plannedEnd", Planning.calendarDate(Py.or(periodOrEmpty.get("end"), legacyOrEmpty.get("data_fim"))));
      item.put("baselineCount", baselineCount);
      item.put("sourceCount", (long) rows.size());
      item.put("addedCount", suiteDiff != null ? suiteDiff.get("added_count") : 0L);
      item.put("removedCount", suiteDiff != null ? suiteDiff.get("removed_count") : 0L);
      item.put("distributedCount", math.get("distributed_count"));
      item.put("distributionGap", baselineCount == null ? null : math.get("distribution_gap"));
      item.put("plannedToDate", math.get("planned_to_date"));
      item.put("finalizedCount", finalized);
      item.put("failed", metrics.get("cts_falhados"));
      item.put("blocked", metrics.get("cts_bloqueados"));
      item.put("passed", metrics.get("cts_passeds"));
      item.put("na", metrics.get("cts_na"));
      item.put("released", metrics.get("cts_liberados"));
      item.put("design", metrics.get("cts_design"));
      item.put("notReleased", metrics.get("cts_nao_liberados"));
      item.put("unclassifiedCount", itemUnmapped);
      item.put("inconsistentCount", itemInconsistent);
      item.put("backlog", math.get("backlog"));
      item.put("aheadOfPlan", math.get("ahead_of_plan"));
      item.put("allocations", allocations);
      List<String> warnings = new ArrayList<>();
      if (snapshot && suiteDiff != null) {
        String w = Planning.scopeIntegrityMessage(true, Py.toLong(suiteDiff.get("added_count")), Py.toLong(suiteDiff.get("removed_count")));
        if (Py.truthy(w)) warnings.add(w);
      }
      String cw = Planning.classificationIntegrityMessage(itemUnmapped, itemInconsistent);
      if (Py.truthy(cw)) warnings.add(cw);
      if (baselineCount != null) {
        String sw = Planning.scheduleIntegrityMessage((long) Py.toDouble(baselineCount), Py.toLong(math.get("distributed_count")));
        if (Py.truthy(sw)) warnings.add(sw);
      }
      item.put("warnings", warnings);
      items.add(item);
    }
    TreeSet<String> dateSet = new TreeSet<>();
    for (Map<String, Object> item : items) {
      dateSet.addAll(Planning.datesBetween(item.get("plannedStart"), item.get("plannedEnd")));
      for (String day : ((Map<String, Object>) item.get("allocations")).keySet()) {
        String cd = Planning.calendarDate(day);
        if (cd != null) dateSet.add(cd);
      }
    }
    Object baselineCount;
    if (snapshot) baselineCount = diff.get("baseline_count");
    else {
      double total = 0;
      for (Map<String, Object> i : items) total += Py.toDouble(i.get("baselineCount"));
      baselineCount = total;
    }
    long distributedCount = 0, plannedToDate = 0;
    double finalizedCount = 0;
    for (Map<String, Object> i : items) {
      distributedCount += Py.toLong(i.get("distributedCount"));
      plannedToDate += Py.toLong(i.get("plannedToDate"));
      finalizedCount += Py.toDouble(i.get("finalizedCount"));
    }
    Map<String, Object> origin = new LinkedHashMap<>();
    if (revision != null) {
      origin.put("version", revision.get("version"));
      origin.put("reason", revision.get("reason"));
      origin.put("createdAt", revision.get("created_at"));
      origin.put("baselineOrigin", "motor");
      origin.put("scopeSnapshotAvailable", snapshot);
    } else {
      origin.put("version", null);
      origin.put("reason", null);
      origin.put("createdAt", null);
      origin.put("baselineOrigin", !legacy.isEmpty() ? "legacy" : "ausente");
      origin.put("scopeSnapshotAvailable", false);
    }
    long addedCount = snapshot ? Py.toLong(diff.get("added_count")) : 0;
    long removedCount = snapshot ? Py.toLong(diff.get("removed_count")) : 0;
    String scopeCheck = scopeNote((String) origin.get("baselineOrigin"), snapshot, addedCount, removedCount);
    double baseline = Py.toDouble(baselineCount);
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("baselineCount", baselineCount);
    summary.put("sourceCount", (long) sourceScope.size());
    summary.put("addedCount", addedCount);
    summary.put("removedCount", removedCount);
    summary.put("scopeDelta", snapshot ? diff.get("scope_delta") : 0L);
    summary.put("distributedCount", distributedCount);
    summary.put("distributionGap", sameKind(distributedCount - baseline, baselineCount));
    summary.put("plannedToDate", plannedToDate);
    summary.put("finalizedCount", finalizedCount);
    summary.put("backlog", floatOrZero(plannedToDate - finalizedCount));
    summary.put("aheadOfPlan", floatOrZero(finalizedCount - plannedToDate));
    summary.put("classifiedCount", classified);
    summary.put("unclassifiedCount", unclassified);
    summary.put("inconsistentCount", inconsistent);
    summary.put("scopeCheck", scopeCheck);
    Map<String, Object> integrity = new LinkedHashMap<>();
    integrity.put("scope", scopeCheck);
    integrity.put("classification", Planning.classificationIntegrityMessage(unclassified, inconsistent));
    integrity.put("schedule", Planning.scheduleIntegrityMessage(baseline, distributedCount));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("planning", Py.obj("planKey", planKey));
    out.put("revision", origin);
    out.put("summary", summary);
    out.put("dimensions", catalog(planKey, execRows, bag));
    out.put("dates", new ArrayList<>(dateSet));
    out.put("items", items);
    out.put("integrity", integrity);
    out.put(
        "executionHistory",
        Py.obj(
            "reconstructed", false,
            "note", "O histórico de execução passa a ser observável a partir das sincronizações do FourQA. O estado atual do Test Point não reconstrói execuções antigas."));
    out.put("revisions", planning.listRevisions(planKey));
    out.put("editable", editable);
    return out;
  }

  static Object sameKind(double value, Object reference) {
    return Py.isInt(reference) ? (Object) (long) value : (Object) value;
  }

  /** Python {@code max(x, 0)} with float {@code x}: the int 0 wins only when {@code x} is negative. */
  static Object floatOrZero(double value) {
    return value < 0 ? (Object) 0L : (Object) value;
  }

  static List<Map<String, Object>> catalog(String planKey, List<Map<String, Object>> rows, Map<String, String> bag) {
    return ReportService.catalog(planKey, rows, bag);
  }

  static Map<String, Object> legacyPlanningView(
      String planKey, String asOf, List<Map<String, Object>> legacyRows, List<Map<String, Object>> execRows, int sourceCount) {
    List<Map<String, String>> points = new ArrayList<>();
    for (Map<String, Object> r : execRows) points.add(Planning.assessPoint(r));
    Map<String, Object> metrics = Formulas.metricasDosPontos(execRows);
    double cancelados = 0;
    for (Map<String, Object> r : legacyRows) cancelados += Py.toDouble(r.get("cts_cancelados"));
    double finalizedCount = Py.toLong(metrics.get("cts_passeds")) + Py.toLong(metrics.get("cts_na")) + cancelados;
    boolean hasPriority = legacyRows.stream().anyMatch(r -> !Py.orText(r.get("prioridades"), "").strip().isEmpty());
    boolean hasFront = legacyRows.stream().anyMatch(r -> !Py.orText(r.get("frente"), "").strip().isEmpty());
    List<Map<String, Object>> dimensions = new ArrayList<>();
    if (hasPriority)
      dimensions.add(Py.obj("key", "prioridades", "label", "Prioridade", "level", 1L, "values", new ArrayList<>(), "role", "priority", "confidence", 1L, "visible", true));
    if (hasFront)
      dimensions.add(Py.obj("key", "frente", "label", "Frente", "level", 2L, "values", new ArrayList<>(), "role", "front", "confidence", 1L, "visible", true));
    List<Map<String, Object>> items = new ArrayList<>();
    for (Map<String, Object> row : legacyRows) {
      double baselineCount = Py.toDouble(row.get("qtd_cts_plan"));
      Map<String, Object> math = Planning.scheduleOf((long) baselineCount, List.of(), asOf, 0);
      String schedule = Planning.scheduleIntegrityMessage(baselineCount, 0);
      Map<String, Object> dims = new LinkedHashMap<>();
      String prioridades = Py.orText(row.get("prioridades"), "").strip();
      String frente = Py.orText(row.get("frente"), "").strip();
      if (hasPriority && !prioridades.isEmpty()) dims.put("prioridades", prioridades);
      if (hasFront && !frente.isEmpty()) dims.put("frente", frente);
      String processo = Py.orText(row.get("processo"), "").strip();
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("suiteId", null);
      item.put("testPointId", null);
      item.put("suiteName", processo.isEmpty() ? "(sem nome)" : processo);
      item.put("responsavel", null);
      item.put("prioridade", null);
      item.put("dimensions", dims);
      item.put("plannedStart", Planning.calendarDate(row.get("data_inicio")));
      item.put("plannedEnd", Planning.calendarDate(row.get("data_fim")));
      item.put("baselineCount", baselineCount);
      item.put("sourceCount", null);
      item.put("addedCount", 0L);
      item.put("removedCount", 0L);
      item.put("distributedCount", 0L);
      item.put("distributionGap", math.get("distribution_gap"));
      item.put("plannedToDate", 0L);
      item.put("finalizedCount", null);
      item.put("failed", null);
      item.put("blocked", null);
      item.put("passed", null);
      item.put("na", null);
      item.put("released", null);
      item.put("design", null);
      item.put("notReleased", null);
      item.put("unclassifiedCount", 0L);
      item.put("inconsistentCount", 0L);
      item.put("backlog", null);
      item.put("aheadOfPlan", null);
      item.put("allocations", new LinkedHashMap<>());
      item.put("warnings", schedule != null ? new ArrayList<>(List.of(schedule)) : new ArrayList<>());
      items.add(item);
    }
    TreeSet<String> dateSet = new TreeSet<>();
    for (Map<String, Object> item : items) dateSet.addAll(Planning.datesBetween(item.get("plannedStart"), item.get("plannedEnd")));
    double baselineCount = 0;
    for (Map<String, Object> i : items) baselineCount += Py.toDouble(i.get("baselineCount"));
    String scope = Planning.scopeIntegrityMessage(false, 0, 0);
    String scheduleMsg = Planning.scheduleIntegrityMessage((long) baselineCount, 0);
    Map<String, Object> math = Planning.scheduleOf((long) baselineCount, List.of(), asOf, (long) finalizedCount);
    long unmapped = countIntegrity(points, "unmapped");
    long inconsistentCount = countIntegrity(points, "inconsistent");
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("baselineCount", baselineCount);
    summary.put("sourceCount", (long) sourceCount);
    summary.put("addedCount", 0L);
    summary.put("removedCount", 0L);
    summary.put("scopeDelta", 0L);
    summary.put("distributedCount", 0L);
    summary.put("distributionGap", math.get("distribution_gap"));
    summary.put("plannedToDate", 0L);
    summary.put("finalizedCount", finalizedCount);
    summary.put("backlog", math.get("backlog"));
    summary.put("aheadOfPlan", math.get("ahead_of_plan"));
    summary.put("classifiedCount", points.stream().filter(p -> !"unclassified".equals(p.get("classification"))).count());
    summary.put("unclassifiedCount", unmapped);
    summary.put("inconsistentCount", inconsistentCount);
    summary.put("scopeCheck", scope);
    Map<String, Object> integrity = new LinkedHashMap<>();
    integrity.put("scope", scope);
    integrity.put("classification", Planning.classificationIntegrityMessage(unmapped, inconsistentCount));
    integrity.put("schedule", scheduleMsg);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("planning", Py.obj("planKey", planKey));
    out.put("revision", Py.obj("version", null, "reason", null, "createdAt", null, "baselineOrigin", "legacy", "scopeSnapshotAvailable", false));
    out.put("summary", summary);
    out.put("dimensions", dimensions);
    out.put("dates", new ArrayList<>(dateSet));
    out.put("items", items);
    out.put("integrity", integrity);
    out.put(
        "executionHistory",
        Py.obj(
            "reconstructed", false,
            "note", "O histórico de execução passa a ser observável a partir das sincronizações do FourQA. O estado atual do Test Point não reconstrói execuções antigas. O planejamento legado não liga cada processo aos Test Points."));
    out.put("revisions", new ArrayList<>());
    out.put("editable", true);
    return out;
  }

  public static Map<String, Object> getPlanningHistory(String planKey) {
    return getPlanningHistory(planKey, 300);
  }

  public static Map<String, Object> getPlanningHistory(String planKey, int limit) {
    PlanningStore planning = planning();
    if (!planning.changeLogSupported()) return Py.obj("supported", false, "entries", new ArrayList<>());
    List<Map<String, Object>> entries = new ArrayList<>();
    for (Map<String, Object> e : planning.listChangeLog(planKey, limit)) {
      Map<String, Object> c = new LinkedHashMap<>();
      c.put("id", e.get("id"));
      c.put("createdAt", e.get("created_at"));
      c.put("actor", e.get("actor"));
      c.put("suiteId", e.get("suite_id"));
      c.put("testPointId", e.get("test_point_id"));
      c.put("suiteName", e.get("suite_name"));
      c.put("field", e.get("field"));
      c.put("allocDate", e.get("alloc_date"));
      c.put("oldValue", e.get("old_value"));
      c.put("newValue", e.get("new_value"));
      entries.add(c);
    }
    return Py.obj("supported", true, "entries", entries);
  }

  /** input: reason, adoptSource. */
  public static Map<String, Object> confirmOrRevise(String planKey, Map<String, Object> input) {
    PlanningStore planning = planning();
    Map<String, Object> current = planning.latestRevision(planKey);
    boolean adoptSource = !Boolean.FALSE.equals(input.getOrDefault("adoptSource", true));
    if (!adoptSource && (current == null || !Py.eq(current.get("scope_snapshot"), 1L)))
      throw new IllegalArgumentException("Confirme um baseline com snapshot antes de replanejar.");
    List<Map<String, Object>> scope = adoptSource || current == null ? sourceScope(planKey) : planning.loadScope(Py.toLong(current.get("id")));
    String now = PyTime.utcStamp();
    List<Map<String, Object>> sourceSchedule = current != null ? planning.loadSchedule(Py.toLong(current.get("id"))) : List.of();
    List<Map<String, Object>> items = current != null && !adoptSource
        ? copiedSchedule(Py.toLong(current.get("id")))
        : itemsForNewRevision(planKey, scope, current != null ? Py.toLong(current.get("id")) : null);
    String reason = Py.orText(input.get("reason"), "").strip();
    planning.commitRevision(revisionInput(planKey, now, current, reason.isEmpty() ? "Confirmação do baseline" : reason, scope, items, sourceSchedule));
    return getPlanningView(planKey);
  }

  static Map<String, Object> revisionInput(
      String planKey, String now, Map<String, Object> current, String reason, List<Map<String, Object>> scope,
      List<Map<String, Object>> items, List<Map<String, Object>> sourceSchedule) {
    Map<String, Object> in = new LinkedHashMap<>();
    in.put("plan_key", planKey);
    in.put("created_at", now);
    in.put("version", (current != null ? Py.toLong(current.get("version")) : 0) + 1);
    in.put("reason", reason);
    in.put("baseline_origin", "motor");
    in.put("scope_snapshot", 1L);
    in.put("scope", scope);
    in.put("items", items);
    in.put("base_revision_id", current != null ? current.get("id") : null);
    in.put("base_fingerprint", current != null ? ScheduleFingerprint.of(sourceSchedule) : null);
    return in;
  }

  static List<Map<String, Object>> sourceScope(String planKey) {
    return sourceScopeOf(stores().azureSnapshot.listExecucoes(planKey), "atalho");
  }

  static List<Map<String, Object>> copiedSchedule(long revisionId) {
    return itemWrites(planning().loadSchedule(revisionId));
  }

  static List<Map<String, Object>> itemWrites(List<Map<String, Object>> rows) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : rows) {
      Map<String, Object> w = new LinkedHashMap<>();
      w.put("suite_id", r.get("suite_id"));
      w.put("suite_name", r.get("suite_name"));
      w.put("test_point_id", r.get("test_point_id"));
      w.put("test_case_id", r.get("test_case_id"));
      w.put("planned_start", r.get("planned_start"));
      w.put("planned_end", r.get("planned_end"));
      w.put("responsavel", r.get("responsavel"));
      w.put("prioridade", r.get("prioridade"));
      w.put("baseline_quantity", r.get("baseline_quantity"));
      List<Map<String, Object>> allocs = new ArrayList<>();
      for (Map<String, Object> a : Py.rows(Py.or(r.get("allocations"), List.of()))) allocs.add(Py.obj("date", a.get("date"), "quantity", a.get("quantity")));
      w.put("allocations", allocs);
      out.add(w);
    }
    return out;
  }

  static List<Map<String, Object>> itemsForNewRevision(String planKey, List<Map<String, Object>> scope, Long previousRevisionId) {
    List<Map<String, Object>> execRows = stores().azureSnapshot.listExecucoes(planKey);
    Map<Object, String> names = new LinkedHashMap<>();
    for (Map<String, Object> r : execRows)
      if (r.get("suite_id") != null && Py.truthy(r.get("suite_name"))) names.put(Py.toLong(r.get("suite_id")), Py.str(r.get("suite_name")));
    Map<String, Map<String, Object>> legacy = new LinkedHashMap<>();
    for (Map<String, Object> r : legacyBase(planKey, null)) legacy.put(Py.orText(r.get("processo"), "").strip().toLowerCase(), r);
    List<Map<String, Object>> previous = previousRevisionId == null ? new ArrayList<>() : copiedSchedule(previousRevisionId);
    return itemWrites(Planning.scheduleItemsForScope(scope, names, previous, suiteName -> {
      Map<String, Object> row = legacy.get(suiteName.strip().toLowerCase());
      if (row == null) return null;
      Map<String, Object> dates = new LinkedHashMap<>();
      dates.put("start", Planning.calendarDate(row.get("data_inicio")));
      dates.put("end", Planning.calendarDate(row.get("data_fim")));
      return dates;
    }));
  }

  static Map<String, Object> changeBase(String planKey, Map<String, Object> item) {
    Map<String, Object> base = new LinkedHashMap<>();
    base.put("plan_key", planKey);
    base.put("suite_id", item.get("suite_id"));
    base.put("test_point_id", item.get("test_point_id"));
    base.put("suite_name", item.get("suite_name"));
    return base;
  }

  static Map<String, Object> cellChange(Map<String, Object> base, String field, Object old, Object neu, String allocDate) {
    if (Py.eq(old, neu)) return null;
    Map<String, Object> out = new LinkedHashMap<>(base);
    out.put("field", field);
    out.put("alloc_date", allocDate);
    out.put("old_value", old == null ? null : Py.str(old));
    out.put("new_value", neu == null ? null : Py.str(neu));
    return out;
  }

  static Object oldQuantity(Map<String, Object> item, String day) {
    for (Map<String, Object> a : Py.rows(Py.or(item.get("allocations"), List.of())))
      if (day.equals(a.get("date"))) return a.get("quantity");
    return 0L;
  }

  /** input: suiteId, testPointId, field, date, quantity, value, guard, expectedText, expectedQuantity. */
  public static Map<String, Object> savePlanningCell(String planKey, Map<String, Object> input) {
    ensureOperationalRevision(planKey);
    PlanningStore planning = planning();
    Map<String, Object> revision = planning.latestRevision(planKey);
    if (revision == null) throw new IllegalArgumentException("Não foi possível preparar o planejamento para edição.");
    long revisionId = Py.toLong(revision.get("id"));
    Map<String, Object> item = Planning.matchScheduleItem(planning.loadSchedule(revisionId), fillKeyRef(input.get("suiteId"), input.get("testPointId")));
    if (item == null) throw new IllegalArgumentException("Suíte fora do baseline confirmado.");
    String field = (String) input.get("field");
    Map<String, Object> base = changeBase(planKey, item);
    Map<String, Object> write = new LinkedHashMap<>();
    write.put("plan_key", planKey);
    write.put("revision_id", revisionId);
    write.put("item_id", item.get("id"));
    if (field.equals("responsavel") || field.equals("prioridade")) {
      if (item.get("suite_id") == null) throw new IllegalArgumentException("Responsável e prioridade exigem Suite ID.");
      Object old = item.get(field);
      String neu = Planning.normalizeSuiteFill((String) input.get("value"));
      write.put("field", field);
      write.put("value", neu);
      write.put("guard", input.get("guard"));
      write.put("expected_text", input.get("expectedText"));
      write.put("change_log", cellChange(base, field, old, neu, null));
      planning.saveCell(write);
      return getPlanningView(planKey);
    }
    if (field.equals("day")) {
      String day = Planning.calendarDate(input.get("date"));
      Object qty = input.get("quantity");
      if (day == null || qty == null || Py.toDouble(qty) < 0) throw new IllegalArgumentException("Informe data e quantidade.");
      Object oldQty = oldQuantity(item, day);
      write.put("field", "day");
      write.put("date", day);
      write.put("quantity", qty);
      write.put("guard", input.get("guard"));
      write.put("expected_quantity", input.get("expectedQuantity"));
      write.put("change_log", cellChange(base, "day", oldQty, qty, day));
      planning.saveCell(write);
    } else {
      String day = Py.truthy(input.get("date")) ? Planning.calendarDate(input.get("date")) : null;
      if (Py.truthy(input.get("date")) && day == null) throw new IllegalArgumentException("Data inválida.");
      Object old = item.get(field.equals("start") ? "planned_start" : "planned_end");
      write.put("field", field);
      write.put("date", day);
      write.put("guard", input.get("guard"));
      write.put("expected_text", input.get("expectedText"));
      write.put("change_log", cellChange(base, field, old, day, day));
      planning.saveCell(write);
    }
    return getPlanningView(planKey);
  }

  public static Map<String, Object> savePlanningBatch(String planKey, List<Map<String, Object>> changes) {
    if (changes.isEmpty()) throw new IllegalArgumentException("Nenhuma alteração.");
    if (changes.size() > 400) throw new IllegalArgumentException("Seleção grande demais para gravar de uma vez.");
    ensureOperationalRevision(planKey);
    PlanningStore planning = planning();
    Map<String, Object> revision = planning.latestRevision(planKey);
    if (revision == null) throw new IllegalArgumentException("Não foi possível preparar o planejamento para edição.");
    long revisionId = Py.toLong(revision.get("id"));
    List<Map<String, Object>> schedule = planning.loadSchedule(revisionId);
    List<Map<String, Object>> writes = new ArrayList<>();
    for (Map<String, Object> change : changes) {
      Map<String, Object> item = Planning.matchScheduleItem(schedule, fillKeyRef(change.get("suiteId"), change.get("testPointId")));
      if (item == null) throw new IllegalArgumentException("Suíte fora do baseline confirmado.");
      String field = (String) change.get("field");
      Map<String, Object> base = changeBase(planKey, item);
      if (field.equals("day")) {
        String day = Planning.calendarDate(change.get("date"));
        Object qty = change.get("quantity");
        if (day == null || qty == null) throw new IllegalArgumentException("Informe data e quantidade.");
        Object oldQty = oldQuantity(item, day);
        if (!Py.eq(oldQty, qty)) {
          Map<String, Object> log = cellChange(base, "day", oldQty, qty, day);
          if (log != null) {
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("plan_key", planKey);
            w.put("revision_id", revisionId);
            w.put("item_id", item.get("id"));
            w.put("field", "day");
            w.put("date", day);
            w.put("quantity", qty);
            w.put("guard", change.get("guard"));
            w.put("expected_quantity", change.get("expectedQuantity"));
            w.put("change_log", log);
            writes.add(w);
          }
        }
      } else {
        String day = Planning.calendarDate(change.get("date"));
        if (day == null) throw new IllegalArgumentException("Data inválida.");
        Object old = item.get(field.equals("start") ? "planned_start" : "planned_end");
        if (!Py.eq(old, day)) {
          Map<String, Object> log = cellChange(base, field, old, day, day);
          if (log != null) {
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("plan_key", planKey);
            w.put("revision_id", revisionId);
            w.put("item_id", item.get("id"));
            w.put("field", field);
            w.put("date", day);
            w.put("guard", change.get("guard"));
            w.put("expected_text", change.get("expectedText"));
            w.put("change_log", log);
            writes.add(w);
          }
        }
      }
    }
    if (!writes.isEmpty()) planning.saveCells(writes);
    return getPlanningView(planKey);
  }

  /** input: strategy, start, end, resguardo, enabledWeekendDays, replace, assignment, mode, cut, preview. */
  @SuppressWarnings("unchecked")
  public static Map<String, Object> distributePlanning(String planKey, Map<String, Object> input) {
    if (!Distribute.isDistributionStrategy(Py.orText(input.get("strategy"), ""))) throw new IllegalArgumentException("Estratégia inválida.");
    boolean preview = Boolean.TRUE.equals(input.get("preview"));
    if (!preview) ensureOperationalRevision(planKey);
    PlanningStore planning = planning();
    Map<String, Object> revision = planning.latestRevision(planKey);
    String start = Planning.calendarDate(input.get("start"));
    String end = Planning.calendarDate(input.get("end"));
    if (start == null || end == null || start.compareTo(end) > 0) throw new IllegalArgumentException("Informe início e fim válidos.");
    Object resguardoObj = input.get("resguardo");
    if (!Py.isInt(resguardoObj) || ((Number) resguardoObj).longValue() < 0) throw new IllegalArgumentException("Resguardo inválido.");
    int resguardo = (int) ((Number) resguardoObj).longValue();
    Set<String> enabled = new HashSet<>();
    for (Object d : (List<Object>) Py.or(input.get("enabledWeekendDays"), List.of()))
      if (d instanceof String s && s.equals(Planning.calendarDate(s))) enabled.add(s);
    String curveEnd = Distribute.shiftCalendarDay(end, -resguardo);
    if (curveEnd == null || curveEnd.compareTo(start) < 0) throw new IllegalArgumentException("O resguardo passa do início do período.");
    String mode = "saldo".equals(input.get("mode")) ? "saldo" : "completo";
    String cut = mode.equals("saldo") ? Planning.calendarDate(Py.or(input.get("cut"), "")) : null;
    if (mode.equals("saldo") && cut == null) throw new IllegalArgumentException("Informe a data de corte do saldo.");
    List<String> days = new ArrayList<>(Distribute.distributionDays(start, end, resguardo, enabled));
    if (cut != null) {
      String c = cut;
      days.removeIf(d -> d.compareTo(c) < 0);
    }
    if (days.isEmpty()) throw new IllegalArgumentException("Nenhum dia habilitado nesse período.");
    Long revisionId = revision != null ? Py.toLong(revision.get("id")) : null;
    List<Map<String, Object>> scope = revisionId != null ? planning.loadScope(revisionId) : sourceScope(planKey);
    List<Map<String, Object>> schedule = revisionId != null ? planning.loadSchedule(revisionId) : new ArrayList<>();
    if (schedule.isEmpty() && !preview) {
      List<Map<String, Object>> fresh = itemsForNewRevision(planKey, scope, null);
      schedule = new ArrayList<>();
      for (int i = 0; i < fresh.size(); i++) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", (long) -(i + 1));
        row.putAll(fresh.get(i));
        schedule.add(row);
      }
    }
    Map<String, Map<String, Object>> balances = balanceBySuite(planKey, scope);
    String strategy = (String) input.get("strategy");
    boolean replace = Boolean.TRUE.equals(input.get("replace"));
    List<Map<String, Object>> shares = new ArrayList<>();
    for (Map<String, Object> item : schedule) {
      String key = Planning.previousFillKey(fillKeyRef(item.get("suite_id"), item.get("test_point_id")));
      Map<String, Object> balance = balances.get(key == null ? "" : key);
      long baseline = (long) Py.toDouble(item.get("baseline_quantity"));
      long pending = balance != null ? Py.toLong(balance.get("pending")) : 0;
      long allocated = 0;
      for (Map<String, Object> a : Py.rows(Py.or(item.get("allocations"), List.of())))
        if (Py.toDouble(a.get("quantity")) > 0) allocated += (long) Py.toDouble(a.get("quantity"));
      long total = mode.equals("saldo") ? pending : Math.max(baseline, allocated);
      Map<String, Object> share = new LinkedHashMap<>();
      share.put("key", Py.str(item.get("id")));
      share.put("total", total);
      share.put("allocations", Py.or(item.get("allocations"), new ArrayList<>()));
      share.put("clearWindow", total == 0 && mode.equals("saldo"));
      shares.add(share);
    }
    Map<String, List<Map<String, Object>>> deltasByItem = Distribute.apportionDistribution(shares, days, strategy, replace);
    boolean changed = false;
    List<Map<String, Object>> writes = new ArrayList<>();
    for (Map<String, Object> item : schedule) {
      List<Map<String, Object>> deltas = deltasByItem.getOrDefault(Py.str(item.get("id")), List.of());
      if (!deltas.isEmpty()) changed = true;
      if (preview || revision == null || Py.toLong(item.get("id")) < 0) continue;
      for (Map<String, Object> delta : deltas) {
        Map<String, Object> w = new LinkedHashMap<>();
        w.put("plan_key", planKey);
        w.put("revision_id", revisionId);
        w.put("item_id", item.get("id"));
        w.put("field", "day");
        w.put("date", delta.get("date"));
        w.put("quantity", delta.get("quantity"));
        w.put("guard", true);
        w.put("expected_quantity", delta.get("previous"));
        w.put("change_log", cellChange(changeBase(planKey, item), "day", delta.get("previous"), delta.get("quantity"), (String) delta.get("date")));
        writes.add(w);
      }
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("preview", true);
    body.put("mode", mode);
    body.put("cut", cut);
    body.put("suiteCount", (long) schedule.size());
    body.put("finalized", 0L);
    body.put("pending", 0L);
    body.put("unchanged", !changed);
    body.put("days", new ArrayList<>());
    if (preview) {
      if (!changed) throw new IllegalArgumentException("Não há quantidade planejada para distribuir.");
      return body;
    }
    if (writes.isEmpty()) throw new IllegalArgumentException("A agenda já segue essa distribuição.");
    List<Map<String, Object>> logged = new ArrayList<>();
    for (Map<String, Object> w : writes) if (Py.truthy(w.get("change_log"))) logged.add(w);
    planning.saveCells(logged);
    return getPlanningView(planKey);
  }

  public static Map<String, Object> clearPlanningToFinalized(String planKey, Map<String, Object> input) {
    boolean preview = input != null && Boolean.TRUE.equals(input.get("preview"));
    if (!preview) ensureOperationalRevision(planKey);
    PlanningStore planning = planning();
    Map<String, Object> revision = planning.latestRevision(planKey);
    if (revision == null) {
      if (preview)
        return Py.obj("preview", true, "action", "limpar", "suiteCount", 0L, "finalized", 0L, "kept", 0L, "removed", 0L, "unchanged", true);
      throw new IllegalArgumentException("Não há agenda para limpar.");
    }
    long revisionId = Py.toLong(revision.get("id"));
    List<Map<String, Object>> scope = planning.loadScope(revisionId);
    List<Map<String, Object>> schedule = planning.loadSchedule(revisionId);
    Map<String, Map<String, Object>> balances = balanceBySuite(planKey, scope);
    List<Map<String, Object>> writes = new ArrayList<>();
    long removed = 0;
    for (Map<String, Object> item : schedule) {
      String key = Planning.previousFillKey(fillKeyRef(item.get("suite_id"), item.get("test_point_id")));
      Map<String, Object> balance = balances.get(key == null ? "" : key);
      if (balance == null) continue;
      List<Map<String, Object>> deltas = Distribute.trimAllocationsToKeep(Py.rows(Py.or(item.get("allocations"), List.of())), Py.toLong(balance.get("finalized")));
      for (Map<String, Object> d : deltas) removed += Py.toLong(d.get("previous")) - Py.toLong(d.get("quantity"));
      if (preview) continue;
      for (Map<String, Object> delta : deltas) {
        Map<String, Object> log = cellChange(changeBase(planKey, item), "day", delta.get("previous"), delta.get("quantity"), (String) delta.get("date"));
        if (log == null) continue;
        Map<String, Object> w = new LinkedHashMap<>();
        w.put("plan_key", planKey);
        w.put("revision_id", revisionId);
        w.put("item_id", item.get("id"));
        w.put("field", "day");
        w.put("date", delta.get("date"));
        w.put("quantity", delta.get("quantity"));
        w.put("guard", true);
        w.put("expected_quantity", delta.get("previous"));
        w.put("change_log", log);
        writes.add(w);
      }
    }
    if (preview)
      return Py.obj("preview", true, "action", "limpar", "suiteCount", (long) schedule.size(), "finalized", 0L, "kept", 0L, "removed", removed, "unchanged", removed == 0);
    if (removed == 0 || writes.isEmpty()) throw new IllegalArgumentException("A agenda já conserva só os finalizados.");
    planning.saveCells(writes);
    return getPlanningView(planKey);
  }

  static void ensureOperationalRevision(String planKey) {
    PlanningStore planning = planning();
    Map<String, Object> current = planning.latestRevision(planKey);
    if (current != null && Py.eq(current.get("scope_snapshot"), 1L)) return;
    List<Map<String, Object>> scope = sourceScope(planKey);
    String now = PyTime.utcStamp();
    Long currentId = current != null ? Py.toLong(current.get("id")) : null;
    List<Map<String, Object>> scheduled = currentId != null ? planning.loadSchedule(currentId) : List.of();
    List<Map<String, Object>> items = currentId != null && !scheduled.isEmpty() ? copiedSchedule(currentId) : itemsForNewRevision(planKey, scope, currentId);
    List<Map<String, Object>> sourceSchedule = currentId != null ? planning.loadSchedule(currentId) : List.of();
    planning.commitRevision(revisionInput(planKey, now, current, "Planejamento operacional", scope, items, sourceSchedule));
  }

  static Map<String, Map<String, Object>> balanceBySuite(String planKey, List<Map<String, Object>> scope) {
    Map<Long, Map<String, Object>> execByPoint = new LinkedHashMap<>();
    for (Map<String, Object> r : stores().azureSnapshot.listExecucoes(planKey))
      if (r.get("test_point_id") != null) execByPoint.put(Py.toLong(r.get("test_point_id")), r);
    Map<String, List<String>> groups = new LinkedHashMap<>();
    for (Map<String, Object> ref : scope) {
      String key = Planning.previousFillKey(fillKeyRef(ref.get("suite_id"), ref.get("test_point_id")));
      if (key == null) continue;
      Object point = ref.get("test_point_id");
      Map<String, Object> row = point != null ? execByPoint.get(Py.toLong(point)) : null;
      String classification = row != null ? Formulas.classifyExecution(row) : "pendente";
      groups.computeIfAbsent(key, k -> new ArrayList<>()).add(classification);
    }
    Map<String, Map<String, Object>> out = new LinkedHashMap<>();
    for (var e : groups.entrySet()) out.put(e.getKey(), Distribute.countPlanningBalance(e.getValue()));
    return out;
  }
}
