import type { CSSProperties } from "react";
import { getScenarioIconUrl, type ScenarioIconKey } from "../config/scenarioStatusIcons";

type Tone = "blue" | "plan" | "green" | "red" | "orange" | "sky" | "purple" | "gray";

export function ScenarioPill({
  label,
  value,
  tone,
  iconKey,
}: {
  label: string;
  value: number;
  tone: Tone;
  iconKey: ScenarioIconKey;
}) {
  const iconUrl = getScenarioIconUrl(iconKey);
  const maskStyle: CSSProperties | undefined = iconUrl
    ? {
        WebkitMaskImage: `url(${iconUrl})`,
        maskImage: `url(${iconUrl})`,
      }
    : undefined;

  return (
    <div className={`scenario-card scenario-card--${tone}`}>
      <div className="scenario-card-head">
        <span className="scenario-card-icon">
          {iconUrl ? (
            <span className="scenario-card-icon-mask" style={maskStyle} aria-hidden />
          ) : null}
        </span>
        <span className="scenario-card-label">{label}</span>
      </div>
      <div className="scenario-card-value">{value}</div>
    </div>
  );
}
