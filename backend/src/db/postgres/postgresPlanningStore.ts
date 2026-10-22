import type { PoolClient } from "pg";
import { normalizeSuiteFill } from "../../domain/planning.js";
import type { PlanningStore } from "../../persistence/contracts.js";
import { PlanningConflictError } from "../../persistence/planningConflict.js";
import { scheduleFingerprint } from "../../persistence/scheduleFingerprint.js";
import type {
  CommitRevisionInput,
  PlanningCellWrite,
  PlanningRevisionRecord,
  PlanningScheduleItem,
  PlanningScopeWrite,
} from "../sqlitePlanningStore.js";
import { asFlag, asNumber, asNumberOrNull, asText, bind, query, withTransaction } from "./pool.js";

function revisionOf(row: Record<string, unknown> | undefined): PlanningRevisionRecord | null {
  if (!row) return null;
  return {
    id: asNumber(row.id),
    version: asNumber(row.version),
    created_at: asText(row.created_at) ?? "",
    reason: asText(row.reason) ?? "",
    baseline_origin: asText(row.baseline_origin) ?? "",
    scope_snapshot: asFlag(row.scope_snapshot),
  };
}

const REVISION_SQL = `SELECT r.id, r.version, r.created_at, r.reason, r.baseline_origin, r.scope_snapshot
  FROM planning_revision r
  JOIN planning p ON p.id = r.planning_id
  WHERE p.plan_key = $1`;

async function latestRevision(planKey: string): Promise<PlanningRevisionRecord | null> {
  const rows = await query<Record<string, unknown>>(`${REVISION_SQL} ORDER BY r.version DESC LIMIT 1`, [planKey]);
  return revisionOf(rows[0]);
}

async function revisionByVersion(planKey: string, version: number): Promise<PlanningRevisionRecord | null> {
  const rows = await query<Record<string, unknown>>(`${REVISION_SQL} AND r.version = $2`, [planKey, version]);
  return revisionOf(rows[0]);
}

async function listRevisions(planKey: string): Promise<{ version: number; createdAt: string; reason: string }[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT r.version, r.created_at, r.reason
     FROM planning_revision r
     JOIN planning p ON p.id = r.planning_id
     WHERE p.plan_key = $1
     ORDER BY r.version`,
    [planKey],
  );
  return rows.map((row) => ({
    version: asNumber(row.version),
    createdAt: asText(row.created_at) ?? "",
    reason: asText(row.reason) ?? "",
  }));
}

async function loadScope(revisionId: number): Promise<PlanningScopeWrite[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT plan_id, suite_id, test_point_id, test_case_id, label
     FROM planning_scope_item WHERE revision_id = $1`,
    [revisionId],
  );
  return rows.map((row) => ({
    planId: asNumberOrNull(row.plan_id),
    suiteId: asNumberOrNull(row.suite_id),
    testPointId: asNumberOrNull(row.test_point_id),
    testCaseId: asNumberOrNull(row.test_case_id),
    label: asText(row.label),
  }));
}

async function loadSchedule(revisionId: number): Promise<PlanningScheduleItem[]> {
  const items = await query<Record<string, unknown>>(
    `SELECT id, suite_id, suite_name, test_point_id, test_case_id, planned_start, planned_end, baseline_quantity, responsavel, prioridade
     FROM planning_item WHERE revision_id = $1`,
    [revisionId],
  );
  const allocs = await query<Record<string, unknown>>(
    `SELECT a.item_id, a.alloc_date, a.planned_quantity
     FROM planning_allocation a
     JOIN planning_item i ON i.id = a.item_id
     WHERE i.revision_id = $1`,
    [revisionId],
  );
  return items.map((item) => {
    const id = asNumber(item.id);
    return {
      id,
      suiteId: asNumberOrNull(item.suite_id),
      suiteName: asText(item.suite_name),
      testPointId: asNumberOrNull(item.test_point_id),
      testCaseId: asNumberOrNull(item.test_case_id),
      plannedStart: asText(item.planned_start),
      plannedEnd: asText(item.planned_end),
      responsavel: asText(item.responsavel),
      prioridade: asText(item.prioridade),
      baselineQuantity: asNumberOrNull(item.baseline_quantity),
      allocations: allocs
        .filter((row) => asNumber(row.item_id) === id)
        .map((row) => ({ date: asText(row.alloc_date) ?? "", quantity: asNumber(row.planned_quantity) })),
    };
  });
}

async function insertReturningId(client: PoolClient, sql: string, params: unknown[]): Promise<number> {
  const result = await client.query<{ id: unknown }>(sql, params);
  return asNumber(result.rows[0]?.id);
}

