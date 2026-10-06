import { classifyExecution, type StatusCenario } from "./formulas.js";
import { calendarDaySpanInclusive, parseCalendarDay, PLAN_PERIOD_MAX_DAYS } from "./planPeriod.js";

/** Identidade estável do CT na fonte. Nome, atalho e frente não entram na chave. */
export type ScopeRef = {
  planId: number | null;
  suiteId: number | null;
  testPointId: number | null;
  testCaseId: number | null;
  label?: string | null;
};

export type PointIntegrity = "consistent" | "inconsistent" | "unmapped";

export type PlanningRevision = {
  version: number;
  createdAt: string;
  reason: string;
  baselineOrigin: "legacy" | "motor";
  scopeSnapshotAvailable: boolean;
  scope: ScopeRef[];
};

export function scopeIdentity(ref: ScopeRef): string {
  return `${ref.planId ?? ""}|${ref.suiteId ?? ""}|${ref.testPointId ?? ""}|${ref.testCaseId ?? ""}`;
}

export function diffScope(baseline: ScopeRef[], source: ScopeRef[]) {
  const base = new Map(baseline.map((item) => [scopeIdentity(item), item]));
  const current = new Map(source.map((item) => [scopeIdentity(item), item]));
  const addedItems = [...current.keys()].filter((key) => !base.has(key)).map((key) => current.get(key)!);
  const removedItems = [...base.keys()].filter((key) => !current.has(key)).map((key) => base.get(key)!);
  const suiteIds = (items: ScopeRef[]) => new Set(items.map((item) => item.suiteId).filter((id) => id != null));
  const baseSuites = suiteIds(baseline);
  const sourceSuites = suiteIds(source);
  return {
    baselineCount: baseline.length,
    sourceCount: source.length,
    addedCount: addedItems.length,
    removedCount: removedItems.length,
    scopeDelta: addedItems.length - removedItems.length,
    addedItems,
    removedItems,
    addedSuites: [...sourceSuites].filter((id) => !baseSuites.has(id)).length,
    removedSuites: [...baseSuites].filter((id) => !sourceSuites.has(id)).length,
  };
}

export function calendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const head = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[0];
  if (head) return parseCalendarDay(head);
  return parseCalendarDay(value.trim());
}

export function scheduleOf(input: {
  baselineCount: number;
  allocations: { date: string; plannedQuantity: number }[];
  asOf: string;
  finalizedCount: number;
}) {
  const distributedCount = input.allocations.reduce((sum, row) => sum + row.plannedQuantity, 0);
  const asOf = calendarDate(input.asOf) ?? input.asOf;
  const plannedToDate = input.allocations.reduce((sum, row) => {
    const day = calendarDate(row.date);
    return day && day <= asOf ? sum + row.plannedQuantity : sum;
  }, 0);
  const scheduleDelta = input.finalizedCount - plannedToDate;
  return {
    baselineCount: input.baselineCount,
    distributedCount,
    distributionGap: distributedCount - input.baselineCount,
    plannedToDate,
    finalizedCount: input.finalizedCount,
    scheduleDelta,
    backlog: Math.max(plannedToDate - input.finalizedCount, 0),
    aheadOfPlan: Math.max(input.finalizedCount - plannedToDate, 0),
  };
}

