package com.fourqa.api.services;

import com.fourqa.api.auth.Credentials;
import com.fourqa.api.auth.Crypto;
import com.fourqa.api.auth.Entra;
import com.fourqa.api.auth.RequestIdentity;
import com.fourqa.api.azure.AzureCacheRead;
import com.fourqa.api.azure.AzureHttpError;
import com.fourqa.api.azure.AzureUtil;
import com.fourqa.api.azure.InMemoryAzureCache;
import com.fourqa.api.azure.Report;
import com.fourqa.api.azure.SyncConfig;
import com.fourqa.api.azure.SyncConfig.SyncConfigError;
import com.fourqa.api.azure.SyncParameters;
import com.fourqa.api.config.Env;
import com.fourqa.api.connector.TestDataSource;
import com.fourqa.api.connector.TestDataSources;
import com.fourqa.api.domain.ValidateSync.SyncValidationError;
import com.fourqa.api.persistence.MetaScope;
import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Sync orchestration (port of {@code fourqa.services.sync_service}). */
public final class SyncService {
  private static final Logger LOG = LoggerFactory.getLogger(SyncService.class);
  private static final Map<String, Map<String, Object>> STATES = new ConcurrentHashMap<>();

  private SyncService() {}

  static String scopeKey() {
    String scope = MetaScope.currentMetaScope();
    return scope == null ? "global" : scope;
  }

  static Map<String, Object> getState() {
    Map<String, Object> s = STATES.get(scopeKey());
    return s == null ? SyncJob.emptySyncState() : s;
  }

  static void setState(Map<String, Object> state) {
    STATES.put(scopeKey(), state);
  }

  static synchronized void patch(Map<String, Object> p) {
    Map<String, Object> next = new LinkedHashMap<>(getState());
    next.putAll(p);
    setState(next);
  }

  public static void resetForTests() {
    STATES.clear();
  }

  public static Map<String, Object> getSyncState() {
    if (!SyncJob.isDurableSyncRuntime()) return new LinkedHashMap<>(getState());
    return SyncJob.readSyncJob();
  }

  public static String userMessage(Throwable err) {
    if (err instanceof SyncConfigError || err instanceof AzureHttpError || err instanceof SyncValidationError
        || err instanceof Crypto.CredentialKeyError) return err.getMessage();
    return "Falha inesperada durante a sincronização com o Azure DevOps. Consulte o log do servidor.";
  }

  static Map<String, Object> storedOverride() {
    String raw = Stores.get().meta.get(SyncParameters.SYNC_PARAMETERS_KEY);
    Map<String, Object> decoded = SyncParameters.decodeStoredParameters(raw);
    Map<String, Object> draft = Py.map(decoded.get("draft"));
    return draft != null ? SyncParameters.parametersToOverride(draft) : null;
  }

  static String connectionAuthorization() {
    Map<String, Object> user = RequestIdentity.currentUser();
    if (!Py.truthy(user)) return null;
    try {
      return Credentials.authorizationFor(Py.toLong(user.get("id")));
    } catch (Entra.EntraError err) {
      throw new SyncConfigError(err.getMessage(), List.of("login"));
    }
  }

  static String apiVersion() {
    String v = Env.value("AZURE_DEVOPS_API_VERSION");
    return v.isEmpty() ? "7.1" : v;
  }

  public static Map<String, Object> connectionSyncSettings(Map<String, Object> connection) {
    Map<String, Object> user = RequestIdentity.currentUser();
    Map<String, Object> credential = null;
    if (Py.truthy(user)) credential = Stores.get().identity.getCredential(Py.toLong(user.get("id")));
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("planKey", connection.get("plan_key"));
    plan.put("planId", connection.get("test_plan_id"));
    plan.put("planName", Py.or(connection.get("test_plan_name"), Py.or(connection.get("title"), "")));
    plan.put("suiteNameFilter", "");
    plan.put("maxSuites", 0L);
    plan.put("load", true);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("organization", connection.get("org"));
    out.put("project", connection.get("project"));
    out.put("apiVersion", apiVersion());
    out.put("credentialConfigured", credential != null);
    out.put("kpiPlanKey", connection.get("plan_key"));
    out.put("plans", new ArrayList<>(List.of(plan)));
    out.put("hierarchy", new ArrayList<>());
    out.put("responsibilities", new ArrayList<>());
    out.put("executionFields", new ArrayList<>());
    out.put("failureFields", new ArrayList<>());
    out.put("warning", null);
    return out;
  }