async function lockPlanningId(client: PoolClient, planKey: string, createdAt: string): Promise<number> {
  const locked = await client.query<{ id: unknown }>("SELECT id FROM planning WHERE plan_key = $1 FOR UPDATE", [planKey]);
  if (locked.rows[0]) return asNumber(locked.rows[0].id);
  return insertReturningId(
    client,
    "INSERT INTO planning (plan_key, created_at) VALUES ($1, $2) RETURNING id",
    [planKey, createdAt],
  );
}

async function readScheduleClient(client: PoolClient, revisionId: number): Promise<PlanningScheduleItem[]> {
  const items = await client.query<Record<string, unknown>>(
    `SELECT id, suite_id, suite_name, test_point_id, test_case_id, planned_start, planned_end, baseline_quantity, responsavel, prioridade
     FROM planning_item WHERE revision_id = $1`,
    [revisionId],
  );
  const allocs = await client.query<Record<string, unknown>>(
    `SELECT a.item_id, a.alloc_date, a.planned_quantity
     FROM planning_allocation a
     JOIN planning_item i ON i.id = a.item_id
     WHERE i.revision_id = $1`,
    [revisionId],
  );
  return items.rows.map((item) => {
    const id = asNumber(item.id);
    return {
      id,
      suiteId: asNumberOrNull(item.suite_id),
      suiteName: asText(item.suite_name),
      testPointId: asNumberOrNull(item.test_point_id),
      testCaseId: asNumberOrNull(item.test_case_id),
      plannedStart: asText(item.planned_start),
      plannedEnd: asText(item.planned_end),
      responsavel: asText(item.responsavel),
      prioridade: asText(item.prioridade),
      baselineQuantity: asNumberOrNull(item.baseline_quantity),
      allocations: allocs.rows
        .filter((row) => asNumber(row.item_id) === id)
        .map((row) => ({ date: asText(row.alloc_date) ?? "", quantity: asNumber(row.planned_quantity) })),
    };
  });
}

