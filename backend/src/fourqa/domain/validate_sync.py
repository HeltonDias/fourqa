"""Validação pós-sync."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, TypedDict

from fourqa.domain.formulas import StatusCenario, classify_execution
from fourqa.types import ExecucaoRow, FalhaRow


class SyncSuiteRef(TypedDict):
    suite_id: int
    parent_suite_id: int | None


class SyncValidationError(Exception):
    def __init__(self, errors: list[str]) -> None:
        super().__init__(" ".join(errors))
        self.name = "SyncValidationError"
        self.errors = errors


_STATUS: list[StatusCenario] = [
    "passed",
    "na",
    "falhado",
    "bloqueado",
    "design",
    "naoLiberado",
    "liberado",
]


def validate_sync_result(
    *,
    execucoes: Sequence[Mapping[str, Any]],
    falhas: Sequence[Mapping[str, Any]],
    suites: Sequence[Mapping[str, Any]],
) -> None:
    errors: list[str] = []

    if len(execucoes) == 0:
        errors.append(
            "Nenhum Test Point retornado. A sincronização foi cancelada para não apagar os dados atuais."
        )

    points: set[str] = set()
    buckets: dict[StatusCenario, int] = {s: 0 for s in _STATUS}

    for row in execucoes:
        if not (row.get("plan_key") or "").strip() or not row.get("plan_id"):
            errors.append("Execução sem PlanKey ou PlanId.")
            break
        if not row.get("suite_id"):
            errors.append(f"Test point {row.get('test_point_id', '?')} sem suíte.")
            break
        tp = row.get("test_point_id")
        if tp:
            key = f"{row.get('plan_key')}:{tp}"
            if key in points:
                errors.append(f"TestPointId duplicado no plano {row.get('plan_key')}: {tp}.")
            points.add(key)
        buckets[classify_execution(row)] += 1

    classified = sum(buckets[s] for s in _STATUS)
    if len(execucoes) > 0 and classified != len(execucoes):
        errors.append(
            f"Invariante de status violada: classificados {classified}, execuções {len(execucoes)}."
        )

    bugs: set[str] = set()
    for row in falhas:
        bug_id = row.get("bug_id")
        plan_key = row.get("plan_key")
        if not bug_id or not plan_key:
            continue
        key = f"{plan_key}:{bug_id}"
        if key in bugs:
            errors.append(f"BugId duplicado no plano {plan_key}: {bug_id}.")
        bugs.add(key)

    suite_ids = {s["suite_id"] for s in suites}
    for suite in suites:
        parent = suite.get("parent_suite_id")
        if parent is not None and parent not in suite_ids:
            errors.append(
                f"Suíte {suite['suite_id']} aponta para o pai {parent}, que não está na árvore."
            )
            break

    if errors:
        raise SyncValidationError(list(dict.fromkeys(errors)))
