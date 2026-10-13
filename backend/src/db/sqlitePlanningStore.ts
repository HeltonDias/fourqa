import { getDb } from "../db.js";
import type { PlanningStore } from "../persistence/contracts.js";

/** Revisão lida do SQLite. `scope_snapshot` permanece 0 ou 1. */
export type PlanningRevisionRecord = {
  id: number;
  version: number;
  created_at: string;
  reason: string;
  baseline_origin: string;
  scope_snapshot: number;
};

export type PlanningScopeWrite = {
  planId: number | null;
  suiteId: number | null;
  testPointId: number | null;
  testCaseId: number | null;
  label?: string | null;
};

export type PlanningAllocationWrite = {
  date: string;
  quantity: number;
};

export type PlanningItemWrite = {
  suiteId: number | null;
  suiteName: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  baselineQuantity: number | null;
  allocations: PlanningAllocationWrite[];
};

export type PlanningScheduleItem = PlanningItemWrite & {
  id: number;
};

export type CommitRevisionInput = {
  planKey: string;
  createdAt: string;
  version: number;
  reason: string;
  baselineOrigin: string;
  scopeSnapshot: number;
  scope: PlanningScopeWrite[];
  items: PlanningItemWrite[];
};

export type PlanningCellWrite =
  | { itemId: number; field: "day"; date: string; quantity: number }
  | { itemId: number; field: "start" | "end"; date: string | null };

const REVISION_SQL = `SELECT r.id, r.version, r.created_at, r.reason, r.baseline_origin, r.scope_snapshot
         FROM planning_revision r
         JOIN planning p ON p.id = r.planning_id
         WHERE p.plan_key = ?`;

export function latestRevision(planKey: string): PlanningRevisionRecord | null {
  return (getDb().prepare(`${REVISION_SQL} ORDER BY r.version DESC LIMIT 1`).get(planKey) as PlanningRevisionRecord | undefined) ?? null;
}

export function revisionByVersion(planKey: string, version: number): PlanningRevisionRecord | null {
  return (getDb().prepare(`${REVISION_SQL} AND r.version = ?`).get(planKey, version) as PlanningRevisionRecord | undefined) ?? null;
}

export function listRevisions(planKey: string): { version: number; createdAt: string; reason: string }[] {
  return (
    getDb()
      .prepare(
        `SELECT r.version, r.created_at, r.reason
         FROM planning_revision r
         JOIN planning p ON p.id = r.planning_id
         WHERE p.plan_key = ?
         ORDER BY r.version`,
      )
      .all(planKey) as { version: number; created_at: string; reason: string }[]
  ).map((row) => ({ version: row.version, createdAt: row.created_at, reason: row.reason }));
}

export function loadScope(revisionId: number): PlanningScopeWrite[] {
  const rows = getDb()
    .prepare(
      `SELECT plan_id, suite_id, test_point_id, test_case_id, label
       FROM planning_scope_item WHERE revision_id = ?`,
    )
    .all(revisionId) as {
    plan_id: number | null;
    suite_id: number | null;
    test_point_id: number | null;
    test_case_id: number | null;
    label: string | null;
  }[];
  return rows.map((row) => ({
    planId: row.plan_id,
    suiteId: row.suite_id,
    testPointId: row.test_point_id,
    testCaseId: row.test_case_id,
    label: row.label,
  }));
}

export function loadSchedule(revisionId: number): PlanningScheduleItem[] {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT id, suite_id, suite_name, planned_start, planned_end, baseline_quantity
       FROM planning_item WHERE revision_id = ?`,
    )
    .all(revisionId) as {
    id: number;
    suite_id: number | null;
    suite_name: string | null;
    planned_start: string | null;
    planned_end: string | null;
    baseline_quantity: number | null;
  }[];
  const allocs = db
    .prepare(
      `SELECT a.item_id, a.alloc_date, a.planned_quantity
       FROM planning_allocation a
       JOIN planning_item i ON i.id = a.item_id
       WHERE i.revision_id = ?`,
    )
    .all(revisionId) as { item_id: number; alloc_date: string; planned_quantity: number }[];
  return items.map((item) => ({
    id: item.id,
    suiteId: item.suite_id,
    suiteName: item.suite_name,
    plannedStart: item.planned_start,
    plannedEnd: item.planned_end,
    baselineQuantity: item.baseline_quantity,
    allocations: allocs
      .filter((row) => row.item_id === item.id)
      .map((row) => ({ date: row.alloc_date, quantity: row.planned_quantity })),
  }));
}

/** Grava plano, revisão, escopo, itens e alocações na mesma transação. */
export function commitRevision(input: CommitRevisionInput): number {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT id FROM planning WHERE plan_key = ?").get(input.planKey) as { id: number } | undefined;
    const planningId =
      existing?.id ??
      Number(db.prepare("INSERT INTO planning (plan_key, created_at) VALUES (?, ?)").run(input.planKey, input.createdAt).lastInsertRowid);
    const revisionId = Number(
      db.prepare(
        `INSERT INTO planning_revision (planning_id, version, created_at, reason, baseline_origin, scope_snapshot)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(planningId, input.version, input.createdAt, input.reason, input.baselineOrigin, input.scopeSnapshot).lastInsertRowid,
    );
    const insertScope = db.prepare(
      `INSERT INTO planning_scope_item (revision_id, plan_id, suite_id, test_point_id, test_case_id, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const item of input.scope) {
      insertScope.run(revisionId, item.planId, item.suiteId, item.testPointId, item.testCaseId, item.label ?? null);
    }
    const insertItem = db.prepare(
      `INSERT INTO planning_item (revision_id, suite_id, suite_name, planned_start, planned_end, baseline_quantity)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertAlloc = db.prepare(
      `INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)`,
    );
    for (const item of input.items) {
      const itemId = Number(
        insertItem.run(revisionId, item.suiteId, item.suiteName, item.plannedStart, item.plannedEnd, item.baselineQuantity).lastInsertRowid,
      );
      for (const alloc of item.allocations) insertAlloc.run(itemId, alloc.date, alloc.quantity);
    }
    db.exec("COMMIT");
    return revisionId;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Quantidade 0 remove a alocação do dia.
 * Quantidade maior que 0 substitui a alocação daquele dia.
 * start/end atualizam a data planejada do item.
 */
export function saveCell(input: PlanningCellWrite): void {
  const db = getDb();
  if (input.field === "day") {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM planning_allocation WHERE item_id = ? AND alloc_date = ?").run(input.itemId, input.date);
      if (input.quantity > 0) {
        db.prepare("INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)").run(
          input.itemId,
          input.date,
          input.quantity,
        );
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return;
  }
  const column = input.field === "start" ? "planned_start" : "planned_end";
  db.prepare(`UPDATE planning_item SET ${column} = ? WHERE id = ?`).run(input.date, input.itemId);
}

export const sqlitePlanningStore = {
  latestRevision,
  revisionByVersion,
  listRevisions,
  loadScope,
  loadSchedule,
  commitRevision,
  saveCell,
} satisfies PlanningStore;
