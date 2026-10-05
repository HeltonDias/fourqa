import type { CSSProperties } from "react";
import {
  scenarioStatusTheme,
  statusCenarioIcons,
  type ScenarioStatusKey,
} from "./statusCenarioAssets";

function ScenarioIcon({ statusKey }: { statusKey: ScenarioStatusKey }) {
  const src = statusCenarioIcons[statusKey];
  const theme = scenarioStatusTheme[statusKey];
  if (!src) {
    return <span className={`scenario-card-icon ${theme.icon}`} aria-hidden />;
  }

  const maskStyle = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    backgroundColor: theme.iconTint,
  } satisfies CSSProperties;

  return (
    <span className={`scenario-card-icon ${theme.icon}`}>
      <span className="scenario-card-icon-glyph" style={maskStyle} aria-hidden />
    </span>
  );
}

function ScenarioCard({ statusKey, value }: { statusKey: ScenarioStatusKey; value: number }) {
  const theme = scenarioStatusTheme[statusKey];
  return (
    <div className={`scenario-card ${theme.card}`}>
      <div className="scenario-card-head">
        <ScenarioIcon statusKey={statusKey} />
        <span className="scenario-card-label" style={{ color: theme.labelColor }}>
          {theme.label}
        </span>
      </div>
      <div className="scenario-card-value">{value}</div>
    </div>
  );
}

type Props = {
  ttl: number;
  plan: number;
  finalizado: number;
  falha: number;
  bloq: number;
  liberado: number;
  design: number;
  naoLiberado: number;
};

const ORDER: ScenarioStatusKey[] = [
  "ttl",
  "plan",
  "finalizado",
  "falha",
  "bloq",
  "liberado",
  "design",
  "naoLiberado",
];

export function StatusCenariosPanel(props: Props) {
  const values: Record<ScenarioStatusKey, number> = {
    ttl: props.ttl,
    plan: props.plan,
    finalizado: props.finalizado,
    falha: props.falha,
    bloq: props.bloq,
    liberado: props.liberado,
    design: props.design,
    naoLiberado: props.naoLiberado,
  };

  return (
    <div className="card scenario-panel">
      <h2 className="scenario-panel-title">
        <span className="scenario-panel-title-icon" aria-hidden>
          📈
        </span>
        Status dos Cenários
      </h2>
      <div className="scenario-grid">
        {ORDER.map((key) => (
          <ScenarioCard key={key} statusKey={key} value={values[key]} />
        ))}
      </div>
    </div>
  );
}
