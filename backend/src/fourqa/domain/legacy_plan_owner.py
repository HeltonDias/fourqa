"""Legado planejamento_linhas (mirrors backend/src/domain/legacyPlanOwner.ts)."""


def is_legacy_plan_owner(plan_key: str, owner: str | None) -> bool:
    stored = (owner or "").strip()
    if not stored:
        return False
    return stored.lower() == plan_key.strip().lower()
