/**
 * Gates do workspace (frontend Node + backend Java).
 */
export const MODULE_GATES = {
  product: ["typecheck", "test", "build", "test_agents"],
  node: ["typecheck", "test", "build", "test_agents"],
};

export function gatesForModule(module = "product") {
  return MODULE_GATES[module] ?? MODULE_GATES.product;
}
