export function stable(value: unknown): unknown {
  if (value == null) return null;
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) out[key] = stable((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

export function projectRows(rows: Record<string, unknown>[], columns: string[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const projected: Record<string, unknown> = {};
    for (const column of columns) projected[column] = row[column] ?? null;
    return projected;
  });
}

export function sameContent(left: Record<string, unknown>[], right: Record<string, unknown>[], columns: string[], orderKey: string): boolean {
  const sort = (rows: Record<string, unknown>[]) =>
    [...projectRows(rows, columns)].sort((a, b) => String(a[orderKey] ?? "").localeCompare(String(b[orderKey] ?? ""), undefined, { numeric: true }));
  return JSON.stringify(sort(left).map((row) => stable(row))) === JSON.stringify(sort(right).map((row) => stable(row)));
}

export function sanitizeMigrationError(err: unknown): Error {
  if (err instanceof Error && err.message.startsWith("Migração interrompida")) return err;
  const message = err instanceof Error ? err.message : "falha na migração";
  const cleaned = message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***")
    .replace(/password[=:]\s*\S+/gi, "password=***")
    .replace(/Key \([^)]*\)=\([^)]*\)/gi, "Key=(oculto)")
    .replace(/Failing row contains \([\s\S]*?\)/gi, "Failing row=(oculto)");
  return new Error(cleaned);
}
