import { faceLabel, StatusFace } from "../StatusFace";
import { FrenteKpiGrid } from "./FrenteKpiGrid";
import { fmtPctBr } from "../../api";
import { kpisDaFrente } from "./statusModel";
import type { StatusFrenteBloco } from "../../types";

export function FrenteCard({ bloco }: { bloco: StatusFrenteBloco }) {
  const status = bloco.indicadores.status;
  const pct = Math.max(0, Math.min(100, bloco.indicadores.pctReal * 100));

  return (
    <article className={`card status-frente tone-${status}`}>
      <header className="status-frente-head">
        <h2>{bloco.frente}</h2>
        <span className={`status-badge tone-${status}`}>
          <StatusFace status={status} />
          {faceLabel[status]}
        </span>
      </header>
      <div className="status-progress" title={`${fmtPctBr(bloco.indicadores.pctReal, 1)} realizado`}>
        <div className="status-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <FrenteKpiGrid kpis={kpisDaFrente(bloco)} />
    </article>
  );
}
