import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { DatabaseSync, backup } from "node:sqlite";
import { envValue } from "../azure/config.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export interface SqliteTableCount {
  table: string;
  n: number;
}

export interface SqliteInventory {
  source: string;
  journalMode: string;
  integrity: string;
  walBytes: number | null;
  shmBytes: number | null;
  counts: SqliteTableCount[];
}

export function invokedAsCli(entry = process.argv[1], moduleUrl = import.meta.url): boolean {
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === moduleUrl;
}

/** Resolve o arquivo sem renomear o legado e sem abrir a migração do aplicativo. */
export function resolveSqliteSource(root = repoRoot): string {
  const configured = envValue("FOURQA_DB");
  if (configured) return path.resolve(configured);
  const current = path.join(root, "data", "fourqa.db");
  const legacy = path.join(root, "data", "motor_qa.db");
  if (fs.existsSync(current)) return current;
  if (fs.existsSync(legacy)) return legacy;
  throw new Error("Banco SQLite não encontrado");
}

export function assertBackupDestination(dest: string, root = repoRoot): string {
  const resolved = path.resolve(dest);
  const relative = path.relative(path.resolve(root), resolved);
  const insideRepo =
    relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
  if (insideRepo) throw new Error("O backup precisa ficar fora do repositório");
  if (!resolved.toLowerCase().endsWith(".db")) throw new Error("O destino do backup precisa terminar em .db");
  if (fs.existsSync(resolved)) throw new Error("O destino do backup já existe");
  return resolved;
}

function fileBytes(file: string): number | null {
  return fs.existsSync(file) ? fs.statSync(file).size : null;
}

function tableCounts(db: DatabaseSync): SqliteTableCount[] {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return tables.map((row) => {
    const table = String(row.name);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error("Nome de tabela SQLite não suportado");
    const count = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
    return { table, n: Number(count.n) };
  });
}

export function inventorySqlite(source: string): SqliteInventory {
  const resolved = path.resolve(source);
  if (!fs.existsSync(resolved)) throw new Error("Banco SQLite não encontrado");
  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    const mode = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    return {
      source: resolved,
      journalMode: mode.journal_mode,
      integrity: integrity.integrity_check,
      walBytes: fileBytes(`${resolved}-wal`),
      shmBytes: fileBytes(`${resolved}-shm`),
      counts: tableCounts(db),
    };
  } finally {
    db.close();
  }
}

export async function backupSqlite(source: string, dest: string, root = repoRoot): Promise<SqliteInventory> {
  const resolvedSource = path.resolve(source);
  const resolvedDest = assertBackupDestination(dest, root);
  if (path.resolve(resolvedSource) === resolvedDest) throw new Error("O destino do backup precisa ser outro arquivo");
  const before = fs.statSync(resolvedSource);
  const walPath = `${resolvedSource}-wal`;
  const walBefore = fileBytes(walPath);
  fs.mkdirSync(path.dirname(resolvedDest), { recursive: true });
  const db = new DatabaseSync(resolvedSource, { readOnly: true });
  try {
    await backup(db, resolvedDest);
  } catch (err) {
    fs.rmSync(resolvedDest, { force: true });
    throw err;
  } finally {
    db.close();
  }
  const after = fs.statSync(resolvedSource);
  if (after.size !== before.size || fileBytes(walPath) !== walBefore) {
    fs.rmSync(resolvedDest, { force: true });
    throw new Error("O backup alterou o arquivo SQLite original");
  }
  try {
    const report = inventorySqlite(resolvedDest);
    if (report.integrity !== "ok") throw new Error("PRAGMA integrity_check do backup falhou");
    return report;
  } catch (err) {
    fs.rmSync(resolvedDest, { force: true });
    throw err;
  }
}

function safeMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "falha no backup SQLite";
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***").replace(/password[=:]\s*\S+/gi, "password=***");
}

async function main(): Promise<void> {
  try {
    const source = resolveSqliteSource();
    if (process.argv.includes("--inventory")) {
      console.log(JSON.stringify(inventorySqlite(source)));
      return;
    }
    const destFlag = process.argv.indexOf("--dest");
    const dest = destFlag >= 0 ? process.argv[destFlag + 1] : "";
    if (!dest) {
      console.error("[db] informe --dest com um caminho fora do repositório");
      process.exitCode = 2;
      return;
    }
    console.log(JSON.stringify(await backupSqlite(source, dest)));
  } catch (err) {
    console.error(`[db] ${safeMessage(err)}`);
    process.exitCode = 1;
  }
}

if (invokedAsCli()) void main();
