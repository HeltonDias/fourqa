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
    if (f.testPointState !== undefined && norm(r.test_point_state) !== f.testPointState)
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

  const cts_passeds = countExecucoes(execRows, {
    planKey,
    suiteName: processo,
    testPointState: "Passed",
    testCaseState: "Closed",
  });

  const cts_na = countExecucoes(execRows, {
    planKey,
    suiteName: processo,
    testCaseState: "NotApplicable",
    testPointState: "Closed",
  });

  const cts_falhados =
    countExecucoes(execRows, {
      planKey,
      suiteName: processo,
      testPointState: "Failed",
      testCaseState: "BUG",
    }) +
    countExecucoes(execRows, {
      planKey,
      suiteId: processo,
      testPointState: "Failed",
      responsabilidade: "Pendências",
    });

  const cts_bloqueados =
    countExecucoes(execRows, {
      planKey,
      suiteName: processo,
      testPointState: "Blocked",
      testCaseState: "BUG",
    }) +
    countExecucoes(execRows, {
      planKey,
      suiteId: processo,
      testPointState: "Blocked",
      responsabilidade: "Pendências",
    });

  const cts_liberados = countExecucoes(execRows, {
    planKey,
    suiteName: processo,
    testPointState: "Ready",
    testCaseState: "QA",
  });

  const cts_design = countExecucoes(execRows, {
    planKey,
    suiteName: processo,
    outcome: "Unspecified",
    testCaseState: "Design",
  });

  const cts_nao_liberados = countExecucoes(execRows, {
    planKey,
    suiteName: processo,
    testPointState: "Unspecified",
    testCaseState: "Não atribuído",
  });

  return {
    cts_passeds,
    cts_na,
    cts_falhados,
    cts_bloqueados,
    cts_liberados,
    cts_design,
    cts_nao_liberados,
  };
}

export function totalRealizadoLinha(
  metrics: ReturnType<typeof metricasPorProcesso>,
  cts_cancelados: number,
): number {
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
