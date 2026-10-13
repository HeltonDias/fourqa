import { getDb } from "../db.js";
import type { LegacyPlanStore } from "../persistence/contracts.js";
import type { PlanejamentoLinha } from "../types.js";

/** Linha bruta da planilha importada. Não inclui colunas calculadas pelo Report. */
export type LegacyPlanRow = Omit<
  PlanejamentoLinha,
  | "cts_passeds"
  | "cts_na"
  | "cts_falhados"
  | "cts_bloqueados"
  | "cts_liberados"
  | "cts_design"
  | "cts_nao_liberados"
  | "total_realizado"
>;

/** Lê planejamento_linhas na ordem de row_num. Não filtra dono nem linha de totais. */
export function listBase(): LegacyPlanRow[] {
  return getDb()
    .prepare(
      `SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim,
              replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados
       FROM planejamento_linhas ORDER BY row_num`,
    )
    .all() as LegacyPlanRow[];
}

export const sqliteLegacyPlanStore = {
  listBase,
} satisfies LegacyPlanStore;
