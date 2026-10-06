/** Equivale a EX_normalize / FL_normalize dos Office Scripts. */
export function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function toPositiveInteger(value: unknown): number {
  const numeric = Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.trunc(numeric);
}

/** Texto vazio vira null (mesma convenção da importação da planilha). */
export function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

/** Processa itens em lotes de `limit` itens em paralelo, mantendo a ordem. */
export async function mapInBatches<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  onBatchDone?: (done: number, total: number) => void,
): Promise<R[]> {
  const out: R[] = [];
  for (let start = 0; start < items.length; start += limit) {
    const batch = items.slice(start, start + limit);
    out.push(...(await Promise.all(batch.map(worker))));
    onBatchDone?.(Math.min(start + limit, items.length), items.length);
  }
  return out;
}

export interface ProgressReporter {
  (step: string, done?: number, total?: number): void;
}