async function commitRevision(input: CommitRevisionInput): Promise<number> {
  try {
  return await withTransaction(async (client) => {
    const planningId = await lockPlanningId(client, input.planKey, input.createdAt);
    const max = await client.query<{ v: unknown }>(
      "SELECT COALESCE(MAX(version), 0) AS v FROM planning_revision WHERE planning_id = $1",
      [planningId],
    );
    const current = asNumber(max.rows[0]?.v);
    if (current !== input.version - 1) {
      throw new PlanningConflictError(PlanningConflictError.revisionRace);
    }
    if (input.baseRevisionId != null && input.baseFingerprint != null) {
      const fresh = await readScheduleClient(client, input.baseRevisionId);
      if (scheduleFingerprint(fresh) !== input.baseFingerprint) {
        throw new PlanningConflictError(PlanningConflictError.scheduleChanged);
      }
    }
    const revisionId = await insertReturningId(
      client,
      `INSERT INTO planning_revision (planning_id, version, created_at, reason, baseline_origin, scope_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [planningId, input.version, input.createdAt, input.reason, input.baselineOrigin, input.scopeSnapshot],
    );
    for (const item of input.scope) {
      await client.query(
        `INSERT INTO planning_scope_item (revision_id, plan_id, suite_id, test_point_id, test_case_id, label)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [revisionId, bind(item.planId), bind(item.suiteId), bind(item.testPointId), bind(item.testCaseId), bind(item.label ?? null)],
      );
    }
    for (const item of input.items) {
      const itemId = await insertReturningId(
        client,
        `INSERT INTO planning_item (
          revision_id, suite_id, suite_name, test_point_id, test_case_id,
          planned_start, planned_end, baseline_quantity, responsavel, prioridade
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          revisionId,
          bind(item.suiteId),
          bind(item.suiteName),
          bind(item.testPointId),
          bind(item.testCaseId),
          bind(item.plannedStart),
          bind(item.plannedEnd),
          bind(item.baselineQuantity),
          bind(normalizeSuiteFill(item.responsavel)),
          bind(normalizeSuiteFill(item.prioridade)),
        ],
      );
      for (const alloc of item.allocations) {
        await client.query(
          "INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES ($1, $2, $3)",
          [itemId, alloc.date, alloc.quantity],
        );
      }
    }
    return revisionId;
  });
  } catch (err: unknown) {
    const pg = err as { code?: string; constraint?: string };
    if (pg.code === "23505" && pg.constraint?.includes("planning_revision")) {
      throw new PlanningConflictError(PlanningConflictError.revisionRace);
    }
    throw err;
  }
}

function sameText(stored: unknown, expected: string | null | undefined): boolean {
  const text = stored == null ? "" : String(stored);
  return text === (expected ?? "");
}

async function guardCell(client: PoolClient, input: PlanningCellWrite): Promise<void> {
  if (!input.guard) return;
  switch (input.field) {
    case "day": {
      const cur = await client.query<{ planned_quantity: unknown }>(
        "SELECT planned_quantity FROM planning_allocation WHERE item_id = $1 AND alloc_date = $2",
        [input.itemId, input.date],
      );
      const qty = cur.rows[0] ? asNumber(cur.rows[0].planned_quantity) : 0;
      if (Math.abs(qty - (input.expectedQuantity ?? 0)) > 1e-9) {
        throw new PlanningConflictError(PlanningConflictError.cellChanged);
      }
      break;
    }
    case "responsavel":
    case "prioridade": {
      const column = input.field === "responsavel" ? "responsavel" : "prioridade";
      const cur = await client.query<Record<string, unknown>>(`SELECT ${column} FROM planning_item WHERE id = $1`, [input.itemId]);
      if (!sameText(cur.rows[0]?.[column], input.expectedText)) {
        throw new PlanningConflictError(PlanningConflictError.cellChanged);
      }
      break;
    }
    default: {
      const column = input.field === "start" ? "planned_start" : "planned_end";
      const cur = await client.query<Record<string, unknown>>(`SELECT ${column} FROM planning_item WHERE id = $1`, [input.itemId]);
      if (!sameText(cur.rows[0]?.[column], input.expectedText)) {
        throw new PlanningConflictError(PlanningConflictError.cellChanged);
      }
    }
  }
}

async function saveCell(input: PlanningCellWrite): Promise<void> {
  const useConcurrency = input.planKey != null && input.revisionId != null;
  const run = async (client: PoolClient) => {
    if (useConcurrency) {
      await client.query("SELECT id FROM planning WHERE plan_key = $1 FOR UPDATE", [input.planKey]);
      const latest = await client.query<{ id: unknown }>(
        `SELECT r.id FROM planning_revision r JOIN planning p ON p.id = r.planning_id
         WHERE p.plan_key = $1 ORDER BY r.version DESC LIMIT 1`,
        [input.planKey],
      );
      const latestId = latest.rows[0] ? asNumber(latest.rows[0].id) : null;
      if (latestId !== input.revisionId) {
        throw new PlanningConflictError(PlanningConflictError.baselineRevised);
      }
      const owner = await client.query("SELECT 1 FROM planning_item WHERE id = $1 AND revision_id = $2", [
        input.itemId,
        input.revisionId,
      ]);
      if (!owner.rows[0]) {
        throw new PlanningConflictError(PlanningConflictError.itemOutOfRevision);
      }
      await guardCell(client, input);
    }
    switch (input.field) {
      case "day": {
        await client.query("DELETE FROM planning_allocation WHERE item_id = $1 AND alloc_date = $2", [input.itemId, input.date]);
        if (input.quantity > 0) {
          await client.query(
            "INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES ($1, $2, $3)",
            [input.itemId, input.date, input.quantity],
          );
        }
        return;
      }
      case "responsavel": {
        await client.query("UPDATE planning_item SET responsavel = $1 WHERE id = $2", [
          bind(normalizeSuiteFill(input.value)),
          input.itemId,
        ]);
        return;
      }
      case "prioridade": {
        await client.query("UPDATE planning_item SET prioridade = $1 WHERE id = $2", [
          bind(normalizeSuiteFill(input.value)),
          input.itemId,
        ]);
        return;
      }
      case "start": {
        await client.query("UPDATE planning_item SET planned_start = $1 WHERE id = $2", [bind(input.date), input.itemId]);
        return;
      }
      case "end": {
        await client.query("UPDATE planning_item SET planned_end = $1 WHERE id = $2", [bind(input.date), input.itemId]);
        return;
      }
      default: {
        const unreachable: never = input;
        throw new Error(`Campo de planejamento não suportado (${JSON.stringify(unreachable)})`);
      }
    }
  };
  if (useConcurrency) {
    await withTransaction(run);
    return;
  }
  switch (input.field) {
    case "day":
      await withTransaction(run);
      return;
    case "responsavel":
      await query("UPDATE planning_item SET responsavel = $1 WHERE id = $2", [bind(normalizeSuiteFill(input.value)), input.itemId]);
      return;
    case "prioridade":
      await query("UPDATE planning_item SET prioridade = $1 WHERE id = $2", [bind(normalizeSuiteFill(input.value)), input.itemId]);
      return;
    case "start":
      await query("UPDATE planning_item SET planned_start = $1 WHERE id = $2", [bind(input.date), input.itemId]);
      return;
    case "end":
      await query("UPDATE planning_item SET planned_end = $1 WHERE id = $2", [bind(input.date), input.itemId]);
      return;
    default: {
      const unreachable: never = input;
      throw new Error(`Campo de planejamento não suportado (${JSON.stringify(unreachable)})`);
    }
  }
}

export const postgresPlanningStore = {
  latestRevision,
  revisionByVersion,
  listRevisions,
  loadScope,
  loadSchedule,
  commitRevision,
  saveCell,
} satisfies PlanningStore;
