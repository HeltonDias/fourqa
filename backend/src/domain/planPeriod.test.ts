import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPlanningPeriod,
  calendarDaySpanInclusive,
  parseCalendarDay,
  PlanningPeriodError,
  PLAN_PERIOD_MAX_DAYS,
} from "./planPeriod.js";

describe("planPeriod", () => {
  it("aceita 2026-08-03 → 2026-09-25", () => {
    const p = assertPlanningPeriod("2026-08-03", "2026-09-25");
    assert.equal(p.inicio, "2026-08-03");
    assert.equal(p.fim, "2026-09-25");
    assert.equal(calendarDaySpanInclusive(p.inicio, p.fim), 54);
  });

  it("rejeita 0939-08-03 → 2026-09-25", () => {
    assert.equal(parseCalendarDay("0939-08-03"), null);
    assert.throws(() => assertPlanningPeriod("0939-08-03", "2026-09-25"), PlanningPeriodError);
  });

  it("rejeita início maior que fim", () => {
    assert.throws(() => assertPlanningPeriod("2026-09-25", "2026-08-03"), PlanningPeriodError);
  });

  it("rejeita intervalo exageradamente grande", () => {
    const ref = new Date("2026-06-15T12:00:00Z");
    const y = ref.getUTCFullYear();
    const start = `${y}-01-01`;
    const endYear = y + Math.floor(PLAN_PERIOD_MAX_DAYS / 365) + 2;
    const end = `${endYear}-12-31`;
    assert.throws(() => assertPlanningPeriod(start, end, ref), PlanningPeriodError);
  });

  it("rejeita ano anterior ao corrente", () => {
    const ref = new Date("2026-06-15T12:00:00Z");
    assert.equal(parseCalendarDay("2025-08-03", ref), null);
    assert.throws(() => assertPlanningPeriod("2025-08-03", "2026-09-25", ref), PlanningPeriodError);
  });
});
