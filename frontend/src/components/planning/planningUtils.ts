import type { CSSProperties } from "react";
import type { DetectedDimension, PlanningItem, PlanningView } from "../../types";

export function planRem(px: number): string {
  return `${px / 16}rem`;
}

export function stickyStyle(col: { left: number; width: number }): CSSProperties {
  return { left: col.left, width: col.width, minWidth: col.width, maxWidth: col.width };
}

/** Colunas fixas em rem para acompanhar o zoom do navegador na tabela de acompanhamento. */
export function stickyStyleRem(col: { left: number; width: number }): CSSProperties {
  const width = planRem(col.width);
  return { left: planRem(col.left), width, minWidth: width, maxWidth: width };
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;
export const CHECK_W = 34;
export const PERIOD_COL_W = 86;

export const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function hojeIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function diaCheio(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function partesDia(iso: string): { dow: string; num: string; monday: boolean; weekend: boolean } {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { dow: "", num: iso, monday: false, weekend: false };
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const day = date.getDay();
  return {
    dow: DOW[day] ?? "",
    num: match[3],
    monday: day === 1,
    weekend: day === 0 || day === 6,
  };
}

export function isWeekendDay(iso: string): boolean {
  return partesDia(iso).weekend;
}

/** Dias úteis (seg–sex) para o calendário da aba Planejar. */
export function onlyWeekdays(dates: string[]): string[] {
  return dates.filter((date) => !isWeekendDay(date));
}

export function soma(items: PlanningItem[], pick: (item: PlanningItem) => number | null): number {
  return items.reduce((total, item) => total + (pick(item) ?? 0), 0);
}

export function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(value);
}

export function pct(part: number, whole: number): string {
  if (!whole) return "0,0%";
  return `${((part / whole) * 100).toFixed(1).replace(".", ",")}%`;
}

export function atalhoDe(name: string): string {
  const cut = name.split(" - ")[0]?.trim() ?? "";
  if (!cut || cut === name.trim() || cut.length > 18) return "";
  return cut;
}

export function dimensionRank(dim: DetectedDimension): number {
  const blob = `${dim.key} ${dim.label} ${dim.role}`.toLowerCase();
  if (blob.includes("atalho")) return 10;
  if (dim.role === "priority" || blob.includes("prior")) return 20;
  if (blob.includes("onda")) return 30;
  if (dim.role === "front" || blob.includes("frente")) return 40;
  if (dim.role === "process" || (blob.includes("process") && !blob.includes("sub"))) return 50;
  if (dim.role === "subprocess" || blob.includes("sub")) return 60;
  return 80 + dim.level;
}

/** Larguras fixas (px) do bloco hierárquico Test Plan → Frente → Processo. */
export const HIER_COL_WIDTH = {
  plan: 88,
  front: 112,
  process: 248,
} as const;

export type HierColTier = "plan" | "front" | "process";

export function dimWidth(dim: DetectedDimension): number {
  const blob = `${dim.key} ${dim.label} ${dim.role}`.toLowerCase();
  if (blob.includes("atalho")) return 78;
  if (dim.role === "priority" || blob.includes("prior")) return 52;
  if (blob.includes("onda")) return 78;
  if (dim.role === "front" || blob.includes("frente")) return HIER_COL_WIDTH.front;
  if (dim.role === "process" || blob.includes("process")) return HIER_COL_WIDTH.process;
  return 88;
}

export function hierarchyDimTier(dim: { role: string }): HierColTier | undefined {
  if (dim.role === "front") return "front";
  if (dim.role === "process") return "process";
  return undefined;
}

export function hierColClass(col: { hierTier?: HierColTier }): string {
  return col.hierTier ? `hier-col hier-col--${col.hierTier}` : "";
}

export function shortDim(label: string): string {
  const blob = label.toLowerCase();
  if (blob.includes("prior")) return "Prior.";
  if (blob.includes("atalho")) return "Atalho";
  if (blob.includes("onda")) return "Onda";
  if (blob.includes("frente")) return "Frente";
  return label;
}

export function rowKey(item: PlanningItem): string {
  return `${item.suiteId ?? "s"}-${item.suiteName}`;
}

export function isPriority(col: { kind: string; label: string; dimKey?: string }): boolean {
  return /prior/i.test(`${col.label} ${col.dimKey ?? ""}`);
}

export type IdCol = {
  key: string;
  label: string;
  short: string;
  width: number;
  left: number;
  kind: "atalho" | "dim" | "suite" | "planKey";
  dimKey?: string;
  planKeyValue?: string;
  hierTier?: HierColTier;
};

/** Cabeçalho visual das dimensões hierárquicas (sem alterar dados). */
export function hierarchyColumnLabel(dim: { role: string; label: string }): string {
  if (dim.role === "front") return "Frente/Feature";
  if (dim.role === "process") return "Processo/Function";
  return dim.label;
}

export function suiteMatchesProcessValue(processValue: string | undefined, suiteValue: string | undefined): boolean {
  const process = processValue?.trim();
  const suite = suiteValue?.trim();
  return Boolean(process && suite && process === suite);
}

function processDimensionKey(dimensions: DetectedDimension[]): string | undefined {
  return dimensions.find((dim) => dim.role === "process" && dim.visible !== false)?.key;
}

/** Oculta coluna de suíte quando Processo já traz o mesmo texto da folha. */
/** Última coluna do bloco Identificação (suíte ou processo quando a suíte está oculta). */
export function isIdentificacaoAnchorCol(col: IdCol, idCols: IdCol[]): boolean {
  const last = idCols[idCols.length - 1];
  return last?.key === col.key;
}

export function shouldHideSuiteIdColumn(dimensions: DetectedDimension[], items: PlanningItem[]): boolean {
  const processKey = processDimensionKey(dimensions);
  if (!processKey) return false;
  if (items.length === 0) return false;
  return items.every((item) =>
    suiteMatchesProcessValue(item.dimensions[processKey], item.suiteName),
  );
}

export type MetricCol = {
  key: string;
  label: string;
  title: string;
  tone: string;
  pick: (item: PlanningItem) => number | null;
};

export const PLAN_TRACK_COLS: MetricCol[] = [
  { key: "baseline", label: "Qtd plan", title: "Quantidade do baseline confirmado", tone: "plan", pick: (item) => item.baselineCount },
  { key: "toDate", label: "Até hoje", title: "Quantidade planejada até hoje", tone: "plan", pick: (item) => item.plannedToDate },
];

export const EXEC_COLS: MetricCol[] = [
  { key: "finalized", label: "Finaliz.", title: "Finalizados", tone: "fin", pick: (item) => item.finalizedCount },
  { key: "passed", label: "Passed", title: "Passed", tone: "pass", pick: (item) => item.passed },
  { key: "na", label: "N/A", title: "N/A", tone: "na", pick: (item) => item.na },
  { key: "failed", label: "Falhos", title: "Falhados", tone: "fail", pick: (item) => item.failed },
  { key: "blocked", label: "Bloq.", title: "Bloqueados", tone: "block", pick: (item) => item.blocked },
  { key: "released", label: "Liber.", title: "Liberados", tone: "rel", pick: (item) => item.released },
  { key: "design", label: "Design", title: "Design", tone: "des", pick: (item) => item.design },
  { key: "notReleased", label: "Não Lib.", title: "Não liberados", tone: "nl", pick: (item) => item.notReleased },
];

export function buildIdCols(
  dimensions: DetectedDimension[],
  items: PlanningItem[],
  options?: { startLeft?: number; planKey?: string },
): IdCol[] {
  const ordered = [...dimensions]
    .filter((dim) => dim.visible !== false)
    .sort((a, b) => dimensionRank(a) - dimensionRank(b) || a.level - b.level);
  const hasAtalhoDim = ordered.some((dim) => /atalho/i.test(`${dim.key} ${dim.label}`));
  const showAtalho = !hasAtalhoDim && items.some((item) => atalhoDe(item.suiteName) !== "");
  const cols: Omit<IdCol, "left">[] = [];
  const planKey = options?.planKey?.trim();
  if (planKey) {
    cols.push({
      key: "planKey",
      label: "Test Plan",
      short: "Test Plan",
      width: HIER_COL_WIDTH.plan,
      kind: "planKey",
      planKeyValue: planKey,
      hierTier: "plan",
    });
  }
  if (showAtalho) cols.push({ key: "atalho", label: "Atalho", short: "Atalho", width: 78, kind: "atalho" });
  for (const dim of ordered) {
    const short = hierarchyColumnLabel(dim);
    cols.push({
      key: dim.key,
      label: hierarchyColumnLabel(dim),
      short,
      width: dimWidth(dim),
      kind: "dim",
      dimKey: dim.key,
      hierTier: hierarchyDimTier(dim),
    });
  }
  if (!shouldHideSuiteIdColumn(dimensions, items)) {
    cols.push({
      key: "suite",
      label: "Processo / Suíte",
      short: "Processo / Suíte",
      width: HIER_COL_WIDTH.process,
      kind: "suite",
      hierTier: "process",
    });
  }
  let left = options?.startLeft ?? CHECK_W;
  return cols.map((col) => {
    const placed: IdCol = { ...col, left };
    left += col.width;
    return placed;
  });
}

export function monthSpans(dates: string[]): { key: string; label: string; count: number }[] {
  const spans: { key: string; label: string; count: number }[] = [];
  for (const date of dates) {
    const key = date.slice(0, 7);
    const last = spans[spans.length - 1];
    if (last && last.key === key) {
      last.count += 1;
      continue;
    }
    const month = MESES[Number(date.slice(5, 7)) - 1] ?? date.slice(5, 7);
    const year = date.slice(0, 4);
    const name = `${month}/${year}`;
    spans.push({
      key,
      label: spans.length === 0 ? `Calendário - ${name}` : name,
      count: 1,
    });
  }
  return spans;
}

export function uniqueMonthKeys(dates: string[]): string[] {
  const keys: string[] = [];
  for (const date of dates) {
    const key = date.slice(0, 7);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function monthLabel(monthKey: string): string {
  const month = MESES[Number(monthKey.slice(5, 7)) - 1] ?? monthKey.slice(5, 7);
  return `${month}/${monthKey.slice(0, 4)}`;
}

export function businessDaysIn(dates: string[]): number {
  return dates.filter((date) => !partesDia(date).weekend).length;
}

export function heatLevel(quantity: number): 0 | 1 | 2 | 3 | 4 {
  if (quantity <= 0) return 0;
  if (quantity <= 2) return 1;
  if (quantity <= 5) return 2;
  if (quantity <= 10) return 3;
  return 4;
}

export function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index);
  const wanted = [0, total - 1, current - 1, current, current + 1].filter((n) => n >= 0 && n < total);
  const sorted = [...new Set(wanted)].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = -1;
  for (const n of sorted) {
    if (prev >= 0 && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

export function findDimKey(dimensions: DetectedDimension[], pattern: RegExp): string | undefined {
  return dimensions.find((dim) => pattern.test(`${dim.key} ${dim.label} ${dim.role}`))?.key;
}

export function dimValues(items: PlanningItem[], dimKey: string): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const value = item.dimensions[dimKey]?.trim();
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function atalhoValues(items: PlanningItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const value = atalhoDe(item.suiteName);
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const BLANK_VALUE = "__blank__";

export function idColDisplayValue(item: PlanningItem, col: IdCol): string {
  if (col.kind === "planKey") return col.planKeyValue?.trim() ?? "";
  if (col.kind === "atalho") return atalhoDe(item.suiteName) || "";
  if (col.kind === "suite") return item.suiteName.trim();
  return (item.dimensions[col.dimKey ?? ""] ?? "").trim();
}

export function idColFilterToken(item: PlanningItem, col: IdCol): string {
  const raw = idColDisplayValue(item, col);
  return raw === "" ? BLANK_VALUE : raw;
}

export function uniqueIdColValues(items: PlanningItem[], col: IdCol): string[] {
  const set = new Set<string>();
  for (const item of items) set.add(idColFilterToken(item, col));
  return [...set].sort((a, b) => {
    if (a === BLANK_VALUE) return 1;
    if (b === BLANK_VALUE) return -1;
    return a.localeCompare(b, "pt-BR");
  });
}

export function idColFilterLabel(token: string): string {
  return token === BLANK_VALUE ? "(Vazias)" : token;
}

export type ColumnSort = { key: string; direction: "asc" | "desc" };

export function compareByIdCol(a: PlanningItem, b: PlanningItem, col: IdCol): number {
  const left = idColDisplayValue(a, col);
  const right = idColDisplayValue(b, col);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, "pt-BR", { numeric: true });
}

export function periodoLabel(dates: string[]): string {
  if (dates.length === 0) return "—";
  return `${diaCheio(dates[0])} - ${diaCheio(dates[dates.length - 1])}`;
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIsoDay(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function enumerateIsoDays(startIso: string, endIso: string): string[] {
  const start = parseIsoDay(startIso);
  const end = parseIsoDay(endIso);
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    out.push(isoDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function isoDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const key = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function collectPlanningDayKeys(apiDates: string[], items: PlanningItem[]): Set<string> {
  const keys = new Set<string>();
  for (const date of apiDates) {
    const key = isoDayKey(date);
    if (key) keys.add(key);
  }
  for (const item of items) {
    const start = isoDayKey(item.plannedStart);
    const end = isoDayKey(item.plannedEnd);
    if (start) keys.add(start);
    if (end) keys.add(end);
    for (const date of Object.keys(item.allocations)) {
      const key = isoDayKey(date);
      if (key) keys.add(key);
    }
  }
  return keys;
}

/** Intervalo do calendário: período do relatório prevalece sobre datas esparsas da API. */
export function resolvePlanningRange(
  apiDates: string[],
  items: PlanningItem[],
  periodo?: { inicio: string; fim: string } | null,
): { start: string; end: string } | null {
  const periodStart = isoDayKey(periodo?.inicio);
  const periodEnd = isoDayKey(periodo?.fim);
  if (periodStart && periodEnd && periodStart <= periodEnd) {
    return { start: periodStart, end: periodEnd };
  }

  const keys = collectPlanningDayKeys(apiDates, items);
  if (keys.size === 0) return null;
  const sorted = [...keys].sort();
  return { start: sorted[0], end: sorted.at(-1)! };
}

/** Monta o intervalo contínuo do calendário e inclui dias avulsos (alocações). */
export function resolvePlanningDates(
  apiDates: string[],
  items: PlanningItem[],
  periodo?: { inicio: string; fim: string } | null,
): string[] {
  const extra = collectPlanningDayKeys(apiDates, items);
  const range = resolvePlanningRange(apiDates, items, periodo);
  if (!range) return [...extra].sort();
  const merged = new Set(enumerateIsoDays(range.start, range.end));
  for (const day of extra) merged.add(day);
  return [...merged].sort();
}

export function monthKeysInRange(startIso: string, endIso: string): string[] {
  const start = parseIsoDay(startIso);
  const end = parseIsoDay(endIso);
  if (!start || !end || start > end) return [];
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    keys.push(`${cursor.getFullYear()}-${month}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

export function daysInMonth(monthKey: string): string[] {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];
  const last = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let day = 1; day <= last; day += 1) {
    out.push(`${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`);
  }
  return out;
}

export function origemRevisao(view: PlanningView): string {
  const revision = view.revision;
  if (revision?.baselineOrigin === "motor" && revision.version != null) {
    return `Revisão v${revision.version}${revision.reason ? ` · ${revision.reason}` : ""}`;
  }
  if (revision?.baselineOrigin === "legacy") return "Planejamento legado · sem snapshot dos cenários";
  return "Planejamento ainda não confirmado";
}
