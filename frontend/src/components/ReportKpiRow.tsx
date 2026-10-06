import type { ReactNode } from "react";
import {
  KpiIconBugCliente,
  KpiIconBugDev,
  KpiIconGap,
  KpiIconPlan,
  KpiIconReal,
  KpiIconRefresh,
  KpiIconWarning,
} from "./KpiIcons";
import { StatusFace, type FaceStatus } from "./StatusFace";

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="kpi-card kpi-card-metric">
      <div className="kpi-metric-head">
        {icon}
        <span>{label}</span>
      </div>
      <div className="kpi-metric-value">{value}</div>
    </div>
  );
}

type Props = {
  statusGeral: FaceStatus;
  percentBugsDev: string;
  percentBugsCliente: string;
  percentTotalImpactados: string;
  replanejados: number;
  percentPlan: string;
  percentReal: string;
  gap: number;
};

export function ReportKpiRow({
  statusGeral,
  percentBugsDev,
  percentBugsCliente,
  percentTotalImpactados,
  replanejados,
  percentPlan,
  percentReal,
  gap,
}: Props) {
  return (
    <section className="kpi-row" aria-label="Indicadores principais">
      <div className={`kpi-card kpi-card-status tone-${statusGeral}`}>
        <span className="kpi-status-label">STATUS</span>
        <div className="kpi-status-center">
          <StatusFace status={statusGeral} hero />
        </div>
      </div>
      <MetricCard icon={<KpiIconBugDev />} label="% BUGS DEV." value={percentBugsDev} />
      <MetricCard icon={<KpiIconBugCliente />} label="% BUGS CLIENTE" value={percentBugsCliente} />
      <MetricCard
        icon={<KpiIconWarning />}
        label="% Total Impactados"
        value={percentTotalImpactados}
      />
      <MetricCard icon={<KpiIconRefresh />} label="Replanejados" value={replanejados} />
      <MetricCard icon={<KpiIconPlan />} label="% PLAN" value={percentPlan} />
      <MetricCard icon={<KpiIconReal />} label="% REAL" value={percentReal} />
      <MetricCard icon={<KpiIconGap />} label="GAP" value={gap} />
    </section>
  );
}
