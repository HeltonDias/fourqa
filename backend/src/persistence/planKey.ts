/** Normaliza a chave da query. Vazia ou ausente usa o plano padrão já resolvido. */
export function planKeyFromRaw(q: unknown, fallback: string): string {
  if (typeof q === "string" && q.trim()) return q.trim();
  return requiredPlanKey(fallback);
}

/** Escrita de plano: uma query planKey, não vazia e sem caractere de controle. Sem fallback. */
export function explicitPlanKeyFromQuery(q: unknown): string | null {
  if (q === undefined) return null;
  if (Array.isArray(q)) {
    if (q.length !== 1) return null;
    q = q[0];
  }
  if (typeof q !== "string") return null;
  const trimmed = q.trim();
  if (!trimmed) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

export function planKeyWriteError(q: unknown): string {
  if (Array.isArray(q) && q.length > 1) return "planKey ambíguo.";
  if (typeof q === "string" && /[\u0000-\u001f\u007f]/.test(q)) return "planKey inválido.";
  return "Informe o planKey.";
}

/** A paginação não consulta execuções ou falhas sem um plano. */
export function requiredPlanKey(planKey: string | undefined): string {
  const key = typeof planKey === "string" ? planKey.trim() : "";
  if (!key) throw new Error("planKey obrigatório");
  return key;
}
