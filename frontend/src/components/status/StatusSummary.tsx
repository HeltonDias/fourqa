import { faceLabel, StatusFace } from "../StatusFace";
import { FrenteKpiGrid } from "./FrenteKpiGrid";
import { contagemPorStatus, kpisDaFrente } from "./statusModel";
import type { StatusFrenteDto } from "../../types";

export function StatusSummary({ dto }: { dto: StatusFrenteDto }) {
  const status = dto.total.indicadores.status;
  const mix = contagemPorStatus(dto);

  return (
    <section className="status-summary" aria-label="Resumo do plano">
      <article className={`card status-hero tone-${status}`}>
        <StatusFace status={status} hero />
        <div>
          <p className="status-kicker">Saúde do plano</p>
          <h2>{faceLabel[status]}</h2>
          <p className="muted">
            {dto.blocos.length} {dto.blocos.length === 1 ? "frente" : "frentes"} no plano {dto.planKey}
          </p>
        </div>
        <ul className="status-mix">
          {mix.map((item) => (
            <li key={item.status}>
              <StatusFace status={item.status} />
              <span>{item.total}</span>
              <span className="muted">{faceLabel[item.status]}</span>
            </li>
          ))}
        </ul>
      </article>
      <article className="card status-summary-kpis">
        <p className="status-kicker">Indicadores do conjunto</p>
        <FrenteKpiGrid kpis={kpisDaFrente(dto.total)} />
      </article>
    </section>
  );
}
