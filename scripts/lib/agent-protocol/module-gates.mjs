/**
 * Seleção futura de gates por módulo (ex.: backend-java).
 * Hoje só documenta o contrato para o workspace Node.
 */
export const MODULE_GATES = {
  node: ["typecheck", "test", "build", "test_agents"],
};

export function gatesForModule(module = "node") {
  return MODULE_GATES[module] ?? MODULE_GATES.node;
}
