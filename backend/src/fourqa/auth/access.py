"""Regras de acesso de leitura e escrita por requisição."""

from __future__ import annotations

import os

from fastapi import HTTPException
from starlette.requests import Request

from fourqa.auth.context import RequestIdentity, current_role, current_user, service_access
from fourqa.auth.roles import can_write, effective_role
from fourqa.auth.session import session_configured
from fourqa.azure.config import env_value
from fourqa.http.write_auth import SESSION_COOKIE, decide_write_auth, open_writes_allowed, presented_authorization

PUBLIC_PATHS = frozenset(
    {"/api/auth/login", "/api/auth/me", "/api/auth/logout", "/api/auth/entra/start", "/api/auth/entra/callback", "/api/session"}
)
VISITOR_PREFIXES = ("/api/home", "/api/meta", "/api/sync/status", "/api/auth/", "/api/connections", "/api/session")
USER_SCOPE_PREFIXES = ("/api/auth/", "/api/connections", "/api/azure/", "/api/admin/", "/api/session", "/api/health")


def _service_token() -> str:
    return env_value("FOURQA_API_TOKEN").strip()


def service_token_ok(request: Request) -> bool:
    token = _service_token()
    if not token:
        return False
    presented = presented_authorization(request.headers.get("authorization"), request.cookies.get(SESSION_COOKIE))
    return decide_write_auth(configured_token=token, allow_open_writes=False, authorization_header=presented) == "allow"


def _reads_protected() -> bool:
    return os.environ.get("VERCEL") == "1" and env_value("FOURQA_PROTECT_READS") != "0"


def read_access_error(request: Request, ident: RequestIdentity) -> tuple[int, str] | None:
    path = request.url.path
    if path in PUBLIC_PATHS:
        return None
    service = service_token_ok(request)
    if ident.connection is not None and not service:
        if ident.user is None:
            return 401, "Entre para acessar este projeto."
        if ident.role is None:
            return 403, "Você não tem acesso a este projeto."
    if ident.user is not None and ident.connection is None and not service and not path.startswith(USER_SCOPE_PREFIXES):
        return 400, "Selecione um projeto conectado."
    if request.method not in ("GET", "HEAD"):
        return None
    if ident.role == "visitante" and not path.startswith(VISITOR_PREFIXES):
        return 403, "Seu acesso permite apenas o Report."
    if _reads_protected() and not service and ident.user is None:
        if not _service_token() and not session_configured():
            return 503, "Acesso desabilitado. Configure FOURQA_SESSION_SECRET neste ambiente."
        return 401, "Não autorizado."
    return None


async def require_write_access(request: Request) -> None:
    if service_token_ok(request):
        return
    if current_user.get() is not None:
        if can_write(current_role.get()):
            return
        raise HTTPException(status_code=403, detail="Seu cargo neste projeto permite apenas consulta.")
    token = _service_token()
    if not token and open_writes_allowed(
        vercel=os.environ.get("VERCEL") == "1",
        allow_open_writes_flag=env_value("FOURQA_ALLOW_OPEN_WRITES"),
    ):
        return
    if not token and not session_configured():
        raise HTTPException(
            status_code=503,
            detail="Escrita desabilitada. Configure FOURQA_API_TOKEN ou FOURQA_ALLOW_OPEN_WRITES=1 neste ambiente.",
        )
    raise HTTPException(status_code=401, detail="Não autorizado.")


async def guard_plan_key(plan_key: str) -> None:
    """Leitura sem conexão explícita: o PlanKey padrão também respeita membros."""
    from fourqa.persistence.provider import get_identity_store

    if service_access.get():
        return
    store = await get_identity_store()
    connection = await store.get_connection_by_plan_key(plan_key)
    if connection is None:
        return
    user = current_user.get()
    if user is None:
        raise HTTPException(status_code=401, detail="Entre para acessar este projeto.")
    member = await store.get_member(connection["id"], user["id"])
    if effective_role(user, connection, member) is None:
        raise HTTPException(status_code=403, detail="Você não tem acesso a este projeto.")


async def require_user() -> dict:
    user = current_user.get()
    if user is None:
        raise HTTPException(status_code=401, detail="Entre para continuar.")
    return user
