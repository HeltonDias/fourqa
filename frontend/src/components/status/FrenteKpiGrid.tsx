import type { FrenteKpi } from "./statusModel";

export function FrenteKpiGrid({ kpis }: { kpis: FrenteKpi[] }) {
  return (
    <dl className="status-kpi-grid">
      {kpis.map((kpi) => (
        <div key={kpi.id} className={kpi.tone ? `status-kpi ${kpi.tone}` : "status-kpi"} title={kpi.hint}>
          <dt>{kpi.label}</dt>
          <dd>{kpi.text}</dd>
        </div>
      ))}
    </dl>
  );
}