  static Map<String, Object> connectionSyncConfig(Map<String, Object> connection) {
    String pat = connectionAuthorization();
    if (!Py.truthy(pat)) throw new SyncConfigError("Entre novamente para sincronizar este projeto.", List.of("login"));
    Map<String, Object> override = storedOverride();
    if (override == null) override = new LinkedHashMap<>();
    Map<String, Object> azure = new LinkedHashMap<>();
    azure.put("organization", connection.get("org"));
    azure.put("project", connection.get("project"));
    azure.put("apiVersion", apiVersion());
    azure.put("pat", pat);
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("planKey", connection.get("plan_key"));
    plan.put("planId", Py.toLong(connection.get("test_plan_id")));
    plan.put("planName", Py.or(connection.get("test_plan_name"), ""));
    plan.put("suiteNameFilter", "");
    plan.put("maxSuites", 0L);
    List<String> fronts = new ArrayList<>();
    for (String s : Env.value("SYNC_FRENTES_VALIDAS").split(",")) if (!s.strip().isEmpty()) fronts.add(s.strip());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("azure", azure);
    out.put("plans", new ArrayList<>(List.of(plan)));
    out.put("hierarchy", Py.or(override.get("hierarchy"), new ArrayList<>()));
    out.put("responsibilities", Py.or(override.get("responsibilities"), new LinkedHashMap<>()));
    out.put("validFronts", fronts);
    out.put("kpiPlanKey", connection.get("plan_key"));
    return out;
  }

  static Map<String, Object> loadEffectiveSyncConfig() {
    Map<String, Object> connection = RequestIdentity.currentConnection();
    if (connection != null) return connectionSyncConfig(connection);
    return SyncConfig.loadSyncConfig(storedOverride());
  }

  public static Map<String, Object> startSync() {
    if (SyncJob.isDurableSyncRuntime()) return startDurableSync();
    synchronized (SyncService.class) {
      if ("running".equals(getState().get("status")))
        return Py.obj("started", false, "state", new LinkedHashMap<>(getState()));
      Map<String, Object> cfg = loadEffectiveSyncConfig();
      OffsetDateTime startedAt = PyTime.nowUtc();
      Map<String, Object> state = SyncJob.emptySyncState();
      state.put("status", "running");
      state.put("startedAt", PyTime.isoformat(startedAt));
      state.put("step", "Iniciando");
      setState(state);
      launch(cfg, startedAt, null);
      return Py.obj("started", true, "state", new LinkedHashMap<>(getState()));
    }
  }

  static Map<String, Object> startDurableSync() {
    Map<String, Object> cfg = loadEffectiveSyncConfig();
    OffsetDateTime startedAt = PyTime.nowUtc();
    Map<String, Object> claimed = SyncJob.claimSyncJob(startedAt);
    if (!Py.truthy(claimed.get("started")) || !Py.truthy(claimed.get("jobId")))
      return Py.obj("started", false, "state", claimed.get("state"));
    setState(Py.map(claimed.get("state")));
    launch(cfg, startedAt, (String) claimed.get("jobId"));
    return Py.obj("started", true, "state", claimed.get("state"));
  }

  static void launch(Map<String, Object> cfg, OffsetDateTime startedAt, String jobId) {
    AzureUtil.Context ctx = AzureUtil.Context.capture();
    Thread.ofVirtual().name("fourqa-sync").start(() -> ctx.run(() -> runSyncSafe(cfg, startedAt, jobId)));
  }

