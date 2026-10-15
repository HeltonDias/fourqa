import type { PageParams, PageResult } from "../db/sqliteAzureSnapshotStore.js";

/** Mesmas colunas do LIKE/ILIKE dos stores SQLite e PostgreSQL. */
export const EXEC_SEARCH = [
  "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
  "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags",
] as const;

export const FALHA_SEARCH = [
  "plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags",
] as const;

function matches(row: object, columns: readonly string[], q: string): boolean {
  const needle = q.toLowerCase();
  return columns.some((column) => {
    const value = (row as Record<string, unknown>)[column];
    if (value == null) return false;
    return String(value).toLowerCase().includes(needle);
  });
}

/** Id estável do Azure. A posição na página não vira identificador do registro. */
function withStableId<T extends object>(row: T, index: number): T & { id: number } {
  const record = row as { test_point_id?: unknown; bug_id?: unknown; id?: unknown };
  const stable = typeof record.test_point_id === "number"
    ? record.test_point_id
    : typeof record.bug_id === "number"
      ? record.bug_id
      : typeof record.id === "number"
        ? record.id
        : index + 1;
  return { ...row, id: stable };
}

/** Ordem do array = ordem de inserção, equivalente ao ORDER BY id do snapshot. */
export function pageCachedRows<T extends object>(
  rows: T[],
  columns: readonly string[],
  params: PageParams,
): PageResult<T & { id: number }> {
  const keyed = rows.map((row, index) => withStableId(row, index));
  const filtered = params.q ? keyed.filter((row) => matches(row, columns, params.q)) : keyed;
  const offset = params.offset;
  const limit = params.limit;
  return {
    total: filtered.length,
    limit,
    offset,
    rows: filtered.slice(offset, offset + limit),
  };
}

export function listCachedRows<T extends object>(rows: T[]): (T & { id: number })[] {
  return rows.map((row, index) => withStableId(row, index));
}
