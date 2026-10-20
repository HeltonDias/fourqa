import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { RUN_FILE, STATES, TERMINAL_STATES, MAX_FAILURE_RETRIES } from "./constants.mjs";

export function runFilePath(root) {
  return path.join(root, RUN_FILE);
}

export function loadRun(root) {
  const p = runFilePath(root);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function saveRun(root, data) {
  const p = runFilePath(root);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function createRun(root, task) {
  const now = new Date().toISOString();
  const data = {
    task_id: task.task_id,
    description: task.description,
    started_at: now,
    updated_at: now,
    current_state: "RECEBIDO",
    states_completed: ["RECEBIDO"],
    acceptance: task.acceptance ?? [],
    gates: {},
    delivery: {
      branch: task.branch ?? null,
      pr_url: null,
      pr_verified: false,
      remote_checks: "unknown",
    },
    failure_retries: {},
    last_failure: null,
    blocked: null,
    code_changes_required: task.code_changes_required ?? true,
    tier: task.tier ?? null,
    tier_reasons: task.tier_reasons ?? [],
    delegation: task.delegation ?? null,
    delegation_done: {},
    release_gates_passed: false,
    efficiency: task.efficiency ?? null,
  };
  saveRun(root, data);
  return data;
}

export function advanceState(run, nextState) {
  const idx = STATES.indexOf(nextState);
  if (idx < 0) throw new Error(`Estado inválido: ${nextState}`);
  const curIdx = STATES.indexOf(run.current_state);
  if (curIdx >= 0 && idx < curIdx) {
    throw new Error(`Não retroceder estado formal: ${run.current_state} -> ${nextState}`);
  }
  if (!run.states_completed.includes(nextState)) run.states_completed.push(nextState);
  run.current_state = nextState;
  run.updated_at = new Date().toISOString();
  return run;
}

export function recordGate(run, name, result) {
  run.gates[name] = {
    status: result.status,
    command: result.command,
    exit_code: result.exit_code ?? null,
    at: new Date().toISOString(),
    output_tail: result.output_tail ?? null,
  };
  run.updated_at = new Date().toISOString();
  return run;
}

export function allGatesPassed(run) {
  const required = ["typecheck", "test", "build", "test_agents"];
  return required.every((g) => run.gates[g]?.status === "pass");
}

export function markReleaseGates(run) {
  run.release_gates_passed = allGatesPassed(run);
  return run;
}

export function shouldBlockCompletion(run) {
  if (!run) return { block: false };
  if (run.current_state === "BLOQUEADO") {
    return { block: true, reason: run.blocked?.reason ?? "BLOQUEADO", evidence: run.blocked?.evidence ?? "" };
  }
  if (run.current_state === "REGISTRADO") return { block: false };
  if (run.no_delivery_required === true) {
    const okScope =
      run.states_completed.includes("EXISTENCIA_VERIFICADA") &&
      classifyAcceptance(run.acceptance) === "JA_IMPLEMENTADO";
    if (okScope && run.current_state === "REGISTRADO") return { block: false };
    if (okScope && run.current_state === "EXISTENCIA_VERIFICADA") {
      return { block: true, reason: "Registrar encerramento sem código (ledger)", evidence: "falta REGISTRADO" };
    }
  }
  if (run.blocked) return { block: true, reason: run.blocked.reason, evidence: run.blocked.evidence };
  if (
    run.delivery?.branch &&
    allGatesPassed(run) &&
    run.states_completed.includes("REVISADO") &&
    !run.delivery.pr_verified
  ) {
    return {
      block: true,
      reason: "ENTREGA_VERIFICADA: PR não confirmado remotamente",
      evidence: run.delivery.pr_url ?? "sem pr_url",
    };
  }
  const missing = STATES.filter((s) => !run.states_completed.includes(s));
  if (missing.length) {
    return {
      block: true,
      reason: `Protocolo incompleto: faltam estados ${missing.join(", ")}`,
      evidence: `current_state=${run.current_state}`,
    };
  }
  if (!allGatesPassed(run)) {
    return { block: true, reason: "Gates obrigatórios não passaram com evidência", evidence: JSON.stringify(run.gates) };
  }
  return { block: false };
}

export function registerFailure(run, signature, cause, evidence) {
  const count = (run.failure_retries[signature] ?? 0) + 1;
  run.failure_retries[signature] = count;
  run.last_failure = { signature, cause, evidence, at: new Date().toISOString(), attempt: count };
  run.updated_at = new Date().toISOString();
  if (count > MAX_FAILURE_RETRIES) {
    run.blocked = {
      reason: `Limite de tentativas (${MAX_FAILURE_RETRIES}) para ${signature}`,
      evidence,
      cause,
    };
    run.current_state = "BLOQUEADO";
  }
  return run;
}

export function classifyAcceptance(acceptance) {
  const allDone = acceptance.every((a) => a.status === "JA_IMPLEMENTADO");
  const anyPending = acceptance.some((a) => a.status === "PENDENTE" || a.status === "PARCIAL");
  if (allDone && acceptance.length > 0) return "JA_IMPLEMENTADO";
  if (anyPending) return "PARCIAL";
  return "INDEFINIDO";
}
