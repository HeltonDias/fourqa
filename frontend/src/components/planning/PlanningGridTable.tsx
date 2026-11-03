import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { HierCellText } from "../HierCellText";
import type { PlanningItem } from "../../types";
import { PlanningExcelColumnFilter } from "./PlanningExcelColumnFilter";
import { distributionPreview } from "./distributionPreview";
import {
  CHECK_W,
  ACCOMPANHAMENTO_PERIOD_COL_W,
  atalhoDe,
  diaCheio,
  heatLevel,
  hojeIso,
  isPlanningOffDay,
  isPriority,
  monthSpans,
  num,
  offDayLabel,
  partesDia,
  stickyStyle,
  hierColClass,
  isIdentificacaoAnchorCol,
  uniqueIdColValues,
  type ColumnSort,
  type IdCol,
} from "./planningUtils";

const DAY_COL_MIN = 32;

const WINDOW_MIN_ROWS = 40;
const WINDOW_OVERSCAN = 8;
const ROW_HEIGHT_GUESS = 34;

let measureContext: CanvasRenderingContext2D | null | undefined;
const labelWidthCache = new Map<string, number>();

function calendarLabelWidth(label: string): number {
  const cached = labelWidthCache.get(label);
  if (cached != null) return cached;
  if (typeof document === "undefined") return 176;
  if (measureContext === undefined) measureContext = document.createElement("canvas").getContext("2d");
  if (!measureContext) return 176;
  measureContext.font = "700 12px \"Roboto\", \"Segoe UI\", system-ui, sans-serif";
  const width = Math.ceil(measureContext.measureText(label).width) + 28;
  labelWidthCache.set(label, width);
  return width;
}

type DayInfo = {
  isToday: boolean;
  off: boolean;
  label: string;
  title: string;
  dow: string;
  num: string;
  style: CSSProperties;
};

/** Renderiza só as linhas visíveis no contêiner com rolagem; abaixo do mínimo, todas. */
function useRowWindow(wrapRef: RefObject<HTMLDivElement | null>, count: number) {
  const enabled = count > WINDOW_MIN_ROWS;
  const [range, setRange] = useState({ start: 0, end: Math.min(count, WINDOW_MIN_ROWS) });
  const rowHeight = useRef(ROW_HEIGHT_GUESS);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!enabled || !wrap) {
      setRange({ start: 0, end: count });
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const sample = wrap.querySelector<HTMLTableRowElement>("tbody tr.plan-row");
      if (sample && sample.offsetHeight > 0) rowHeight.current = sample.offsetHeight;
      const head = wrap.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      const top = Math.max(0, wrap.scrollTop - head);
      const first = Math.max(0, Math.floor(top / rowHeight.current) - WINDOW_OVERSCAN);
      const visible = Math.ceil(wrap.clientHeight / rowHeight.current) + WINDOW_OVERSCAN * 2;
      const last = Math.min(count, first + visible);
      setRange((current) => (current.start === first && current.end === last ? current : { start: first, end: last }));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    wrap.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      wrap.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [wrapRef, count, enabled]);

  const start = enabled ? Math.min(range.start, count) : 0;
  const end = enabled ? Math.min(range.end, count) : count;
  return {
    start,
    end,
    padTop: start * rowHeight.current,
    padBottom: Math.max(0, count - end) * rowHeight.current,
  };
}

/** Mantém identidade estável para callbacks vindos do pai, sem perder a versão mais recente. */
function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}

function dayColumnWidths(dates: string[], months: { label: string; count: number }[]): Map<string, number> {
  const widths = new Map<string, number>();
  let cursor = 0;
  for (const month of months) {
    const each = Math.max(DAY_COL_MIN, Math.ceil(calendarLabelWidth(month.label) / Math.max(month.count, 1)));
    for (let index = 0; index < month.count; index += 1) {
      const date = dates[cursor + index];
      if (date) widths.set(date, each);
    }
    cursor += month.count;
  }
  return widths;
}