  static void runSyncSafe(Map<String, Object> cfg, OffsetDateTime startedAt, String jobId) {
    try {
      runSync(cfg, startedAt, jobId);
    } catch (RuntimeException err) {
      LOG.error("sync failed", err);
      patch(Py.obj("status", "error", "finishedAt", PyTime.nowIso(), "progress", null, "error", userMessage(err)));
    }
  }

  @SuppressWarnings("unchecked")
  public static void runSync(Map<String, Object> cfg, OffsetDateTime startedAt, String durableJobId) {
    TestDataSource source = TestDataSources.forConfig(cfg);
    boolean durable = SyncJob.isDurableSyncRuntime();

    java.util.function.Supplier<Map<String, Object>> storedJob = () -> {
      Map<String, Object> job = new LinkedHashMap<>(getState());
      job.put("beatAt", PyTime.nowIso());
      job.put("jobId", durableJobId);
      return job;
    };
    Report report = (step, done, total) -> {
      patch(Py.obj("step", step, "progress", done != null && total != null ? Py.obj("done", (long) done, "total", (long) total) : null));
      if (durable && durableJobId != null) {
        try {
          SyncJob.saveSyncJobIfOwner(storedJob.get());
        } catch (RuntimeException e) {
          LOG.warn("sync heartbeat failed: {}", e.getMessage());
        }
      }
    };

    InMemoryAzureCache cache = InMemoryAzureCache.get();
    boolean cacheRead = AzureCacheRead.isEnabled();
    boolean locked = false;
    if (cacheRead) {
      cache.beginRefresh();
      locked = true;
    }
    try {
      Map<String, Object>[] built = source.refresh(cfg, report);
      Map<String, Object> draft = built[0];
      Map<String, Object> artifacts = built[1];
      Map<String, Object> scopedMeta = new LinkedHashMap<>();
      for (var e : ((Map<String, Object>) artifacts.get("workbookMeta")).entrySet())
        scopedMeta.put(MetaScope.scopedMetaKey(e.getKey()), e.getValue());
      artifacts.put("workbookMeta", scopedMeta);
      report.step("Validando integridade antes de gravar", null, null);
      report.step(cacheRead ? "Publicando a atualização" : "Gravando no banco de dados", null, null);
      var durableSnapshot = Stores.get().durableSnapshot;
      Map<String, Object>[] publishPayload = new Map[1];
      AzureCacheRead.persistValidatedSyncBatch(draft, artifacts, cache, cacheRead, input -> {
        if (durable && durableJobId != null) {
          publishPayload[0] = input;
          return;
        }
        durableSnapshot.replaceSnapshot(input);
      });
      OffsetDateTime finishedAt = PyTime.nowUtc();
      Map<String, Object> summary = new LinkedHashMap<>((Map<String, Object>) artifacts.get("summary"));
      summary.put("duracaoMs", Duration.between(startedAt, finishedAt).toMillis());
      if (durable && durableJobId != null && publishPayload[0] != null) {
        Map<String, Object> success = storedJob.get();
        success.put("status", "success");
        success.put("finishedAt", PyTime.isoformat(finishedAt));
        success.put("step", "Concluído");
        success.put("progress", null);
        success.put("summary", summary);
        success.put("error", null);
        boolean published = SyncJob.publishSyncIfOwner(durableJobId, publishPayload[0], success, finishedAt.toInstant().toEpochMilli());
        if (!published) return;
        patch(Py.obj("status", "success", "finishedAt", success.get("finishedAt"), "step", "Concluído", "progress", null, "summary", summary));
      } else {
        patch(Py.obj("status", "success", "finishedAt", PyTime.isoformat(finishedAt), "step", "Concluído", "progress", null, "summary", summary));
      }
    } catch (RuntimeException err) {
      if (locked) cache.markRefreshFailed();
      if (durable && durableJobId != null) {
        LOG.error("durable sync failed", err);
        SyncJob.failSyncJobIfOwner(durableJobId, userMessage(err));
        patch(Py.obj("status", "error", "finishedAt", PyTime.nowIso(), "progress", null, "error", userMessage(err)));
      } else {
        throw err;
      }
    } finally {
      if (locked) cache.endRefresh();
    }
  }
}
