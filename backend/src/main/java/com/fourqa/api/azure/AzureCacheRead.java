package com.fourqa.api.azure;

import com.fourqa.api.config.Env;
import com.fourqa.api.persistence.AzureSnapshotStore;
import com.fourqa.api.persistence.MetaScope;
import com.fourqa.api.persistence.MetaStore;
import com.fourqa.api.persistence.PlanKeys;
import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Optional Azure read from the in-memory generation (port of {@code azure_cache_read_source} and
 * {@code azure_cache_query}). Java: opt-in with {@code AZURE_CACHE_READ=1} only, because the Java host may run more than
 * one instance and the operational snapshot lives in PostgreSQL.
 */
public final class AzureCacheRead {
  public static final List<String> EXEC_SEARCH = List.of(
      "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
      "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags");
  public static final List<String> FALHA_SEARCH =
      List.of("plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags");
  static final Set<String> BATCH_EXACT = Set.of("kpi_plan_key", "ultima_sincronizacao_azure");
  static final List<String> BATCH_PREFIX = List.of("dimensoes_catalog:", "kpi_impactos:");

  private AzureCacheRead() {}

  public static class AzureCacheUnavailableError extends RuntimeException {
    public AzureCacheUnavailableError() {
      super("Dados do Azure ainda não foram carregados. Use Atualizar.");
    }
  }

  public static boolean isEnabled() {
    return "1".equals(Env.value("AZURE_CACHE_READ"));
  }

  public static boolean isMirrorEnabled() {
    return "1".equals(Env.value("AZURE_CACHE_MIRROR"));
  }

  public static void assertHostedCacheMode() {
    if (Env.hosted() && isEnabled())
      throw new IllegalStateException("AZURE_CACHE_READ=1 não é permitido no host operacional. O snapshot operacional fica no PostgreSQL.");
  }

  static boolean isBatchMetaKey(String key) {
    if (BATCH_EXACT.contains(key)) return MetaScope.currentMetaScope() == null;
    for (String p : BATCH_PREFIX) if (key.startsWith(p)) return true;
    return false;
  }

  public static String readBatchMeta(Map<String, Object> meta, String key) {
    if (meta.containsKey(key)) return (String) meta.get(key);
    for (String prefix : BATCH_PREFIX) {
      if (!key.startsWith(prefix)) continue;
      String want = key.substring(prefix.length());
      for (var e : meta.entrySet())
        if (e.getKey().startsWith(prefix) && AzureDataRefresh.planKeyMatch(e.getKey().substring(prefix.length()), want))
          return (String) e.getValue();
      return null;
    }
    return null;
  }

  static boolean matches(Map<String, Object> row, List<String> columns, String q) {
    String needle = q.toLowerCase();
    for (String column : columns) {
      Object value = row.get(column);
      if (value == null) continue;
      if (Py.str(value).toLowerCase().contains(needle)) return true;
    }
    return false;
  }

  static Map<String, Object> withStableId(Map<String, Object> row, int index) {
    Object stable = row.get("test_point_id");
    if (!Py.isInt(stable)) stable = row.get("bug_id");
    if (!Py.isInt(stable)) stable = row.get("id");
    if (!Py.isInt(stable)) stable = (long) (index + 1);
    Map<String, Object> out = new LinkedHashMap<>(row);
    out.put("id", stable);
    return out;
  }

  public static Map<String, Object> pageCachedRows(List<Map<String, Object>> rows, List<String> columns, Map<String, Object> params) {
    List<Map<String, Object>> filtered = new ArrayList<>();
    String q = (String) params.get("q");
    for (int i = 0; i < rows.size(); i++) {
      Map<String, Object> keyed = withStableId(rows.get(i), i);
      if (!Py.truthy(q) || matches(keyed, columns, q)) filtered.add(keyed);
    }
    int offset = (int) Py.toLong(params.get("offset"));
    int limit = (int) Py.toLong(params.get("limit"));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("total", (long) filtered.size());
    out.put("limit", params.get("limit"));
    out.put("offset", params.get("offset"));
    int from = Math.min(offset, filtered.size());
    out.put("rows", new ArrayList<>(filtered.subList(from, Math.min(filtered.size(), from + limit))));
    return out;
  }

  public static List<Map<String, Object>> listCachedRows(List<Map<String, Object>> rows) {
    List<Map<String, Object>> out = new ArrayList<>(rows.size());
    for (int i = 0; i < rows.size(); i++) out.add(withStableId(rows.get(i), i));
    return out;
  }

  @SuppressWarnings("unchecked")
  static List<Map<String, Object>> publishedRows(InMemoryAzureCache cache, String planKey, String pick) {
    if (!cache.hasPublishedGeneration()) throw new AzureCacheUnavailableError();
    Map<String, Object> view = cache.getPlan(planKey);
    if ("empty".equals(view.get("state"))) return new ArrayList<>();
    return (List<Map<String, Object>>) view.get(pick);
  }

  public static AzureSnapshotStore wrapAzure(AzureSnapshotStore snapshot) {
    return wrapAzure(InMemoryAzureCache.get(), snapshot);
  }

