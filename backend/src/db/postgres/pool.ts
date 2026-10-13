import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import { envValue } from "../../azure/config.js";

let pool: Pool | null = null;

export function databaseUrl(): string {
  const url = envValue("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
  return url;
}

function connectionConfig(connectionString: string): PoolConfig {
  let host = "";
  let sslmode = "";
  try {
    const parsed = new URL(connectionString);
    host = parsed.hostname;
    sslmode = parsed.searchParams.get("sslmode") ?? "";
  } catch {
    throw new Error("DATABASE_URL inválida");
  }
  const supabase =
    host.endsWith(".supabase.co") || host.endsWith(".supabase.com") || host.endsWith(".pooler.supabase.com");
  const ssl =
    sslmode === "disable"
      ? undefined
      : supabase || sslmode === "require" || sslmode === "verify-ca" || sslmode === "verify-full" || sslmode === "no-verify"
        ? { rejectUnauthorized: false }
        : undefined;
  return {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    application_name: "fourqa",
    ssl,
  };
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(connectionConfig(databaseUrl()));
    pool.on("error", () => {
      console.error("[db] conexão PostgreSQL encerrada");
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, lockSql?: string): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (lockSql) await client.query(lockSql);
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* a conexão já pode ter caído */
    }
    throw err;
  } finally {
    client.release();
  }
}

export function bind(value: unknown): unknown {
  return value === undefined ? null : value;
}

export function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("Valor numérico inválido vindo do PostgreSQL");
}

export function asNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  return asNumber(value);
}

export function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** scope_snapshot permanece 0 ou 1 mesmo se o driver devolver boolean. */
export function asFlag(value: unknown): number {
  if (value === true) return 1;
  if (value === false) return 0;
  return asNumber(value);
}
