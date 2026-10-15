/** Comparação de PlanKey ignorando caixa e espaços (Azure, cfg e meta). */
export function planKeyMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
