"""Login com conta institucional (Microsoft Entra ID): authorization code + PKCE, cliente confidencial."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import httpx

from fourqa.auth.session import SECRET_ENV
from fourqa.azure.config import env_value

TENANT_ENV = "FOURQA_ENTRA_TENANT_ID"
CLIENT_ID_ENV = "FOURQA_ENTRA_CLIENT_ID"
CLIENT_SECRET_ENV = "FOURQA_ENTRA_CLIENT_SECRET"
REDIRECT_ENV = "FOURQA_ENTRA_REDIRECT_URI"
CALLBACK_PATH = "/api/auth/entra/callback"
OAUTH_COOKIE = "fourqa_oauth"
OAUTH_TTL_SECONDS = 10 * 60
AZURE_DEVOPS_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798"
SCOPES = f"{AZURE_DEVOPS_RESOURCE}/user_impersonation offline_access openid profile email"


class EntraError(Exception):
    pass


def entra_configured() -> bool:
    return all(env_value(name) for name in (TENANT_ENV, CLIENT_ID_ENV, CLIENT_SECRET_ENV))


def _authority() -> str:
    return f"https://login.microsoftonline.com/{env_value(TENANT_ENV)}/oauth2/v2.0"


def redirect_uri(scheme: str, host: str) -> str:
    return env_value(REDIRECT_ENV) or f"{scheme}://{host}{CALLBACK_PATH}"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _sign(payload: str) -> str:
    return _b64(hmac.new(env_value(SECRET_ENV).encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())


def start_flow(redirect: str, now: float | None = None) -> tuple[str, str]:
    """(URL de autorização, valor do cookie com state + verifier assinado)."""
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    challenge = _b64(hashlib.sha256(verifier.encode("ascii")).digest())
    issued = int(now if now is not None else time.time())
    payload = _b64(
        json.dumps({"s": state, "v": verifier, "r": redirect, "exp": issued + OAUTH_TTL_SECONDS}).encode("utf-8")
    )
    query = urlencode(
        {
            "client_id": env_value(CLIENT_ID_ENV),
            "response_type": "code",
            "redirect_uri": redirect,
            "response_mode": "query",
            "scope": SCOPES,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    )
    return f"{_authority()}/authorize?{query}", f"{payload}.{_sign(payload)}"


def read_flow(cookie: str | None, state: str | None, now: float | None = None) -> dict[str, str]:
    """Valida o cookie do fluxo contra o `state` devolvido pela Microsoft."""
    if not cookie or not state or "." not in cookie or not cookie.isascii():
        raise EntraError("Sessão de login expirada. Tente entrar novamente.")
    payload, signature = cookie.rsplit(".", 1)
    if not hmac.compare_digest(_sign(payload), signature):
        raise EntraError("Sessão de login inválida. Tente entrar novamente.")
    try:
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except ValueError:
        raise EntraError("Sessão de login inválida. Tente entrar novamente.") from None
    if not isinstance(data, dict) or data.get("exp", 0) < int(now if now is not None else time.time()):
        raise EntraError("Sessão de login expirada. Tente entrar novamente.")
    if not hmac.compare_digest(str(data.get("s")), state):
        raise EntraError("Sessão de login inválida. Tente entrar novamente.")
    return {"verifier": str(data["v"]), "redirect": str(data["r"])}


async def _token_request(form: dict[str, str]) -> dict[str, Any]:
    body = {"client_id": env_value(CLIENT_ID_ENV), "client_secret": env_value(CLIENT_SECRET_ENV), "scope": SCOPES, **form}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(f"{_authority()}/token", data=body)
    except httpx.HTTPError:
        raise EntraError("Falha de rede ao falar com a Microsoft. Tente novamente.") from None
    data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
    if res.status_code != 200 or not data.get("access_token"):
        code = data.get("error") or f"HTTP {res.status_code}"
        if code == "invalid_grant":
            raise EntraError("Sua sessão Microsoft expirou. Entre novamente.")
        raise EntraError(f"A Microsoft recusou o login ({code}).")
    expires_in = int(data.get("expires_in") or 3600)
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token") or form.get("refresh_token") or "",
        "expires_at": int(time.time()) + expires_in,
    }


async def exchange_code(code: str, verifier: str, redirect: str) -> dict[str, Any]:
    return await _token_request(
        {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect, "code_verifier": verifier}
    )


async def refresh_tokens(refresh_token: str) -> dict[str, Any]:
    if not refresh_token:
        raise EntraError("Sua sessão Microsoft expirou. Entre novamente.")
    return await _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})
