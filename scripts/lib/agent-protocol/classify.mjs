/** Níveis de orquestração (impacto/risco, não contagem de arquivos). */
export const TIERS = ["N0", "N1", "N2", "N3"];

/**
 * @param {object} signals — flags booleanas observadas na tarefa
 * @returns {{ tier: string, reasons: string[] }}
 */
export function classifyTask(signals = {}) {
  const reasons = [];
  if (signals.already_implemented === true) {
    return { tier: "N0", reasons: ["critérios já comprovados no código/testes"] };
  }
  if (
    signals.dotnet_migration ||
    signals.domain_formula ||
    signals.persistence ||
    signals.security ||
    signals.api_contract
  ) {
    if (signals.dotnet_migration) reasons.push("migração/.NET");
    if (signals.domain_formula) reasons.push("fórmula/domínio");
    if (signals.persistence) reasons.push("persistência");
    if (signals.security) reasons.push("segurança");
    if (signals.api_contract) reasons.push("contrato HTTP");
    return { tier: "N3", reasons };
  }
  if (signals.cross_module || signals.multiple_modules) {
    reasons.push("impacto transversal");
    return { tier: "N2", reasons };
  }
  reasons.push("alteração localizada");
  return { tier: "N1", reasons };
}
