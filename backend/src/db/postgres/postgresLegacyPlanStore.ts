import type { LegacyPlanStore } from "../../persistence/contracts.js";
import type { LegacyPlanRow } from "../sqliteLegacyPlanStore.js";
import { asNumberOrNull, asText, query } from "./pool.js";

function rowOf(row: Record<string, unknown>): LegacyPlanRow {
  return {
    row_num: asNumberOrNull(row.row_num) ?? 0,
    qa: asText(row.qa),
    prioridades: asText(row.prioridades),
    frente: asText(row.frente),
    processo: asText(row.processo),
    data_inicio: asText(row.data_inicio),
    data_fim: asText(row.data_fim),
    replanejamento: asNumberOrNull(row.replanejamento) as number,
    qtd_cts_plan: asNumberOrNull(row.qtd_cts_plan),
    cts_plan_dia: asNumberOrNull(row.cts_plan_dia),
    cts_cancelados: asNumberOrNull(row.cts_cancelados) as number,
  };
}

async function listBase(): Promise<LegacyPlanRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim,
            replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados
     FROM planejamento_linhas ORDER BY row_num`,
  );
  return rows.map(rowOf);
}

export const postgresLegacyPlanStore = {
  listBase,
} satisfies LegacyPlanStore;
