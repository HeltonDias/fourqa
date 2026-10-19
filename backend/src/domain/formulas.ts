import type { ExecucaoRow, FalhaRow } from "../types.js";

export const DEFAULT_PLAN_KEY = "EndToEnd";

type ExecFilter = Partial<{
  planKey: string;
  suiteName: string;
  suiteId: string | number;
  testPointState: string;
  testCaseState: string;
  outcome: string;
  responsabilidade: string;
}>;

function norm(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * Valor de "TestPointState" no vocabulário das fórmulas da planilha.
 * O Azure devolve state = Ready/NotReady/Completed e outcome = Passed/Failed/Blocked/NotApplicable/Unspecified;
 * as fórmulas (COUNTIFS) esperam Passed/Failed/Blocked/Closed para pontos executados, Ready para liberados
 * e Unspecified para os demais. Por isso o resultado executado prevalece sobre o state.
 */
export function estadoPonto(r: Pick<ExecucaoRow, "test_point_state" | "outcome">): string {
  switch (norm(r.outcome).toLowerCase()) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "blocked":
      return "Blocked";
    case "notapplicable":
      return "Closed";
  }
  const state = norm(r.test_point_state);
  return state.toLowerCase() === "ready" ? "Ready" : state ? "Unspecified" : "";
}

function matchContains(haystack: string, needle: string): boolean {
  return haystack.toUpperCase().includes(needle.toUpperCase());
}

export function countExecucoes(rows: ExecucaoRow[], f: ExecFilter): number {
  return rows.filter((r) => {
    if (f.planKey && norm(r.plan_key) !== f.planKey) return false;
    if (f.suiteName !== undefined && norm(r.suite_name) !== norm(String(f.suiteName)))
      return false;
    if (f.suiteId !== undefined && String(r.suite_id ?? "") !== String(f.suiteId))
      return false;
    if (f.testPointState !== undefined && estadoPonto(r) !== f.testPointState)
      return false;
    if (f.testCaseState !== undefined && norm(r.test_case_state) !== f.testCaseState)
      return false;
    if (f.outcome !== undefined && norm(r.outcome) !== f.outcome) return false;
    if (
      f.responsabilidade !== undefined &&
      norm(r.responsabilidade) !== f.responsabilidade
    )
      return false;
    return true;
  }).length;
}

/** Espelha colunas L–S da aba Planejamento (linha com processo = SuiteName). */
export function metricasPorProcesso(
  execRows: ExecucaoRow[],
  planKey: string,
  processo: string,
) {
  if (!processo) {
    return {
      cts_passeds: 0,
      cts_na: 0,
      cts_falhados: 0,
      cts_bloqueados: 0,
      cts_liberados: 0,
      cts_design: 0,
      cts_nao_liberados: 0,
    };
  }

  const out = {
    cts_passeds: 0,
    cts_na: 0,
    cts_falhados: 0,
    cts_bloqueados: 0,
    cts_liberados: 0,
    cts_design: 0,
    cts_nao_liberados: 0,
  };
  for (const r of execRows) {
    if (norm(r.plan_key) !== planKey || norm(r.suite_name) !== norm(processo)) continue;
    out[STATUS_COLUNA[statusCenario(r)]]++;
  }
  return out;
}

export type StatusCenario = "passed" | "na" | "falhado" | "bloqueado" | "design" | "naoLiberado" | "liberado";

const STATUS_COLUNA = {
  passed: "cts_passeds",
  na: "cts_na",
  falhado: "cts_falhados",
  bloqueado: "cts_bloqueados",
  design: "cts_design",
  naoLiberado: "cts_nao_liberados",
  liberado: "cts_liberados",
} as const;

/**
 * Fonte única da coluna de status. O resultado da execução manda (Passed/N/A/Failed/Blocked),
 * independentemente do estado do Test Case (Closed, UAT, BUG, QA, Pendências...).
 * Sem execução: Design e "Não atribuído" pelo estado do Test Case; ponto Ready fica em
 * Liberados e o restante em Não Liberados. Cada cenário cai em exatamente uma coluna.
 *
 * Decisão em relação à planilha: a Home legada às vezes cruza Outcome com TestCaseState
 * (ex.: Passed + Closed). Aqui Passed conta como finalizado mesmo se o Test Case não estiver
 * Closed — é o que fechou os números da Fase 2 (907 passed). Ver docs/adr/002-status.md.
 */
export function classifyExecution(
  r: Pick<ExecucaoRow, "test_point_state" | "outcome" | "test_case_state">,
): StatusCenario {
  const ponto = estadoPonto(r);
  if (ponto === "Passed") return "passed";
  if (ponto === "Closed") return "na";
  if (ponto === "Failed") return "falhado";
  if (ponto === "Blocked") return "bloqueado";
  const tc = norm(r.test_case_state).toLowerCase();
  if (tc === "design") return "design";
  if (tc === "não atribuído" || tc === "nao atribuido") return "naoLiberado";
  return ponto === "Ready" ? "liberado" : "naoLiberado";
}

export function statusCenario(r: ExecucaoRow): StatusCenario {
  return classifyExecution(r);
}

