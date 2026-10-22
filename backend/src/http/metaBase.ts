export type PairBase = { present: boolean; valid: boolean; a: string; b: string };

/** Nenhuma chave base: sem guarda. As duas strings: guarda. Caso contrário, inválido. */
export function parseMetaPair(body: Record<string, unknown>, keyA: string, keyB: string): PairBase {
  const hasA = Object.prototype.hasOwnProperty.call(body, keyA);
  const hasB = Object.prototype.hasOwnProperty.call(body, keyB);
  if (!hasA && !hasB) return { present: false, valid: true, a: "", b: "" };
  if (typeof body[keyA] === "string" && typeof body[keyB] === "string") {
    return { present: true, valid: true, a: body[keyA] as string, b: body[keyB] as string };
  }
  return { present: true, valid: false, a: "", b: "" };
}
