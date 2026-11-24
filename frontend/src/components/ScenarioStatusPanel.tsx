import type { CSSProperties, ReactNode } from "react";
import impactadosIcon from "../../../fonte/util/status/impactados.png";
import { iconMaskStyle } from "../utils/iconMask";

const icons = import.meta.glob<string>("../../../fonte/util/status_cenarios/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function iconUrl(fileName: string): string | undefined {
  const entry = Object.entries(icons).find(([path]) => path.endsWith(`/${fileName}`));
  return entry?.[1];
}

type Variant = "ttl" | "plan" | "final" | "pendentes" | "passed" | "na" | "falha" | "bloq" | "lib" | "design" | "naolib";

export function CircleMinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StatusCard({
  variant,
  label,
  iconFile,
  iconSrc,
  value,
}: {
  variant: Variant;
  label: string;
  iconFile?: string;
  iconSrc?: string;
  value: number;
}) {
  const src = iconSrc ?? (iconFile ? iconUrl(iconFile) : undefined);
  const maskStyle: CSSProperties | undefined = src ? iconMaskStyle(src) : undefined;

  return (
    <div className={`impact-card status-card--${variant}`}>
      {src ? (
        <span className="impact-card-icon">
          <span className="impact-card-img impact-card-img-mask" style={maskStyle} aria-hidden />
        </span>
      ) : null}
      <div className="impact-card-body">
        <span className="impact-card-label" title={label}>
          {label}
        </span>
        <div className="impact-card-value">{value}</div>
      </div>
    </div>
  );
}

export function DetailStatusCard({
  variant,
  label,
  iconFile,
  icon,
  value,
}: {
  variant: Variant;
  label: string;
  iconFile?: string;
  icon?: ReactNode;
  value: number;
}) {
  const src = iconFile ? iconUrl(iconFile) : undefined;
  const maskStyle: CSSProperties | undefined = src ? iconMaskStyle(src) : undefined;

  return (
    <div className={`impact-card status-card--${variant} status-detail-card`}>
      <div className="status-detail-head">
        <span className="impact-card-icon">
          {src ? (
            <span className="impact-card-img impact-card-img-mask" style={maskStyle} aria-hidden />
          ) : (
            icon
          )}
        </span>
        <span className="impact-card-label" title={label}>
          {label}
        </span>
      </div>
      <div className="impact-card-value">{value}</div>
    </div>
  );
}

type Props = {
  total: number;
  planejados: number;
  finalizados: number;
  pendentes: number;
  passed: number;
  na: number;
  falha: number;
  bloq: number;
  lib: number;
  naoLib: number;
  design: number;
};

export function ScenarioStatusPanel(p: Props) {
  const titleIcon = iconUrl("Status dos cenários.png");
  const titleMask: CSSProperties | undefined = titleIcon ? iconMaskStyle(titleIcon) : undefined;

  return (
    <div className="card scenario-panel">
      <h2>
        <span className="panel-icon panel-icon-mask" style={titleMask} aria-hidden />
        Status dos Cenários
      </h2>
      <div className="scenario-grid scenario-grid-summary">
        <StatusCard variant="ttl" label="Total" iconFile="TTL CT's.png" value={p.total} />
        <StatusCard variant="plan" label="Planejados" iconFile="CT's PLAN.png" value={p.planejados} />
        <StatusCard variant="final" label="Finalizados" iconFile="FINALIZADO.png" value={p.finalizados} />
        <StatusCard variant="pendentes" label="Pendentes" iconSrc={impactadosIcon} value={p.pendentes} />
      </div>
      <div className="scenario-grid scenario-grid-detail">
        <DetailStatusCard variant="passed" label="Passed" iconFile="FINALIZADO.png" value={p.passed} />
        <DetailStatusCard variant="na" label="N/A" icon={<CircleMinusIcon />} value={p.na} />
        <DetailStatusCard variant="falha" label="Falha" iconFile="FALHA.png" value={p.falha} />
        <DetailStatusCard variant="bloq" label="Bloqueado" iconFile="BLOQ..png" value={p.bloq} />
        <DetailStatusCard variant="lib" label="Liberado" iconFile="LIBERADO.png" value={p.lib} />
        <DetailStatusCard variant="naolib" label="Não lib." iconFile="NÃO LIBERADO.png" value={p.naoLib} />
        <DetailStatusCard variant="design" label="Design" iconFile="DESIGN.png" value={p.design} />
      </div>
    </div>
  );
}
