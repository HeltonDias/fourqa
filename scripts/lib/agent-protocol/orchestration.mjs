import { classifyTask } from "./classify.mjs";

/** Plano de delegação por tier — não invoca agentes; só registra o que é permitido/necessário. */
export function delegationPlan(tier) {
  switch (tier) {
    case "N0":
      return { impact_analyst: false, qa_verifier: false, bmad: false };
    case "N1":
      return { impact_analyst: false, qa_verifier: false, bmad: false };
    case "N2":
      return { impact_analyst: true, qa_verifier: false, bmad: false };
    case "N3":
      return { impact_analyst: true, qa_verifier: true, bmad: false };
    default:
      return { impact_analyst: true, qa_verifier: true, bmad: false };
  }
}

export function applyClassification(run, signals) {
  const { tier, reasons } = classifyTask(signals);
  run.tier = tier;
  run.tier_reasons = reasons;
  run.delegation = delegationPlan(tier);
  if (tier === "N0") {
    run.code_changes_required = false;
    run.no_delivery_required = true;
  }
  return run;
}

export function delegationSatisfied(run) {
  if (!run?.delegation) return { ok: true };
  const d = run.delegation;
  const done = run.delegation_done ?? {};
  if (d.impact_analyst && !done.impact_analyst) {
    return { ok: false, missing: "impact_analyst" };
  }
  if (d.qa_verifier && !done.qa_verifier) {
    return { ok: false, missing: "qa_verifier" };
  }
  return { ok: true };
}