export function datesBetween(start: string | null, end: string | null): string[] {
  const a = calendarDate(start);
  const b = calendarDate(end);
  if (!a || !b || a > b) return [];
  if (calendarDaySpanInclusive(a, b) > PLAN_PERIOD_MAX_DAYS) return [];
  const out: string[] = [];
  const cursor = new Date(`${a}T12:00:00`);
  const last = new Date(`${b}T12:00:00`);
  while (cursor <= last) {
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    out.push(`${cursor.getFullYear()}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

type Point = { outcome: string | null; test_case_state: string | null; test_point_state: string | null };

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Classificação vem de classifyExecution. Integridade é outra pergunta:
 * a combinação de estados é coerente, ou não está mapeada.
 */
export function assessPoint(point: Point): {
  classification: StatusCenario | "unclassified";
  integrity: PointIntegrity;
} {
  const outcome = norm(point.outcome);
  const testCase = norm(point.test_case_state);
  const classification = classifyExecution(point);
  if (outcome === "passed" && testCase === "bug") {
    return { classification, integrity: "inconsistent" };
  }
  const knownOutcome = outcome === "passed" || outcome === "failed" || outcome === "blocked" || outcome === "notapplicable";
  const knownCase = testCase === "design" || testCase === "não atribuído" || testCase === "nao atribuido";
  const ready = norm(point.test_point_state) === "ready" && !knownOutcome;
  if (knownOutcome || knownCase || ready) return { classification, integrity: "consistent" };
  return { classification: "unclassified", integrity: "unmapped" };
}

export function countAssessments(points: Point[]) {
  const rows = points.map(assessPoint);
  return {
    classifiedCount: rows.filter((row) => row.classification !== "unclassified").length,
    unclassifiedCount: rows.filter((row) => row.integrity === "unmapped").length,
    inconsistentCount: rows.filter((row) => row.integrity === "inconsistent").length,
    finalizedCount: rows.filter((row) => row.classification === "passed" || row.classification === "na").length,
  };
}

export function scopeIntegrityMessage(input: {
  scopeSnapshotAvailable: boolean;
  addedCount: number;
  removedCount: number;
}): string | null {
  if (!input.scopeSnapshotAvailable) {
    return "Baseline legado sem snapshot dos CTs. Não há informação suficiente para validar o que entrou ou saiu.";
  }
  if (input.addedCount === 0 && input.removedCount === 0) return null;
  const parts: string[] = [];
  if (input.addedCount === 1) parts.push("1 CT foi adicionado após a confirmação do baseline");
  else if (input.addedCount > 1) parts.push(`${input.addedCount} CTs foram adicionados após a confirmação do baseline`);
  if (input.removedCount === 1) parts.push("1 CT foi removido da fonte");
  else if (input.removedCount > 1) parts.push(`${input.removedCount} CTs foram removidos da fonte`);
  return parts.join(". ") + ".";
}

export function scheduleIntegrityMessage(baselineCount: number, distributedCount: number): string | null {
  const gap = distributedCount - baselineCount;
  if (gap === 0) return null;
  if (gap < 0) return `${-gap} cenário${gap === -1 ? "" : "s"} ainda não distribuído${gap === -1 ? "" : "s"} no cronograma`;
  return `${gap} cenário${gap === 1 ? "" : "s"} distribuído${gap === 1 ? "" : "s"} além do baseline`;
}

export function classificationIntegrityMessage(unclassified: number, inconsistent: number): string | null {
  const parts: string[] = [];
  if (unclassified > 0) parts.push(`${unclassified} cenário${unclassified === 1 ? "" : "s"} não classificado${unclassified === 1 ? "" : "s"}`);
  if (inconsistent > 0) parts.push(`${inconsistent} combinação inconsistente`);
  return parts.length ? parts.join(". ") + "." : null;
}

/** Nova revisão. Não altera a anterior. CTs novos da fonte não entram sozinhos. */
export function nextRevision(
  previous: PlanningRevision | null,
  input: { at: string; reason: string; scope: ScopeRef[]; adoptSource: boolean },
): { previous: PlanningRevision | null; current: PlanningRevision } {
  const scope = previous && !input.adoptSource ? previous.scope.map((item) => ({ ...item })) : input.scope.map((item) => ({ ...item }));
  return {
    previous,
    current: {
      version: (previous?.version ?? 0) + 1,
      createdAt: input.at,
      reason: input.reason.trim(),
      baselineOrigin: "motor",
      scopeSnapshotAvailable: true,
      scope,
    },
  };
}
