import type { CSSProperties } from "react";

const icons = import.meta.glob<string>("../../../fonte/util/status_cenarios/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function iconUrl(fileName: string): string | undefined {
  const entry = Object.entries(icons).find(([path]) => path.endsWith(`/${fileName}`));
  return entry?.[1];
}

type Variant = "ttl" | "plan" | "final" | "falha" | "bloq" | "lib" | "design" | "naolib";

function StatusCard({
  variant,
  label,
  iconFile,
  value,
}: {
  variant: Variant;
  label: string;
  iconFile: string;
  value: number;
}) {
  const src = iconUrl(iconFile);
  const maskStyle: CSSProperties | undefined = src
    ? { WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }
    : undefined;

  return (
    <div className={`impact-card status-card--${variant}`}>
      <span className="impact-card-icon">
        <span className="impact-card-img impact-card-img-mask" style={maskStyle} aria-hidden />
      </span>
      <div className="impact-card-body">
        <span className="impact-card-label">{label}</span>
        <div className="impact-card-value">{value}</div>
      </div>
    </div>
  );
}

type Props = {
  ttl: number;
  plan: number;
  final: number;
  falha: number;
  bloq: number;
  lib: number;
  design: number;
  naoLib: number;
};

export function ScenarioStatusPanel(p: Props) {
  const titleIcon = iconUrl("Status dos cenários.png");
  const titleMask: CSSProperties | undefined = titleIcon
    ? { WebkitMaskImage: `url("${titleIcon}")`, maskImage: `url("${titleIcon}")` }
    : undefined;

  return (
    <div className="card scenario-panel">
      <h2>
        <span className="panel-icon panel-icon-mask" style={titleMask} aria-hidden />
        Status dos Cenários
      </h2>
      <div className="scenario-grid">
        <StatusCard variant="ttl" label="TTL CT's" iconFile="TTL CT's.png" value={p.ttl} />
        <StatusCard variant="plan" label="CT's Plan" iconFile="CT's PLAN.png" value={p.plan} />
        <StatusCard variant="final" label="Final." iconFile="FINALIZADO.png" value={p.final} />
        <StatusCard variant="falha" label="Falha" iconFile="FALHA.png" value={p.falha} />
        <StatusCard variant="bloq" label="Bloq." iconFile="BLOQ..png" value={p.bloq} />
        <StatusCard variant="lib" label="Lib." iconFile="LIBERADO.png" value={p.lib} />
        <StatusCard variant="design" label="Design" iconFile="DESIGN.png" value={p.design} />
        <StatusCard variant="naolib" label="Não Lib." iconFile="NÃO LIBERADO.png" value={p.naoLib} />
      </div>
    </div>
  );
}
