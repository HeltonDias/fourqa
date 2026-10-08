import { getDb, getMeta, listExecucoesAll, listPlanejamentoBase } from "../db.js";
import { assertStoredPlanningPeriod } from "../domain/planPeriod.js";
import { inferDimensions, type DetectedDimension } from "../domain/dimensions.js";
import { metricasDosPontos } from "../domain/formulas.js";
import {
  assessPoint,
  calendarDate,
  classificationIntegrityMessage,
  datesBetween,
  diffScope,
  scheduleIntegrityMessage,
  scheduleOf,
  scopeIntegrityMessage,
  type ScopeRef,
} from "../domain/planning.js";
import type { ExecucaoRow } from "../types.js";

export type PlanningItemView = {
  suiteId: number | null;
  suiteName: string;
  dimensions: Record<string, string>;
  plannedStart: string | null;
  plannedEnd: string | null;
  baselineCount: number | null;
  sourceCount: number | null;
  addedCount: number;
  removedCount: number;
  distributedCount: number;
  distributionGap: number | null;
  plannedToDate: number;
  finalizedCount: number | null;
  failed: number | null;
  blocked: number | null;
  passed: number | null;
  na: number | null;
  released: number | null;
  design: number | null;
  notReleased: number | null;
  unclassifiedCount: number;
  inconsistentCount: number;
  backlog: number | null;
  aheadOfPlan: number | null;
  allocations: Record<string, number>;
  warnings: string[];
};

export type PlanningView = {
  planning: { planKey: string };
  revision: {
    version: number | null;
    reason: string | null;
    createdAt: string | null;
    baselineOrigin: "legacy" | "motor" | "ausente";
    scopeSnapshotAvailable: boolean;
  } | null;
  summary: {
    baselineCount: number;
    sourceCount: number;
    addedCount: number;
    removedCount: number;
    scopeDelta: number;
    distributedCount: number;
    distributionGap: number;
    plannedToDate: number;
    finalizedCount: number;
    backlog: number;
    aheadOfPlan: number;
    classifiedCount: number;
    unclassifiedCount: number;
    inconsistentCount: number;
    scopeCheck: string | null;
  };
  dimensions: DetectedDimension[];
  dates: string[];
  items: PlanningItemView[];
  integrity: { scope: string | null; classification: string | null; schedule: string | null };
  executionHistory: { reconstructed: false; note: string };
  revisions: { version: number; createdAt: string; reason: string }[];
  editable: boolean;
};

function hojeLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function dimsOf(row: ExecucaoRow): Record<string, string> {
  if (!row.dimensions_json) return {};
  try {
    const parsed = JSON.parse(row.dimensions_json) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function samePlan(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isLegacyTotalsRow(processo: string | null): boolean {
  return /valores\s+totais/i.test(processo ?? "");
}

/**
 * planejamento_linhas não tem plan_key. Só entra no plano cujo dono está em
 * workbook_meta.planejamento_legado_plan_key. Sem essa meta, o legado não tem proprietário.
 */
function legacyBaseForPlan(planKey: string): ReturnType<typeof listPlanejamentoBase> {
  const owner = getMeta("planejamento_legado_plan_key")?.trim() ?? "";
  if (!owner || !samePlan(planKey, owner)) return [];
  return listPlanejamentoBase().filter((row) => !isLegacyTotalsRow(row.processo));
}

function catalog(planKey: string, rows: ExecucaoRow[]): DetectedDimension[] {
  const raw = getMeta(`dimensoes_catalog:${planKey}`);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DetectedDimension[];
      if (Array.isArray(parsed) && parsed.length) return parsed.filter((d) => d.visible !== false);
    } catch {
      /* cai na inferência */
    }
  }
  return inferDimensions(rows);
}

type RevisionRow = {
  id: number;
  version: number;
  created_at: string;
  reason: string;
  baseline_origin: string;
  scope_snapshot: number;
};

const REVISION_SQL = `SELECT r.id, r.version, r.created_at, r.reason, r.baseline_origin, r.scope_snapshot
         FROM planning_revision r
         JOIN planning p ON p.id = r.planning_id
         WHERE p.plan_key = ?`;

function latestRevision(planKey: string): RevisionRow | null {
  return (getDb().prepare(`${REVISION_SQL} ORDER BY r.version DESC LIMIT 1`).get(planKey) as RevisionRow | undefined) ?? null;
}

function revisionByVersion(planKey: string, version: number): RevisionRow | null {
  return (getDb().prepare(`${REVISION_SQL} AND r.version = ?`).get(planKey, version) as RevisionRow | undefined) ?? null;
}

function listRevisions(planKey: string): { version: number; createdAt: string; reason: string }[] {
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

function loadScope(revisionId: number): ScopeRef[] {
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

export function getPlanningView(planKey: string, version?: number): PlanningView {
  assertStoredPlanningPeriod(getMeta("data_inicio"), getMeta("data_fim"));
  const execRows = listExecucoesAll(planKey);
  const asOf = hojeLocal();
  const revision = version != null ? revisionByVersion(planKey, version) : latestRevision(planKey);
  const latest = latestRevision(planKey);
  const editable = Boolean(revision && latest && revision.id === latest.id && revision.scope_snapshot === 1);
  const snapshot = Boolean(revision && revision.scope_snapshot === 1);
  const baselineScope = revision && snapshot ? loadScope(revision.id) : [];
  const sourceScope: ScopeRef[] = execRows
    .filter((row) => row.test_point_id != null)
    .map((row) => ({
      planId: row.plan_id,
      suiteId: row.suite_id,
      testPointId: row.test_point_id,
      testCaseId: row.test_case_id,
      label: row.test_case_title,
    }));
  const diff = snapshot
    ? diffScope(baselineScope, sourceScope)
    : {
        baselineCount: 0,
        sourceCount: sourceScope.length,
        addedCount: 0,
        removedCount: 0,
        scopeDelta: 0,
        addedItems: [] as ScopeRef[],
        removedItems: [] as ScopeRef[],
        addedSuites: 0,
        removedSuites: 0,
      };

  const legacyRows = legacyBaseForPlan(planKey);
  const legacy = new Map(legacyRows.map((row) => [(row.processo ?? "").trim().toLowerCase(), row]));

  const groups = new Map<string, ExecucaoRow[]>();
  for (const row of execRows) {
    const key = row.suite_id != null ? `id:${row.suite_id}` : `name:${(row.suite_name ?? "").trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const allocBySuite = new Map<string, Record<string, number>>();
  const periodBySuite = new Map<string, { start: string | null; end: string | null; qty: number | null; name: string | null }>();
  if (revision) {
    const items = getDb()
      .prepare(
        `SELECT id, suite_id, suite_name, planned_start, planned_end, baseline_quantity
         FROM planning_item WHERE revision_id = ?`,
      )
      .all(revision.id) as {
      id: number;
      suite_id: number | null;
      suite_name: string | null;
      planned_start: string | null;
      planned_end: string | null;
      baseline_quantity: number | null;
    }[];
    const allocs = getDb()
      .prepare(
        `SELECT a.item_id, a.alloc_date, a.planned_quantity
         FROM planning_allocation a
         JOIN planning_item i ON i.id = a.item_id
         WHERE i.revision_id = ?`,
      )
      .all(revision.id) as { item_id: number; alloc_date: string; planned_quantity: number }[];
    const byItem = new Map<number, Record<string, number>>();
    for (const alloc of allocs) {
      const map = byItem.get(alloc.item_id) ?? {};
      map[alloc.alloc_date] = alloc.planned_quantity;
      byItem.set(alloc.item_id, map);
    }
    for (const item of items) {
      const key = item.suite_id != null ? `id:${item.suite_id}` : `name:${(item.suite_name ?? "").trim().toLowerCase()}`;
      periodBySuite.set(key, {
        start: item.planned_start,
        end: item.planned_end,
        qty: item.baseline_quantity,
        name: item.suite_name,
      });
      allocBySuite.set(key, byItem.get(item.id) ?? {});
    }
  }

  if (!snapshot && legacyRows.length > 0) {
    return legacyPlanningView({
      planKey,
      asOf,
      legacyRows,
      execRows,
      sourceCount: sourceScope.length,
    });
  }

  const items: PlanningItemView[] = [];
  let classified = 0;
  let unclassified = 0;
  let inconsistent = 0;
  for (const [key, rows] of groups) {
    const sample = rows[0];
    const name = (sample?.suite_name ?? "").trim();
    const legacyRow = legacy.get(name.toLowerCase());
    const period = periodBySuite.get(key);
    const points = rows.map(assessPoint);
    classified += points.filter((point) => point.classification !== "unclassified").length;
    unclassified += points.filter((point) => point.integrity === "unmapped").length;
    inconsistent += points.filter((point) => point.integrity === "inconsistent").length;
    const metrics = metricasDosPontos(rows);
    const finalized = metrics.cts_passeds + metrics.cts_na + (Number(legacyRow?.cts_cancelados) || 0);
    const suiteScope = baselineScope.filter((item) => item.suiteId === sample?.suite_id);
    const suiteSource = sourceScope.filter((item) => item.suiteId === sample?.suite_id);
    const suiteDiff = snapshot ? diffScope(suiteScope, suiteSource) : null;
    const baselineCount = snapshot
      ? suiteScope.length
      : legacyRow
        ? Number(legacyRow.qtd_cts_plan) || 0
        : null;
    const allocations = allocBySuite.get(key) ?? {};
    const allocList = Object.entries(allocations).map(([date, plannedQuantity]) => ({ date, plannedQuantity }));
    const math = scheduleOf({
      baselineCount: baselineCount ?? 0,
      allocations: allocList,
      asOf,
      finalizedCount: finalized,
    });
    const warnings = [
      snapshot ? scopeIntegrityMessage({ scopeSnapshotAvailable: true, addedCount: suiteDiff?.addedCount ?? 0, removedCount: suiteDiff?.removedCount ?? 0 }) : null,
      classificationIntegrityMessage(
        points.filter((point) => point.integrity === "unmapped").length,
        points.filter((point) => point.integrity === "inconsistent").length,
      ),
      baselineCount != null ? scheduleIntegrityMessage(baselineCount, math.distributedCount) : null,
    ].filter((line): line is string => Boolean(line));
    items.push({
      suiteId: sample?.suite_id ?? null,
      suiteName: name || "(sem suíte)",
      dimensions: sample ? dimsOf(sample) : {},
      plannedStart: calendarDate(period?.start ?? legacyRow?.data_inicio),
      plannedEnd: calendarDate(period?.end ?? legacyRow?.data_fim),
      baselineCount,
      sourceCount: rows.length,
      addedCount: suiteDiff?.addedCount ?? 0,
      removedCount: suiteDiff?.removedCount ?? 0,
      distributedCount: math.distributedCount,
      distributionGap: baselineCount == null ? null : math.distributionGap,
      plannedToDate: math.plannedToDate,
      finalizedCount: finalized,
      failed: metrics.cts_falhados,
      blocked: metrics.cts_bloqueados,
      passed: metrics.cts_passeds,
      na: metrics.cts_na,
      released: metrics.cts_liberados,
      design: metrics.cts_design,
      notReleased: metrics.cts_nao_liberados,
      unclassifiedCount: points.filter((point) => point.integrity === "unmapped").length,
      inconsistentCount: points.filter((point) => point.integrity === "inconsistent").length,
      backlog: math.backlog,
      aheadOfPlan: math.aheadOfPlan,
      allocations,
      warnings,
    });
  }

  if (snapshot) {
    const present = new Set(items.map((item) => item.suiteId));
    const missing = new Map<number, ScopeRef[]>();
    for (const ref of baselineScope) {
      if (ref.suiteId == null || present.has(ref.suiteId)) continue;
      const list = missing.get(ref.suiteId) ?? [];
      list.push(ref);
      missing.set(ref.suiteId, list);
    }
    for (const [suiteId, refs] of missing) {
      const key = `id:${suiteId}`;
      const period = periodBySuite.get(key);
      const allocations = allocBySuite.get(key) ?? {};
      const allocList = Object.entries(allocations).map(([date, plannedQuantity]) => ({ date, plannedQuantity }));
      const baselineCount = refs.length;
      const math = scheduleOf({ baselineCount, allocations: allocList, asOf, finalizedCount: 0 });
      const warnings = [
        scopeIntegrityMessage({ scopeSnapshotAvailable: true, addedCount: 0, removedCount: refs.length }),
        scheduleIntegrityMessage(baselineCount, math.distributedCount),
      ].filter((line): line is string => Boolean(line));
      items.push({
        suiteId,
        suiteName: period?.name?.trim() || `Suíte ${suiteId}`,
        dimensions: {},
        plannedStart: calendarDate(period?.start),
        plannedEnd: calendarDate(period?.end),
        baselineCount,
        sourceCount: 0,
        addedCount: 0,
        removedCount: refs.length,
        distributedCount: math.distributedCount,
        distributionGap: math.distributionGap,
        plannedToDate: math.plannedToDate,
        finalizedCount: 0,
        failed: 0,
        blocked: 0,
        passed: 0,
        na: 0,
        released: 0,
        design: 0,
        notReleased: 0,
        unclassifiedCount: 0,
        inconsistentCount: 0,
        backlog: math.backlog,
        aheadOfPlan: math.aheadOfPlan,
        allocations,
        warnings,
      });
    }
  }

  const dateSet = new Set<string>();
  for (const item of items) {
    for (const day of datesBetween(item.plannedStart, item.plannedEnd)) dateSet.add(day);
    for (const day of Object.keys(item.allocations)) {
      const normalized = calendarDate(day);
      if (normalized) dateSet.add(normalized);
    }
  }
  const dates = [...dateSet].sort();
  const baselineCount = snapshot
    ? diff.baselineCount
    : items.reduce((sum, item) => sum + (item.baselineCount ?? 0), 0);
  const distributedCount = items.reduce((sum, item) => sum + item.distributedCount, 0);
  const plannedToDate = items.reduce((sum, item) => sum + item.plannedToDate, 0);
  const finalizedCount = items.reduce((sum, item) => sum + (item.finalizedCount ?? 0), 0);
  const origin: PlanningView["revision"] = revision
    ? {
        version: revision.version,
        reason: revision.reason,
        createdAt: revision.created_at,
        baselineOrigin: "motor",
        scopeSnapshotAvailable: snapshot,
      }
    : legacy.size
      ? {
          version: null,
          reason: null,
          createdAt: null,
          baselineOrigin: "legacy",
          scopeSnapshotAvailable: false,
        }
      : {
          version: null,
          reason: null,
          createdAt: null,
          baselineOrigin: "ausente",
          scopeSnapshotAvailable: false,
        };

  return {
    planning: { planKey },
    revision: origin,
    summary: {
      baselineCount,
      sourceCount: sourceScope.length,
      addedCount: snapshot ? diff.addedCount : 0,
      removedCount: snapshot ? diff.removedCount : 0,
      scopeDelta: snapshot ? diff.scopeDelta : 0,
      distributedCount,
      distributionGap: distributedCount - baselineCount,
      plannedToDate,
      finalizedCount,
      backlog: Math.max(plannedToDate - finalizedCount, 0),
      aheadOfPlan: Math.max(finalizedCount - plannedToDate, 0),
      classifiedCount: classified,
      unclassifiedCount: unclassified,
      inconsistentCount: inconsistent,
      scopeCheck: scopeNote(origin.baselineOrigin, snapshot, snapshot ? diff.addedCount : 0, snapshot ? diff.removedCount : 0),
    },
    dimensions: catalog(planKey, execRows),
    dates,
    items,
    integrity: {
      scope: scopeNote(origin.baselineOrigin, snapshot, snapshot ? diff.addedCount : 0, snapshot ? diff.removedCount : 0),
      classification: classificationIntegrityMessage(unclassified, inconsistent),
      schedule: scheduleIntegrityMessage(baselineCount, distributedCount),
    },
    executionHistory: {
      reconstructed: false,
      note: "O histórico de execução passa a ser observável a partir das sincronizações do FourQA. O estado atual do Test Point não reconstrói execuções antigas.",
    },
    revisions: listRevisions(planKey),
    editable,
  };
}

function legacyPlanningView(input: {
  planKey: string;
  asOf: string;
  legacyRows: ReturnType<typeof listPlanejamentoBase>;
  execRows: ExecucaoRow[];
  sourceCount: number;
}): PlanningView {
  const points = input.execRows.map(assessPoint);
  const metrics = metricasDosPontos(input.execRows);
  const cancelados = input.legacyRows.reduce((sum, row) => sum + (Number(row.cts_cancelados) || 0), 0);
  const finalizedCount = metrics.cts_passeds + metrics.cts_na + cancelados;
  const hasPriority = input.legacyRows.some((row) => (row.prioridades ?? "").trim());
  const hasFront = input.legacyRows.some((row) => (row.frente ?? "").trim());
  const dimensions: DetectedDimension[] = [];
  if (hasPriority) {
    dimensions.push({ key: "prioridades", label: "Prioridade", level: 1, values: [], role: "priority", confidence: 1, visible: true });
  }
  if (hasFront) {
    dimensions.push({ key: "frente", label: "Frente", level: 2, values: [], role: "front", confidence: 1, visible: true });
  }
  const items: PlanningItemView[] = input.legacyRows.map((row) => {
    const baselineCount = Number(row.qtd_cts_plan) || 0;
    const math = scheduleOf({ baselineCount, allocations: [], asOf: input.asOf, finalizedCount: 0 });
    const schedule = scheduleIntegrityMessage(baselineCount, 0);
    return {
      suiteId: null,
      suiteName: (row.processo ?? "").trim() || "(sem nome)",
      dimensions: {
        ...(hasPriority && (row.prioridades ?? "").trim() ? { prioridades: row.prioridades!.trim() } : {}),
        ...(hasFront && (row.frente ?? "").trim() ? { frente: row.frente!.trim() } : {}),
      },
      plannedStart: calendarDate(row.data_inicio),
      plannedEnd: calendarDate(row.data_fim),
      baselineCount,
      sourceCount: null,
      addedCount: 0,
      removedCount: 0,
      distributedCount: 0,
      distributionGap: math.distributionGap,
      plannedToDate: 0,
      finalizedCount: null,
      failed: null,
      blocked: null,
      passed: null,
      na: null,
      released: null,
      design: null,
      notReleased: null,
      unclassifiedCount: 0,
      inconsistentCount: 0,
      backlog: null,
      aheadOfPlan: null,
      allocations: {},
      warnings: schedule ? [schedule] : [],
    };
  });
  const dateSet = new Set<string>();
  for (const item of items) {
    for (const day of datesBetween(item.plannedStart, item.plannedEnd)) dateSet.add(day);
  }
  const baselineCount = items.reduce((sum, item) => sum + (item.baselineCount ?? 0), 0);
  const scope = scopeIntegrityMessage({ scopeSnapshotAvailable: false, addedCount: 0, removedCount: 0 });
  const schedule = scheduleIntegrityMessage(baselineCount, 0);
  const math = scheduleOf({
    baselineCount,
    allocations: [],
    asOf: input.asOf,
    finalizedCount,
  });
  return {
    planning: { planKey: input.planKey },
    revision: {
      version: null,
      reason: null,
      createdAt: null,
      baselineOrigin: "legacy",
      scopeSnapshotAvailable: false,
    },
    summary: {
      baselineCount,
      sourceCount: input.sourceCount,
      addedCount: 0,
      removedCount: 0,
      scopeDelta: 0,
      distributedCount: 0,
      distributionGap: math.distributionGap,
      plannedToDate: 0,
      finalizedCount,
      backlog: math.backlog,
      aheadOfPlan: math.aheadOfPlan,
      classifiedCount: points.filter((point) => point.classification !== "unclassified").length,
      unclassifiedCount: points.filter((point) => point.integrity === "unmapped").length,
      inconsistentCount: points.filter((point) => point.integrity === "inconsistent").length,
      scopeCheck: scope,
    },
    dimensions,
    dates: [...dateSet].sort(),
    items,
    integrity: {
      scope,
      classification: classificationIntegrityMessage(
        points.filter((point) => point.integrity === "unmapped").length,
        points.filter((point) => point.integrity === "inconsistent").length,
      ),
      schedule,
    },
    executionHistory: {
      reconstructed: false,
      note: "O histórico de execução passa a ser observável a partir das sincronizações do FourQA. O estado atual do Test Point não reconstrói execuções antigas. O planejamento legado não liga cada processo aos Test Points.",
    },
    revisions: [],
    editable: false,
  };
}

function scopeNote(
  origin: "legacy" | "motor" | "ausente",
  snapshot: boolean,
  addedCount: number,
  removedCount: number,
): string | null {
  if (origin === "ausente") {
    return "Planejamento ainda não confirmado. A fonte atual é sugestão e não entra no baseline.";
  }
  return scopeIntegrityMessage({ scopeSnapshotAvailable: snapshot, addedCount, removedCount });
}

function sourceScopeOf(planKey: string): ScopeRef[] {
  return listExecucoesAll(planKey)
    .filter((row) => row.test_point_id != null)
    .map((row) => ({
      planId: row.plan_id,
      suiteId: row.suite_id,
      testPointId: row.test_point_id,
      testCaseId: row.test_case_id,
      label: row.atalho,
    }));
}

export function confirmOrRevise(planKey: string, input: { reason: string; adoptSource: boolean }): PlanningView {
  const db = getDb();
  const current = latestRevision(planKey);
  if (!input.adoptSource && (!current || current.scope_snapshot !== 1)) {
    throw new Error("Confirme um baseline com snapshot antes de replanejar.");
  }
  const scope = input.adoptSource || !current ? sourceScopeOf(planKey) : loadScope(current.id);
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT id FROM planning WHERE plan_key = ?").get(planKey) as { id: number } | undefined;
    const planningId =
      existing?.id ?? Number(db.prepare("INSERT INTO planning (plan_key, created_at) VALUES (?, ?)").run(planKey, now).lastInsertRowid);
    const version = (current?.version ?? 0) + 1;
    const revisionId = Number(
      db.prepare(
        `INSERT INTO planning_revision (planning_id, version, created_at, reason, baseline_origin, scope_snapshot)
         VALUES (?, ?, ?, ?, 'motor', 1)`,
      ).run(planningId, version, now, input.reason.trim() || "Confirmação do baseline").lastInsertRowid,
    );
    const insertScope = db.prepare(
      `INSERT INTO planning_scope_item (revision_id, plan_id, suite_id, test_point_id, test_case_id, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const item of scope) {
      insertScope.run(revisionId, item.planId, item.suiteId, item.testPointId, item.testCaseId, item.label ?? null);
    }
    if (!input.adoptSource && current) {
      copySchedule(db, current.id, revisionId);
    } else {
      insertItemsFromScope(db, planKey, revisionId, scope, current?.id ?? null);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getPlanningView(planKey);
}

function copySchedule(db: ReturnType<typeof getDb>, fromRevision: number, toRevision: number): void {
  const items = db
    .prepare(
      `SELECT id, suite_id, suite_name, planned_start, planned_end, baseline_quantity
       FROM planning_item WHERE revision_id = ?`,
    )
    .all(fromRevision) as {
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
    .all(fromRevision) as { item_id: number; alloc_date: string; planned_quantity: number }[];
  const insertItem = db.prepare(
    `INSERT INTO planning_item (revision_id, suite_id, suite_name, planned_start, planned_end, baseline_quantity)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAlloc = db.prepare(
    `INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)`,
  );
  for (const item of items) {
    const newId = Number(
      insertItem.run(toRevision, item.suite_id, item.suite_name, item.planned_start, item.planned_end, item.baseline_quantity).lastInsertRowid,
    );
    for (const alloc of allocs.filter((row) => row.item_id === item.id)) {
      insertAlloc.run(newId, alloc.alloc_date, alloc.planned_quantity);
    }
  }
}

function insertItemsFromScope(
  db: ReturnType<typeof getDb>,
  planKey: string,
  revisionId: number,
  scope: ScopeRef[],
  previousRevisionId: number | null,
): void {
  const names = new Map<number, string>();
  for (const row of listExecucoesAll(planKey)) {
    if (row.suite_id != null && row.suite_name) names.set(row.suite_id, row.suite_name);
  }
  const legacy = new Map(
    legacyBaseForPlan(planKey).map((row) => [(row.processo ?? "").trim().toLowerCase(), row]),
  );
  const bySuite = new Map<string, { suiteId: number | null; count: number }>();
  for (const item of scope) {
    const key = item.suiteId != null ? `id:${item.suiteId}` : "sem";
    const found = bySuite.get(key) ?? { suiteId: item.suiteId, count: 0 };
    found.count += 1;
    bySuite.set(key, found);
  }
  const previous = new Map<string, { start: string | null; end: string | null; allocs: { date: string; quantity: number }[] }>();
  if (previousRevisionId != null) {
    const prevItems = db
      .prepare(`SELECT id, suite_id, planned_start, planned_end FROM planning_item WHERE revision_id = ?`)
      .all(previousRevisionId) as { id: number; suite_id: number | null; planned_start: string | null; planned_end: string | null }[];
    const prevAllocs = db
      .prepare(
        `SELECT a.item_id, a.alloc_date, a.planned_quantity
         FROM planning_allocation a
         JOIN planning_item i ON i.id = a.item_id
         WHERE i.revision_id = ?`,
      )
      .all(previousRevisionId) as { item_id: number; alloc_date: string; planned_quantity: number }[];
    for (const item of prevItems) {
      if (item.suite_id == null) continue;
      previous.set(`id:${item.suite_id}`, {
        start: item.planned_start,
        end: item.planned_end,
        allocs: prevAllocs
          .filter((row) => row.item_id === item.id)
          .map((row) => ({ date: row.alloc_date, quantity: row.planned_quantity })),
      });
    }
  }
  const insertItem = db.prepare(
    `INSERT INTO planning_item (revision_id, suite_id, suite_name, planned_start, planned_end, baseline_quantity)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAlloc = db.prepare(
    `INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)`,
  );
  for (const group of bySuite.values()) {
    const name = group.suiteId != null ? (names.get(group.suiteId) ?? null) : null;
    const kept = group.suiteId != null ? previous.get(`id:${group.suiteId}`) : undefined;
    const inherited = name ? legacy.get(name.trim().toLowerCase()) : undefined;
    const newId = Number(
      insertItem.run(
        revisionId,
        group.suiteId,
        name,
        kept?.start ?? (inherited?.data_inicio ? calendarDate(inherited.data_inicio) : null),
        kept?.end ?? (inherited?.data_fim ? calendarDate(inherited.data_fim) : null),
        group.count,
      ).lastInsertRowid,
    );
    for (const alloc of kept?.allocs ?? []) insertAlloc.run(newId, alloc.date, alloc.quantity);
  }
}

export function savePlanningCell(
  planKey: string,
  input: { suiteId: number | null; field: "start" | "end" | "day"; date?: string; quantity?: number },
): PlanningView {
  const revision = latestRevision(planKey);
  if (!revision || revision.scope_snapshot !== 1) {
    throw new Error("Período e distribuição só podem ser editados num baseline confirmado.");
  }
  const db = getDb();
  const item = db
    .prepare(
      `SELECT id FROM planning_item
       WHERE revision_id = ? AND ((suite_id = ?) OR (suite_id IS NULL AND ? IS NULL))`,
    )
    .get(revision.id, input.suiteId, input.suiteId) as { id: number } | undefined;
  if (!item) throw new Error("Suíte fora do baseline confirmado.");
  if (input.field === "day") {
    const day = calendarDate(input.date);
    const quantity = input.quantity;
    if (!day || quantity == null || !Number.isFinite(quantity) || quantity < 0) throw new Error("Informe data e quantidade.");
    db.prepare("DELETE FROM planning_allocation WHERE item_id = ? AND alloc_date = ?").run(item.id, day);
    if (quantity > 0) {
      db.prepare("INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)").run(item.id, day, quantity);
    }
  } else {
    const day = input.date ? calendarDate(input.date) : null;
    if (input.date && !day) throw new Error("Data inválida.");
    const column = input.field === "start" ? "planned_start" : "planned_end";
    db.prepare(`UPDATE planning_item SET ${column} = ? WHERE id = ?`).run(day, item.id);
  }
  return getPlanningView(planKey);
}
