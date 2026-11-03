"""Status evolução."""

from __future__ import annotations

from typing import Literal

EvolucaoStatus = Literal["done", "ok", "warn", "risk", "na"]


def status_evolucao(
    *,
    gap: float,
    ttl_cts: float,
    finalizados: float,
    na: float,
) -> EvolucaoStatus:
    ttl = ttl_cts
    if ttl > 0 and na >= ttl:
        return "na"
    if ttl > 0 and finalizados >= ttl:
        return "done"
    if gap > 3:
        return "risk"
    if gap > 0 and gap < 3:
        return "warn"
    if gap > 0:
        return "warn"
    return "ok"


def status_geral_de(statuses: list[EvolucaoStatus]) -> EvolucaoStatus:
    votos = [s for s in statuses if s != "na"]
    if not votos:
        return "na" if any(s == "na" for s in statuses) else "ok"
    ordem: list[EvolucaoStatus] = ["risk", "warn", "ok", "done"]

    def count(status: EvolucaoStatus) -> int:
        return sum(1 for item in votos if item == status)

    best = ordem[0]
    for status in ordem[1:]:
        if count(status) > count(best):
            best = status
    return best