export function metricasDosPontos(rows: ExecucaoRow[]) {
  const out = {
    cts_passeds: 0,
    cts_na: 0,
    cts_falhados: 0,
    cts_bloqueados: 0,
    cts_liberados: 0,
    cts_design: 0,
    cts_nao_liberados: 0,
  };
  for (const r of rows) out[STATUS_COLUNA[classifyExecution(r)]]++;
  return out;
}

type ContagemPassedNa = {
  cts_passeds: number;
  cts_na: number;
};

/** Finalizados do Report: Passed + N/A. Cancelados legados ficam fora desta conta. */
export function totalRealizadoLinha(metrics: ContagemPassedNa): number {
  return metrics.cts_passeds + metrics.cts_na;
}

/**
 * Finalizados da aba Status nesta etapa: Passed + N/A + cancelados legados.
 * Não usar no Report. O Planejamento mantém a mesma soma no próprio serviço.
 */
export function finalizadosComCancelados(metrics: ContagemPassedNa, cts_cancelados: number): number {
  return metrics.cts_passeds + metrics.cts_na + (cts_cancelados ?? 0);
}

export function impactoTotalTestPoint(execRows: ExecucaoRow[], planKey: string): number {
  return (
    countExecucoes(execRows, { planKey, testPointState: "Failed" }) +
    countExecucoes(execRows, { planKey, testPointState: "Blocked" })
  );
}

function isOpenBugStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "new" || s === "active";
}

function bugById(falhas: FalhaRow[]): Map<number, FalhaRow> {
  const m = new Map<number, FalhaRow>();
  for (const f of falhas) {
    if (f.bug_id != null) m.set(f.bug_id, f);
  }
  return m;
}

/** Aproximação do KPI C14:E14 quando não há bugs ligados por run/result. */
export function classificarImpactosKpi(
  execRows: ExecucaoRow[],
  falhas: FalhaRow[],
  planKey: string,
): { foursys: number; cliente: number; reteste: number } {
  const bugs = bugById(falhas.filter((f) => norm(f.plan_key) === planKey));
  let foursys = 0;
  let cliente = 0;
  let reteste = 0;

  const cenários = execRows.filter(
    (r) =>
      norm(r.plan_key) === planKey &&
      (norm(r.outcome).toLowerCase() === "failed" ||
        norm(r.outcome).toLowerCase() === "blocked"),
  );

  for (const c of cenários) {
    const tags = norm(c.test_case_tags);
    let classified = false;
    for (const f of falhas) {
      if (norm(f.plan_key) !== planKey || !f.bug_id) continue;
      if (!isOpenBugStatus(norm(f.status))) continue;
      const frenteMatch = tags && f.frente && matchContains(tags, norm(f.frente));
      const tituloMatch =
        c.test_case_title &&
        f.titulo &&
        matchContains(norm(f.titulo), norm(c.test_case_title).slice(0, 20));
      if (!frenteMatch && !tituloMatch) continue;
      const resp = norm(f.responsavel);
      if (resp.includes("Foursys")) {
        foursys++;
        classified = true;
        break;
      }
      if (resp.includes("Cliente") || resp.includes("CVP")) {
        cliente++;
        classified = true;
        break;
      }
    }
    if (!classified) {
      if (c.last_result_id && bugs.size === 0) reteste++;
      else reteste++;
    }
  }

  return { foursys, cliente, reteste };
}

type FalhaFilter = {
  planKey: string;
  frenteContains?: string;
  responsavel?: string;
  status?: string;
  statusNot?: string;
  fechamentoEmpty?: boolean;
  fechamentoNotEmpty?: boolean;
  criacaoEmpty?: boolean;
  idNotEmpty?: boolean;
};

export function countFalhas(rows: FalhaRow[], f: FalhaFilter): number {
  return rows.filter((r) => {
    if (norm(r.plan_key) !== f.planKey) return false;
    if (f.frenteContains && !matchContains(norm(r.frente), f.frenteContains))
      return false;
    if (f.responsavel !== undefined && norm(r.responsavel) !== f.responsavel)
      return false;
    if (f.status !== undefined && norm(r.status) !== f.status) return false;
    if (f.statusNot !== undefined && norm(r.status) === f.statusNot) return false;
    if (f.fechamentoEmpty && norm(r.fechamento) !== "") return false;
    if (f.fechamentoNotEmpty && norm(r.fechamento) === "") return false;
    if (f.criacaoEmpty && norm(r.criacao) !== "") return false;
    if (f.idNotEmpty && (r.bug_id == null || r.bug_id === 0)) return false;
    return true;
  }).length;
}

/** Equivalente a SUMIF(Planejamento!C:C, "*"&frente&"*", coluna). */
export function sumifFrente<
  T extends { frente: string | null },
  K extends keyof T & string,
>(rows: T[], frenteNeedle: string, field: K): number {
  let sum = 0;
  for (const row of rows) {
    if (!matchContains(norm(row.frente), frenteNeedle)) continue;
    const v = row[field];
    sum += typeof v === "number" ? v : Number(v) || 0;
  }
  return sum;
}
