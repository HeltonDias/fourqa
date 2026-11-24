package com.fourqa.api.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.util.Py;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Durable sync job record: parsing, heartbeat staleness and the state the API exposes. */
class SyncJobTest {
  static final long NOW = 1_800_000_000_000L;

  @Test
  void emptyOrCorruptRecordIsIdle() {
    assertEquals("idle", SyncJob.parseSyncJob(null).get("status"));
    assertEquals("idle", SyncJob.parseSyncJob("{nao json").get("status"));
  }

  @Test
  void runningJobGoesStaleWithoutHeartbeat() {
    Map<String, Object> fresh = Py.obj("status", "running", "beatAt", PyTime.isoFromMillis(NOW - 1_000));
    Map<String, Object> stale = Py.obj("status", "running", "beatAt", PyTime.isoFromMillis(NOW - 120_000));
    assertTrue(SyncJob.isSyncJobAlive(fresh, NOW, 90_000));
    assertFalse(SyncJob.isSyncJobAlive(stale, NOW, 90_000));
    assertFalse(SyncJob.isSyncJobAlive(Py.obj("status", "success"), NOW, 90_000));
  }

  @Test
  void staleRunningJobIsNotReportedAsRunning() {
    Map<String, Object> stale = Py.obj("status", "running", "startedAt", PyTime.isoFromMillis(NOW - 120_000));
    assertFalse("running".equals(SyncJob.visibleSyncJob(stale, NOW, 90_000).get("status")));
  }
}
