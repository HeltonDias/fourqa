import type { PlanningScheduleItem } from "../db/sqlitePlanningStore.js";

/** Identidade do cronograma de uma revisão (sem ordem instável de alocações). */
export function scheduleFingerprint(items: readonly PlanningScheduleItem[]): string {
  const lines: string[] = [];
  const sorted = [...items].sort((a, b) => a.id - b.id);
  for (const item of sorted) {
    lines.push(
      [
        item.id,
        item.suiteId,
        item.testPointId,
        item.testCaseId,
        item.plannedStart ?? "",
        item.plannedEnd ?? "",
        item.responsavel ?? "",
        item.prioridade ?? "",
        num(item.baselineQuantity),
        item.suiteName ?? "",
      ].join("\t"),
    );
    const allocs = [...item.allocations].sort((a, b) => a.date.localeCompare(b.date) || a.quantity - b.quantity);
    for (const a of allocs) {
      lines.push(`${a.date}=${num(a.quantity)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}
