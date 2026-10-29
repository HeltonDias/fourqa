import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
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
  soma,
  stickyStyle,
  hierColClass,
  isIdentificacaoAnchorCol,
  uniqueIdColValues,
  type ColumnSort,
  type IdCol,
} from "./planningUtils";

const DAY_COL_MIN = 32;

function calendarLabelWidth(label: string): number {
  if (typeof document === "undefined") return 176;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 176;
  context.font = "700 12px \"IBM Plex Sans\", \"Segoe UI\", system-ui, sans-serif";
  return Math.ceil(context.measureText(label).width) + 28;
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
  const [tipKey, setTipKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const today = hojeIso();

  function focusedDistributionCell(): string | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    return active.closest<HTMLElement>(".plan-day-anchor")?.dataset.cell ?? null;
  }

  function openDistributionTip(cellKey: string) {
    const focused = focusedDistributionCell();
    if (focused && focused !== cellKey) return;
    setTipKey(cellKey);
  }

  function closeDistributionTip(cellKey: string) {
    if (focusedDistributionCell() === cellKey) return;
    setTipKey((current) => (current === cellKey ? null : current));
  }

  function focusDistributionTip(cellKey: string) {
    setTipKey(cellKey);
  }

  function blurDistributionTip(cellKey: string) {
    setTipKey((current) => (current === cellKey ? null : current));
  }

  function startDistributionEdit(cellKey: string) {
    setEditKey(cellKey);
  }

  function endDistributionEdit(cellKey: string) {
    setEditKey((current) => (current === cellKey ? null : current));
  }
  const stickyWidth = CHECK_W + idCols.reduce((sum, col) => sum + col.width, 0);
  const periodStartLeft = stickyWidth;
  const periodEndLeft = stickyWidth + ACCOMPANHAMENTO_PERIOD_COL_W;
  const stickyWithPeriod = stickyWidth + ACCOMPANHAMENTO_PERIOD_COL_W * 2;
  const checkStyle = stickyStyle({ left: 0, width: CHECK_W });
  const months = monthSpans(dates);
  const dayWidth = dayColumnWidths(dates, months);
  const dayStyle = (date: string): CSSProperties => {
    const width = dayWidth.get(date) ?? DAY_COL_MIN;
    return { width, minWidth: width, maxWidth: width };
  };

  const periodSticky = (left: number): CSSProperties => ({
    left,
    width: ACCOMPANHAMENTO_PERIOD_COL_W,
    minWidth: ACCOMPANHAMENTO_PERIOD_COL_W,
    maxWidth: ACCOMPANHAMENTO_PERIOD_COL_W,
  });

  const dayTotals = dates.map((date) => soma(allRows, (item) => item.allocations[date] ?? 0));
  const spotRowId = editKey?.slice(0, editKey.lastIndexOf(":day:")) ?? null;

  return (
    <div className="plan-table-wrap">
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
              const values = uniqueIdColValues(sourceItems, col);
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
            <th className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)} title="Data início">
              Início
            </th>
            <th className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} title="Data fim">
              Fim
            </th>
            <th className="plan-c-plan plan-split" title="Prioridade própria da suíte">Prioridade</th>
            <th className="plan-c-plan" title="Quantidade de cenários do processo/função">Qtd plan</th>
            <th className="plan-c-plan" title="Soma da distribuição diária">Distrib.</th>
            {dates.length === 0 && <th className="plan-c-dayhead plan-split" />}
            {dates.map((date, index) => {
              const parts = partesDia(date);
              const isToday = date === today;
              const off = isPlanningOffDay(date);
              const offOn = off && enabledWeekendDays.has(date);
              const tone = isToday ? "plan-today" : offOn ? "plan-weekend-on" : off ? "plan-weekend" : "";
              const holiday = offDayLabel(date);
              return (
                <th
                  key={date}
                  ref={isToday ? todayRef : undefined}
                  className={`plan-c-dayhead${index === 0 ? " plan-split" : ""} ${tone}`}
                  style={dayStyle(date)}
                  title={off && holiday !== "fim de semana" ? `${diaCheio(date)} · ${holiday}` : diaCheio(date)}
                >
                  <span className="plan-dow">{parts.dow}</span>
                  <span className="plan-dnum">{parts.num}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((item) => {
            const key = `${item.suiteId ?? "s"}-${item.testPointId ?? "p"}-${item.suiteName}`;
            const rowId = String(item.suiteId ?? item.testPointId ?? item.suiteName);
            const rowClass = [
              selected.has(key) ? "plan-selected" : "",
              spotRowId === rowId ? "plan-row-focus" : "",
            ].filter(Boolean).join(" ");
            return (
              <tr key={key} className={rowClass || undefined}>
                <td className="plan-sticky plan-checkcol" style={checkStyle}>
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => onToggleOne(key)}
                    aria-label={`Selecionar ${item.suiteName}`}
                  />
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
                <td className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)}>
                  <DateCell
                    cellKey={`${rowId}:start`}
                    value={item.plannedStart}
                    min={periodBounds?.min}
                    max={periodBounds?.max}
                    editable={canEdit}
                    batchEdit={Boolean(onOpenBatchDate)}
                    onBatchEdit={() => onOpenBatchDate?.("start")}
                    onDirtyChange={onCellDirtyChange}
                    onCommit={(date) => onSave(item, "start", date)}
                  />
                </td>
                <td className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)}>
                  <DateCell
                    cellKey={`${rowId}:end`}
                    value={item.plannedEnd}
                    min={periodBounds?.min}
                    max={periodBounds?.max}
                    editable={canEdit}
                    batchEdit={Boolean(onOpenBatchDate)}
                    onBatchEdit={() => onOpenBatchDate?.("end")}
                    onDirtyChange={onCellDirtyChange}
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
                      onDirtyChange={onCellDirtyChange}
                      onCommit={(value) => onSave(item, "prioridade", value)}
                    />
                  )}
                </td>
                <td className={`plan-num plan-c-plan${qtdPlan(item) === 0 ? " plan-zero" : ""}`}>{num(qtdPlan(item))}</td>
                <td className={`plan-num plan-c-plan${item.distributedCount === 0 ? " plan-zero" : ""}`}>{num(item.distributedCount)}</td>
                {dates.length === 0 && <td className="plan-c-day plan-split" />}
                {dates.map((date, index) => {
                  const quantity = item.allocations[date] ?? 0;
                  const isToday = date === today;
                  const level = heatLevel(quantity);
                  const off = isPlanningOffDay(date);
                  const weekendLocked = off && !enabledWeekendDays.has(date);
                  return (
                    <td
                      key={date}
                      className={`plan-c-day plan-heat-${level}${index === 0 ? " plan-split" : ""}${isToday ? " plan-today" : ""}${off ? " plan-weekend-col" : ""}${weekendLocked ? " plan-weekend-off" : ""}${off && !weekendLocked ? " plan-weekend-on" : ""}`}
                      style={dayStyle(date)}
                    >
                      <DayCell
                        cellKey={`${rowId}:day:${date}`}
                        date={date}
                        value={quantity}
                        distributedCount={item.distributedCount}
                        editable={canEdit}
                        weekendLocked={weekendLocked}
                        tipOpen={tipKey === `${rowId}:day:${date}`}
                        onEnableWeekend={() => onEnableWeekendDay(date)}
                        onDirtyChange={onCellDirtyChange}
                        onCommit={(next) => onSave(item, "day", date, next)}
                        onTipOpen={openDistributionTip}
                        onTipClose={closeDistributionTip}
                        onTipFocus={focusDistributionTip}
                        onTipBlur={blurDistributionTip}
                        onEditFocus={startDistributionEdit}
                        onEditBlur={endDistributionEdit}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="plan-sticky plan-c-id" colSpan={1 + idCols.length + 2} style={{ left: 0 }}>
              Totais
            </td>
            <td className="plan-c-plan plan-split" />
            <td className="plan-num plan-c-plan">{soma(allRows, (item) => qtdPlan(item) ?? 0)}</td>
            <td className="plan-num plan-c-plan">{soma(allRows, (item) => item.distributedCount)}</td>
            {dates.length === 0 && <td className="plan-c-day plan-split" />}
            {dates.map((date, index) => {
              const total = dayTotals[index] ?? 0;
              const level = heatLevel(total);
              const isToday = date === today;
              const off = isPlanningOffDay(date);
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

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    onDirtyChange?.(cellKey, dirty);
  }, [cellKey, dirty, onDirtyChange]);

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
          if (value === 0) setDraft("");
          onTipFocus(cellKey);
          onEditFocus(cellKey);
        }}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => {
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
