import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HierCellText } from "../HierCellText";
import type { PlanningItem } from "../../types";
import { PlanningExcelColumnFilter } from "./PlanningExcelColumnFilter";
import {
  CHECK_W,
  PERIOD_COL_W,
  atalhoDe,
  diaCheio,
  heatLevel,
  hojeIso,
  isPriority,
  monthSpans,
  num,
  partesDia,
  soma,
  stickyStyle,
  hierColClass,
  isIdentificacaoAnchorCol,
  uniqueIdColValues,
  type ColumnSort,
  type IdCol,
} from "./planningUtils";

export function PlanningGridTable({
  idCols,
  dates,
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
}: {
  idCols: IdCol[];
  dates: string[];
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
}) {
  const todayRef = useRef<HTMLTableCellElement | null>(null);
  const today = hojeIso();
  const stickyWidth = CHECK_W + idCols.reduce((sum, col) => sum + col.width, 0);
  const periodStartLeft = stickyWidth;
  const periodEndLeft = stickyWidth + PERIOD_COL_W;
  const stickyWithPeriod = stickyWidth + PERIOD_COL_W * 2;
  const checkStyle = stickyStyle({ left: 0, width: CHECK_W });
  const months = monthSpans(dates);

  const periodSticky = (left: number): CSSProperties => ({
    left,
    width: PERIOD_COL_W,
    minWidth: PERIOD_COL_W,
    maxWidth: PERIOD_COL_W,
  });

  const dayTotals = dates.map((date) => soma(allRows, (item) => item.allocations[date] ?? 0));

  return (
    <div className="plan-table-wrap">
      <table className="plan-table plan-table--planejar">
        <thead>
          <tr className="plan-groups">
            <th className="plan-g-id plan-sticky" style={checkStyle} />
            {idCols.map((col) => (
              <th
                key={col.key}
                className={`plan-g-id plan-sticky${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
                style={stickyStyle(col)}
              >
                {isIdentificacaoAnchorCol(col, idCols) && (
                  <span className="plan-g-cover" style={{ left: -col.left, width: stickyWithPeriod }}>
                    Identificação
                  </span>
                )}
              </th>
            ))}
            <th className="plan-g-period plan-sticky plan-g-period-start" style={periodSticky(periodStartLeft)} colSpan={1}>
              <span className="plan-g-pin plan-g-pin-sticky" style={{ left: periodStartLeft + 8 }}>Período</span>
            </th>
            <th className="plan-g-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} />
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
            <th className="plan-c-plan" title="Quantidade do baseline confirmado">Qtd plan</th>
            <th className="plan-c-plan" title="Soma da distribuição diária">Distrib.</th>
            {dates.length === 0 && <th className="plan-c-dayhead plan-split" />}
            {dates.map((date, index) => {
              const parts = partesDia(date);
              const isToday = date === today;
              const tone = isToday ? "plan-today" : parts.weekend ? "plan-weekend" : "";
              return (
                <th
                  key={date}
                  ref={isToday ? todayRef : undefined}
                  className={`plan-c-dayhead${index === 0 ? " plan-split" : ""} ${tone}`}
                  title={diaCheio(date)}
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
            return (
              <tr key={key} className={selected.has(key) ? "plan-selected" : undefined}>
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
                    editable={canEdit}
                    onDirtyChange={onCellDirtyChange}
                    onCommit={(date) => onSave(item, "start", date)}
                  />
                </td>
                <td className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)}>
                  <DateCell
                    cellKey={`${rowId}:end`}
                    value={item.plannedEnd}
                    editable={canEdit}
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
                <td className={`plan-num plan-c-plan${item.baselineCount === 0 ? " plan-zero" : ""}`}>{num(item.baselineCount)}</td>
                <td className={`plan-num plan-c-plan${item.distributedCount === 0 ? " plan-zero" : ""}`}>{num(item.distributedCount)}</td>
                {dates.length === 0 && <td className="plan-c-day plan-split" />}
                {dates.map((date, index) => {
                  const quantity = item.allocations[date] ?? 0;
                  const isToday = date === today;
                  const level = heatLevel(quantity);
                  return (
                    <td
                      key={date}
                      className={`plan-c-day plan-heat-${level}${index === 0 ? " plan-split" : ""}${isToday ? " plan-today" : ""}${partesDia(date).weekend ? " plan-weekend-col" : ""}`}
                    >
                      <DayCell
                        cellKey={`${rowId}:day:${date}`}
                        value={quantity}
                        editable={canEdit}
                        onDirtyChange={onCellDirtyChange}
                        onCommit={(next) => onSave(item, "day", date, next)}
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
            <td className="plan-sticky plan-checkcol" style={checkStyle} />
            {idCols.map((col) => (
              <td
                key={col.key}
                className={`plan-sticky plan-c-id${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
                style={stickyStyle(col)}
              >
                {isIdentificacaoAnchorCol(col, idCols) ? "Totais" : ""}
              </td>
            ))}
            <td className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)} />
            <td className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} />
            <td className="plan-c-plan plan-split" />
            <td className="plan-num plan-c-plan">{soma(allRows, (item) => item.baselineCount)}</td>
            <td className="plan-num plan-c-plan">{soma(allRows, (item) => item.distributedCount)}</td>
            {dates.length === 0 && <td className="plan-c-day plan-split" />}
            {dates.map((date, index) => {
              const total = dayTotals[index] ?? 0;
              const level = heatLevel(total);
              const isToday = date === today;
              return (
                <td
                  key={date}
                  className={`plan-num plan-c-day plan-heat-${level}${index === 0 ? " plan-split" : ""}${isToday ? " plan-today" : ""}`}
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
  editable,
  onCommit,
  onDirtyChange,
}: {
  cellKey: string;
  value: string | null;
  editable: boolean;
  onCommit: (date: string) => void;
  onDirtyChange?: (cellKey: string, dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => toDateInputValue(value));
  const saved = toDateInputValue(value);
  const dirty = draft !== saved;

  useEffect(() => {
    setDraft(toDateInputValue(value));
  }, [value]);

  useEffect(() => {
    onDirtyChange?.(cellKey, dirty);
  }, [cellKey, dirty, onDirtyChange]);

  if (!editable) return <span>{value ? diaCheio(value) : "—"}</span>;
  return (
    <input
      className="plan-edit"
      type="date"
      value={draft}
      aria-label={value ? diaCheio(value) : "Data"}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== saved) onCommit(draft);
      }}
    />
  );
}

function draftQuantity(draft: string): number {
  return draft === "" ? 0 : Number(draft);
}

function DayCell({
  cellKey,
  value,
  editable,
  onCommit,
  onDirtyChange,
}: {
  cellKey: string;
  value: number;
  editable: boolean;
  onCommit: (quantity: number) => void;
  onDirtyChange?: (cellKey: string, dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const dirty = draftQuantity(draft) !== value;

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    onDirtyChange?.(cellKey, dirty);
  }, [cellKey, dirty, onDirtyChange]);

  if (!editable) return <span>{String(value)}</span>;
  return (
    <input
      className="plan-edit plan-day"
      inputMode="numeric"
      aria-label="Quantidade do dia"
      value={draft}
      onFocus={() => {
        if (value === 0) setDraft("");
      }}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => {
        const quantity = draftQuantity(draft);
        if (quantity !== value) onCommit(quantity);
        setDraft(String(quantity));
      }}
    />
  );
}
