import { getStores } from "../persistence/provider.js";
import type { LegacyPlanRow, PlanningItemWrite } from "../persistence/contracts.js";
import { isLegacyPlanOwner } from "../domain/legacyPlanOwner.js";
import { assertStoredPlanningPeriod } from "../domain/planPeriod.js";
import { inferDimensions, type DetectedDimension } from "../domain/dimensions.js";
import { metricasDosPontos } from "../domain/formulas.js";
import {
  assessPoint,
  calendarDate,
  classificationIntegrityMessage,
  datesBetween,
  diffScope,
  matchScheduleItem,
  normalizeSuiteFill,
  previousFillKey,
  scheduleIntegrityMessage,
  scheduleItemsForScope,
  scheduleOf,
  scopeIntegrityMessage,
  type ScopeRef,
} from "../domain/planning.js";
import type { ExecucaoRow } from "../types.js";
import { scheduleFingerprint } from "../persistence/scheduleFingerprint.js";

const stores = await getStores();
const getMeta = async (key: string) => stores.meta.get(key);
const listExecucoesAll = async (planKey: string) => stores.azureSnapshot.listExecucoes(planKey);
const listPlanejamentoBase = async () => stores.legacyPlan.listBase();
const {
  latestRevision,
  revisionByVersion,
  listRevisions,
  loadScope,
  loadSchedule,
  commitRevision,
  saveCell,
} = stores.planning;

