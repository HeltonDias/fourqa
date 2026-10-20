#!/usr/bin/env node
/** Critérios de aceite: orquestração adaptativa e tokens. */
import assert from "node:assert/strict";
import { classifyTask } from "./lib/agent-protocol/classify.mjs";
import { delegationPlan } from "./lib/agent-protocol/orchestration.mjs";
import { gatesForTier } from "./lib/agent-protocol/gates.mjs";
import { ledgerTail } from "./lib/agent-protocol/ledger-query.mjs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

console.log("agent-orchestration-selftest...");

// 1 — N1 sem subagentes
{
  const d = delegationPlan("N1");
  assert.equal(d.impact_analyst, false);
  assert.equal(d.qa_verifier, false);
  console.log("  1 N1 sem delegação OK");
}

// 2 — N3 com verificações
{
  const d = delegationPlan("N3");
  assert.equal(d.impact_analyst, true);
  assert.equal(d.qa_verifier, true);
  const release = gatesForTier("N3", "release");
  assert.deepEqual(release, ["typecheck", "test", "build", "test_agents"]);
  console.log("  2 N3 delegação + release gates OK");
}

// 3 — ledger seletivo
{
  const root = mkdtempSync(path.join(tmpdir(), "fourqa-orch-"));
  const p = path.join(root, ".cursor/docs/CHANGE_LEDGER.jsonl");
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    `${JSON.stringify({ id: "a1", description: "x", acceptance_criteria: [], before: "", after: "", files: [], tests: [], decisions: [], status: "ok", recorded_at: "t" })}\n${JSON.stringify({ id: "b2", description: "y", acceptance_criteria: [], before: "", after: "", files: [], tests: [], decisions: [], status: "ok", recorded_at: "t" })}\n`,
  );
  const tail = ledgerTail(root, { limit: 1 });
  assert.equal(tail.length, 1);
  assert.equal(tail[0].id, "b2");
  const byPrefix = ledgerTail(root, { idPrefix: "a", limit: 10 });
  assert.equal(byPrefix.length, 1);
  rmSync(root, { recursive: true, force: true });
  console.log("  3 ledger-tail OK");
}

// 4 — falha localizada: iterate < release
{
  const iter = gatesForTier("N1", "iterate");
  const rel = gatesForTier("N1", "release");
  assert.ok(iter.length < rel.length);
  console.log("  4 gates progressivos OK");
}

// 5 — release não enfraquecido
{
  assert.deepEqual(gatesForTier("N1", "release"), ["typecheck", "test", "build", "test_agents"]);
  console.log("  5 release = CI completo OK");
}

// 6 — N0 já implementado
{
  const { tier } = classifyTask({ already_implemented: true });
  assert.equal(tier, "N0");
  assert.deepEqual(gatesForTier("N0", "iterate"), []);
  console.log("  6 N0 OK");
}

// 7 — pedidos distintos (classificação)
{
  const a = classifyTask({ cross_module: false });
  const b = classifyTask({ domain_formula: true });
  assert.notEqual(a.tier, b.tier);
  console.log("  7 classificação distinta OK");
}

console.log("agent-orchestration-selftest: OK");
