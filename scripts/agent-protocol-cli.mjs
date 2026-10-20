#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRun,
  loadRun,
  saveRun,
  advanceState,
  recordGate,
  allGatesPassed,
} from "./lib/agent-protocol/run-state.mjs";
import { runAllGates, runGate } from "./lib/agent-protocol/gates.mjs";
import { validateLedger, appendLedger, readLedger } from "./lib/agent-protocol/ledger.mjs";
import { verifyProtocolCompletion } from "./lib/agent-protocol/verify-completion.mjs";
import { verifyPullRequest } from "./lib/agent-protocol/delivery.mjs";
import { STATES } from "./lib/agent-protocol/constants.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [cmd, ...rest] = process.argv.slice(2);

function arg(name) {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

async function main() {
  switch (cmd) {
    case "init": {
      const taskId = arg("--id") ?? `task-${Date.now()}`;
      const desc = arg("--desc") ?? "";
      createRun(root, { task_id: taskId, description: desc, branch: arg("--branch") });
      console.log(`agent-run iniciado: ${taskId}`);
      break;
    }
    case "advance": {
      const state = arg("--state");
      if (!state || !STATES.includes(state)) {
        console.error("Uso: advance --state EXISTENCIA_VERIFICADA");
        process.exit(1);
      }
      const run = loadRun(root);
      if (!run) {
        console.error("agent-run.json ausente");
        process.exit(1);
      }
      advanceState(run, state);
      saveRun(root, run);
      console.log(`estado: ${run.current_state}`);
      break;
    }
    case "gates": {
      const run = loadRun(root);
      const results = runAllGates(root);
      if (run) {
        for (const [name, result] of Object.entries(results)) recordGate(run, name, result);
        if (allGatesPassed(run)) advanceState(run, "TESTADO");
        saveRun(root, run);
      }
      const failed = Object.entries(results).find(([, r]) => r.status === "fail");
      if (failed) {
        console.error(`gate falhou: ${failed[0]}`);
        process.exit(1);
      }
      console.log("gates: OK");
      break;
    }
    case "gate": {
      const name = arg("--name");
      const r = runGate(name, root);
      console.log(JSON.stringify(r));
      process.exit(r.status === "pass" ? 0 : 1);
    }
    case "delivery-verify": {
      const run = loadRun(root);
      const d = await verifyPullRequest(root);
      if (run) {
        run.delivery = { ...run.delivery, ...d };
        if (d.pr_verified) advanceState(run, "ENTREGA_VERIFICADA");
        saveRun(root, run);
      }
      console.log(JSON.stringify(d, null, 2));
      if (!d.pr_verified) process.exit(1);
      break;
    }
    case "ledger-validate": {
      const v = validateLedger(root);
      if (!v.ok) {
        console.error(v.errors.join("\n"));
        process.exit(1);
      }
      console.log(`ledger OK (${v.count} entradas)`);
      break;
    }
    case "ledger-append": {
      const file = arg("--file");
      if (!file) {
        console.error("ledger-append --file entry.json");
        process.exit(1);
      }
      const { readFileSync } = await import("node:fs");
      const entry = JSON.parse(readFileSync(path.resolve(file), "utf8"));
      appendLedger(root, entry);
      const run = loadRun(root);
      if (run && run.task_id === entry.id) {
        advanceState(run, "REGISTRADO");
        saveRun(root, run);
      }
      console.log("ledger append OK");
      break;
    }
    case "verify": {
      const v = verifyProtocolCompletion(root);
      console.log(JSON.stringify(v, null, 2));
      process.exit(v.ok ? 0 : 1);
      break;
    }
    case "show": {
      console.log(JSON.stringify(loadRun(root), null, 2));
      break;
    }
    default:
      console.error(`Comandos: init | advance | gates | gate | delivery-verify | ledger-validate | ledger-append | verify | show`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
