import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  onSave: (item: PlanningItem, field: "start" | "end" | "day", date: string, quantity?: number) => void;
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
                className={`plan-g-id plan-sticky${col.kind === "suite" ? " plan-suite" : ""}`}
                style={stickyStyle(col)}
              >
                {col.kind === "suite" && (
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
            <th className="plan-g-plan" colSpan={2}>
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
                  className={`plan-sticky plan-c-id plan-c-id--filter${col.kind === "suite" ? " plan-suite" : ""}${hasFilter ? " plan-c-id--filtered" : ""}`}
                  style={stickyStyle(col)}
                  title={col.label}
                >
                  <span className="plan-col-head">
                    <span className="plan-ellipsis">{col.short}</span>
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
            <th className="plan-c-plan plan-split" title="Quantidade do baseline confirmado">Qtd plan</th>
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
            const key = `${item.suiteId ?? "s"}-${item.suiteName}`;
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
                      className={`plan-sticky plan-c-id${col.kind === "suite" ? " plan-suite" : ""}`}
                      style={stickyStyle(col)}
                      title={text === "—" ? undefined : text}
                    >
                      {pill ? (
                        <span className={/^\d+$/.test(text) ? "plan-pill plan-pill-hot" : "plan-pill plan-pill-cool"}>{text}</span>
                      ) : (
                        <span className="plan-ellipsis">{text}</span>
                      )}
                    </td>
                  );
                })}
                <td className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)}>
                  <DateCell value={item.plannedStart} editable={canEdit} onCommit={(date) => onSave(item, "start", date)} />
                </td>
                <td className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)}>
                  <DateCell value={item.plannedEnd} editable={canEdit} onCommit={(date) => onSave(item, "end", date)} />
                </td>
                <td className={`plan-num plan-c-plan plan-split${item.baselineCount === 0 ? " plan-zero" : ""}`}>{num(item.baselineCount)}</td>
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
                      <DayCell value={quantity} editable={canEdit} onCommit={(next) => onSave(item, "day", date, next)} />
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
                className={`plan-sticky plan-c-id${col.kind === "suite" ? " plan-suite" : ""}`}
                style={stickyStyle(col)}
              >
                {col.kind === "suite" ? "Totais" : ""}
              </td>
            ))}
            <td className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)} />
            <td className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} />
            <td className="plan-num plan-c-plan plan-split">{soma(allRows, (item) => item.baselineCount)}</td>
            <td className="plan-num plan-c-plan">{soma(allRows, (item) => item.distributedCount)}</td>
            {dates.length === 0 && <td className="plan-c-day plan-split" />}
            {dates.map((date, index) => {
              const total = dayTotals[index] ?? 0;
              const level = heatLevel(total);
              return (
                <td
                  key={date}
                  className={`plan-num plan-c-day plan-heat-${level}${index === 0 ? " plan-split" : ""}`}
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
  if (col.kind === "atalho") return atalhoDe(item.suiteName) || "—";
  if (col.kind === "suite") return item.suiteName;
  return item.dimensions[col.dimKey ?? ""] || "—";
}

function DateCell({
  value,
  editable,
  onCommit,
}: {
  value: string | null;
  editable: boolean;
  onCommit: (date: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  if (!editable) return <span>{value ? diaCheio(value) : "—"}</span>;
  return (
    <input
      className="plan-edit"
      type="date"
      value={draft}
      aria-label={value ? diaCheio(value) : "Data"}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if ((draft || "") !== (value ?? "")) onCommit(draft);
      }}
    />
  );
}

function DayCell({
  value,
  editable,
  onCommit,
}: {
  value: number;
  editable: boolean;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
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
        const quantity = draft === "" ? 0 : Number(draft);
        if (quantity !== value) onCommit(quantity);
        setDraft(String(quantity));
      }}
    />
  );
}
