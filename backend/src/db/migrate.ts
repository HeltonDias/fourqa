import type { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 7;

const MIGRATIONS: { version: number; up: (db: DatabaseSync) => void }[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS execucoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_key TEXT,
          plan_id INTEGER,
          plan_name TEXT,
          frente TEXT,
          atalho TEXT,
          processo TEXT,
          suite_id INTEGER,
          suite_name TEXT,
          test_point_id INTEGER,
          test_case_id INTEGER,
          test_case_title TEXT,
          responsabilidade TEXT,
          test_case_state TEXT,
          test_point_state TEXT,
          outcome TEXT,
          date_completed TEXT,
          run_by TEXT,
          last_updated_date TEXT,
          last_test_run_id INTEGER,
          last_result_id INTEGER,
          test_case_link TEXT,
          test_case_tags TEXT
        );
        CREATE TABLE IF NOT EXISTS falhas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_key TEXT,
          responsavel TEXT,
          ambiente TEXT,
          categoria TEXT,
          bug_id INTEGER,
          impacto REAL,
          frente TEXT,
          titulo TEXT,
          status TEXT,
          criacao TEXT,
          fechamento TEXT,
          links TEXT,
          tags TEXT
        );
        CREATE TABLE IF NOT EXISTS planejamento_linhas (
          row_num INTEGER PRIMARY KEY,
          qa TEXT,
          prioridades TEXT,
          frente TEXT,
          processo TEXT,
          data_inicio TEXT,
          data_fim TEXT,
          replanejamento REAL,
          qtd_cts_plan REAL,
          cts_plan_dia REAL,
          cts_cancelados REAL
        );
        CREATE TABLE IF NOT EXISTS workbook_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);
      indexIf(db, "idx_exec_plan", "execucoes", ["plan_key"]);
      indexIf(db, "idx_exec_suite", "execucoes", ["suite_name"]);
      indexIf(db, "idx_falhas_plan", "falhas", ["plan_key"]);
      indexIf(db, "idx_falhas_frente", "falhas", ["frente"]);
    },
  },
  {
    version: 2,
    up: (db) => {
      const add = (table: string, column: string, type: string) => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      };
      add("execucoes", "parent_suite_id", "INTEGER");
      add("execucoes", "suite_depth", "INTEGER");
      add("execucoes", "suite_path", "TEXT");
      add("execucoes", "dimensions_json", "TEXT");
      indexIf(db, "idx_exec_point", "execucoes", ["plan_key", "test_point_id"]);
    },
  },
  {
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS planning (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_key TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS planning_revision (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          planning_id INTEGER NOT NULL,
          version INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          reason TEXT NOT NULL,
          baseline_origin TEXT NOT NULL,
          scope_snapshot INTEGER NOT NULL DEFAULT 0,
          UNIQUE (planning_id, version)
        );
        CREATE TABLE IF NOT EXISTS planning_item (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          revision_id INTEGER NOT NULL,
          suite_id INTEGER,
          suite_name TEXT,
          planned_start TEXT,
          planned_end TEXT,
          baseline_quantity REAL
        );
        CREATE TABLE IF NOT EXISTS planning_scope_item (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          revision_id INTEGER NOT NULL,
          plan_id INTEGER,
          suite_id INTEGER,
          test_point_id INTEGER,
          test_case_id INTEGER,
          label TEXT
        );
        CREATE TABLE IF NOT EXISTS planning_allocation (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          alloc_date TEXT NOT NULL,
          planned_quantity REAL NOT NULL,
          UNIQUE (item_id, alloc_date)
        );
      `);
      indexIf(db, "idx_plan_rev", "planning_revision", ["planning_id", "version"]);
      indexIf(db, "idx_plan_item_rev", "planning_item", ["revision_id"]);
      indexIf(db, "idx_plan_scope_rev", "planning_scope_item", ["revision_id", "test_point_id"]);
      indexIf(db, "idx_plan_alloc_item", "planning_allocation", ["item_id", "alloc_date"]);
    },
  },
  {
    version: 4,
    up: (db) => {
      db.prepare("UPDATE workbook_meta SET value = ? WHERE key = 'data_inicio' AND value = ?").run(
        "2026-08-03",
        "0939-08-03",
      );
    },
  },
  {
    version: 5,
    up: (db) => {
      const existing = db
        .prepare("SELECT value FROM workbook_meta WHERE key = ?")
        .get("planejamento_legado_plan_key") as { value: string } | undefined;
      if (existing?.value?.trim()) return;
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'planejamento_linhas'")
        .get() as { name: string } | undefined;
      if (!table) return;
      const count = db.prepare("SELECT COUNT(*) AS n FROM planejamento_linhas").get() as { n: number };
      if (count.n === 0) return;
      // Dado do banco já importado desta instalação, não fallback da regra de planejamento.
      db.prepare("INSERT INTO workbook_meta (key, value) VALUES (?, ?)").run(
        "planejamento_legado_plan_key",
        "EndToEnd",
      );
    },
  },
  {
    version: 6,
    up: (db) => {
      const cols = db.prepare("PRAGMA table_info(planning_item)").all() as { name: string }[];
      if (cols.length === 0) return;
      const add = (column: string) => {
        if (!cols.some((entry) => entry.name === column)) {
          db.exec(`ALTER TABLE planning_item ADD COLUMN ${column} INTEGER`);
        }
      };
      add("test_point_id");
      add("test_case_id");
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item_suite
         ON planning_item (revision_id, suite_id) WHERE suite_id IS NOT NULL`,
      );
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item_point
         ON planning_item (revision_id, test_point_id) WHERE suite_id IS NULL AND test_point_id IS NOT NULL`,
      );
    },
  },
  {
    version: 7,
    up: (db) => {
      const cols = db.prepare("PRAGMA table_info(planning_item)").all() as { name: string }[];
      if (cols.length === 0) return;
      const add = (column: string) => {
        if (!cols.some((entry) => entry.name === column)) {
          db.exec(`ALTER TABLE planning_item ADD COLUMN ${column} TEXT`);
        }
      };
      add("responsavel");
      add("prioridade");
    },
  },
];

function indexIf(db: DatabaseSync, name: string, table: string, columns: string[]): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const present = new Set(cols.map((c) => c.name));
  if (!columns.every((column) => present.has(column))) return;
  db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${columns.join(", ")})`);
}

function ensureHierarchyColumns(db: DatabaseSync): void {
  const cols = db.prepare("PRAGMA table_info(execucoes)").all() as { name: string }[];
  if (cols.length === 0) return;
  const add = (column: string, type: string) => {
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE execucoes ADD COLUMN ${column} ${type}`);
  };
  add("parent_suite_id", "INTEGER");
  add("suite_depth", "INTEGER");
  add("suite_path", "TEXT");
  add("dimensions_json", "TEXT");
  indexIf(db, "idx_exec_point", "execucoes", ["plan_key", "test_point_id"]);
}

export function migrate(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const current =
    (db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null }).v ?? 0;
  const insert = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      insert.run(migration.version, new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  // A importação legada recria as tabelas sem as colunas novas e sem baixar a versão.
  ensureHierarchyColumns(db);
}

export function schemaVersion(db: DatabaseSync): number {
  try {
    const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}
