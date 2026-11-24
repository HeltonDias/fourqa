export function norm(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function includesQuery(query: string, parts: string[]): boolean {
  const q = norm(query);
  if (!q) return true;
  return norm(parts.join(" ")).includes(q);
}

export function nid(prefix: string): string {
  const cryptoRef = globalThis.crypto;
  const id = cryptoRef?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

export function renumber<T extends { ordem: number }>(list: T[]): T[] {
  return list.map((item, index) => ({ ...item, ordem: index + 1 }));
}

export function moveById<T extends { id: string; ordem: number }>(
  list: T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const sorted = [...list].sort((a, b) => a.ordem - b.ordem);
  const index = sorted.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return sorted;
  const next = [...sorted];
  const current = next[index];
  const swap = next[target];
  if (!current || !swap) return sorted;
  next[index] = swap;
  next[target] = current;
  return renumber(next);
}
