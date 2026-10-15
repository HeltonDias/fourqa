import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASE_PRIORITY_REFERENCE, readCasePriority } from "./execucoes.js";
import type { TestPoint } from "./types.js";

function point(value: unknown): TestPoint {
  return {
    workItemProperties: [{ workItem: { key: CASE_PRIORITY_REFERENCE, value } }],
  } as TestPoint;
}

describe("prioridade do Test Case", () => {
  it("lê o valor da integração e não inventa quando falta", () => {
    assert.equal(readCasePriority(point(2)), "2");
    assert.equal(readCasePriority(point("")), null);
    assert.equal(readCasePriority({ workItemProperties: [] } as TestPoint), null);
    const source = readFileSync(new URL("./execucoes.ts", import.meta.url), "utf8");
    assert.match(source, new RegExp(CASE_PRIORITY_REFERENCE.replaceAll(".", "\\.")));
  });

  it("não entra nas colunas persistidas de execuções", () => {
    const sqlite = readFileSync(new URL("../db/sqliteAzureSnapshotStore.ts", import.meta.url), "utf8");
    const postgres = readFileSync(new URL("../db/postgres/postgresAzureSnapshotStore.ts", import.meta.url), "utf8");
    const baseline = readFileSync(new URL("../db/postgres/migrations/001_baseline.sql", import.meta.url), "utf8");
    const fill = readFileSync(new URL("../db/postgres/migrations/003_plan_suite_fill.sql", import.meta.url), "utf8");
    assert.equal(sqlite.includes("case_priority"), false);
    assert.equal(postgres.includes("case_priority"), false);
    assert.equal(baseline.includes("case_priority"), false);
    assert.equal(fill.includes("case_priority"), false);
  });
});
