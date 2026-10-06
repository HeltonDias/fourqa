import type { AzureClient } from "./client.js";
import type { ExecucaoInsert } from "./execucoes.js";
import { getRunResultsWithBugs, type BugMeta } from "./falhas.js";
import { mapInBatches, normalize, type ProgressReporter } from "./util.js";

/** Porta do bloco EX_KPI_* de atualizar_Execucoes_Azure.ts (C14:E14 da Home). */

const KPI_RUN_CONCURRENCY = 4;

export interface KpiImpactos {
  total: number;
  foursys: number;
  cliente: number;
  reteste: number;
  semResultadoMapeado: number;
  calculadoEm: string;
}

type Bucket = "Foursys" | "Cliente" | "Reteste";

/** Pega o bug aberto (New/Active) mais recente e decide quem é o dono. */
function classifyBugs(bugs: BugMeta[]): Bucket {
  const open = bugs
    .filter((b) => {
      const s = normalize(b.status);
      return s === "new" || s === "active";
    })
    .sort((a, b) => (a.criacaoMs !== b.criacaoMs ? b.criacaoMs - a.criacaoMs : b.bugId - a.bugId));
  if (open.length === 0) return "Reteste";
  const r = normalize(open[0].responsavel);
  if (r.includes("foursys")) return "Foursys";
  if (r.includes("cliente") || r.includes("cvp")) return "Cliente";
  return "Reteste";
}

export async function calculateKpiImpactos(
  client: AzureClient,
  execRows: ExecucaoInsert[],
  bugMeta: Map<number, BugMeta>,
  report: ProgressReporter,
): Promise<KpiImpactos> {
  const scenarios = execRows
    .filter((r) => {
      const o = normalize(r.outcome ?? "");
      return o === "failed" || o === "blocked";
    })
    .map((r) => ({ runId: r.last_test_run_id ?? 0, resultId: r.last_result_id ?? 0 }));

  const stats: KpiImpactos = {
    total: scenarios.length,
    foursys: 0,
    cliente: 0,
    reteste: 0,
    semResultadoMapeado: 0,
    calculadoEm: new Date().toISOString(),
  };
  if (scenarios.length === 0) return stats;

  const runIds = [...new Set(scenarios.map((s) => s.runId).filter((id) => id > 0))];
  const bugsByResult = new Map<string, number[]>();
  const perRun = await mapInBatches(
    runIds,
    KPI_RUN_CONCURRENCY,
    async (runId) => ({ runId, results: await getRunResultsWithBugs(client, runId) }),
    (done, total) => report("KPIs da Home: runs", done, total),
  );
  for (const { runId, results } of perRun) {
    for (const result of results) {
      const resultId = Number(result.id ?? 0);
      if (resultId <= 0) continue;
      const ids = [...new Set((result.associatedBugs ?? []).map((b) => Number(b.id ?? 0)).filter((id) => id > 0))];
      bugsByResult.set(`${runId}|${resultId}`, ids);
    }
  }

  for (const s of scenarios) {
    const ids = s.runId > 0 && s.resultId > 0 ? bugsByResult.get(`${s.runId}|${s.resultId}`) : undefined;
    if (!ids) {
      stats.reteste++;
      stats.semResultadoMapeado++;
      continue;
    }
    const bugs = ids.map((id) => bugMeta.get(id)).filter((b): b is BugMeta => Boolean(b));
    const bucket = classifyBugs(bugs);
    if (bucket === "Foursys") stats.foursys++;
    else if (bucket === "Cliente") stats.cliente++;
    else stats.reteste++;
  }
  return stats;
}
