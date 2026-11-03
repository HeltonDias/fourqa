"""Escopo de `workbook_meta` por conexão (período, cabeçalho, sync)."""

from __future__ import annotations

from contextvars import ContextVar, Token

SCOPED_META_KEYS = frozenset(
    {
        "data_inicio",
        "data_fim",
        "data_fim_linha",
        "cabecalho_titulo",
        "cabecalho_subtitulo",
        "title",
        "sync_parameters",
        "sync_job",
        "kpi_plan_key",
        "ultima_sincronizacao_azure",
        "planejamento_legado_plan_key",
    }
)

_scope: ContextVar[str | None] = ContextVar("fourqa_meta_scope", default=None)
_actor: ContextVar[str | None] = ContextVar("fourqa_actor", default=None)


def current_actor_name() -> str | None:
    return _actor.get()


def set_actor_name(name: str | None) -> Token[str | None]:
    return _actor.set(name)


def reset_actor_name(token: Token[str | None]) -> None:
    _actor.reset(token)


def current_meta_scope() -> str | None:
    return _scope.get()


def set_meta_scope(scope: str | None) -> Token[str | None]:
    return _scope.set(scope)


def reset_meta_scope(token: Token[str | None]) -> None:
    _scope.reset(token)


def connection_scope(connection: dict | None) -> str | None:
    """Conexão legada usa as chaves globais; as demais ganham prefixo próprio."""
    if not connection or connection.get("legacy"):
        return None
    return f"conn:{connection['id']}"


def scoped_meta_key(key: str) -> str:
    scope = _scope.get()
    if not scope or key not in SCOPED_META_KEYS:
        return key
    return f"{scope}:{key}"
