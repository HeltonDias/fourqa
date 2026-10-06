import { pct } from "./planningUtils";

export function PlanningAcompanhamentoSummary({
  baseline,
  finalizados,
  falhos,
  naoClassificados,
  inconsistentes,
}: {
  baseline: number;
  finalizados: number;
  falhos: number;
  naoClassificados: number;
  inconsistentes: number;
}) {
  const base = baseline > 0 ? baseline : 1;
  return (
    <div className="plan-acc-strip" aria-label="Resumo do acompanhamento">
      <span>
        <strong>{baseline}</strong> cenários no escopo
      </span>
      <span>
        <strong>{finalizados}</strong> finalizados ({pct(finalizados, base)})
      </span>
      <span className={falhos > 0 ? "is-warn" : undefined}>
        <strong>{falhos}</strong> falhados
      </span>
      <span className={naoClassificados > 0 ? "is-warn" : undefined}>
        <strong>{naoClassificados}</strong> não classificados
      </span>
      <span className={inconsistentes > 0 ? "is-warn" : undefined}>
        <strong>{inconsistentes}</strong> inconsistentes
      </span>
    </div>
  );
}
