import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import { envValue } from "../../azure/config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sslQueryKeys = new Set(["sslmode", "ssl", "uselibpqcompat", "sslrootcert", "sslcert", "sslkey"]);

let pool: Pool | null = null;

export function databaseUrl(): string {
  const url = envValue("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
  return url;
}

function queryParams(connectionString: string): URLSearchParams {
  const hash = connectionString.indexOf("#");
  const main = hash >= 0 ? connectionString.slice(0, hash) : connectionString;
  const query = main.indexOf("?");
  return query < 0 ? new URLSearchParams() : new URLSearchParams(main.slice(query + 1));
}

function param(params: URLSearchParams, name: string): string {
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase() === name) return value.trim();
  }
  return "";
}

/** O pg faz Object.assign({}, config, parse(url)) e o ssl da URL substitui o nosso. */
function stripSslParams(connectionString: string): string {
  const hash = connectionString.indexOf("#");
  const suffix = hash >= 0 ? connectionString.slice(hash) : "";
  const main = hash >= 0 ? connectionString.slice(0, hash) : connectionString;
  const query = main.indexOf("?");
  if (query < 0) return connectionString;
  const params = new URLSearchParams(main.slice(query + 1));
  for (const key of [...params.keys()]) {
    if (sslQueryKeys.has(key.toLowerCase())) params.delete(key);
  }
  const rest = params.toString();
  return rest ? `${main.slice(0, query)}?${rest}${suffix}` : `${main.slice(0, query)}${suffix}`;
}

function isSupabaseHost(host: string): boolean {
  const name = host.toLowerCase();
  return name.endsWith(".supabase.co") || name.endsWith(".supabase.com") || name.endsWith(".pooler.supabase.com");
}

function sslConfig(host: string, mode: string, sslFlag: string, caPem?: string): PoolConfig["ssl"] {
  const ca = caPem ? { ca: caPem } : {};
  if (mode === "disable" || sslFlag === "0" || sslFlag === "false") return false;
  if (mode === "no-verify" || sslFlag === "no-verify") return { rejectUnauthorized: false, ...ca };
  const verifies =
    mode === "require" ||
    mode === "verify-ca" ||
    mode === "verify-full" ||
    mode === "prefer" ||
    mode === "allow" ||
    sslFlag === "1" ||
    sslFlag === "true";
  if (mode && !verifies) throw new Error("sslmode da DATABASE_URL não é suportado");
  if (sslFlag && !verifies) throw new Error("parâmetro ssl da DATABASE_URL não é suportado");
  if (verifies || isSupabaseHost(host)) return { rejectUnauthorized: true, ...ca };
  return undefined;
}

export function readPostgresCaPem(file: string): string {
  const trimmed = file.trim();
  if (!trimmed) throw new Error("Certificado CA do PostgreSQL não pôde ser lido");
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(repoRoot, trimmed);
  try {
    const pem = fs.readFileSync(resolved, "utf8");
    if (!pem.includes("BEGIN CERTIFICATE")) throw new Error("pem");
    return pem;
  } catch (err) {
    if (err instanceof Error && err.message === "pem") {
      throw new Error("Certificado CA do PostgreSQL não está em PEM");
    }
    throw new Error("Certificado CA do PostgreSQL não pôde ser lido");
  }
}

export function postgresConnectionConfig(connectionString: string, caPem?: string): PoolConfig {
  let host = "";
  let mode = "";
  let sslFlag = "";
  try {
    host = new URL(connectionString).hostname;
    const params = queryParams(connectionString);
    mode = param(params, "sslmode").toLowerCase();
    sslFlag = param(params, "ssl").toLowerCase();
  } catch {
    throw new Error("DATABASE_URL inválida");
  }
  if (!host) throw new Error("DATABASE_URL inválida");
  return {
    connectionString: stripSslParams(connectionString),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    application_name: "fourqa",
    ssl: sslConfig(host, mode, sslFlag, caPem),
  };
}

export function postgresCaPem(connectionString: string): string | undefined {
  const configured = envValue("DATABASE_SSL_CA_FILE");
  if (configured) return readPostgresCaPem(configured);
  let rootCert = "";
  try {
    rootCert = param(queryParams(connectionString), "sslrootcert");
  } catch {
    return undefined;
  }
  return rootCert ? readPostgresCaPem(rootCert) : undefined;
}

export type PostgresTestPool = {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  connect(): Promise<{
    query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
    release(): void;
  }>;
};

let testPool: PostgresTestPool | null = null;

/** Substitui o pool real. Usado só em teste, para não abrir a URL configurada. */
export function bindPostgresTestPool(next: PostgresTestPool | null): void {
  testPool = next;
}

/** Encerra o pool aberto por esta API. Não toca no pool de teste. */
export async function closePool(): Promise<void> {
  if (testPool) return;
  const current = pool;
  pool = null;
  if (current) await current.end();
}

export function getPool(): Pool {
  if (testPool) return testPool as unknown as Pool;
  if (!pool) {
    const connectionString = databaseUrl();
    pool = new Pool(postgresConnectionConfig(connectionString, postgresCaPem(connectionString)));
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
