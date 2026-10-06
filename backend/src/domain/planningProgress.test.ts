import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecucaoRow } from "../types.js";
import {
  planejadoVsRealizadoFromAllocations,
  situacaoProgresso,
  snapshotProgresso,
  sumAllocationsByDay,
} from "./planningProgress.js";

const PERIODO = { inicio: "2026-08-03", fim: "2026-08-06" };
const PLAN = "test-plan";

function execCompleted(day: string, id: number): ExecucaoRow {
  return {
    plan_key: PLAN,
    outcome: "Passed",
    test_case_state: "Ready",
    test_point_state: "Completed",
    date_completed: `${day}T15:00:00Z`,
    last_updated_date: null,
    row_num: id,
    suite_id: 1,
    suite_name: "S",
    test_point_id: id,
    test_case_id: id,
    test_case_title: "T",
    processo: "P",
    frente: "F",
    dimensions_json: null,
    plan_id: 1,
  } as ExecucaoRow;
}

describe("planningProgress", () => {
  it("soma allocations por dia", () => {
    const map = sumAllocationsByDay([
      { "2026-08-03": 100, "2026-08-04": 5 },
      { "2026-08-03": 95 },
    ]);
    assert.equal(map.get("2026-08-03"), 195);
    assert.equal(map.get("2026-08-04"), 5);
  });

  it("calcula acumulados por dia útil a partir da distribuição", () => {
    const plan = new Map<string, number>([
      ["2026-08-03", 195],
      ["2026-08-04", 16],
      ["2026-08-05", 37],
      ["2026-08-06", 26],
    ]);
    const execs = [
      execCompleted("2026-08-03", 1),
      ...Array.from({ length: 171 }, (_, i) => execCompleted("2026-08-03", 10 + i)),
      ...Array.from({ length: 20 }, (_, i) => execCompleted("2026-08-04", 200 + i)),
    ];
    const serie = planejadoVsRealizadoFromAllocations(plan, execs, PLAN, PERIODO, new Date("2026-08-06T12:00:00Z"));
    assert.equal(serie.length, 4);
    assert.equal(serie[0].planejadoDia, 195);
    assert.equal(serie[0].planejado, 195);
    assert.equal(serie[1].planejado, 211);
    assert.equal(serie[2].planejado, 248);
    assert.equal(serie[3].planejado, 274);
    assert.equal(serie[3].realizado, 192);
  });

  it("situação compara acumulado realizado x planejado", () => {
    assert.equal(situacaoProgresso(100, 104), "adiantado");
    assert.equal(situacaoProgresso(100, 100), "dentro");
    assert.equal(situacaoProgresso(100, 90), "atrasado");
  });

  it("snapshot até hoje usa último dia útil não futuro", () => {
    const serie = planejadoVsRealizadoFromAllocations(
      new Map([["2026-08-03", 10], ["2026-08-04", 10]]),
      [],
      PLAN,
      PERIODO,
      new Date("2026-08-04T12:00:00Z"),
    );
    const snap = snapshotProgresso(serie, new Date("2026-08-04T12:00:00Z"));
    assert.ok(snap);
    assert.equal(snap!.planejadoAteHoje, 20);
    assert.equal(snap!.realizadoAteHoje, 0);
    assert.equal(snap!.situacao, "atrasado");
  });
});
