"""Credencial Azure DevOps do usuário: PAT (dev) ou tokens Entra ID, sempre criptografados no banco."""

from __future__ import annotations

import base64
import json
import time
from typing import Any

from fourqa.auth import entra
from fourqa.auth.crypto import decrypt_secret, encrypt_secret

REFRESH_MARGIN_SECONDS = 120


def seal_pat(pat: str) -> str:
    return encrypt_secret(pat)


def seal_entra(tokens: dict[str, Any]) -> str:
    return encrypt_secret(json.dumps({"kind": "entra", **tokens}))


def _basic(pat: str) -> str:
    return "Basic " + base64.b64encode(f":{pat}".encode()).decode()


def credential_kind(sealed: str) -> str:
    return "entra" if decrypt_secret(sealed).startswith('{"kind": "entra"') else "pat"


async def authorization_for(user_id: int) -> str | None:
    """Valor do header Authorization para o Azure DevOps; renova o token Entra quando perto de expirar."""
    from fourqa.persistence.provider import get_identity_store

    store = await get_identity_store()
    credential = await store.get_credential(user_id)
    if not credential:
        return None
    raw = decrypt_secret(credential["pat_encrypted"])
    if not raw.startswith('{"kind": "entra"'):
        return _basic(raw)
    tokens = json.loads(raw)
    if int(tokens.get("expires_at") or 0) - REFRESH_MARGIN_SECONDS <= int(time.time()):
        tokens = await entra.refresh_tokens(str(tokens.get("refresh_token") or ""))
        await store.save_credential(user_id, seal_entra(tokens), credential.get("org_hint"))
    return f"Bearer {tokens['access_token']}"
