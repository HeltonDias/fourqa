package com.fourqa.api.azure;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/** Process-local Azure cache (port of {@code fourqa.azure.in_memory_azure_cache}). */
public final class InMemoryAzureCache {
  private static InMemoryAzureCache shared;

  private Map<String, Map<String, Object>> plans = new LinkedHashMap<>();
  private String fetchedAt;
  private boolean stale;
  private String kpiPlanKey;
  private boolean refreshing;
  private boolean publishing;
  private Map<String, Object> generationMeta;

  public static synchronized InMemoryAzureCache get() {
    if (shared == null) shared = new InMemoryAzureCache();
    return shared;
  }

  public static synchronized void reset() {
    shared = null;
  }

  @SuppressWarnings("unchecked")
  static Object deepCopy(Object v) {
    if (v instanceof Map<?, ?> m) {
      Map<String, Object> out = new LinkedHashMap<>();
      for (var e : m.entrySet()) out.put(String.valueOf(e.getKey()), deepCopy(e.getValue()));
      return out;
    }
    if (v instanceof List<?> l) {
      List<Object> out = new ArrayList<>(l.size());
      for (Object o : l) out.add(deepCopy(o));
      return out;
    }
    return v;
  }

  @SuppressWarnings("unchecked")
  static List<Map<String, Object>> copyRows(Object rows) {
    return (List<Map<String, Object>>) deepCopy(rows == null ? List.of() : rows);
  }

  public synchronized String findPlanKey(String planKey) {
    String trimmed = planKey.strip();
    if (trimmed.isEmpty()) return null;
    if (plans.containsKey(trimmed)) return trimmed;
    List<String> hits = new ArrayList<>();
    for (String k : plans.keySet()) if (AzureDataRefresh.planKeyMatch(k, trimmed)) hits.add(k);
    if (hits.size() > 1) throw new IllegalStateException("PlanKey ambíguo no cache");
    return hits.isEmpty() ? null : hits.get(0);
  }

  public synchronized Map<String, Object> getPlan(String planKey) {
    String key = findPlanKey(planKey);
    if (key == null) return emptySnapshot(planKey.strip());
    Map<String, Object> row = plans.get(key);
    if (row == null || row.isEmpty()) return emptySnapshot(key);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("planKey", key);
    out.put("state", row.get("state"));
    out.put("execucoes", copyRows(row.get("execucoes")));
    out.put("falhas", copyRows(row.get("falhas")));
    out.put("dimensions", copyRows(row.get("dimensions")));
    out.put("kpi", com.fourqa.api.util.Py.truthy(row.get("kpi")) ? deepCopy(row.get("kpi")) : null);
    out.put("fetchedAt", row.get("fetchedAt"));
    return out;
  }

  public synchronized List<String> listLoadedPlanKeys() {
    return new ArrayList<>(new TreeSet<>(plans.keySet()));
  }

  public synchronized Map<String, Object> getRefreshMeta() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("fetchedAt", fetchedAt);
    out.put("stale", stale);
    out.put("kpiPlanKey", kpiPlanKey);
    return out;
  }

  @SuppressWarnings("unchecked")
  public synchronized void commitSuccessfulRefresh(Map<String, Object> draft, Map<String, Object> artifacts) {
    String at = (String) artifacts.get("fetchedAt");
    Map<String, Map<String, Object>> next = new LinkedHashMap<>(plans);
    for (Map<String, Object> plan : (List<Map<String, Object>>) draft.get("plans")) {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("state", "loaded");
      row.put("execucoes", copyRows(plan.get("execucoes")));
      row.put("falhas", copyRows(plan.get("falhas")));
      row.put("dimensions", copyRows(plan.get("dimensions")));
      row.put("kpi", com.fourqa.api.util.Py.truthy(plan.get("kpi")) ? deepCopy(plan.get("kpi")) : null);
      row.put("fetchedAt", at);
      next.put((String) plan.get("planKey"), row);
    }
    plans = next;
    fetchedAt = at;
    stale = false;
    kpiPlanKey = (String) draft.get("kpiPlanKey");
    Map<String, Object> meta = new LinkedHashMap<>(generationMeta == null ? Map.of() : generationMeta);
    meta.putAll((Map<String, Object>) artifacts.get("workbookMeta"));
    generationMeta = meta;
  }

  public synchronized boolean hasPublishedGeneration() {
    return generationMeta != null;
  }

  public synchronized Map<String, Object> readGeneration() {
    if (generationMeta == null || generationMeta.isEmpty()) return null;
    return new LinkedHashMap<>(generationMeta);
  }

  public synchronized void markRefreshFailed() {
    if (plans.isEmpty()) return;
    stale = true;
    for (var e : plans.entrySet()) {
      if ("loaded".equals(e.getValue().get("state"))) {
        Map<String, Object> row = new LinkedHashMap<>(e.getValue());
        row.put("state", "stale");
        e.setValue(row);
      }
    }
  }

  public synchronized void beginRefresh() {
    if (refreshing) throw new IllegalStateException("Refresh Azure já em andamento.");
    refreshing = true;
  }

  public synchronized void endRefresh() {
    refreshing = false;
  }

  public synchronized boolean isRefreshing() {
    return refreshing;
  }

  public synchronized void beginPublish() {
    publishing = true;
  }

  public synchronized void endPublish() {
    publishing = false;
  }

  public synchronized boolean isPublishing() {
    return publishing;
  }

  static Map<String, Object> emptySnapshot(String planKey) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("planKey", planKey);
    out.put("state", "empty");
    out.put("execucoes", new ArrayList<>());
    out.put("falhas", new ArrayList<>());
    out.put("dimensions", new ArrayList<>());
    out.put("kpi", null);
    out.put("fetchedAt", null);
    return out;
  }
}
