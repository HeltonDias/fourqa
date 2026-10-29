import { useRef } from "react";
import { daysInMonth, isPlanningOffDay, isWeekendDay, monthLabel, offDayLabel } from "./planningUtils";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function weekdayIndex(iso: string): number {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return d.getDay();
}

export function PlanningDistributeWeekendCalendar({
  monthKey,
  monthKeys,
  onMonthChange,
  windowStart,
  windowEnd,
  selected,
  onToggle,
  disabled,
}: {
  monthKey: string;
  monthKeys: string[];
  onMonthChange: (key: string) => void;
  windowStart: string;
  windowEnd: string;
  selected: ReadonlySet<string>;
  onToggle: (date: string) => void;
  disabled?: boolean;
}) {
  const monthInputRef = useRef<HTMLInputElement>(null);
  const index = monthKeys.indexOf(monthKey);
  const days = daysInMonth(monthKey);
  const firstPad = days.length > 0 ? weekdayIndex(days[0]) : 0;

  function openMonthPicker() {
    const input = monthInputRef.current;
    if (!input || input.disabled) return;
    if (typeof input.showPicker === "function") {
      void input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  function shift(delta: number) {
    if (monthKeys.length === 0) return;
    const next = monthKeys[Math.min(monthKeys.length - 1, Math.max(0, index + delta))];
    if (next) onMonthChange(next);
  }

  function inWindow(date: string): boolean {
    return date >= windowStart && date <= windowEnd;
  }

  function eligibleOff(date: string): boolean {
    return isPlanningOffDay(date) && inWindow(date);
  }

  const cells: Array<{ kind: "pad" } | { kind: "day"; date: string }> = [];
  for (let i = 0; i < firstPad; i += 1) cells.push({ kind: "pad" });
  for (const date of days) cells.push({ kind: "day", date });

  return (
    <div className="plan-distribute-weekend">
      <p className="plan-modal-lead">
        Marque feriados e fins de semana dentro do período da curva. Os demais dias aparecem só como referência.
      </p>
      <div className="plan-month-nav plan-distribute-weekend-nav">
        <button type="button" className="plan-filter-icon" aria-label="Mês anterior" onClick={() => shift(-1)} disabled={disabled || index <= 0}>
          ‹
        </button>
        <div className="plan-month-trigger">
          <button
            type="button"
            className="plan-month-label"
            onClick={openMonthPicker}
            disabled={disabled || monthKeys.length === 0}
            aria-label="Selecionar mês"
          >
            {monthKey ? monthLabel(monthKey) : "—"}
          </button>
          <input
            ref={monthInputRef}
            type="month"
            className="plan-month-picker"
            tabIndex={-1}
            value={monthKey}
            min={monthKeys[0] ?? undefined}
            max={monthKeys.at(-1) ?? undefined}
            disabled={disabled || monthKeys.length === 0}
            aria-hidden="true"
            onChange={(event) => {
              const next = event.target.value;
              if (next && monthKeys.includes(next)) onMonthChange(next);
            }}
          />
        </div>
        <button
          type="button"
          className="plan-filter-icon"
          aria-label="Próximo mês"
          onClick={() => shift(1)}
          disabled={disabled || index < 0 || index >= monthKeys.length - 1}
        >
          ›
        </button>
      </div>
      <div className="plan-distribute-cal" role="grid" aria-label="Calendário de feriados e fins de semana">
        <div className="plan-distribute-cal-head" role="row">
          {DOW.map((label) => (
            <span key={label} role="columnheader">
              {label}
            </span>
          ))}
        </div>
        <div className="plan-distribute-cal-body">
          {cells.map((cell, idx) => {
            if (cell.kind === "pad") return <span key={`pad-${idx}`} className="plan-distribute-cal-pad" aria-hidden />;
            const { date } = cell;
            const num = date.slice(8, 10);
            const off = isPlanningOffDay(date);
            const outside = !inWindow(date);
            const label = off ? `${date} · ${offDayLabel(date)}` : date;
            if (!off) {
              return (
                <span
                  key={date}
                  className={`plan-distribute-cal-day is-weekday${outside ? " is-outside" : ""}`}
                  role="gridcell"
                  aria-label={label}
                >
                  {num}
                </span>
              );
            }
            if (!eligibleOff(date)) {
              return (
                <span
                  key={date}
                  className={`plan-distribute-cal-day is-weekend is-disabled${isWeekendDay(date) ? "" : " is-holiday"}`}
                  role="gridcell"
                  aria-label={`${label} (fora do período)`}
                >
                  {num}
                </span>
              );
            }
            const on = selected.has(date);
            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                className={`plan-distribute-cal-day is-weekend is-selectable${on ? " is-on" : ""}`}
                aria-pressed={on}
                aria-label={label}
                disabled={disabled}
                onClick={() => onToggle(date)}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>
      {selected.size > 0 && (
        <p className="plan-distribute-weekend-summary">
          {selected.size} {selected.size === 1 ? "dia selecionado" : "dias selecionados"} (feriado/fim de semana).
        </p>
      )}
    </div>
  );
}
