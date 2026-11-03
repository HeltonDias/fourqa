"""Papéis e papel efetivo por conexão (DEC-036, DEC-038)."""

from __future__ import annotations

from typing import Any, Literal

Role = Literal["head", "lider", "qa", "visitante"]
ROLES: tuple[Role, ...] = ("head", "lider", "qa", "visitante")
ROLE_LABEL: dict[str, str] = {"head": "Head", "lider": "Líder", "qa": "QA", "visitante": "Visitante"}
_RANK: dict[str, int] = {"visitante": 0, "qa": 1, "lider": 2, "head": 3}


def normalize_role(value: object) -> Role | None:
    if not isinstance(value, str):
        return None
    key = value.strip().lower().replace("í", "i")
    return key if key in _RANK else None  # type: ignore[return-value]


def rank(role: str | None) -> int:
    return _RANK.get(role or "", -1)


def at_least(role: str | None, minimum: Role) -> bool:
    return rank(role) >= _RANK[minimum]


def effective_role(user: dict[str, Any] | None, connection: dict[str, Any] | None, member: dict[str, Any] | None) -> Role | None:
    """Papel no projeto quando definido; senão o global. Sem vínculo, só Head global acessa."""
    if not user:
        return None
    global_role = normalize_role(user.get("global_role")) or "qa"
    if global_role == "head":
        return "head"
    if connection is None:
        return global_role
    if member is None:
        return None
    return normalize_role(member.get("role")) or global_role


def can_write(role: str | None) -> bool:
    return at_least(role, "lider")
