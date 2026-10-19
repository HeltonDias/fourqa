/** Rosto da Evoluções e do card STATUS. Cada valor aponta para uma imagem do roteiro. */
export type EvolucaoStatus = "done" | "ok" | "warn" | "risk" | "na";

/**
 * fonte/util/evolucoes/roteiro_status.md
 * - status_na: todos os cenários são N/A
 * - status_finalizado: todos os cenários foram finalizados
 * - status_vermelho: GAP > 3
 * - status_amarelo: GAP > 0 e GAP < 3 (GAP 3 não é vermelho, porque vermelho é só acima de 3)
 * - status_verde: GAP <= 0
 */
export function statusEvolucao(input: {
  gap: number;
  ttlCts: number;
  /**
   * Contagem já calculada pelo chamador.
   * O Report envia Passed + N/A. A aba Status ainda envia Passed + N/A + cancelados.
   */
  finalizados: number;
  na: number;
}): EvolucaoStatus {
  const ttl = input.ttlCts;
  if (ttl > 0 && input.na >= ttl) return "na";
  if (ttl > 0 && input.finalizados >= ttl) return "done";
  if (input.gap > 3) return "risk";
  if (input.gap > 0 && input.gap < 3) return "warn";
  // GAP exatamente 3 não entra em vermelho.
  if (input.gap > 0) return "warn";
  return "ok";
}

/** Maioria das suítes, com a imagem daquele status. N/A fica de fora. Empate: o mais grave. */
export function statusGeralDe(statuses: EvolucaoStatus[]): EvolucaoStatus {
  const votos = statuses.filter((status) => status !== "na");
  if (votos.length === 0) return statuses.some((status) => status === "na") ? "na" : "ok";
  const ordem: EvolucaoStatus[] = ["risk", "warn", "ok", "done"];
  const count = (status: EvolucaoStatus) => votos.filter((item) => item === status).length;
  return ordem.reduce((melhor, status) => (count(status) > count(melhor) ? status : melhor));
}
