"""PlanKey comparison (mirrors planKeyMatch.ts)."""


def plan_key_match(a: str, b: str) -> bool:
    return a.strip().lower() == b.strip().lower()
