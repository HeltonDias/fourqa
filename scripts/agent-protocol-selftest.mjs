#!/usr/bin/env node
/**
 * Cenários A–G do protocolo determinístico (sem rede obrigatória).
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createRun,
  loadRun,
  saveRun,
  advanceState,
  recordGate,
  shouldBlockCompletion,
  registerFailure,
  classifyAcceptance,
} from "./lib/agent-protocol/run-state.mjs";
import { validateLedger, appendLedger } from "./lib/agent-protocol/ledger.mjs";
import { verifyProtocolCompletion } from "./lib/agent-protocol/verify-completion.mjs";
import { runGateDry } from "./lib/agent-protocol/gates.mjs";

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), "fourqa-protocol-"));
}

function ledgerFile(root) {
  return path.join(root, ".cursor/docs/CHANGE_LEDGER.jsonl");
}

function runFile(root) {
  return path.join(root, ".cursor/agent-run.json");
}

function writeLedger(root, lines) {
  const p = ledgerFile(root);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, `${lines.join("\n")}\n`, "utf8");
}

console.log("agent-protocol-selftest...");

// A — já implementado: sem entrega
{
  const root = tempRoot();
  const run = createRun(root, {
    task_id: "A-demo",
    description: "pedido já atendido",
    code_changes_required: false,
  });
  run.acceptance = [{ id: "c1", text: "x", status: "JA_IMPLEMENTADO", evidence: ["test:foo"] }];
  run.no_delivery_required = true;
  advanceState(run, "CONTEXTO_VALIDADO");
  advanceState(run, "EXISTENCIA_VERIFICADA");
  saveRun(root, run);
  assert.equal(classifyAcceptance(run.acceptance), "JA_IMPLEMENTADO");
  const block = shouldBlockCompletion(run);
  assert.equal(block.block, true, "A: falta REGISTRADO/ledger");
  appendLedger(root, {
    id: "A-demo",
    description: "sem mudança",
    acceptance_criteria: ["c1"],
    before: "ok",
    after: "ok",
    files: [],
    tests: ["n/a"],
    decisions: [],
    status: "JA_IMPLEMENTADO",
    recorded_at: new Date().toISOString(),
  });
  advanceState(run, "REGISTRADO");
  saveRun(root, run);
  assert.equal(shouldBlockCompletion(run).block, false);
  rmSync(root, { recursive: true, force: true });
  console.log("  A OK");
}

// B — parcial
{
  const root = tempRoot();
  const run = createRun(root, { task_id: "B-demo", description: "parcial" });
  run.acceptance = [
    { id: "c1", text: "a", status: "JA_IMPLEMENTADO", evidence: [] },
    { id: "c2", text: "b", status: "PENDENTE", evidence: [] },
  ];
  saveRun(root, run);
  assert.equal(classifyAcceptance(run.acceptance), "PARCIAL");
  rmSync(root, { recursive: true, force: true });
  console.log("  B OK");
}

// C — falha de gate e revalidação
{
  const root = tempRoot();
  const run = createRun(root, { task_id: "C-demo", description: "gate retry" });
  recordGate(run, "typecheck", { status: "fail", command: "npm run typecheck", exit_code: 1, output_tail: "err" });
  registerFailure(run, "gate:typecheck", "codigo", "ts error");
  saveRun(root, run);
  assert.equal(run.failure_retries["gate:typecheck"], 1);
  recordGate(run, "typecheck", runGateDry("typecheck"));
  assert.equal(run.gates.typecheck.status, "pass");
  rmSync(root, { recursive: true, force: true });
  console.log("  C OK");
}

// D — push sem PR
{
  const root = tempRoot();
  const run = createRun(root, { task_id: "D-demo", description: "sem pr", branch: "feat/x" });
  for (const s of ["CONTEXTO_VALIDADO", "EXISTENCIA_VERIFICADA", "ESCOPO_DEFINIDO", "IMPLEMENTADO", "TESTADO", "REVISADO"]) {
    advanceState(run, s);
  }
  for (const g of ["typecheck", "test", "build", "test_agents"]) {
    recordGate(run, g, runGateDry(g));
  }
  run.delivery = { branch: "feat/x", pr_url: null, pr_verified: false, remote_checks: "missing" };
  saveRun(root, run);
  const block = shouldBlockCompletion(run);
  assert.equal(block.block, true);
  assert.match(block.reason, /PR/);
  rmSync(root, { recursive: true, force: true });
  console.log("  D OK");
}

// E — falha persistente
{
  const root = tempRoot();
  const run = createRun(root, { task_id: "E-demo", description: "blocked" });
  registerFailure(run, "gate:test", "teste", "fail 1");
  registerFailure(run, "gate:test", "teste", "fail 2");
  registerFailure(run, "gate:test", "teste", "fail 3");
  saveRun(root, run);
  assert.equal(run.current_state, "BLOQUEADO");
  const v = verifyProtocolCompletion(root);
  assert.equal(v.ok, false);
  rmSync(root, { recursive: true, force: true });
  console.log("  E OK");
}

// F — ledger inválido
{
  const root = tempRoot();
  writeLedger(root, ["{not-json"]);
  const v = validateLedger(root);
  assert.equal(v.ok, false);
  const verify = verifyProtocolCompletion(root);
  assert.equal(verify.ok, false);
  rmSync(root, { recursive: true, force: true });
  console.log("  F OK");
}

// G — pedidos distintos (IDs diferentes)
{
  const root = tempRoot();
  appendLedger(root, {
    id: "G1",
    description: "feature auth bearer",
    acceptance_criteria: ["auth"],
    before: "a",
    after: "b",
    files: ["api.ts"],
    tests: ["t1"],
    decisions: [],
    status: "entregue",
    recorded_at: new Date().toISOString(),
  });
  appendLedger(root, {
    id: "G2",
    description: "feature auth oauth",
    acceptance_criteria: ["oauth"],
    before: "c",
    after: "d",
    files: ["oauth.ts"],
    tests: ["t2"],
    decisions: [],
    status: "entregue",
    recorded_at: new Date().toISOString(),
  });
  const entries = readFileSync(ledgerFile(root), "utf8").trim().split("\n");
  assert.equal(entries.length, 2);
  rmSync(root, { recursive: true, force: true });
  console.log("  G OK");
}

console.log("agent-protocol-selftest: OK");