function qtdPlan(item: PlanningItem): number | null {
  if (item.baselineCount != null) return item.baselineCount;
  return item.sourceCount;
}

export function PlanningGridTable({
  idCols,
  dates,
  periodBounds,
  enabledWeekendDays,
  onEnableWeekendDay,
  pageRows,
  allRows,
  sourceItems,
  columnFilters,
  columnSort,
  onColumnFilterApply,
  onColumnFilterClear,
  onColumnSort,
  canEdit,
  selected,
  allPageSelected,
  onToggleAll,
  onToggleOne,
  onSave,
  onCellDirtyChange,
  onOpenBatchDate,
}: {
  idCols: IdCol[];
  dates: string[];
  periodBounds?: { min: string; max: string } | null;
  enabledWeekendDays: Set<string>;
  onEnableWeekendDay: (date: string) => void;
  pageRows: PlanningItem[];
  allRows: PlanningItem[];
  sourceItems: PlanningItem[];
  columnFilters: Record<string, Set<string>>;
  columnSort: ColumnSort | null;
  onColumnFilterApply: (colKey: string, selected: Set<string> | null) => void;
  onColumnFilterClear: (colKey: string) => void;
  onColumnSort: (colKey: string, direction: "asc" | "desc") => void;
  canEdit: boolean;
  selected: Set<string>;
  allPageSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (key: string) => void;
  onSave: (item: PlanningItem, field: "start" | "end" | "day" | "prioridade", date: string, quantity?: number) => void;
  onCellDirtyChange?: (cellKey: string, dirty: boolean) => void;
  onOpenBatchDate?: (field: "start" | "end") => void;
}) {
  const todayRef = useRef<HTMLTableCellElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tipKey, setTipKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const today = hojeIso();

  const handlers = useMemo<RowHandlers>(() => {
    function focusedDistributionCell(): string | null {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      return active.closest<HTMLElement>(".plan-day-anchor")?.dataset.cell ?? null;
    }
    return {
      onTipOpen: (cellKey) => {
        const focused = focusedDistributionCell();
        if (focused && focused !== cellKey) return;
        setTipKey(cellKey);
      },
      onTipClose: (cellKey) => {
        if (focusedDistributionCell() === cellKey) return;
        setTipKey((current) => (current === cellKey ? null : current));
      },
      onTipFocus: (cellKey) => setTipKey(cellKey),
      onTipBlur: (cellKey) => setTipKey((current) => (current === cellKey ? null : current)),
      onEditFocus: (cellKey) => setEditKey(cellKey),
      onEditBlur: (cellKey) => setEditKey((current) => (current === cellKey ? null : current)),
    };
  }, []);

  const save = useStableCallback(onSave);
  const toggleOne = useStableCallback(onToggleOne);
  const enableWeekendDay = useStableCallback(onEnableWeekendDay);
  const batchDate = useStableCallback((field: "start" | "end") => onOpenBatchDate?.(field));
  const dirtyChange = useStableCallback((cellKey: string, dirty: boolean) => onCellDirtyChange?.(cellKey, dirty));

  const stickyWidth = CHECK_W + idCols.reduce((sum, col) => sum + col.width, 0);
  const periodStartLeft = stickyWidth;
  const periodEndLeft = stickyWidth + ACCOMPANHAMENTO_PERIOD_COL_W;
  const stickyWithPeriod = stickyWidth + ACCOMPANHAMENTO_PERIOD_COL_W * 2;
  const checkStyle = useMemo(() => stickyStyle({ left: 0, width: CHECK_W }), []);
  const months = useMemo(() => monthSpans(dates), [dates]);
  const dayInfo = useMemo(() => {
    const widths = dayColumnWidths(dates, months);
    const map = new Map<string, DayInfo>();
    for (const date of dates) {
      const width = widths.get(date) ?? DAY_COL_MIN;
      const off = isPlanningOffDay(date);
      const label = off ? offDayLabel(date) : "";
      const parts = partesDia(date);
      map.set(date, {
        isToday: date === today,
        off,
        label,
        title: off && label !== "fim de semana" ? `${diaCheio(date)} · ${label}` : diaCheio(date),
        dow: parts.dow,
        num: parts.num,
        style: { width, minWidth: width, maxWidth: width },
      });
    }
    return map;
  }, [dates, months, today]);
  const dayStyle = (date: string): CSSProperties => dayInfo.get(date)?.style ?? FALLBACK_DAY_STYLE;

  const periodStyles = useMemo(() => {
    const make = (left: number): CSSProperties => ({
      left,
      width: ACCOMPANHAMENTO_PERIOD_COL_W,
      minWidth: ACCOMPANHAMENTO_PERIOD_COL_W,
      maxWidth: ACCOMPANHAMENTO_PERIOD_COL_W,
    });
    return { start: make(periodStartLeft), end: make(periodEndLeft) };
  }, [periodStartLeft, periodEndLeft]);

  const filterValues = useMemo(
    () => new Map(idCols.map((col) => [col.key, uniqueIdColValues(sourceItems, col)])),
    [idCols, sourceItems],
  );
  const totals = useMemo(() => {
    const byDay = new Map<string, number>();
    let qtd = 0;
    let distributed = 0;
    for (const item of allRows) {
      qtd += qtdPlan(item) ?? 0;
      distributed += item.distributedCount;
      for (const date of dates) {
        const value = item.allocations[date];
        if (value) byDay.set(date, (byDay.get(date) ?? 0) + value);
      }
    }
    return { byDay, qtd, distributed };
  }, [allRows, dates]);
  const spotRowId = editKey?.slice(0, editKey.lastIndexOf(":day:")) ?? null;
  const rowWindow = useRowWindow(wrapRef, pageRows.length);
  const columnCount = 1 + idCols.length + 5 + Math.max(dates.length, 1);

  return (
    <div className="plan-table-wrap" ref={wrapRef}>
      <table className={`plan-table plan-table--planejar${spotRowId ? " plan-row-spot" : ""}`}>
        <thead>
          <tr className="plan-groups">
            <th
              className="plan-g-id plan-sticky plan-suite"
              colSpan={1 + idCols.length}
              style={{ left: 0 }}
            >
              Identificação
            </th>
            <th className="plan-g-period plan-sticky" colSpan={2} style={{ left: periodStartLeft }}>
              Período
            </th>
            <th className="plan-g-plan" colSpan={3}>
              <span className="plan-g-pin" style={{ left: stickyWithPeriod + 8 }}>Planejamento</span>
            </th>
            {months.length === 0 && (
              <th className="plan-g-days">
                <span className="plan-g-pin" style={{ left: stickyWithPeriod + 8 }}>Calendário</span>
              </th>
            )}
            {months.map((month) => (
              <th key={month.key} className="plan-g-days" colSpan={month.count}>
                <span className="plan-g-pin" style={{ left: stickyWithPeriod + 8 }}>{month.label}</span>
              </th>
            ))}
          </tr>
          <tr className="plan-cols">
            <th className="plan-sticky plan-checkcol" style={checkStyle}>
              <input type="checkbox" checked={allPageSelected} onChange={onToggleAll} aria-label="Selecionar registros da página" />
            </th>
            {idCols.map((col) => {
              const values = filterValues.get(col.key) ?? [];
              const filterSet = columnFilters[col.key];
              const hasFilter = filterSet != null;
              const sortDirection = columnSort?.key === col.key ? columnSort.direction : null;
              return (
                <th
                  key={col.key}
                  className={`plan-sticky plan-c-id plan-c-id--filter ${hierColClass(col)}${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}${hasFilter ? " plan-c-id--filtered" : ""}`}
                  style={stickyStyle(col)}
                  title={col.label}
                >
                  <span className="plan-col-head">
                    <HierCellText value={col.short} className="plan-ellipsis" />
                    <PlanningExcelColumnFilter
                      columnLabel={col.label}
                      values={values}
                      selected={hasFilter ? filterSet : null}
                      sortDirection={sortDirection}
                      onApply={(next) => onColumnFilterApply(col.key, next)}
                      onSort={(direction) => onColumnSort(col.key, direction)}
                      onClear={() => onColumnFilterClear(col.key)}
                    />
                  </span>
                </th>
              );
            })}
            <th className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodStyles.start} title="Data início">
              Início
            </th>
            <th className="plan-c-period plan-sticky plan-g-period-end" style={periodStyles.end} title="Data fim">
              Fim
            </th>
            <th className="plan-c-plan plan-split" title="Prioridade própria da suíte">Prioridade</th>
            <th className="plan-c-plan" title="Quantidade de cenários do processo/função">Qtd plan</th>
            <th className="plan-c-plan" title="Soma da distribuição diária">Distrib.</th>
            {dates.length === 0 && <th className="plan-c-dayhead plan-split" />}
            {dates.map((date, index) => {
              const info = dayInfo.get(date);
              const isToday = info?.isToday ?? false;
              const off = info?.off ?? false;
              const offOn = off && enabledWeekendDays.has(date);
              const tone = isToday ? "plan-today" : offOn ? "plan-weekend-on" : off ? "plan-weekend" : "";
              return (
                <th
                  key={date}
                  ref={isToday ? todayRef : undefined}
                  className={`plan-c-dayhead${index === 0 ? " plan-split" : ""} ${tone}`}
                  style={dayStyle(date)}
                  title={info?.title}
                >
                  <span className="plan-dow">{info?.dow}</span>
                  <span className="plan-dnum">{info?.num}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rowWindow.padTop > 0 ? (
            <tr className="plan-spacer" aria-hidden>
              <td colSpan={columnCount} style={{ height: rowWindow.padTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {pageRows.slice(rowWindow.start, rowWindow.end).map((item) => {
            const key = `${item.suiteId ?? "s"}-${item.testPointId ?? "p"}-${item.suiteName}`;
            const rowId = String(item.suiteId ?? item.testPointId ?? item.suiteName);
            return (
              <PlanningRow
                key={key}
                item={item}
                rowKey={key}
                rowId={rowId}
                idCols={idCols}
                dates={dates}
                dayInfo={dayInfo}
                enabledWeekendDays={enabledWeekendDays}
                checkStyle={checkStyle}
                periodStyles={periodStyles}
                periodBounds={periodBounds}
                canEdit={canEdit}
                batchEdit={Boolean(onOpenBatchDate)}
                selected={selected.has(key)}
                focused={spotRowId === rowId}
                tipKey={tipKey?.startsWith(`${rowId}:`) ? tipKey : null}
                handlers={handlers}
                onToggle={toggleOne}
                onSave={save}
                onBatchDate={batchDate}
                onEnableWeekendDay={enableWeekendDay}
                onDirtyChange={dirtyChange}
              />
            );
          })}
          {rowWindow.padBottom > 0 ? (
            <tr className="plan-spacer" aria-hidden>
              <td colSpan={columnCount} style={{ height: rowWindow.padBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr>
            <td className="plan-sticky plan-c-id" colSpan={1 + idCols.length + 2} style={{ left: 0 }}>
              Totais
            </td>
            <td className="plan-c-plan plan-split" />
            <td className="plan-num plan-c-plan">{totals.qtd}</td>
            <td className="plan-num plan-c-plan">{totals.distributed}</td>
            {dates.length === 0 && <td className="plan-c-day plan-split" />}
            {dates.map((date, index) => {
              const total = totals.byDay.get(date) ?? 0;
              const level = heatLevel(total);
              const isToday = dayInfo.get(date)?.isToday ?? false;
              const off = dayInfo.get(date)?.off ?? false;
              const weekendLocked = off && !enabledWeekendDays.has(date);
              return (
                <td
                  key={date}
                  className={`plan-num plan-c-day plan-heat-${level}${index === 0 ? " plan-split" : ""}${isToday ? " plan-today" : ""}${off ? " plan-weekend-col" : ""}${weekendLocked ? " plan-weekend-off" : ""}${off && !weekendLocked ? " plan-weekend-on" : ""}`}
                  style={dayStyle(date)}
                >
                  {total || "0"}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const FALLBACK_DAY_STYLE: CSSProperties = { width: DAY_COL_MIN, minWidth: DAY_COL_MIN, maxWidth: DAY_COL_MIN };

type RowHandlers = {
  onTipOpen: (cellKey: string) => void;
  onTipClose: (cellKey: string) => void;
  onTipFocus: (cellKey: string) => void;
  onTipBlur: (cellKey: string) => void;
  onEditFocus: (cellKey: string) => void;
  onEditBlur: (cellKey: string) => void;
};

type SaveField = "start" | "end" | "day" | "prioridade";

/** Uma linha da grade. Memoizada: só re-renderiza quando o item ou o estado da própria linha muda. */
const PlanningRow = memo(function PlanningRow({
  item,
  rowKey,
  rowId,
  idCols,
  dates,
  dayInfo,
  enabledWeekendDays,
  checkStyle,
  periodStyles,
  periodBounds,
  canEdit,
  batchEdit,
  selected,
  focused,
  tipKey,
  handlers,
  onToggle,
  onSave,
  onBatchDate,
  onEnableWeekendDay,
  onDirtyChange,
}: {
  item: PlanningItem;
  rowKey: string;
  rowId: string;
  idCols: IdCol[];
  dates: string[];
  dayInfo: Map<string, DayInfo>;
  enabledWeekendDays: Set<string>;
  checkStyle: CSSProperties;
  periodStyles: { start: CSSProperties; end: CSSProperties };
  periodBounds?: { min: string; max: string } | null;
  canEdit: boolean;
  batchEdit: boolean;
  selected: boolean;
  focused: boolean;
  tipKey: string | null;
  handlers: RowHandlers;
  onToggle: (key: string) => void;
  onSave: (item: PlanningItem, field: SaveField, date: string, quantity?: number) => void;
  onBatchDate: (field: "start" | "end") => void;
  onEnableWeekendDay: (date: string) => void;
  onDirtyChange: (cellKey: string, dirty: boolean) => void;
}) {
  const rowClass = ["plan-row", selected ? "plan-selected" : "", focused ? "plan-row-focus" : ""].filter(Boolean).join(" ");
  const qtd = qtdPlan(item);
  return (
    <tr className={rowClass}>
      <td className="plan-sticky plan-checkcol" style={checkStyle}>
        <input type="checkbox" checked={selected} onChange={() => onToggle(rowKey)} aria-label={`Selecionar ${item.suiteName}`} />
      </td>
      {idCols.map((col) => {
        const text = idText(item, col);
        const pill = isPriority(col) && text !== "—";
        return (
          <td
            key={col.key}
            className={`plan-sticky plan-c-id ${hierColClass(col)}${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
            style={stickyStyle(col)}
          >
            {pill ? (
              <span className={/^\d+$/.test(text) ? "plan-pill plan-pill-hot" : "plan-pill plan-pill-cool"}>{text}</span>
            ) : (
              <HierCellText value={text === "—" ? "" : text} className="plan-ellipsis" />
            )}
          </td>
        );
      })}
      <td className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodStyles.start}>
        <DateCell
          cellKey={`${rowId}:start`}
          value={item.plannedStart}
          min={periodBounds?.min}
          max={periodBounds?.max}
          editable={canEdit}
          batchEdit={batchEdit}
          onBatchEdit={() => onBatchDate("start")}
          onDirtyChange={onDirtyChange}
          onCommit={(date) => onSave(item, "start", date)}
        />
      </td>
      <td className="plan-c-period plan-sticky plan-g-period-end" style={periodStyles.end}>
        <DateCell
          cellKey={`${rowId}:end`}
          value={item.plannedEnd}
          min={periodBounds?.min}
          max={periodBounds?.max}
          editable={canEdit}
          batchEdit={batchEdit}
          onBatchEdit={() => onBatchDate("end")}
          onDirtyChange={onDirtyChange}
          onCommit={(date) => onSave(item, "end", date)}
        />
      </td>
      <td className="plan-c-plan plan-split">
        {item.suiteId == null ? (
          "—"
        ) : (
          <TextCell
            cellKey={`${rowId}:prioridade`}
            value={item.prioridade ?? ""}
            editable={canEdit}
            label={`Prioridade de ${item.suiteName}`}
            onDirtyChange={onDirtyChange}
            onCommit={(value) => onSave(item, "prioridade", value)}
          />
        )}
      </td>
      <td className={`plan-num plan-c-plan${qtd === 0 ? " plan-zero" : ""}`}>{num(qtd)}</td>
      <td className={`plan-num plan-c-plan${item.distributedCount === 0 ? " plan-zero" : ""}`}>{num(item.distributedCount)}</td>
      {dates.length === 0 && <td className="plan-c-day plan-split" />}
      {dates.map((date, index) => {
        const quantity = item.allocations[date] ?? 0;
        const info = dayInfo.get(date);
        const isToday = info?.isToday ?? false;
        const off = info?.off ?? false;
        const weekendLocked = off && !enabledWeekendDays.has(date);
        const cellKey = `${rowId}:day:${date}`;
        return (
          <td
            key={date}
            className={`plan-c-day plan-heat-${heatLevel(quantity)}${index === 0 ? " plan-split" : ""}${isToday ? " plan-today" : ""}${off ? " plan-weekend-col" : ""}${weekendLocked ? " plan-weekend-off" : ""}${off && !weekendLocked ? " plan-weekend-on" : ""}`}
            style={info?.style ?? FALLBACK_DAY_STYLE}
          >
            <DayCell
              cellKey={cellKey}
              date={date}
              value={quantity}
              distributedCount={item.distributedCount}
              editable={canEdit}
              weekendLocked={weekendLocked}
              tipOpen={tipKey === cellKey}
              onEnableWeekend={() => onEnableWeekendDay(date)}
              onDirtyChange={onDirtyChange}
              onCommit={(next) => onSave(item, "day", date, next)}
              onTipOpen={handlers.onTipOpen}
              onTipClose={handlers.onTipClose}
              onTipFocus={handlers.onTipFocus}
              onTipBlur={handlers.onTipBlur}
              onEditFocus={handlers.onEditFocus}
              onEditBlur={handlers.onEditBlur}
            />
          </td>
        );
      })}
    </tr>
  );
});

function idText(item: PlanningItem, col: IdCol): string {
  if (col.kind === "planKey") return col.planKeyValue?.trim() || "—";
  if (col.kind === "atalho") return atalhoDe(item.suiteName) || "—";
  if (col.kind === "suite") return item.suiteName;
  return item.dimensions[col.dimKey ?? ""] || "—";
}

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

/** Linhas fora da janela virtual desmontam; uma edição pendente não pode se perder. */
function useCommitOnUnmount(pending: boolean, draft: string, onCommit: (value: string) => void, onDone: () => void) {
  const ref = useRef({ pending, draft, onCommit, onDone });
  ref.current = { pending, draft, onCommit, onDone };
  useEffect(
    () => () => {
      const current = ref.current;
      if (!current.pending) return;
      current.onCommit(current.draft);
      current.onDone();
    },
    [],
  );
}

function TextCell({
  cellKey,
  value,
  editable,
  label,
  onCommit,
  onDirtyChange,
}: {
  cellKey: string;
  value: string;
  editable: boolean;
  label: string;
  onCommit: (value: string) => void;
  onDirtyChange?: (cellKey: string, dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = draft !== value;
  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(() => {
    onDirtyChange?.(cellKey, dirty);
  }, [cellKey, dirty, onDirtyChange]);
  useCommitOnUnmount(editable && dirty, draft, onCommit, () => onDirtyChange?.(cellKey, false));
  if (!editable) return <span>{value || "—"}</span>;
  return (
    <input
      className="plan-edit"
      type="text"
      maxLength={80}
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

function DateCell({
  cellKey,
  value,
  min,
  max,
  editable,
  batchEdit,
  onBatchEdit,
  onCommit,
  onDirtyChange,
}: {
  cellKey: string;
  value: string | null;
  min?: string;
  max?: string;
  editable: boolean;
  batchEdit?: boolean;
  onBatchEdit?: () => void;
  onCommit: (date: string) => void;
  onDirtyChange?: (cellKey: string, dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => toDateInputValue(value));
  const [editing, setEditing] = useState(false);
  const saved = toDateInputValue(value);
  const dirty = draft !== saved;

  useEffect(() => {
    setDraft(toDateInputValue(value));
  }, [value]);

  useEffect(() => {
    onDirtyChange?.(cellKey, batchEdit || !editing ? false : dirty);
  }, [batchEdit, cellKey, dirty, editing, onDirtyChange]);
  useCommitOnUnmount(editable && editing && !batchEdit && !!draft && dirty, draft, onCommit, () =>
    onDirtyChange?.(cellKey, false),
  );

  if (!editable) return <span>{value ? diaCheio(value) : "—"}</span>;
  if (batchEdit) {
    return (
      <button type="button" className="plan-date-batch" onClick={onBatchEdit}>
        {value ? diaCheio(value) : "—"}
      </button>
    );
  }
  if (!editing) {
    return (
      <button
        type="button"
        className="plan-date-read"
        aria-label={value ? diaCheio(value) : "Data"}
        onClick={() => setEditing(true)}
      >
        {value ? diaCheio(value) : "—"}
      </button>
    );
  }
  return (
    <input
      className="plan-edit"
      type="date"
      value={draft}
      min={min}
      max={max}
      autoFocus
      aria-label={value ? diaCheio(value) : "Data"}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft && draft !== saved) onCommit(draft);
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function draftQuantity(draft: string): number {
  return draft === "" ? 0 : Number(draft);
}

function distributionTipId(cellKey: string): string {
  return `plan-dist-${cellKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function DistributionTip({
  anchorRef,
  text,
  id,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  text: string;
  id: string;
}) {
  const [place, setPlace] = useState<{ top: number; left: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    function placeTip() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const head = anchor.closest("table")?.querySelector("thead")?.getBoundingClientRect().bottom ?? 0;
      const below = rect.top < 32 || rect.top - 28 < head;
      setPlace({
        top: below ? rect.bottom + 6 : rect.top - 6,
        left: Math.min(window.innerWidth - 8, Math.max(8, rect.left + rect.width / 2)),
        below,
      });
    }
    placeTip();
    window.addEventListener("scroll", placeTip, true);
    window.addEventListener("resize", placeTip);
    return () => {
      window.removeEventListener("scroll", placeTip, true);
      window.removeEventListener("resize", placeTip);
    };
  }, [anchorRef, text]);

  if (!place) return null;
  return createPortal(
    <div
      id={id}
      role="tooltip"
      className={`plan-dist-tip${place.below ? " plan-dist-tip-below" : " plan-dist-tip-above"}`}
      style={{
        top: place.top,
        left: place.left,
        transform: place.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
    >
      {text}
    </div>,
    document.body,
  );
}

function DayCell({
  cellKey,
  date,
  value,
  distributedCount,
  editable,
  weekendLocked,
  tipOpen,
  onEnableWeekend,
  onCommit,
  onDirtyChange,
  onTipOpen,
  onTipClose,
  onTipFocus,
  onTipBlur,
  onEditFocus,
  onEditBlur,
}: {
  cellKey: string;
  date: string;
  value: number;
  distributedCount: number;
  editable: boolean;
  weekendLocked: boolean;
  tipOpen: boolean;
  onEnableWeekend: () => void;
  onCommit: (quantity: number) => void;
  onDirtyChange?: (cellKey: string, dirty: boolean) => void;
  onTipOpen: (cellKey: string) => void;
  onTipClose: (cellKey: string) => void;
  onTipFocus: (cellKey: string) => void;
  onTipBlur: (cellKey: string) => void;
  onEditFocus: (cellKey: string) => void;
  onEditBlur: (cellKey: string) => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [draft, setDraft] = useState(String(value));
  const dirty = !weekendLocked && draftQuantity(draft) !== value;
  const preview = distributionPreview(
    distributedCount,
    value,
    weekendLocked || !editable ? String(value) : draft,
  );
  const tipId = distributionTipId(cellKey);
  const describedBy = tipOpen ? tipId : undefined;

  const pendingRef = useRef<{ focused: boolean; draft: string; value: number; onCommit: (quantity: number) => void }>({
    focused: false,
    draft,
    value,
    onCommit,
  });
  pendingRef.current.draft = draft;
  pendingRef.current.value = value;
  pendingRef.current.onCommit = onCommit;

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    onDirtyChange?.(cellKey, dirty);
  }, [cellKey, dirty, onDirtyChange]);

  useEffect(
    () => () => {
      const pending = pendingRef.current;
      if (!pending.focused) return;
      const quantity = draftQuantity(pending.draft);
      if (quantity !== pending.value) pending.onCommit(quantity);
      onDirtyChange?.(cellKey, false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const tip = tipOpen ? <DistributionTip anchorRef={anchorRef} text={preview.text} id={tipId} /> : null;

  if (weekendLocked) {
    const label = `${diaCheio(date)} (${offDayLabel(date)} desativado)`;
    if (!editable) {
      return (
        <span
          ref={anchorRef}
          className="plan-day-anchor"
          data-cell={cellKey}
          onMouseEnter={() => onTipOpen(cellKey)}
          onMouseLeave={() => onTipClose(cellKey)}
        >
          <span className="plan-day-off-label" aria-label={label} aria-describedby={describedBy}>—</span>
          {tip}
        </span>
      );
    }
    return (
      <span
        ref={anchorRef}
        className="plan-day-anchor"
        data-cell={cellKey}
        onMouseEnter={() => onTipOpen(cellKey)}
        onMouseLeave={() => onTipClose(cellKey)}
      >
        <button
          type="button"
          className="plan-day-off"
          aria-label={label}
          aria-describedby={describedBy}
          onFocus={() => onTipFocus(cellKey)}
          onBlur={() => onTipBlur(cellKey)}
          onClick={() => {
            const ok = window.confirm(`Ativar ${diaCheio(date)} (${offDayLabel(date)}) para distribuir cenários neste dia?`);
            if (ok) onEnableWeekend();
          }}
        >
          —
        </button>
        {tip}
      </span>
    );
  }

  if (!editable) {
    return (
      <span
        ref={anchorRef}
        className="plan-day-anchor"
        data-cell={cellKey}
        onMouseEnter={() => onTipOpen(cellKey)}
        onMouseLeave={() => onTipClose(cellKey)}
      >
        <span aria-describedby={describedBy}>{String(value)}</span>
        {tip}
      </span>
    );
  }
  return (
    <span
      ref={anchorRef}
      className="plan-day-anchor"
      data-cell={cellKey}
      onMouseEnter={() => onTipOpen(cellKey)}
      onMouseLeave={() => onTipClose(cellKey)}
    >
      <input
        className="plan-edit plan-day"
        inputMode="numeric"
        aria-label={`Quantidade em ${diaCheio(date)}`}
        aria-describedby={describedBy}
        value={draft}
        onFocus={() => {
          pendingRef.current.focused = true;
          if (value === 0) setDraft("");
          onTipFocus(cellKey);
          onEditFocus(cellKey);
        }}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => {
          pendingRef.current.focused = false;
          const quantity = draftQuantity(draft);
          if (quantity !== value) onCommit(quantity);
          setDraft(String(quantity));
          onTipBlur(cellKey);
          onEditBlur(cellKey);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {tip}
    </span>
  );
}
