#!/usr/bin/env node
/** Aceite Intent-to-Delivery — mensagens informais representativas. */
import assert from "node:assert/strict";
import { interpretIntent, validateIntentPlan } from "./lib/agent-protocol/intent-to-delivery.mjs";

const SCENARIOS = [
  {
    message: "Migra o backend para C#.",
    intent_id: "dotnet_migration",
    tier: "N3",
    investigate: false,
    slices_min: 3,
    approval_min: 1,
  },
  {
    message: "Melhora o Report.",
    intent_id: "report_improvement_vague",
    tier: "N3",
    investigate: true,
    approval_min: 1,
  },
  {
    message: "Adiciona login para os usuários.",
    intent_id: "user_login_auth",
    tier: "N3",
    investigate: true,
    approval_min: 1,
  },
  {
    message: "Corrige a sincronização, que está dando problema.",
    intent_id: "sync_fix",
    tier: "N2",
    investigate: true,
  },
  {
    message: "Faz novamente o filtro que já temos.",
    intent_id: "redundant_or_reapply",
    tier: "N1",
    investigate: true,
    preflight: "CHECK_FIRST",
  },
];

console.log("agent-intent-selftest...");

for (const s of SCENARIOS) {
  const plan = interpretIntent(s.message);
  const v = validateIntentPlan(plan);
  assert.equal(v.ok, true, `${s.intent_id}: ${v.errors.join(", ")}`);
  assert.equal(plan.intent_id, s.intent_id, s.message);
  assert.equal(plan.tier, s.tier, `${s.intent_id} tier`);
  assert.equal(plan.investigate_before_code, s.investigate, `${s.intent_id} investigate`);
  assert.ok(plan.context_queries.length >= 2, `${s.intent_id} context`);
  assert.ok(plan.acceptance_criteria.length >= 3, `${s.intent_id} AC`);
  if (s.slices_min) assert.ok(plan.slices.length >= s.slices_min, `${s.intent_id} slices`);
  if (s.approval_min) {
    assert.ok(plan.human_approval_required.length >= s.approval_min, `${s.intent_id} approval`);
  }
  if (s.preflight) assert.equal(plan.existence_preflight, s.preflight);
  console.log(`  OK ${s.intent_id} (${plan.tier})`);
}

// Plano genérico não quebra
{
  const plan = interpretIntent("arruma aquilo lá");
  assert.equal(validateIntentPlan(plan).ok, true);
  assert.equal(plan.intent_id, "general_delivery");
  console.log("  OK general_delivery fallback");
}

console.log("agent-intent-selftest: OK");
