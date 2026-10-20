import { classifyTask } from "./classify.mjs";
import { delegationPlan } from "./orchestration.mjs";

function norm(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Intent-to-Delivery: mensagem informal → plano executável (sem LLM).
 * O agente Cursor materializa evidências; este módulo fixa critérios e estratégia.
 *
 * @param {string} rawMessage
 * @returns {import('./intent-to-delivery.types').IntentPlan}
 */
export function interpretIntent(rawMessage) {
  const text = norm(rawMessage);
  const base = {
    raw_message: rawMessage,
    protocol: "intent-to-delivery",
    version: 1,
  };

  if (/(migra|migrar|passar|portar).*(c#|csharp|dotnet|\.net)|backend.*(c#|dotnet)/.test(text)) {
    return finalize({
      ...base,
      intent_id: "dotnet_migration",
      goal: "Migrar backend Node/Express para ASP.NET Core 10 com equivalência funcional, por fatias verificáveis.",
      acceptance_criteria: [
        "Contratos /api/* e auth preservados até cutover aprovado",
        "Domínio portado com testes espelhando Node",
        "Node permanece operacional entre fatias",
        "Cada fatia em PR pequeno com evidência CI",
      ],
      existence_strategy: "ledger_tail + ADR 005 + grep rotas/domain",
      existence_preflight: "PARTIAL",
      tier_signals: { dotnet_migration: true, api_contract: true },
      slices: [
        "Domínio puro (formulas, status, …)",
        "API skeleton + health",
        "Rotas por grupo + paridade contrato",
        "Cutover só com aprovação",
      ],
      investigate_before_code: false,
      human_approval_required: ["hospedagem .NET em produção", "cutover de tráfego", "banco operacional"],
      context_queries: ["ADR 005", "backend/src/routes/api.ts", "backend/src/domain/", "DECISIONS OPEN-010"],
    });
  }

  if (/melhora.*report|report.*melhor|arruma.*report|report.*bug/.test(text)) {
    return finalize({
      ...base,
      intent_id: "report_improvement_vague",
      goal: "Melhorar o Report conforme requisitos aprovados (RPT-*) sem alterar semântica de indicadores por suposição.",
      acceptance_criteria: [
        "Problema ou gap identificado com evidência (UI, teste, requisito)",
        "Mudança vinculada a RPT-* ou DEC-* aplicável",
        "Fórmulas Report (DEC-008/009) intactas salvo decisão explícita",
        "Testes e smoke visual no painel Report",
      ],
      existence_strategy: "buscar RPT- em REQUIREMENTS + estado em reportService/formulas",
      existence_preflight: "UNKNOWN",
      tier_signals: { cross_module: true, domain_formula: true },
      slices: ["Diagnóstico e delimitação", "Implementação mínima do gap", "PR com testes"],
      investigate_before_code: true,
      human_approval_required: ["mudança de semântica Report/Planejamento se diagnóstico ambíguo"],
      context_queries: ["REQUIREMENTS RPT-", "DEC-005", "DEC-008", "reportService.ts", "ScenarioStatusPanel"],
    });
  }

  if (/login|logar|entrar|autentic|sso|microsoft|google.*usuario/.test(text)) {
    return finalize({
      ...base,
      intent_id: "user_login_auth",
      goal: "Autenticação de usuários conforme EP-09 / OPEN-013 (RBAC, não só token compartilhado).",
      acceptance_criteria: [
        "Fluxo OIDC/OAuth ou decisão registrada se outro",
        "Autorização server-side (DEC-004)",
        "Testes negativos de permissão",
        "Sem expor segredos nem alterar produção sem aprovação",
      ],
      existence_strategy: "writeAuth.ts + REQUIREMENTS EP-09 + OPEN-013",
      existence_preflight: "PARTIAL",
      tier_signals: { security: true, api_contract: true, persistence: true },
      slices: ["ADR identidade", "MVP login", "RBAC"],
      investigate_before_code: true,
      human_approval_required: ["provedor IdP", "modelo multi-tenant OPEN-010", "dados em produção"],
      context_queries: ["OPEN-013", "EP-09", "writeAuth.ts", "DEC-004"],
    });
  }

  if (/sincroniz|sync.*problema|sync.*erro|azure.*sync|nao sincroniza/.test(text)) {
    return finalize({
      ...base,
      intent_id: "sync_fix",
      goal: "Corrigir falha na sincronização Azure mantendo comportamento aprovado e sem enfraquecer validações.",
      acceptance_criteria: [
        "Causa raiz com logs/teste reproduzível",
        "Correção localizada em sync/azure/persistência",
        "Testes sync existentes passam + caso do bug",
        "Sem sync real em produção sem autorização",
      ],
      existence_strategy: "syncService.ts syncJob.ts testes azure + sintoma do usuário",
      existence_preflight: "UNKNOWN",
      tier_signals: { cross_module: true },
      slices: ["Investigar", "Patch + teste", "PR"],
      investigate_before_code: true,
      human_approval_required: ["sync contra tenant Azure real", "alteração de schema"],
      context_queries: ["syncService.ts", "syncJob.ts", "azure/", "US sync BACKLOG"],
    });
  }

  if (/de novo|novamente|ja temos|já temos|refaz.*filtro|filtro.*(de novo|novamente)/.test(text)) {
    return finalize({
      ...base,
      intent_id: "redundant_or_reapply",
      goal: "Reaplicar ou completar filtro/funcionalidade já prevista — sem duplicar implementação.",
      acceptance_criteria: [
        "EXISTENCIA_VERIFICADA: JA_IMPLEMENTADO | PARCIAL | PENDENTE com evidência",
        "Se JA_IMPLEMENTADO: encerrar sem PR",
        "Se PARCIAL: só o gap",
        "Comportamento igual ao contrato/UI existente",
      ],
      existence_strategy: "grep filtro + testes + páginas frontend",
      existence_preflight: "CHECK_FIRST",
      tier_signals: { already_implemented: false },
      slices: ["Verificar código", "Gap mínimo se PARCIAL"],
      investigate_before_code: true,
      human_approval_required: [],
      context_queries: ["frontend filtros", "ledger-tail", "BACKLOG US-"],
    });
  }

  return finalize({
    ...base,
    intent_id: "general_delivery",
    goal: "Entregar o pedido do usuário com critérios verificáveis e escopo mínimo.",
    acceptance_criteria: [
      "Objetivo traduzido em critérios mensuráveis",
      "EXISTENCIA_VERIFICADA antes de codar",
      "PR pequeno com gates release",
      "Registro no CHANGE_LEDGER",
    ],
    existence_strategy: "BACKLOG/REQUIREMENTS por palavra-chave + código",
    existence_preflight: "UNKNOWN",
    tier_signals: {},
    slices: ["Interpretar", "Implementar gap", "Testar e entregar"],
    investigate_before_code: true,
    human_approval_required: ["produção", "custo", "semântica negócio se ambíguo"],
    context_queries: ["BACKLOG.md", "INDEX.md"],
  });
}

function finalize(partial) {
  const { tier, reasons } = classifyTask(partial.tier_signals ?? {});
  const delegation = delegationPlan(tier);
  const noCode =
    partial.intent_id === "redundant_or_reapply" && partial.existence_preflight === "CHECK_FIRST"
      ? false
      : tier === "N0";
  return {
    ...partial,
    tier,
    tier_reasons: reasons,
    delegation,
    code_changes_default: !noCode,
    delivery_steps: [
      "interpretIntent (este plano)",
      "CONTEXTO_VALIDADO seletivo",
      "EXISTENCIA_VERIFICADA",
      "ESCOPO_DEFINIDO → IMPLEMENTADO",
      "agent:gates release",
      "delivery-verify + ledger",
    ],
  };
}

/** Grava plano em agent-run e prepara acceptance[]. */
export function applyIntentToRun(run, plan) {
  run.intent = plan;
  run.description = plan.goal;
  run.acceptance = plan.acceptance_criteria.map((text, i) => ({
    id: `AC-${i + 1}`,
    text,
    status: "PENDENTE",
    evidence: null,
  }));
  run.tier = plan.tier;
  run.tier_reasons = plan.tier_reasons;
  run.delegation = plan.delegation;
  if (plan.tier === "N0") {
    run.code_changes_required = false;
    run.no_delivery_required = true;
  } else {
    run.code_changes_required = plan.code_changes_default !== false;
  }
  run.investigate_before_code = plan.investigate_before_code === true;
  return run;
}

/** Valida plano mínimo para selftest e verify. */
export function validateIntentPlan(plan) {
  const errors = [];
  if (!plan?.intent_id) errors.push("intent_id ausente");
  if (!plan?.goal) errors.push("goal ausente");
  if (!Array.isArray(plan?.acceptance_criteria) || plan.acceptance_criteria.length === 0) {
    errors.push("acceptance_criteria vazio");
  }
  if (!plan?.tier) errors.push("tier ausente");
  if (!plan?.existence_strategy) errors.push("existence_strategy ausente");
  return { ok: errors.length === 0, errors };
}
