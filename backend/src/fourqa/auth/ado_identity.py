"""Identidade e descoberta no Azure DevOps com o PAT do próprio usuário."""

from __future__ import annotations

import base64
import re
from typing import Any
from urllib.parse import quote, urlencode

import httpx

from fourqa.azure.client import AzureHttpError

API_VERSION = "7.1"
VSSPS = "https://app.vssps.visualstudio.com"
DEV = "https://dev.azure.com"
REJECTED = (
    "O Azure DevOps recusou o PAT. Confira se ele está correto, não expirou e tem leitura em "
    "Test Management, Project and Team e User Profile."
)
ORG_REQUIRED = "Informe a organização do Azure DevOps (dev.azure.com/<organização>)."


def _auth(credential: str) -> str:
    """Aceita o header pronto (`Bearer` do Entra, `Basic`) ou um PAT cru."""
    if credential.startswith(("Basic ", "Bearer ")):
        return credential
    return "Basic " + base64.b64encode(f":{credential}".encode()).decode()


async def _get_json(url: str, pat: str) -> Any:
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
            res = await client.get(url, headers={"Authorization": _auth(pat), "Accept": "application/json"})
    except httpx.HTTPError:
        raise AzureHttpError("Falha de rede ao acessar o Azure DevOps.", 0) from None
    if res.status_code in (203, 401, 403) or 300 <= res.status_code < 400:
        raise AzureHttpError(REJECTED, 401 if res.status_code == 203 else res.status_code)
    if res.status_code == 404:
        raise AzureHttpError("Recurso não encontrado no Azure DevOps.", 404)
    if res.status_code >= 400:
        raise AzureHttpError(f"Azure DevOps respondeu HTTP {res.status_code}.", res.status_code)
    try:
        return res.json()
    except ValueError:
        raise AzureHttpError(REJECTED, 401) from None


def _url(base: str, path: str, query: dict[str, Any] | None = None) -> str:
    params = {"api-version": API_VERSION, **(query or {})}
    return f"{base}{path}?{urlencode({k: str(v) for k, v in params.items()})}"


_ORG_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,49}$")


def normalize_organization(value: object) -> str | None:
    """Aceita o nome ou a URL (dev.azure.com/org, org.visualstudio.com)."""
    if not isinstance(value, str):
        return None
    text = value.strip().rstrip("/")
    match = re.match(r"^(?:https?://)?dev\.azure\.com/([^/?#]+)", text, re.IGNORECASE)
    if match:
        text = match.group(1)
    else:
        match = re.match(r"^(?:https?://)?([^./]+)\.visualstudio\.com", text, re.IGNORECASE)
        if match:
            text = match.group(1)
    return text if _ORG_NAME.match(text) else None


async def fetch_global_profile(authorization: str) -> dict[str, Any]:
    """Perfil global (vssps). Funciona com token Entra; PAT só se criado para todas as organizações."""
    data = await _get_json(_url(VSSPS, "/_apis/profile/profiles/me"), authorization)
    if not isinstance(data, dict) or not data.get("id"):
        raise AzureHttpError(REJECTED, 401)
    return {
        "id": str(data["id"]),
        "email": data.get("emailAddress") or None,
        "displayName": data.get("displayName") or data.get("emailAddress") or None,
    }


async def fetch_profile(pat: str, organization: str | None = None) -> dict[str, Any]:
    """Retorna {id, email, displayName} pelo connectionData da organização (funciona com PAT de uma só org)."""
    if not organization:
        raise AzureHttpError(ORG_REQUIRED, 401)
    data = await _get_json(f"{DEV}/{quote(organization)}/_apis/connectionData", pat)
    user = data.get("authenticatedUser") if isinstance(data, dict) else None
    if not isinstance(user, dict) or not user.get("id"):
        raise AzureHttpError(REJECTED, 401)
    raw_props = user.get("properties")
    props: dict[str, Any] = raw_props if isinstance(raw_props, dict) else {}
    raw_account = props.get("Account")
    account: dict[str, Any] = raw_account if isinstance(raw_account, dict) else {}
    raw_email = account.get("$value")
    email = raw_email if isinstance(raw_email, str) else None
    return {
        "id": str(user["id"]),
        "email": email,
        "displayName": user.get("providerDisplayName") or user.get("customDisplayName") or email,
    }


async def list_organizations(pat: str, profile_id: str, org_hint: str | None = None) -> list[str]:
    names: list[str] = []
    try:
        data = await _get_json(_url(VSSPS, "/_apis/accounts", {"memberId": profile_id}), pat)
        for row in data.get("value", []) if isinstance(data, dict) else []:
            name = row.get("accountName") if isinstance(row, dict) else None
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    except AzureHttpError:
        if not org_hint:
            raise
    if org_hint and org_hint.strip() and all(n.lower() != org_hint.strip().lower() for n in names):
        names.append(org_hint.strip())
    return sorted(dict.fromkeys(names), key=str.lower)


async def list_projects(pat: str, organization: str) -> list[dict[str, Any]]:
    data = await _get_json(_url(f"{DEV}/{quote(organization)}", "/_apis/projects", {"$top": 500}), pat)
    rows = data.get("value", []) if isinstance(data, dict) else []
    out = [{"id": r.get("id"), "name": r.get("name")} for r in rows if isinstance(r, dict) and r.get("name")]
    return sorted(out, key=lambda r: str(r["name"]).lower())


async def list_test_plans(pat: str, organization: str, project: str) -> list[dict[str, Any]]:
    base = f"{DEV}/{quote(organization)}/{quote(project)}"
    out: list[dict[str, Any]] = []
    token: str | None = None
    for _ in range(20):
        query: dict[str, Any] = {"filterActivePlans": "true"}
        if token:
            query["continuationToken"] = token
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
                res = await client.get(
                    _url(base, "/_apis/testplan/plans", query),
                    headers={"Authorization": _auth(pat), "Accept": "application/json"},
                )
        except httpx.HTTPError:
            raise AzureHttpError("Falha de rede ao acessar o Azure DevOps.", 0) from None
        if res.status_code in (203, 401, 403) or 300 <= res.status_code < 400:
            raise AzureHttpError(REJECTED, 401 if res.status_code == 203 else res.status_code)
        if res.status_code >= 400:
            raise AzureHttpError(f"Azure DevOps respondeu HTTP {res.status_code}.", res.status_code)
        data = res.json()
        for row in data.get("value", []) if isinstance(data, dict) else []:
            if isinstance(row, dict) and isinstance(row.get("id"), int):
                out.append({"id": row["id"], "name": row.get("name") or f"Plano {row['id']}"})
        token = res.headers.get("x-ms-continuationtoken")
        if not token:
            break
    return sorted(out, key=lambda r: str(r["name"]).lower())


async def get_test_plan(pat: str, organization: str, project: str, plan_id: int) -> dict[str, Any]:
    base = f"{DEV}/{quote(organization)}/{quote(project)}"
    data = await _get_json(_url(base, f"/_apis/testplan/plans/{int(plan_id)}"), pat)
    if not isinstance(data, dict) or not isinstance(data.get("id"), int):
        raise AzureHttpError("Test Plan não encontrado.", 404)
    return {"id": data["id"], "name": data.get("name") or f"Plano {data['id']}"}
