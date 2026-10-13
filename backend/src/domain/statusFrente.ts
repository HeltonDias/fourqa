import { statusEvolucao, type EvolucaoStatus } from "./evolucaoStatus.js";

/** Contagens já agregadas por frente. A classificação do test point não entra aqui. */
export type FrenteContagens = {
  ttl: number;
  planAteHoje: number;
  finalizado: number;
  na: number;
  passeds: number;
  falha: number;
  bloqueado: number;
  impactosDev: number;
  impactosCliente: number;
  bugsTotal: number;
  bugsFechados: number;
};

export type FrenteIndicadores = {
  planAteHoje: number;
  na: number;
  passeds: number;
  gap: number;
  pctPlan: number;
  pctReal: number;
  pctBugsDev: number;
  pctBugsCliente: number;
  bugsAbertos: number;
  status: EvolucaoStatus;
};

function ratio(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

/**
 * Mesma leitura da Home, aplicada ao bloco da frente:
 * gap = planejado até hoje − finalizados; % sobre o total; % de bugs sobre CTs executados.
 */
export function indicadoresFrente(c: FrenteContagens): FrenteIndicadores {
  const gap = c.planAteHoje - c.finalizado;
  const executados = c.passeds + c.falha + c.bloqueado;
  return {
    planAteHoje: c.planAteHoje,
    na: c.na,
    passeds: c.passeds,
    gap,
    pctPlan: ratio(c.planAteHoje, c.ttl),
    pctReal: ratio(c.finalizado, c.ttl),
    pctBugsDev: ratio(c.impactosDev, executados),
    pctBugsCliente: ratio(c.impactosCliente, executados),
    bugsAbertos: Math.max(0, c.bugsTotal - c.bugsFechados),
    status: statusEvolucao({
      gap,
      ttlCts: c.ttl,
      finalizados: c.finalizado,
      na: c.na,
    }),
  };
}

/** O SUMIF da frente é por contém. Nomes encaixados contam o mesmo item mais de uma vez. */
export function haSobreposicaoFrentes(nomes: string[]): boolean {
  const norm = nomes.map((nome) => nome.trim().toLowerCase()).filter((nome) => nome.length > 0);
  return norm.some((nome, i) => norm.some((outro, j) => i !== j && outro.includes(nome)));
}
