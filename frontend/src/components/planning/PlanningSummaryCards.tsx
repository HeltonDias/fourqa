import { businessDaysIn, pct, periodoLabel } from "./planningUtils";

const HEAT_LEGEND: { level: 0 | 1 | 2 | 3 | 4; label: string }[] = [
  { level: 0, label: "0" },
  { level: 1, label: "1–2" },
  { level: 2, label: "3–5" },
  { level: 3, label: "6–10" },
  { level: 4, label: ">10" },
];

export function PlanningSummaryCards({
  baseline,
  distribuido,
  naoDistribuido,
  dates,
}: {
  baseline: number;
  distribuido: number;
  naoDistribuido: number;
  dates: string[];
}) {
  const base = baseline > 0 ? baseline : 1;
  const diasUteis = businessDaysIn(dates);

  return (
    <div className="plan-summary-row">
      <article className="plan-summary-card">
        <span className="plan-summary-label">Baseline</span>
        <strong>{baseline}</strong>
        <small>cenários</small>
      </article>

      <article className="plan-summary-card plan-summary-card--ok">
        <span className="plan-summary-label">Distribuído</span>
        <strong>{distribuido}</strong>
        <small>{pct(distribuido, base)}</small>
      </article>

      <article className="plan-summary-card plan-summary-card--warn">
        <span className="plan-summary-label">Não distribuído</span>
        <strong>{naoDistribuido}</strong>
        <small>{pct(naoDistribuido, base)}</small>
      </article>

      <article className="plan-summary-card plan-summary-card--period">
        <span className="plan-summary-label">Período</span>
        <strong className="plan-summary-dates">{periodoLabel(dates)}</strong>
        <small>{diasUteis} dias úteis</small>
      </article>

      <article className="plan-summary-card plan-summary-card--legend" aria-label="Legenda de intensidade de carga">
        <span className="plan-summary-label">Intensidade de carga</span>
        <div className="plan-heat-legend">
          {HEAT_LEGEND.map((item) => (
            <div key={item.level} className="plan-heat-legend-item">
              <span className={`plan-heat-swatch plan-heat-${item.level}`} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
