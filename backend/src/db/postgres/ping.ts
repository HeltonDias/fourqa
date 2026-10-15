import path from "node:path";
import { pathToFileURL } from "node:url";
import { getPool } from "./pool.js";

export const PING_SQL = "SELECT 1 AS connected";

const safeConfigErrors = new Set([
  "DATABASE_URL is required when DB_PROVIDER=postgres",
  "DATABASE_URL inválida",
  "sslmode da DATABASE_URL não é suportado",
  "parâmetro ssl da DATABASE_URL não é suportado",
  "Certificado CA do PostgreSQL não pôde ser lido",
  "Certificado CA do PostgreSQL não está em PEM",
  "resultado inesperado do ping",
]);

export interface PostgresPingClient {
  query(sql: string): Promise<{ rows: Array<{ connected?: unknown }> }>;
  end(): Promise<void>;
}

export function invokedAsCli(entry = process.argv[1], moduleUrl = import.meta.url): boolean {
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === moduleUrl;
}

function errorCode(err: unknown): string {
  if (typeof err !== "object" || err === null || !("code" in err)) return "";
  const code = err.code;
  return typeof code === "string" ? code : "";
}

/** Mensagem fixa. Não devolve URI, usuário, hostname, senha nem token. */
export function safePingMessage(err: unknown): string {
  if (err instanceof Error && safeConfigErrors.has(err.message)) return err.message;
  const code = errorCode(err);
  if (
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "CERT_HAS_EXPIRED" ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID"
  ) {
    return "falha ao verificar o certificado TLS";
  }
  if (code === "28P01" || code === "28000") return "falha de autenticação";
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EAI_AGAIN") {
    return "não foi possível conectar ao PostgreSQL";
  }
  const message = err instanceof Error ? err.message : "";
  if (/certificate|self[- ]signed|unable to verify/i.test(message)) return "falha ao verificar o certificado TLS";
  if (/password authentication failed|authentication failed/i.test(message)) return "falha de autenticação";
  if (message === "encerrar") return "falha ao encerrar a conexão";
  return "falha na conexão PostgreSQL";
}

export async function runPostgresPing(db: PostgresPingClient): Promise<void> {
  let failure: unknown;
  try {
    const result = await db.query(PING_SQL);
    if (Number(result.rows[0]?.connected) !== 1) failure = new Error("resultado inesperado do ping");
  } catch (err) {
    failure = err;
  }
  try {
    await db.end();
  } catch {
    if (!failure) failure = new Error("encerrar");
  }
  if (failure) throw failure;
}

async function main(): Promise<void> {
  try {
    const pool = getPool();
    await runPostgresPing({
      query: (sql) => pool.query(sql),
      end: () => pool.end(),
    });
    console.log("[db] PostgreSQL respondeu");
  } catch (err) {
    console.error(`[db] ${safePingMessage(err)}`);
    process.exitCode = 1;
  }
}

if (invokedAsCli()) void main();
