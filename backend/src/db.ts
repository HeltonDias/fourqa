import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecucaoRow, FalhaRow, PlanejamentoLinha } from "./types.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultDb = path.join(rootDir, "data", "motor_qa.db");

let db: DatabaseSync | null = null;

export function getDbPath(): string {
  return process.env.MOTOR_QA_DB ?? defaultDb;
}

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(getDbPath(), { allowExtension: false });
    db.exec("PRAGMA journal_mode = WAL;");
  }
  return db;
}

export function dbReady(): boolean {
  try {
    const d = getDb();
    d.prepare("SELECT 1 FROM sqlite_master WHERE name = 'execucoes'").get();
    return true;
  } catch {
    return false;
  }
}

export function getMeta(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM workbook_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function listExecucoes(planKey?: string, limit = 5000): ExecucaoRow[] {
  const sql = planKey
    ? "SELECT * FROM execucoes WHERE plan_key = ? ORDER BY id LIMIT ?"
    : "SELECT * FROM execucoes ORDER BY id LIMIT ?";
  const stmt = getDb().prepare(sql);
  return (planKey ? stmt.all(planKey, limit) : stmt.all(limit)) as ExecucaoRow[];
}

export function listFalhas(planKey?: string, limit = 10000): FalhaRow[] {
  const sql = planKey
    ? "SELECT * FROM falhas WHERE plan_key = ? ORDER BY id LIMIT ?"
    : "SELECT * FROM falhas ORDER BY id LIMIT ?";
  const stmt = getDb().prepare(sql);
  return (planKey ? stmt.all(planKey, limit) : stmt.all(limit)) as FalhaRow[];
}

export function listPlanejamentoBase(): Omit<
  PlanejamentoLinha,
  | "cts_passeds"
  | "cts_na"
  | "cts_falhados"
  | "cts_bloqueados"
  | "cts_liberados"
  | "cts_design"
  | "cts_nao_liberados"
  | "total_realizado"
>[] {
  return getDb()
    .prepare(
      `SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim,
              replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados
       FROM planejamento_linhas ORDER BY row_num`,
    )
    .all() as Omit<
    PlanejamentoLinha,
    | "cts_passeds"
    | "cts_na"
    | "cts_falhados"
    | "cts_bloqueados"
    | "cts_liberados"
    | "cts_design"
    | "cts_nao_liberados"
    | "total_realizado"
  >[];
}
