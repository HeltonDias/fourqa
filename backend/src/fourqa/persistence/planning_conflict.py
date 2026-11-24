"""Conflitos de concorrência."""


class PlanningConflictError(Exception):
    cell_changed = "Essa célula foi alterada por outra pessoa. Recarregue e tente novamente."
    schedule_changed = "O planejamento mudou antes da confirmação. Recarregue e tente novamente."
    header_changed = "O cabeçalho foi alterado por outra pessoa. Recarregue e tente novamente."
    period_changed = "O período foi alterado por outra pessoa. Recarregue e tente novamente."
    revision_race = (
        "Outra revisão do planejamento foi confirmada ao mesmo tempo. Recarregue e tente novamente."
    )
    baseline_revised = "O baseline foi revisado enquanto a célula era editada. Recarregue e tente novamente."
    item_out_of_revision = "Item fora da revisão atual. Recarregue e tente novamente."

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.name = "PlanningConflictError"
