/** Normaliza a chave da query. Vazia ou ausente usa o plano padrão já resolvido. */
export function planKeyFromRaw(q: unknown, fallback: string): string {
  if (typeof q === "string" && q.trim()) return q.trim();
  return requiredPlanKey(fallback);
}

/** A paginação não consulta execuções ou falhas sem um plano. */
export function requiredPlanKey(planKey: string | undefined): string {
  const key = typeof planKey === "string" ? planKey.trim() : "";
  if (!key) throw new Error("planKey obrigatório");
  return key;
}
