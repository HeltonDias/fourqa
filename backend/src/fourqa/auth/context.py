"""Usuário, conexão e papel resolvidos por requisição."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from starlette.requests import Request

from fourqa.auth.roles import effective_role
from fourqa.auth.session import USER_COOKIE, read_session, session_configured

CONNECTION_HEADER = "x-fourqa-connection"

current_user: ContextVar[dict[str, Any] | None] = ContextVar("fourqa_user", default=None)
current_connection: ContextVar[dict[str, Any] | None] = ContextVar("fourqa_connection", default=None)
current_role: ContextVar[str | None] = ContextVar("fourqa_role", default=None)
service_access: ContextVar[bool] = ContextVar("fourqa_service_access", default=False)


class IdentityError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class RequestIdentity:
    user: dict[str, Any] | None = None
    connection: dict[str, Any] | None = None
    member: dict[str, Any] | None = None
    role: str | None = None


def needs_identity(request: Request) -> bool:
    return bool(
        request.cookies.get(USER_COOKIE)
        or request.headers.get(CONNECTION_HEADER)
        or request.query_params.get("planKey")
    )


async def resolve_request_identity(request: Request) -> RequestIdentity:
    from fourqa.persistence.provider import get_identity_store

    ident = RequestIdentity()
    if not needs_identity(request):
        return ident
    store = await get_identity_store()
    token = request.cookies.get(USER_COOKIE)
    if token and session_configured():
        user_id = read_session(token)
        if user_id is not None:
            ident.user = await store.get_user(user_id)
    raw_header = (request.headers.get(CONNECTION_HEADER) or "").strip()
    plan_key = (request.query_params.get("planKey") or "").strip()
    if raw_header:
        if not raw_header.isdigit():
            raise IdentityError(400, "Conexão inválida.")
        ident.connection = await store.get_connection(int(raw_header))
        if ident.connection is None:
            raise IdentityError(404, "Conexão não encontrada.")
        if plan_key and plan_key.lower() != str(ident.connection["plan_key"]).lower():
            raise IdentityError(400, "planKey não pertence à conexão selecionada.")
    elif plan_key:
        ident.connection = await store.get_connection_by_plan_key(plan_key)
    if ident.user and ident.connection:
        ident.member = await store.get_member(ident.connection["id"], ident.user["id"])
    ident.role = effective_role(ident.user, ident.connection, ident.member)
    return ident
