import { useRef } from "react";
import historyClock from "../../../../fonte/util/wall-clock.png";
import broomIcon from "../../../../fonte/util/broom.png";
import splitIcon from "../../../../fonte/util/split.png";
import { monthLabel } from "./planningUtils";
import { PlanningWeekendOffMenu } from "./PlanningWeekendOffMenu";

export function PlanningFiltersBar({
  monthKey,
  monthKeys,
  onMonthChange,
  query,
  onQueryChange,
  onSaveChanges,
  onOpenHistory,
  onOpenDistribute,
  onOpenClear,
  distributeBlocked,
  saving,
  hasChanges,
  activeWeekendDays,
  onWeekendOffRequest,
  weekendOffDisabled,
}: {
  monthKey: string;
  monthKeys: string[];
  onMonthChange: (key: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onSaveChanges: () => void;
  onOpenHistory: () => void;
  onOpenDistribute?: () => void;
  onOpenClear?: () => void;
  distributeBlocked?: boolean;
  saving: boolean;
  hasChanges: boolean;
  activeWeekendDays?: string[];
  onWeekendOffRequest?: (date: string) => void;
  weekendOffDisabled?: boolean;
}) {
  const monthInputRef = useRef<HTMLInputElement>(null);
  const index = monthKeys.indexOf(monthKey);

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

  return (
    <div className="plan-filters">
      <div className="plan-month-nav">
        <button type="button" className="plan-filter-icon" aria-label="Mês anterior" onClick={() => shift(-1)} disabled={index <= 0}>
          ‹
        </button>
        <div className="plan-month-trigger">
          <button
            type="button"
            className="plan-month-label"
            onClick={openMonthPicker}
            disabled={monthKeys.length === 0}
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
            disabled={monthKeys.length === 0}
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
          disabled={index < 0 || index >= monthKeys.length - 1}
        >
          ›
        </button>
      </div>

      <input
        className="plan-filter-search plan-filter-search--planejar"
        type="search"
        placeholder="Buscar processo, suite ou atalho..."
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-label="Buscar processo, suite ou atalho"
      />

      {onWeekendOffRequest && (
        <PlanningWeekendOffMenu
          activeDays={activeWeekendDays ?? []}
          disabled={weekendOffDisabled}
          onRequestOff={onWeekendOffRequest}
        />
      )}

      <div className="plan-filter-actions">
        {onOpenClear && (
          <button
            type="button"
            className="plan-filter-history"
            onClick={onOpenClear}
            disabled={saving || distributeBlocked}
            aria-label="Limpar planejamento e manter só os finalizados"
            title={distributeBlocked ? "Salve as edições da grade antes de limpar." : "Limpar planejamento e manter só os finalizados"}
          >
            <img src={broomIcon} alt="" className="plan-filter-history-icon" width={18} height={18} />
          </button>
        )}
        {onOpenDistribute && (
          <button
            type="button"
            className="plan-filter-history"
            onClick={onOpenDistribute}
            disabled={saving || distributeBlocked}
            aria-label="Distribuição automática"
            title={distributeBlocked ? "Salve as edições da grade antes de distribuir." : "Distribuição automática"}
          >
            <img src={splitIcon} alt="" className="plan-filter-history-icon" width={18} height={18} />
          </button>
        )}
        <button
          type="button"
          className="plan-filter-history"
          onClick={onOpenHistory}
          aria-label="Registro de alterações do planejamento"
          title="Registro de alterações"
        >
          <img src={historyClock} alt="" className="plan-filter-history-icon" width={18} height={18} />
        </button>
        <button
          type="button"
          className={`plan-filter-primary plan-filter-primary--compact${saving ? " plan-filter-primary--busy" : ""}${!hasChanges ? " plan-filter-primary--inactive" : ""}`}
          onClick={onSaveChanges}
          disabled={saving || !hasChanges}
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