export type PlanningItemView = {
  suiteId: number | null;
  testPointId: number | null;
  suiteName: string;
  responsavel: string | null;
  prioridade: string | null;
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

function isLegacyTotalsRow(processo: string | null): boolean {
  return /valores\s+totais/i.test(processo ?? "");
}

/**
 * planejamento_linhas não tem plan_key. Só entra no plano cujo dono está em
 * workbook_meta.planejamento_legado_plan_key. Sem essa meta, o legado não tem proprietário.
 */
async function legacyBaseForPlan(planKey: string): Promise<LegacyPlanRow[]> {
  if (!isLegacyPlanOwner(planKey, await getMeta("planejamento_legado_plan_key"))) return [];
  return (await listPlanejamentoBase()).filter((row) => !isLegacyTotalsRow(row.processo));
}

async function catalog(planKey: string, rows: ExecucaoRow[]): Promise<DetectedDimension[]> {
  const raw = await getMeta(`dimensoes_catalog:${planKey}`);
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

export async function getPlanningView(planKey: string, version?: number): Promise<PlanningView> {
  assertStoredPlanningPeriod(await getMeta("data_inicio"), await getMeta("data_fim"));
  const execRows = await listExecucoesAll(planKey);
  const asOf = hojeLocal();
  const revision = version != null ? await revisionByVersion(planKey, version) : await latestRevision(planKey);
  const latest = await latestRevision(planKey);
  const editable = Boolean(revision && latest && revision.id === latest.id && revision.scope_snapshot === 1);
  const snapshot = Boolean(revision && revision.scope_snapshot === 1);
  const baselineScope = revision && snapshot ? await loadScope(revision.id) : [];
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

  const legacyRows = await legacyBaseForPlan(planKey);
  const legacy = new Map(legacyRows.map((row) => [(row.processo ?? "").trim().toLowerCase(), row]));

  const groups = new Map<string, ExecucaoRow[]>();
  for (const [index, row] of execRows.entries()) {
    const key = previousFillKey({ suiteId: row.suite_id, testPointId: row.suite_id == null ? row.test_point_id : null }) ?? `loose:${index}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const allocBySuite = new Map<string, Record<string, number>>();
  const periodBySuite = new Map<string, {
    start: string | null;
    end: string | null;
    qty: number | null;
    name: string | null;
    responsavel: string | null;
    prioridade: string | null;
  }>();
  if (revision) {
    for (const item of await loadSchedule(revision.id)) {
      const key = previousFillKey({ suiteId: item.suiteId, testPointId: item.testPointId ?? null }) ?? `loose:${item.id}`;
      periodBySuite.set(key, {
        start: item.plannedStart,
        end: item.plannedEnd,
        qty: item.baselineQuantity,
        name: item.suiteName,
        responsavel: item.suiteId != null ? (item.responsavel ?? null) : null,
        prioridade: item.suiteId != null ? (item.prioridade ?? null) : null,
      });
      const allocations: Record<string, number> = {};
      for (const alloc of item.allocations) allocations[alloc.date] = alloc.quantity;
      allocBySuite.set(key, allocations);
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
    const suiteScope = scopeOfGroup(sample, baselineScope);
    const suiteSource = scopeOfGroup(sample, sourceScope);
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
      testPointId: sample?.suite_id != null ? null : (sample?.test_point_id ?? null),
      suiteName: name || "(sem suíte)",
      responsavel: sample?.suite_id != null ? (period?.responsavel ?? null) : null,
      prioridade: sample?.suite_id != null ? (period?.prioridade ?? null) : null,
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
    const present = new Set(items.map((item) => previousFillKey(item)).filter((key): key is string => key != null));
    const missing = new Map<string, ScopeRef[]>();
    for (const ref of baselineScope) {
      const key = previousFillKey(ref);
      if (!key || present.has(key)) continue;
      const list = missing.get(key) ?? [];
      list.push(ref);
      missing.set(key, list);
    }
    for (const [key, refs] of missing) {
      const suiteId = refs[0]?.suiteId ?? null;
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
        testPointId: suiteId != null ? null : (refs[0]?.testPointId ?? null),
        suiteName: period?.name?.trim() || (suiteId != null ? `Suíte ${suiteId}` : `Ponto ${refs[0]?.testPointId ?? ""}`),
        responsavel: suiteId != null ? (period?.responsavel ?? null) : null,
        prioridade: suiteId != null ? (period?.prioridade ?? null) : null,
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
    dimensions: await catalog(planKey, execRows),
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
    revisions: await listRevisions(planKey),
    editable,
  };
}

function legacyPlanningView(input: {
  planKey: string;
  asOf: string;
  legacyRows: LegacyPlanRow[];
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
      testPointId: null,
      suiteName: (row.processo ?? "").trim() || "(sem nome)",
      responsavel: null,
      prioridade: null,
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

async function sourceScopeOf(planKey: string): Promise<ScopeRef[]> {
  return (await listExecucoesAll(planKey))
    .filter((row) => row.test_point_id != null)
    .map((row) => ({
      planId: row.plan_id,
      suiteId: row.suite_id,
      testPointId: row.test_point_id,
      testCaseId: row.test_case_id,
      label: row.atalho,
    }));
}

function scopeOfGroup(sample: ExecucaoRow | undefined, scope: ScopeRef[]): ScopeRef[] {
  if (!sample) return [];
  if (sample.suite_id != null) return scope.filter((item) => item.suiteId === sample.suite_id);
  if (sample.test_point_id != null) {
    return scope.filter((item) => item.suiteId == null && item.testPointId === sample.test_point_id);
  }
  return [];
}

async function copiedSchedule(revisionId: number): Promise<PlanningItemWrite[]> {
  return (await loadSchedule(revisionId)).map((row) => ({
    suiteId: row.suiteId,
    suiteName: row.suiteName,
    testPointId: row.testPointId ?? null,
    testCaseId: row.testCaseId ?? null,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    responsavel: row.responsavel ?? null,
    prioridade: row.prioridade ?? null,
    baselineQuantity: row.baselineQuantity,
    allocations: row.allocations.map((alloc) => ({ date: alloc.date, quantity: alloc.quantity })),
  }));
}

async function itemsForNewRevision(planKey: string, scope: ScopeRef[], previousRevisionId: number | null): Promise<PlanningItemWrite[]> {
  const names = new Map<number, string>();
  for (const row of await listExecucoesAll(planKey)) {
    if (row.suite_id != null && row.suite_name) names.set(row.suite_id, row.suite_name);
  }
  const legacy = new Map(
    (await legacyBaseForPlan(planKey)).map((row) => [(row.processo ?? "").trim().toLowerCase(), row]),
  );
  const previous = previousRevisionId == null ? [] : await copiedSchedule(previousRevisionId);
  return scheduleItemsForScope({
    scope,
    suiteNames: names,
    previous: previous.map((item) => ({
      suiteId: item.suiteId,
      testPointId: item.testPointId ?? null,
      testCaseId: item.testCaseId ?? null,
      suiteName: item.suiteName,
      plannedStart: item.plannedStart,
      plannedEnd: item.plannedEnd,
      responsavel: item.responsavel ?? null,
      prioridade: item.prioridade ?? null,
      baselineQuantity: item.baselineQuantity ?? 0,
      allocations: item.allocations,
    })),
    inherited: (suiteName) => {
      const row = legacy.get(suiteName.trim().toLowerCase());
      if (!row) return undefined;
      return {
        start: row.data_inicio ? calendarDate(row.data_inicio) : null,
        end: row.data_fim ? calendarDate(row.data_fim) : null,
      };
    },
  });
}

export async function confirmOrRevise(planKey: string, input: { reason: string; adoptSource: boolean }): Promise<PlanningView> {
  const current = await latestRevision(planKey);
  if (!input.adoptSource && (!current || current.scope_snapshot !== 1)) {
    throw new Error("Confirme um baseline com snapshot antes de replanejar.");
  }
  const scope = input.adoptSource || !current ? await sourceScopeOf(planKey) : await loadScope(current.id);
  const now = new Date().toISOString();
  const sourceSchedule = current ? await loadSchedule(current.id) : [];
  const items = !input.adoptSource && current
    ? await copiedSchedule(current.id)
    : await itemsForNewRevision(planKey, scope, current?.id ?? null);
  await commitRevision({
    planKey,
    createdAt: now,
    version: (current?.version ?? 0) + 1,
    reason: input.reason.trim() || "Confirmação do baseline",
    baselineOrigin: "motor",
    scopeSnapshot: 1,
    scope,
    items,
    baseRevisionId: current?.id ?? null,
    baseFingerprint: current ? scheduleFingerprint(sourceSchedule) : null,
  });
  return getPlanningView(planKey);
}

export async function savePlanningCell(
  planKey: string,
  input: {
    suiteId: number | null;
    testPointId?: number | null;
    field: "start" | "end" | "day" | "responsavel" | "prioridade";
    date?: string;
    quantity?: number;
    value?: string;
    guard?: boolean;
    expectedText?: string | null;
    expectedQuantity?: number;
  },
): Promise<PlanningView> {
  const revision = await latestRevision(planKey);
  if (!revision || revision.scope_snapshot !== 1) {
    throw new Error("Período e distribuição só podem ser editados num baseline confirmado.");
  }
  const schedule = await loadSchedule(revision.id);
  const item = matchScheduleItem(
    schedule.map((row) => ({ ...row, testPointId: row.testPointId ?? null })),
    input,
  );
  if (!item) {
    const loose = schedule.filter((row) => row.suiteId == null && row.testPointId == null);
    if (input.suiteId == null && input.testPointId == null && loose.length > 1) {
      throw new Error("Item sem suíte e sem Test Point não pode ser editado em conjunto.");
    }
    throw new Error("Suíte fora do baseline confirmado.");
  }
  if (input.field === "responsavel" || input.field === "prioridade") {
    if (item.suiteId == null) throw new Error("Responsável e prioridade exigem Suite ID.");
    await saveCell({
      planKey,
      revisionId: revision.id,
      itemId: item.id,
      field: input.field,
      value: normalizeSuiteFill(input.value),
      guard: input.guard,
      expectedText: input.expectedText,
    });
    return getPlanningView(planKey);
  }
  if (input.field === "day") {
    const day = calendarDate(input.date);
    const quantity = input.quantity;
    if (!day || quantity == null || !Number.isFinite(quantity) || quantity < 0) throw new Error("Informe data e quantidade.");
    await saveCell({
      planKey,
      revisionId: revision.id,
      itemId: item.id,
      field: "day",
      date: day,
      quantity,
      guard: input.guard,
      expectedQuantity: input.expectedQuantity,
    });
  } else {
    const day = input.date ? calendarDate(input.date) : null;
    if (input.date && !day) throw new Error("Data inválida.");
    await saveCell({
      planKey,
      revisionId: revision.id,
      itemId: item.id,
      field: input.field,
      date: day,
      guard: input.guard,
      expectedText: input.expectedText,
    });
  }
  return getPlanningView(planKey);
}
