/** Ano máximo aceito para período do plano e datas de calendário. */
export const PLAN_PERIOD_YEAR_MAX = 2100;

/** Ano mínimo = ano corrente (só datas atuais ou futuras no calendário). */
export function planPeriodYearMin(reference = new Date()): number {
  return reference.getFullYear();
}

/** Limite de dias no intervalo fechado [início, fim] para cálculos e calendário. */
export const PLAN_PERIOD_MAX_DAYS = 2000;

export class PlanningPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanningPeriodError";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isRealUtcDate(year: number, month: number, day: number): boolean {
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/** Converte entrada ISO ou dd/mm/aaaa em YYYY-MM-DD válido, ou null. */
export function parseCalendarDay(value: string, reference = new Date()): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const yearMin = planPeriodYearMin(reference);

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (year < yearMin || year > PLAN_PERIOD_YEAR_MAX) return null;
    if (!isRealUtcDate(year, month, day)) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const year = Number(br[3]);
    const month = Number(br[2]);
    const day = Number(br[1]);
    if (year < yearMin || year > PLAN_PERIOD_YEAR_MAX) return null;
    if (!isRealUtcDate(year, month, day)) return null;
    return `${br[3]}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

export function planningPeriodInvalidMessage(reference = new Date()): string {
  const yearMin = planPeriodYearMin(reference);
  return `Período inválido. Use datas de ${yearMin} em diante (até ${PLAN_PERIOD_YEAR_MAX}) no formato aaaa-mm-dd.`;
}

export function calendarDaySpanInclusive(startIso: string, endIso: string): number {
  const start = parseCalendarDay(startIso);
  const end = parseCalendarDay(endIso);
  if (!start || !end || start > end) return 0;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const t0 = Date.UTC(sy, sm - 1, sd);
  const t1 = Date.UTC(ey, em - 1, ed);
  return Math.floor((t1 - t0) / 86_400_000) + 1;
}

export function assertPlanningPeriod(
  inicio: string,
  fim: string,
  reference = new Date(),
): { inicio: string; fim: string } {
  const start = parseCalendarDay(inicio, reference);
  const end = parseCalendarDay(fim, reference);
  if (!start || !end) {
    throw new PlanningPeriodError(planningPeriodInvalidMessage(reference));
  }
  if (start > end) {
    throw new PlanningPeriodError("A data de início não pode ser posterior à data de fim.");
  }
  const span = calendarDaySpanInclusive(start, end);
  if (span > PLAN_PERIOD_MAX_DAYS) {
    throw new PlanningPeriodError(
      `Período muito longo (${span} dias). O máximo permitido é ${PLAN_PERIOD_MAX_DAYS} dias.`,
    );
  }
  return { inicio: start, fim: end };
}

/** Valida metadados do workbook antes de cálculos pesados; ignora se ainda não houver período. */
export function assertStoredPlanningPeriod(inicio: string | null | undefined, fim: string | null | undefined): void {
  const a = (inicio ?? "").trim();
  const b = (fim ?? "").trim();
  if (!a || !b) return;
  assertPlanningPeriod(a, b);
}

export function assertDateRangeForCalculation(inicio: Date, fim: Date): void {
  if (fim.getTime() < inicio.getTime()) {
    throw new PlanningPeriodError("Intervalo de datas inválido para cálculo.");
  }
  const allowedMin = planPeriodYearMin();
  const yearMin = inicio.getUTCFullYear();
  const yearMax = fim.getUTCFullYear();
  if (yearMin < allowedMin || yearMax > PLAN_PERIOD_YEAR_MAX) {
    throw new PlanningPeriodError(planningPeriodInvalidMessage());
  }
  const spanDays = Math.floor((fim.getTime() - inicio.getTime()) / 86_400_000) + 1;
  if (spanDays > PLAN_PERIOD_MAX_DAYS) {
    throw new PlanningPeriodError(
      `Intervalo muito longo para cálculo (${spanDays} dias). Máximo: ${PLAN_PERIOD_MAX_DAYS} dias.`,
    );
  }
}
