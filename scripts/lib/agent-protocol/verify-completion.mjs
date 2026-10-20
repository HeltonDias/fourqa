import { validateLedger, findLedgerById } from "./ledger.mjs";
import { loadRun, shouldBlockCompletion } from "./run-state.mjs";
import { delegationSatisfied } from "./orchestration.mjs";

export function verifyProtocolCompletion(root) {
  const ledger = validateLedger(root);
  if (!ledger.ok) {
    return {
      ok: false,
      blocked: true,
      reason: "CHANGE_LEDGER inválido",
      evidence: ledger.errors.join("; "),
      followup: "Corrija .cursor/docs/CHANGE_LEDGER.jsonl e execute npm run agent:ledger:validate antes de encerrar.",
    };
  }

  const run = loadRun(root);
  if (!run) {
    return { ok: true, blocked: false, reason: "sem agent-run.json ativo (sessão informal)" };
  }

  if (run.current_state === "BLOQUEADO") {
    return {
      ok: false,
      blocked: true,
      reason: run.blocked?.reason ?? "BLOQUEADO",
      evidence: run.blocked?.evidence ?? "",
      followup: "Tarefa BLOQUEADA. Apresente evidência ao usuário; não declare sucesso.",
    };
  }

  const deleg = delegationSatisfied(run);
  if (!deleg.ok) {
    return {
      ok: false,
      blocked: true,
      reason: `Delegação obrigatória pendente: ${deleg.missing}`,
      evidence: JSON.stringify(run.delegation),
      followup: `Execute ou registre delegation_done.${deleg.missing}=true após ${deleg.missing}.`,
    };
  }

  const block = shouldBlockCompletion(run);
  if (block.block) {
    return {
      ok: false,
      blocked: true,
      reason: block.reason,
      evidence: block.evidence,
      followup: `Continue o protocolo: ${block.reason}. Atualize .cursor/agent-run.json e reexecute gates com npm run agent:gates.`,
    };
  }

  if (run.current_state === "REGISTRADO") {
    const entry = findLedgerById(root, run.task_id);
    if (!entry) {
      return {
        ok: false,
        blocked: true,
        reason: "REGISTRADO sem entrada no CHANGE_LEDGER",
        evidence: run.task_id,
        followup: `Registre a entrega com npm run agent:ledger:append -- --id ${run.task_id}`,
      };
    }
  }

  return { ok: true, blocked: false, reason: "protocolo completo ou não aplicável" };
}
