"""PostgreSQL legacy plan store (mirrors postgresLegacyPlanStore.ts)."""

from __future__ import annotations

from typing import Any

from fourqa.db.postgres.pool import as_int_or_null, as_number_or_null, as_text, query
from fourqa.persistence.contracts import LegacyPlanRow


def _row_of(row: dict[str, Any]) -> LegacyPlanRow:
    return {
        "row_num": as_int_or_null(row.get("row_num")) or 0,
        "qa": as_text(row.get("qa")),
        "prioridades": as_text(row.get("prioridades")),
        "frente": as_text(row.get("frente")),
        "processo": as_text(row.get("processo")),
        "data_inicio": as_text(row.get("data_inicio")),
        "data_fim": as_text(row.get("data_fim")),
        "replanejamento": as_number_or_null(row.get("replanejamento")) or 0,
        "qtd_cts_plan": as_number_or_null(row.get("qtd_cts_plan")),
        "cts_plan_dia": as_number_or_null(row.get("cts_plan_dia")),
        "cts_cancelados": as_number_or_null(row.get("cts_cancelados")) or 0,
    }


async def list_base() -> list[LegacyPlanRow]:
    rows = await query(
        """
        SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim,
               replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados
        FROM planejamento_linhas ORDER BY row_num
        """
    )
    return [_row_of(r) for r in rows]


postgres_legacy_plan_store = {"list_base": list_base}
