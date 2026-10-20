/**
 * Seleção futura de gates por módulo (ASP.NET Core 10).
 * Hoje só documenta o contrato; não executa dotnet.
 */
export const MODULE_GATES = {
  node: ["typecheck", "test", "build", "test_agents"],
  dotnet: ["dotnet_build", "dotnet_test"],
};

export function gatesForModule(module = "node") {
  return MODULE_GATES[module] ?? MODULE_GATES.node;
}
