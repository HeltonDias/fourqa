import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanningConflictError } from "./planningConflict.js";
import { sqliteMetaStore } from "../db/sqliteMetaStore.js";

describe("meta concorrente", () => {
  it("cabeçalho com base divergente responde conflito", () => {
    sqliteMetaStore.setMany({ cabecalho_titulo: "T0", cabecalho_subtitulo: "S0" });
    sqliteMetaStore.replaceHeaderIf!("T0", "S0", "T1", "S0", "STATUS REPORT QA", "Sub");
    assert.equal(sqliteMetaStore.get("cabecalho_titulo"), "T1");
    assert.throws(
      () => sqliteMetaStore.replaceHeaderIf!("T0", "S0", "T2", "S0", "STATUS REPORT QA", "Sub"),
      (err: unknown) => err instanceof PlanningConflictError,
    );
  });

  it("período com base divergente responde conflito", () => {
    sqliteMetaStore.setMany({ data_inicio: "2026-10-01", data_fim: "2026-10-31" });
    sqliteMetaStore.replacePeriodIf!("2026-10-01", "2026-10-31", "2026-11-01", "2026-11-30");
    assert.throws(
      () => sqliteMetaStore.replacePeriodIf!("2026-10-01", "2026-10-31", "2026-12-01", "2026-12-31"),
      (err: unknown) => err instanceof PlanningConflictError,
    );
  });
});