  public static AzureSnapshotStore wrapAzure(InMemoryAzureCache cache, AzureSnapshotStore snapshot) {
    return new AzureSnapshotStore() {
      @Override
      public void replaceSnapshot(Map<String, Object> input) {
        throw new IllegalStateException("Persistência de snapshot desligada no modo cache.");
      }

      @Override
      public List<Map<String, Object>> listExecucoes(String planKey) {
        if (!cache.hasPublishedGeneration()) return snapshot.listExecucoes(planKey);
        return listCachedRows(publishedRows(cache, planKey, "execucoes"));
      }

      @Override
      public List<Map<String, Object>> listFalhas(String planKey) {
        if (!cache.hasPublishedGeneration()) return snapshot.listFalhas(planKey);
        return listCachedRows(publishedRows(cache, planKey, "falhas"));
      }

      @Override
      public Map<String, Object> queryExecucoes(Map<String, Object> params) {
        return query(params, "execucoes", EXEC_SEARCH, true);
      }

      @Override
      public Map<String, Object> queryFalhas(Map<String, Object> params) {
        return query(params, "falhas", FALHA_SEARCH, false);
      }

      private Map<String, Object> query(Map<String, Object> params, String pick, List<String> columns, boolean exec) {
        String planKey = PlanKeys.requiredPlanKey((String) params.get("plan_key"));
        Map<String, Object> scoped = new LinkedHashMap<>(params);
        scoped.put("plan_key", planKey);
        if (!cache.hasPublishedGeneration()) return exec ? snapshot.queryExecucoes(scoped) : snapshot.queryFalhas(scoped);
        return pageCachedRows(publishedRows(cache, planKey, pick), columns, scoped);
      }
    };
  }

  public static MetaStore wrapMeta(MetaStore meta) {
    return wrapMeta(InMemoryAzureCache.get(), meta);
  }

  public static MetaStore wrapMeta(InMemoryAzureCache cache, MetaStore meta) {
    return new MetaStore() {
      @Override
      public String get(String key) {
        if (!isBatchMetaKey(key)) return meta.get(key);
        Map<String, Object> generation = cache.readGeneration();
        if (generation == null) return meta.get(key);
        return readBatchMeta(generation, key);
      }

      @Override
      public Map<String, String> getMany(List<String> keys) {
        List<String> unique = new ArrayList<>(new LinkedHashSet<>(keys));
        Map<String, Object> generation = cache.readGeneration();
        Map<String, String> out = new LinkedHashMap<>();
        for (String k : unique) out.put(k, null);
        List<String> sqlKeys = new ArrayList<>();
        for (String key : unique) {
          if (generation != null && isBatchMetaKey(key)) out.put(key, readBatchMeta(generation, key));
          else sqlKeys.add(key);
        }
        if (!sqlKeys.isEmpty()) {
          Map<String, String> fromSql = meta.getMany(sqlKeys);
          for (String key : sqlKeys) out.put(key, fromSql.get(key));
        }
        return out;
      }

      @Override
      public void set(String key, String value) {
        meta.set(key, value);
      }

      @Override
      public void setMany(Map<String, String> entries) {
        meta.setMany(entries);
      }

      @Override
      public void replaceHeaderIf(String a, String b, String c, String d, String e, String f) {
        meta.replaceHeaderIf(a, b, c, d, e, f);
      }

      @Override
      public void replacePeriodIf(String a, String b, String c, String d) {
        meta.replacePeriodIf(a, b, c, d);
      }
    };
  }

  /** Cache vs database publish policy (port of {@code azure_cache_consistency}). */
  @SuppressWarnings("unchecked")
  public static void persistValidatedSyncBatch(
      Map<String, Object> draft, Map<String, Object> artifacts, InMemoryAzureCache cache, boolean cacheReadEnabled,
      java.util.function.Consumer<Map<String, Object>> replaceSnapshot) {
    Map<String, Object> snap = new LinkedHashMap<>();
    List<Map<String, Object>> execucoes = new ArrayList<>();
    List<Map<String, Object>> falhas = new ArrayList<>();
    List<String> planKeys = new ArrayList<>();
    for (Map<String, Object> plan : (List<Map<String, Object>>) draft.get("plans")) {
      execucoes.addAll(Py.rows(plan.get("execucoes")));
      falhas.addAll(Py.rows(plan.get("falhas")));
      planKeys.add((String) plan.get("planKey"));
    }
    snap.put("execucoes", execucoes);
    snap.put("falhas", falhas);
    snap.put("meta", artifacts.get("workbookMeta"));
    snap.put("plan_keys", planKeys);
    if (cacheReadEnabled) {
      replaceSnapshot.accept(snap);
      cache.commitSuccessfulRefresh(draft, artifacts);
      return;
    }
    cache.beginPublish();
    try {
      replaceSnapshot.accept(snap);
      if (!isMirrorEnabled()) {
        cache.markRefreshFailed();
        return;
      }
      try {
        if (cache.isRefreshing()) throw new IllegalStateException("Cache Azure ocupado por outro refresh.");
        cache.commitSuccessfulRefresh(draft, artifacts);
      } catch (RuntimeException e) {
        cache.markRefreshFailed();
      }
    } finally {
      cache.endPublish();
    }
  }
}
