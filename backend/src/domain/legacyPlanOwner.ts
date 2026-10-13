/**
 * planejamento_linhas não tem plan_key.
 * O legado só pertence ao plano gravado em planejamento_legado_plan_key.
 * Meta ausente, vazia ou de outro plano não tem dono.
 * A comparação ignora caixa e espaços, como o Planejamento já fazia.
 */
export function isLegacyPlanOwner(planKey: string, owner: string | null | undefined): boolean {
  const stored = (owner ?? "").trim();
  if (!stored) return false;
  return stored.toLowerCase() === planKey.trim().toLowerCase();
}
