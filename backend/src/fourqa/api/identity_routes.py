"""Login (Entra ID ou PAT de dev), descoberta no Azure DevOps, conexões, membros e papéis."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

from fourqa.auth import ado_identity, entra
from fourqa.auth.access import require_user
from fourqa.auth.credentials import authorization_for, seal_entra, seal_pat
from fourqa.auth.crypto import CredentialKeyError, encryption_configured
from fourqa.auth.entra import EntraError, entra_configured
from fourqa.auth.roles import ROLE_LABEL, ROLES, at_least, effective_role, normalize_role
from fourqa.auth.session import SESSION_TTL_SECONDS, USER_COOKIE, issue_session, session_configured
from fourqa.azure.client import AzureHttpError
from fourqa.azure.config import env_value, read_sync_settings
from fourqa.http.write_auth import cookie_is_secure
from fourqa.persistence.provider import get_identity_store

router = APIRouter()


def _secure(request: Request) -> bool:
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    return cookie_is_secure(vercel=os.environ.get("VERCEL") == "1", scheme=scheme)


def _bootstrap_heads() -> set[str]:
    return {e.strip().lower() for e in env_value("FOURQA_BOOTSTRAP_HEADS").split(",") if e.strip()}


def present_user(user: dict[str, Any]) -> dict[str, Any]:
    role = normalize_role(user.get("global_role")) or "qa"
    return {
        "id": user["id"],
        "name": user.get("display_name") or user.get("email") or "Usuário",
        "email": user.get("email"),
        "globalRole": role,
        "globalRoleLabel": ROLE_LABEL[role],
    }


def present_connection(conn: dict[str, Any], role: str | None) -> dict[str, Any]:
    return {
        "id": conn["id"],
        "organization": conn["org"],
        "project": conn["project"],
        "testPlanId": conn["test_plan_id"],
        "testPlanName": conn.get("test_plan_name"),
        "planKey": conn["plan_key"],
        "title": conn.get("title") or conn.get("test_plan_name") or conn["plan_key"],
        "legacy": bool(conn.get("legacy")),
        "role": role,
        "roleLabel": ROLE_LABEL.get(role or "", None),
    }


def _azure_error(err: AzureHttpError) -> HTTPException:
    if err.status == 404:
        return HTTPException(status_code=404, detail=str(err))
    if err.status in (401, 403):
        return HTTPException(status_code=401, detail=f"{err} Entre novamente.")
    return HTTPException(status_code=502, detail=str(err))


async def _user_pat(user: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """(header Authorization para o Azure DevOps, credencial guardada)."""
    store = await get_identity_store()
    credential = await store.get_credential(user["id"])
    if not credential:
        raise HTTPException(status_code=401, detail="Entre novamente.")
    try:
        authorization = await authorization_for(user["id"])
    except (CredentialKeyError, EntraError) as err:
        raise HTTPException(status_code=401, detail=str(err)) from err
    if not authorization:
        raise HTTPException(status_code=401, detail="Entre novamente.")
    return authorization, credential


def _login_ready() -> bool:
    return session_configured() and encryption_configured()


def pat_login_enabled() -> bool:
    """PAT é alternativa de dev: vale sem Entra configurado ou com FOURQA_PAT_LOGIN=1."""
    return _login_ready() and (not entra_configured() or env_value("FOURQA_PAT_LOGIN") == "1")


def entra_login_enabled() -> bool:
    return _login_ready() and entra_configured()


def _session_response(response: Response, user: dict[str, Any], request: Request) -> Response:
    response.set_cookie(
        key=USER_COOKIE,
        value=issue_session(user["id"]),
        httponly=True,
        secure=_secure(request),
        samesite="lax",
        path="/",
        max_age=SESSION_TTL_SECONDS,
    )
    return response


async def _upsert_identity(profile: dict[str, Any]) -> dict[str, Any]:
    email = (profile.get("email") or "").strip() or None
    store = await get_identity_store()
    profile_id = profile["id"]
    if email:
        same_email = await store.find_user_by_email(email)
        if same_email is not None:
            profile_id = same_email["ado_profile_id"]
    user = await store.upsert_user(
        profile_id,
        email,
        profile.get("displayName"),
        bool(email and email.lower() in _bootstrap_heads()),
    )
    await store.claim_invites_for_user(email, user["id"])
    return user


def _normalize_invite_email(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    email = raw.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@") or " " in email:
        return None
    local, _, domain = email.partition("@")
    if not local or "." not in domain:
        return None
    return email


# --- Sessão ---------------------------------------------------------------


@router.get("/auth/entra/start")
async def entra_start(request: Request):
    if not entra_login_enabled():
        return RedirectResponse("/login?erro=" + quote("Login institucional não configurado neste ambiente."), 302)
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    url, flow_cookie = entra.start_flow(entra.redirect_uri(scheme, host))
    response = RedirectResponse(url, 302)
    response.set_cookie(
        key=entra.OAUTH_COOKIE,
        value=flow_cookie,
        httponly=True,
        secure=_secure(request),
        samesite="lax",
        path="/api/auth/entra",
        max_age=entra.OAUTH_TTL_SECONDS,
    )
    return response


@router.get("/auth/entra/callback")
async def entra_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    def fail(message: str) -> Response:
        response = RedirectResponse("/login?erro=" + quote(message), 302)
        response.delete_cookie(entra.OAUTH_COOKIE, path="/api/auth/entra")
        return response

    if not entra_login_enabled():
        return fail("Login institucional não configurado neste ambiente.")
    if error:
        return fail("Login cancelado ou recusado pela Microsoft." if error == "access_denied" else f"Microsoft: {error}.")
    try:
        flow = entra.read_flow(request.cookies.get(entra.OAUTH_COOKIE), state)
        if not code:
            raise entra.EntraError("A Microsoft não devolveu o código de login.")
        tokens = await entra.exchange_code(code, flow["verifier"], flow["redirect"])
        profile = await ado_identity.fetch_global_profile(f"Bearer {tokens['access_token']}")
    except entra.EntraError as err:
        return fail(str(err))
    except AzureHttpError:
        return fail("Sua conta entrou, mas o Azure DevOps recusou o acesso. Confirme que você tem acesso a uma organização.")
    user = await _upsert_identity(profile)
    store = await get_identity_store()
    await store.save_credential(user["id"], seal_entra(tokens), None)
    response = _session_response(RedirectResponse("/", 302), user, request)
    response.delete_cookie(entra.OAUTH_COOKIE, path="/api/auth/entra")
    return response


@router.post("/auth/login")
async def login(body: dict[str, Any], request: Request):
    if not _login_ready():
        raise HTTPException(
            status_code=503,
            detail="Login desabilitado. Configure FOURQA_SESSION_SECRET e FOURQA_PAT_ENCRYPTION_KEY neste ambiente.",
        )
    if not pat_login_enabled():
        raise HTTPException(status_code=403, detail="Entre com sua conta institucional (Microsoft).")
    pat = body.get("pat")
    organization = body.get("organization")
    if not isinstance(pat, str) or not (20 <= len(pat.strip()) <= 200):
        raise HTTPException(status_code=400, detail="Informe um PAT válido.")
    org = ado_identity.normalize_organization(organization)
    if org is None:
        raise HTTPException(status_code=400, detail="Informe a organização do Azure DevOps (dev.azure.com/<organização>).")
    pat = pat.strip()
    try:
        profile = await ado_identity.fetch_profile(pat, org)
    except AzureHttpError as err:
        raise HTTPException(status_code=401, detail=str(err)) from err
    user = await _upsert_identity(profile)
    store = await get_identity_store()
    await store.save_credential(user["id"], seal_pat(pat), org)
    return _session_response(JSONResponse({"user": present_user(user)}), user, request)


@router.get("/auth/me")
async def me(request: Request):
    from fourqa.auth.context import current_user

    user = current_user.get()
    return {
        "authenticated": user is not None,
        "user": present_user(user) if user else None,
        "loginEnabled": _login_ready(),
        "entraEnabled": entra_login_enabled(),
        "patEnabled": pat_login_enabled(),
    }


@router.post("/auth/logout")
async def logout(request: Request):
    from fourqa.auth.context import current_user

    user = current_user.get()
    if user is not None:
        store = await get_identity_store()
        await store.delete_credential(user["id"])
    response = JSONResponse({"ok": True})
    response.delete_cookie(key=USER_COOKIE, path="/", httponly=True, secure=_secure(request), samesite="lax")
    return response


# --- Descoberta no Azure DevOps --------------------------------------------


@router.get("/azure/orgs")
async def azure_orgs(user: dict = Depends(require_user)):
    pat, credential = await _user_pat(user)
    try:
        member_id = user["ado_profile_id"]
        if pat.startswith("Bearer "):
            member_id = (await ado_identity.fetch_global_profile(pat))["id"]
        orgs = await ado_identity.list_organizations(pat, member_id, credential.get("org_hint"))
    except AzureHttpError as err:
        raise _azure_error(err) from err
    return {"organizations": orgs}


@router.get("/azure/orgs/{org}/projects")
async def azure_projects(org: str, user: dict = Depends(require_user)):
    pat, _ = await _user_pat(user)
    try:
        return {"projects": await ado_identity.list_projects(pat, org)}
    except AzureHttpError as err:
        raise _azure_error(err) from err


@router.get("/azure/orgs/{org}/projects/{project}/test-plans")
async def azure_test_plans(org: str, project: str, user: dict = Depends(require_user)):
    pat, _ = await _user_pat(user)
    try:
        return {"testPlans": await ado_identity.list_test_plans(pat, org, project)}
    except AzureHttpError as err:
        raise _azure_error(err) from err


# --- Conexões ---------------------------------------------------------------


def _legacy_plan(org: str, project: str, plan_id: int) -> tuple[str | None, bool]:
    """(PlanKey do env, usa o escopo global). Só o plano KPI herda período e cabeçalho globais."""
    settings = read_sync_settings()
    if str(settings.get("organization") or "").strip().lower() != org.strip().lower():
        return None, False
    if str(settings.get("project") or "").strip().lower() != project.strip().lower():
        return None, False
    for plan in settings.get("plans") or []:  # type: ignore[union-attr]
        if isinstance(plan, dict) and plan.get("planId") == plan_id and plan.get("planKey"):
            key = str(plan["planKey"])
            kpi = str(settings.get("kpiPlanKey") or "").strip().lower()
            return key, key.strip().lower() == kpi
    return None, False


async def _connection_access(connection_id: int, user: dict[str, Any]) -> tuple[dict[str, Any], str]:
    store = await get_identity_store()
    conn = await store.get_connection(connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Conexão não encontrada.")
    member = await store.get_member(conn["id"], user["id"])
    role = effective_role(user, conn, member)
    if role is None:
        raise HTTPException(status_code=403, detail="Você não tem acesso a este projeto.")
    return conn, role


@router.get("/connections")
async def list_connections(user: dict = Depends(require_user)):
    store = await get_identity_store()
    if normalize_role(user.get("global_role")) == "head":
        rows = await store.list_connections()
        return {"connections": [present_connection(c, "head") for c in rows]}
    rows = await store.list_connections_for_user(user["id"])
    out = []
    for conn in rows:
        role = effective_role(user, conn, {"role": conn.get("member_role")})
        out.append(present_connection(conn, role))
    return {"connections": out}


@router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: int, user: dict = Depends(require_user)):
    conn, role = await _connection_access(connection_id, user)
    if not at_least(role, "lider"):
        raise HTTPException(status_code=403, detail="Só Líder ou Head desconecta o projeto.")
    store = await get_identity_store()
    await store.delete_connection(conn["id"])
    return {"ok": True}


@router.get("/connections/{connection_id}")
async def get_connection(connection_id: int, user: dict = Depends(require_user)):
    conn, role = await _connection_access(connection_id, user)
    return present_connection(conn, role)


@router.post("/connections")
async def create_connection(body: dict[str, Any], user: dict = Depends(require_user)):
    org = body.get("organization")
    project = body.get("project")
    plan_id = body.get("testPlanId")
    title = body.get("title")
    if not isinstance(org, str) or not org.strip() or not isinstance(project, str) or not project.strip():
        raise HTTPException(status_code=400, detail="Informe organização e projeto.")
    if not isinstance(plan_id, int) or plan_id <= 0:
        raise HTTPException(status_code=400, detail="Informe o Test Plan.")
    if title is not None and (not isinstance(title, str) or len(title) > 200):
        raise HTTPException(status_code=400, detail="Nome de exibição até 200 caracteres.")
    org, project = org.strip(), project.strip()
    pat, _ = await _user_pat(user)
    try:
        plan = await ado_identity.get_test_plan(pat, org, project, plan_id)
    except AzureHttpError as err:
        raise _azure_error(err) from err
    store = await get_identity_store()
    existing = await store.find_connection(org, project, plan_id)
    if existing is not None:
        await store.add_member(existing["id"], user["id"], None)
        member = await store.get_member(existing["id"], user["id"])
        return JSONResponse(
            status_code=200,
            content={"created": False, "connection": present_connection(existing, effective_role(user, existing, member))},
        )
    legacy_key, legacy_scope = _legacy_plan(org, project, plan_id)
    plan_key = legacy_key or f"{org}/{project}/{plan_id}"
    if await store.get_connection_by_plan_key(plan_key) is not None:
        raise HTTPException(status_code=409, detail="Já existe uma conexão com este PlanKey.")
    conn = await store.create_connection(
        org,
        project,
        plan_id,
        plan["name"],
        plan_key,
        (title or "").strip() or plan["name"],
        legacy_scope,
        user["id"],
    )
    await store.add_member(conn["id"], user["id"], "lider")
    member = await store.get_member(conn["id"], user["id"])
    return JSONResponse(
        status_code=201,
        content={"created": True, "connection": present_connection(conn, effective_role(user, conn, member))},
    )


# --- Membros do projeto (DEC-036) ------------------------------------------


@router.get("/connections/{connection_id}/members")
async def list_members(connection_id: int, user: dict = Depends(require_user)):
    conn, role = await _connection_access(connection_id, user)
    if not at_least(role, "qa"):
        raise HTTPException(status_code=403, detail="Seu acesso permite apenas o Report.")
    store = await get_identity_store()
    members = await store.list_members(conn["id"])
    out = []
    for m in members:
        eff = effective_role(m, conn, {"role": m.get("member_role")})
        out.append(
            {
                **present_user(m),
                "memberRole": normalize_role(m.get("member_role")),
                "effectiveRole": eff,
                "effectiveRoleLabel": ROLE_LABEL.get(eff or "", None),
            }
        )
    return {"connection": present_connection(conn, role), "canManage": at_least(role, "lider"), "members": out, "roles": list(ROLES)}


async def _guard_member_change(connection_id: int, target_id: int, actor: dict[str, Any]) -> tuple[dict[str, Any], str, dict[str, Any]]:
    conn, role = await _connection_access(connection_id, actor)
    if not at_least(role, "lider"):
        raise HTTPException(status_code=403, detail="Só Líder ou Head altera papéis neste projeto.")
    store = await get_identity_store()
    target = await store.get_user(target_id)
    member = await store.get_member(conn["id"], target_id)
    if target is None or member is None:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")
    target_role = effective_role(target, conn, member)
    if target_role == "head" and role != "head":
        raise HTTPException(status_code=403, detail="Só Head altera o papel de um Head.")
    return conn, role, member


@router.put("/connections/{connection_id}/members/{user_id}")
async def set_member_role(connection_id: int, user_id: int, body: dict[str, Any], user: dict = Depends(require_user)):
    conn, actor_role, _ = await _guard_member_change(connection_id, user_id, user)
    raw = body.get("role")
    role = None if raw is None or raw == "" else normalize_role(raw)
    if raw not in (None, "") and role is None:
        raise HTTPException(status_code=400, detail="Papel inválido.")
    if role == "head" and actor_role != "head":
        raise HTTPException(status_code=403, detail="Só Head concede o papel Head.")
    store = await get_identity_store()
    await store.set_member_role(conn["id"], user_id, role)
    return await list_members(connection_id, user)


@router.delete("/connections/{connection_id}/members/{user_id}")
async def remove_member(connection_id: int, user_id: int, user: dict = Depends(require_user)):
    conn, _, _ = await _guard_member_change(connection_id, user_id, user)
    store = await get_identity_store()
    await store.remove_member(conn["id"], user_id)
    return await list_members(connection_id, user)


# --- Convites por e-mail (OPEN-013 parcial) ---------------------------------


async def _guard_invite_manage(connection_id: int, actor: dict[str, Any]) -> tuple[dict[str, Any], str]:
    conn, role = await _connection_access(connection_id, actor)
    if not at_least(role, "lider"):
        raise HTTPException(status_code=403, detail="Só Líder ou Head convida usuários neste projeto.")
    return conn, role


def _present_invite(invite: dict[str, Any]) -> dict[str, Any]:
    role = normalize_role(invite.get("role")) or "qa"
    return {
        "id": invite["id"],
        "email": invite["email"],
        "role": role,
        "roleLabel": ROLE_LABEL[role],
        "invitedBy": invite.get("invited_by"),
        "createdAt": invite.get("created_at"),
    }


@router.get("/connections/{connection_id}/invites")
async def list_invites(connection_id: int, user: dict = Depends(require_user)):
    conn, role = await _guard_invite_manage(connection_id, user)
    store = await get_identity_store()
    invites = await store.list_invites(conn["id"])
    return {
        "connection": present_connection(conn, role),
        "canManage": True,
        "invites": [_present_invite(i) for i in invites],
        "roles": list(ROLES),
    }


@router.post("/connections/{connection_id}/invites")
async def create_invite(connection_id: int, body: dict[str, Any], user: dict = Depends(require_user)):
    conn, actor_role = await _guard_invite_manage(connection_id, user)
    email = _normalize_invite_email(body.get("email"))
    if email is None:
        raise HTTPException(status_code=400, detail="Informe um e-mail válido.")
    role = normalize_role(body.get("role"))
    if role is None:
        raise HTTPException(status_code=400, detail="Papel inválido.")
    if role == "head" and actor_role != "head":
        raise HTTPException(status_code=403, detail="Só Head concede o papel Head.")
    store = await get_identity_store()
    existing = await store.find_user_by_email(email)
    if existing is not None:
        member = await store.get_member(conn["id"], existing["id"])
        if member is None:
            await store.add_member(conn["id"], existing["id"], role)
        await store.delete_invite(conn["id"], email)
        return {"addedMember": True, "invited": False, "user": present_user(existing)}
    invite = await store.upsert_invite(conn["id"], email, role, user["id"])
    return {"invited": True, "addedMember": False, "invite": _present_invite(invite)}


@router.delete("/connections/{connection_id}/invites/{email}")
async def cancel_invite(connection_id: int, email: str, user: dict = Depends(require_user)):
    conn, _ = await _guard_invite_manage(connection_id, user)
    normalized = _normalize_invite_email(email)
    if normalized is None:
        raise HTTPException(status_code=400, detail="Informe um e-mail válido.")
    store = await get_identity_store()
    deleted = await store.delete_invite(conn["id"], normalized)
    if not deleted:
        raise HTTPException(status_code=404, detail="Convite não encontrado.")
    return await list_invites(connection_id, user)


# --- Papéis globais (só Head) -----------------------------------------------


def _require_head(user: dict[str, Any]) -> None:
    if normalize_role(user.get("global_role")) != "head":
        raise HTTPException(status_code=403, detail="Só Head acessa os papéis globais.")


@router.get("/admin/users")
async def admin_users(user: dict = Depends(require_user)):
    _require_head(user)
    store = await get_identity_store()
    return {"users": [present_user(u) for u in await store.list_users()], "roles": list(ROLES)}


@router.put("/admin/users/{user_id}")
async def admin_set_role(user_id: int, body: dict[str, Any], user: dict = Depends(require_user)):
    _require_head(user)
    role = normalize_role(body.get("globalRole"))
    if role is None:
        raise HTTPException(status_code=400, detail="Papel inválido.")
    store = await get_identity_store()
    target = await store.get_user(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if normalize_role(target.get("global_role")) == "head" and role != "head" and await store.count_heads() <= 1:
        raise HTTPException(status_code=409, detail="Não é possível rebaixar o último Head.")
    await store.set_global_role(user_id, role)
    return {"users": [present_user(u) for u in await store.list_users()], "roles": list(ROLES)}
