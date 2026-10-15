import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXPECTED_TABLES, formatPreflight, formatVerify, inspectPreflight, inspectVerify } from "./schemaAudit.js";
import type { DbQuery } from "./migrate.js";

const BASE_COLUMNS = ["id", "revision_id", "suite_id", "suite_name", "planned_start", "planned_end", "baseline_quantity"];
const FINAL_COLUMNS = [...BASE_COLUMNS, "test_point_id", "test_case_id", "responsavel", "prioridade"];

function queryOf(input: {
  versions?: number[] | null;
  columns?: string[];
  indexes?: string[];
  suiteConflicts?: { revision_id: number; suite_id: number; n: number }[];
  pointConflicts?: { revision_id: number; test_point_id: number; n: number }[];
  tables?: string[];
  constraints?: { table_name: string; contype: string; def: string }[];
  failProbe?: boolean;
}): DbQuery {
  const tables = input.tables ?? [...EXPECTED_TABLES];
  return async (sql: string) => {
    if (sql.startsWith("SAVEPOINT") || sql.startsWith("RELEASE") || sql.startsWith("ROLLBACK TO")) return { rows: [] };
    if (sql.includes("pg_tables")) return { rows: tables.map((tablename) => ({ tablename })) };
    if (sql.includes("FROM schema_migrations")) return { rows: (input.versions ?? []).map((version) => ({ version })) };
    if (sql.includes("information_schema.columns")) {
      return { rows: (input.columns ?? []).map((column_name) => ({ column_name })) };
    }
    if (sql.includes("pg_indexes")) return { rows: (input.indexes ?? []).map((indexname) => ({ indexname })) };
    if (sql.includes("suite_id IS NOT NULL")) return { rows: input.suiteConflicts ?? [] };
    if (sql.includes("test_point_id IS NOT NULL")) return { rows: input.pointConflicts ?? [] };
    if (sql.includes("COUNT(*)")) return { rows: [{ n: 0 }] };
    if (sql.includes("pg_constraint")) return { rows: input.constraints ?? [] };
    if (input.failProbe && sql.includes("FROM planning_item WHERE")) throw new Error("coluna ausente");
    return { rows: [] };
  };
}

const finalConstraints = [
  { table_name: "planning_revision", contype: "f", def: "FOREIGN KEY (planning_id) REFERENCES planning(id)" },
  { table_name: "planning_item", contype: "f", def: "FOREIGN KEY (revision_id) REFERENCES planning_revision(id)" },
  { table_name: "planning_scope_item", contype: "f", def: "FOREIGN KEY (revision_id) REFERENCES planning_revision(id)" },
  { table_name: "planning_allocation", contype: "f", def: "FOREIGN KEY (item_id) REFERENCES planning_item(id)" },
  { table_name: "planning", contype: "u", def: "UNIQUE (plan_key)" },
  { table_name: "planning_revision", contype: "u", def: "UNIQUE (planning_id, version)" },
  { table_name: "planning_allocation", contype: "u", def: "UNIQUE (item_id, alloc_date)" },
  ...EXPECTED_TABLES.map((table) => ({ table_name: table, contype: "p", def: "PRIMARY KEY (id)" })),
];

describe("preflight e verify", () => {
  it("mostra a versão 1 sem tratar ausência de 002 e 003 como erro", async () => {
    const report = await inspectPreflight(queryOf({
      versions: [1],
      columns: BASE_COLUMNS,
      indexes: ["idx_plan_item_rev"],
    }));
    assert.equal(report.precheck, "PASS");
    const text = formatPreflight(report);
    assert.match(text, /versions = \[1\]/);
    assert.match(text, /expected = 3/);
    assert.match(text, /pending = \[2,3\]/);
    assert.match(text, /responsavel = ausente/);
    assert.match(text, /prioridade = ausente/);
    assert.match(text, /test_point_id = ausente/);
    assert.match(text, /suite_conflicts = 0/);
    assert.match(text, /point_conflicts = 0/);
    assert.equal(text.includes("postgres://"), false);
  });

  it("falha o precheck quando há duplicidade ou lacuna", async () => {
    const duplicated = await inspectPreflight(queryOf({
      versions: [1],
      columns: [...BASE_COLUMNS, "test_point_id"],
      suiteConflicts: [{ revision_id: 9, suite_id: 10, n: 2 }],
      pointConflicts: [{ revision_id: 9, test_point_id: 77, n: 3 }],
    }));
    assert.equal(duplicated.precheck, "FAIL");
    const text = formatPreflight(duplicated);
    assert.match(text, /suite_conflict revision_id=9 suite_id=10 count=2/);
    assert.match(text, /point_conflict revision_id=9 test_point_id=77 count=3/);

    const gap = await inspectPreflight(queryOf({ versions: [1, 3], columns: BASE_COLUMNS }));
    assert.equal(gap.precheck, "FAIL");
    assert.match(formatPreflight(gap), /inconsistente \(\[1,3\]\)/);
  });

  it("aceita o schema final e recusa tabela ou consulta ausente", async () => {
    const ready = await inspectVerify(queryOf({
      versions: [1, 2, 3],
      columns: FINAL_COLUMNS,
      indexes: ["idx_plan_item_rev", "uq_plan_item_suite", "uq_plan_item_point"],
      constraints: finalConstraints,
    }));
    assert.equal(ready.verify, "PASS");
    assert.match(formatVerify(ready), /VERIFY = PASS/);
    assert.match(formatVerify(ready), /pending = \[\]/);

    const broken = await inspectVerify(queryOf({
      versions: [1, 2, 3],
      columns: FINAL_COLUMNS,
      indexes: ["uq_plan_item_suite", "uq_plan_item_point"],
      constraints: finalConstraints,
      tables: EXPECTED_TABLES.filter((table) => table !== "execucoes"),
      failProbe: true,
    }));
    assert.equal(broken.verify, "FAIL");
    const text = formatVerify(broken);
    assert.match(text, /tabela ausente: execucoes/);
    assert.match(text, /consulta de schema falhou: planning_item/);
  });

  it("falha quando uma tabela esperada não existe", async () => {
    const report = await inspectPreflight(queryOf({
      versions: [1],
      columns: BASE_COLUMNS,
      indexes: ["idx_plan_item_rev"],
      tables: EXPECTED_TABLES.filter((table) => table !== "execucoes"),
    }));
    assert.equal(report.precheck, "FAIL");
    assert.equal(report.counts.execucoes, "ausente");
    const text = formatPreflight(report);
    assert.match(text, /tabela ausente: execucoes/);
    assert.match(text, /count execucoes = ausente/);
    assert.match(text, /versions = \[1\]/);
    assert.equal(text.split("tabela ausente: execucoes").length, 2);
  });

  it("não trata ledger ausente com tabelas FourQA como banco novo", async () => {
    const report = await inspectPreflight(queryOf({
      tables: ["planning", "planning_item", "execucoes"],
      columns: BASE_COLUMNS,
    }));
    assert.equal(report.precheck, "FAIL");
    assert.deepEqual(report.pending, []);
    assert.equal(report.counts.schema_migrations, "ausente");
    const text = formatPreflight(report);
    assert.match(text, /schema_migrations ausente com tabelas FourQA já existentes/);
    assert.equal(text.includes("tabela ausente: schema_migrations"), false);
    assert.match(text, /tabela ausente: workbook_meta/);
    assert.equal(text.includes("pending = [1,2,3]"), false);
  });
});
