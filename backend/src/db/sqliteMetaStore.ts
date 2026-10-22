import { getDb } from "../db.js";
import type { MetaStore } from "../persistence/contracts.js";
import { PlanningConflictError } from "../persistence/planningConflict.js";

/** Lê uma chave de workbook_meta. Chave ausente devolve null. */
export function get(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM workbook_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** Cria ou substitui o valor da chave. O store não interpreta o conteúdo. */
export function set(key: string, value: string): void {
  getDb().prepare("INSERT OR REPLACE INTO workbook_meta (key, value) VALUES (?, ?)").run(key, value);
}

export function setMany(entries: Record<string, string>): void {
  const db = getDb();
  const stmt = db.prepare("INSERT OR REPLACE INTO workbook_meta (key, value) VALUES (?, ?)");
  db.exec("BEGIN");
  try {
    for (const [key, value] of Object.entries(entries)) stmt.run(key, value);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function replaceHeaderIf(
  expectedTitle: string,
  expectedSubtitle: string,
  title: string,
  subtitle: string,
  defaultTitle: string,
  defaultSubtitle: string,
): void {
  const effectiveTitle = (get("cabecalho_titulo") ?? get("title") ?? defaultTitle).trim();
  const effectiveSubtitle = (get("cabecalho_subtitulo") ?? defaultSubtitle).trim();
  if (effectiveTitle !== expectedTitle.trim() || effectiveSubtitle !== expectedSubtitle.trim()) {
    throw new PlanningConflictError(PlanningConflictError.headerChanged);
  }
  setMany({ cabecalho_titulo: title.trim(), cabecalho_subtitulo: subtitle.trim() });
}

function replacePeriodIf(expectedInicio: string, expectedFim: string, inicio: string, fim: string): void {
  const currentInicio = get("data_inicio") ?? "";
  const currentFim = get("data_fim") ?? "";
  if (currentInicio !== expectedInicio || currentFim !== expectedFim) {
    throw new PlanningConflictError(PlanningConflictError.periodChanged);
  }
  setMany({ data_inicio: inicio, data_fim: fim });
}

export const sqliteMetaStore = {
  get,
  set,
  setMany,
  replaceHeaderIf,
  replacePeriodIf,
} satisfies MetaStore;
