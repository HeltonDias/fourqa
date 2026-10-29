"""SQLite legacy plan store (mirrors backend/src/db/sqliteLegacyPlanStore.ts)."""

from __future__ import annotations

from fourqa.db.db import get_db
from fourqa.persistence.contracts import LegacyPlanRow


def list_base() -> list[LegacyPlanRow]:
    rows = get_db().execute(
        """
        SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim,
               replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados
        FROM planejamento_linhas ORDER BY row_num
        """
    ).fetchall()
    return [dict(row) for row in rows]  # type: ignore[misc]


sqlite_legacy_plan_store = {"list_base": list_base}
