package com.fourqa.api.services;

import com.fourqa.api.persistence.Database;
import com.fourqa.api.persistence.JdbcAzureSnapshotStore;
import com.fourqa.api.persistence.MetaScope;
import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Durable sync job state in {@code workbook_meta} (port of {@code fourqa.services.sync_job}). Python enables it on
 * Vercel; Java enables it whenever the database is PostgreSQL, so every API instance sees the same job.
 */
public final class SyncJob {
  public static final long SYNC_HEARTBEAT_STALE_MS = 90_000;
  public static final String SYNC_JOB_KEY = "sync_job";
  static final String UPSERT = "INSERT INTO workbook_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value";
  static final String REPLACE_LOCK = "LOCK TABLE execucoes, falhas, workbook_meta IN EXCLUSIVE MODE";
  static final List<String> STATE_KEYS = List.of("status", "startedAt", "finishedAt", "step", "progress", "summary", "error");

  private SyncJob() {}

  static String jobKey() {
    return MetaScope.scopedMetaKey(SYNC_JOB_KEY);
  }

  public static boolean isDurableSyncRuntime() {
    return Stores.get().database().isPostgres();
  }

  public static Map<String, Object> emptySyncState() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("status", "idle");
    out.put("startedAt", null);
    out.put("finishedAt", null);
    out.put("step", "");
    out.put("progress", null);
    out.put("summary", null);
    out.put("error", null);
    return out;
  }

  static Map<String, Object> emptyJob() {
    Map<String, Object> out = emptySyncState();
    out.put("beatAt", null);
    out.put("jobId", null);
    return out;
  }

  static Map<String, Object> progressOf(Object value) {
    Map<String, Object> m = Py.map(value);
    if (m == null || !Py.isNumber(m.get("done")) || !Py.isNumber(m.get("total"))) return null;
    return Py.obj("done", (long) ((Number) m.get("done")).doubleValue(), "total", (long) ((Number) m.get("total")).doubleValue());
  }

  static String textOrNull(Object v) {
    return v instanceof String s ? s : null;
  }

  public static Map<String, Object> parseSyncJob(String raw) {
    if (raw == null || raw.isEmpty()) return emptyJob();
    Map<String, Object> value;
    try {
      value = Py.map(PyJson.loads(raw));
    } catch (PyJson.DecodeException e) {
      return emptyJob();
    }
    if (value == null) return emptyJob();
    Object status = value.get("status");
    if (!List.of("idle", "running", "success", "error").contains(status)) return emptyJob();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("status", status);
    out.put("startedAt", textOrNull(value.get("startedAt")));
    out.put("finishedAt", textOrNull(value.get("finishedAt")));
    out.put("step", value.get("step") instanceof String s ? s : "");
    out.put("progress", progressOf(value.get("progress")));
    out.put("summary", value.get("summary"));
    out.put("error", textOrNull(value.get("error")));
    out.put("beatAt", textOrNull(value.get("beatAt")));
    out.put("jobId", textOrNull(value.get("jobId")));
    return out;
  }

  public static boolean isSyncJobAlive(Map<String, Object> job, long nowMs, long staleMs) {
    if (!"running".equals(job.get("status"))) return false;
    Object beat = Py.or(job.get("beatAt"), Py.or(job.get("startedAt"), ""));
    Double ts = PyTime.parseIsoMillis(Py.str(beat));
    if (ts == null) return false;
    return nowMs - ts < staleMs;
  }

  public static Map<String, Object> visibleSyncJob(Map<String, Object> job, long nowMs, long staleMs) {
    Map<String, Object> state = new LinkedHashMap<>();
    for (String k : STATE_KEYS) state.put(k, job.get(k));
    if (!"running".equals(job.get("status"))) return state;
    if (isSyncJobAlive(job, nowMs, staleMs)) return state;
    state.put("status", "error");
    state.put("finishedAt", PyTime.isoFromMillis(nowMs));
    state.put("progress", null);
    state.put("error", "Sincronização interrompida antes de concluir. Os dados anteriores permanecem. Tente novamente.");
    return state;
  }

  public static Map<String, Object> runningSyncJob(OffsetDateTime now, String jobId) {
    String at = PyTime.isoformat(now);
    Map<String, Object> out = emptySyncState();
    out.put("status", "running");
    out.put("startedAt", at);
    out.put("step", "Iniciando");
    out.put("beatAt", at);
    out.put("jobId", jobId);
    return out;
  }

  static Database db() {
    return Stores.get().database();
  }

  private static Map<String, Object> currentJob(Database.Conn conn) throws java.sql.SQLException {
    Map<String, Object> row = conn.one("SELECT value FROM workbook_meta WHERE key = ? FOR UPDATE", jobKey());
    return parseSyncJob(row == null ? null : textOrNull(row.get("value")));
  }

  public static Map<String, Object> readSyncJob() {
    Map<String, Object> row = db().one("SELECT value FROM workbook_meta WHERE key = ?", jobKey());
    return visibleSyncJob(parseSyncJob(row == null ? null : textOrNull(row.get("value"))), PyTime.nowMillis(), SYNC_HEARTBEAT_STALE_MS);
  }

  public static boolean saveSyncJobIfOwner(Map<String, Object> job) {
    long nowMs = PyTime.nowMillis();
    return db().tx(conn -> {
      Map<String, Object> current = currentJob(conn);
      if (!("running".equals(current.get("status"))
          && java.util.Objects.equals(current.get("jobId"), job.get("jobId"))
          && isSyncJobAlive(current, nowMs, SYNC_HEARTBEAT_STALE_MS))) return false;
      Map<String, Object> payload = new LinkedHashMap<>(job);
      payload.put("beatAt", Py.or(job.get("beatAt"), PyTime.isoFromMillis(nowMs)));
      conn.execute(UPSERT, jobKey(), PyJson.dumps(payload));
      return true;
    });
  }

  public static boolean failSyncJobIfOwner(String jobId, String error) {
    long nowMs = PyTime.nowMillis();
    return db().tx(conn -> {
      Map<String, Object> current = currentJob(conn);
      if (!"running".equals(current.get("status")) || !jobId.equals(current.get("jobId"))) return false;
      Map<String, Object> failed = new LinkedHashMap<>(current);
      failed.put("status", "error");
      failed.put("finishedAt", PyTime.isoFromMillis(nowMs));
      failed.put("progress", null);
      failed.put("beatAt", PyTime.isoFromMillis(nowMs));
      failed.put("error", error);
      conn.execute(UPSERT, jobKey(), PyJson.dumps(failed));
      return true;
    });
  }

  public static boolean publishSyncIfOwner(String jobId, Map<String, Object> snapshot, Map<String, Object> success, long nowMs) {
    return db().tx(conn -> {
      Map<String, Object> current = currentJob(conn);
      if (!"running".equals(current.get("status")) || !jobId.equals(current.get("jobId"))
          || !isSyncJobAlive(current, nowMs, SYNC_HEARTBEAT_STALE_MS)) return false;
      JdbcAzureSnapshotStore.applySnapshotOnClient(conn, snapshot);
      Map<String, Object> payload = new LinkedHashMap<>(success);
      payload.put("jobId", jobId);
      payload.put("beatAt", Py.or(success.get("beatAt"), PyTime.isoFromMillis(nowMs)));
      conn.execute(UPSERT, jobKey(), PyJson.dumps(payload));
      return true;
    }, REPLACE_LOCK);
  }

  /** {started, state, jobId}. */
  public static Map<String, Object> claimSyncJob(OffsetDateTime now) {
    String jobId = UUID.randomUUID().toString().replace("-", "");
    long nowMs = now.toInstant().toEpochMilli();
    return db().tx(conn -> {
      conn.execute("INSERT INTO workbook_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING", jobKey(), PyJson.dumps(emptyJob()));
      Map<String, Object> current = currentJob(conn);
      Map<String, Object> visible = visibleSyncJob(current, nowMs, SYNC_HEARTBEAT_STALE_MS);
      if ("running".equals(visible.get("status"))) return Py.obj("started", false, "state", visible, "jobId", null);
      Map<String, Object> next = runningSyncJob(now, jobId);
      conn.execute(UPSERT, jobKey(), PyJson.dumps(next));
      return Py.obj("started", true, "state", visibleSyncJob(next, nowMs, SYNC_HEARTBEAT_STALE_MS), "jobId", jobId);
    });
  }
}
