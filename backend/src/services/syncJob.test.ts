import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakePostgres } from "../db/postgres/fakePostgres.js";
import { bindPostgresTestPool } from "../db/postgres/pool.js";
import {
  claimSyncJob,
  emptySyncState,
  parseSyncJob,
  runningSyncJob,
  saveSyncJob,
  visibleSyncJob,
  type SyncState,
} from "./syncJob.js";

describe("job de sincronização durável", () => {
  it("JSON inválido volta para idle e batimento velho libera novo claim", async () => {
    assert.equal(parseSyncJob("nao-json").status, "idle");
    assert.equal(parseSyncJob(null).status, "idle");
    const stale = runningSyncJob(new Date("2026-10-15T12:00:00.000Z"));
    stale.beatAt = "2026-10-15T12:00:00.000Z";
    const visible = visibleSyncJob(stale, Date.parse("2026-10-15T12:02:00.000Z"), 90_000);
    assert.equal(visible.status, "error");
    assert.match(visible.error ?? "", /dados anteriores permanecem/);

    const fresh = runningSyncJob(new Date("2026-10-15T12:01:30.000Z"));
    assert.equal(visibleSyncJob(fresh, Date.parse("2026-10-15T12:02:00.000Z"), 90_000).status, "running");

    const fake = createFakePostgres();
    bindPostgresTestPool(fake.pool);
    try {
      const first = await claimSyncJob(new Date("2026-10-15T12:00:00.000Z"));
      assert.equal(first.started, true);
      assert.equal(first.state.status, "running");
      const second = await claimSyncJob(new Date("2026-10-15T12:00:10.000Z"));
      assert.equal(second.started, false);
      assert.equal(second.state.status, "running");

      const expired: SyncState & { beatAt: string | null } = {
        ...emptySyncState(),
        status: "running",
        startedAt: "2026-10-15T12:00:00.000Z",
        step: "Execuções",
        beatAt: "2026-10-15T12:00:00.000Z",
      };
      await saveSyncJob(expired);
      const taken = await claimSyncJob(new Date("2026-10-15T12:02:00.000Z"));
      assert.equal(taken.started, true);
      assert.equal(taken.state.step, "Iniciando");
    } finally {
      bindPostgresTestPool(null);
    }
  });
});
