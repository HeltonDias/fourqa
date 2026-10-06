import { monthLabel } from "./planningUtils";

export function PlanningFiltersBar({
  monthKey,
  monthKeys,
  onMonthChange,
  query,
  onQueryChange,
  onRefresh,
  refreshing,
}: {
  monthKey: string;
  monthKeys: string[];
  onMonthChange: (key: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const index = monthKeys.indexOf(monthKey);

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
        <span className="plan-month-label">{monthKey ? monthLabel(monthKey) : "—"}</span>
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
        className="plan-filter-search"
        type="search"
        placeholder="Buscar processo, suite ou atalho..."
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-label="Buscar processo, suite ou atalho"
      />

      <button type="button" className="plan-filter-more">Mais filtros</button>
      <button type="button" className="plan-filter-primary" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? "Atualizando…" : "Atualizar"}
      </button>
    </div>
  );
}
