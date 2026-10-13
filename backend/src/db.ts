import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, SCHEMA_VERSION, schemaVersion } from "./db/migrate.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultDb = path.join(rootDir, "data", "fourqa.db");
/** Legado: banco já criado com o nome anterior. Adotado só quando fourqa.db ainda não existe. */
const legacyDefaultDb = path.join(rootDir, "data", "motor_qa.db");

let db: DatabaseSync | null = null;

function configuredDbPath(): string {
  return process.env.FOURQA_DB?.trim() || "";
}

/** Move o arquivo legado para o caminho novo. Se estiver em uso, devolve o caminho antigo nesta abertura. */
export function adoptRenamedDatabase(target: string, legacy: string, explicitPath: boolean): string {
  if (explicitPath || fs.existsSync(target) || !fs.existsSync(legacy)) return target;
  try {
    fs.renameSync(legacy, target);
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const from = `${legacy}${suffix}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${target}${suffix}`);
    }
    return target;
  } catch {
    return legacy;
  }
}

export function getDbPath(): string {
  const configured = configuredDbPath();
  if (configured) return configured;
  return adoptRenamedDatabase(defaultDb, legacyDefaultDb, false);
}

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(getDbPath(), { allowExtension: false });
    db.exec("PRAGMA journal_mode = WAL;");
    migrate(db);
  }
  return db;
}

export function dbReady(): boolean {
  try {
    return schemaVersion(getDb()) >= SCHEMA_VERSION;
  } catch {
    return false;
  }
}

export { parsePageQuery } from "./http/pageQuery.js";
