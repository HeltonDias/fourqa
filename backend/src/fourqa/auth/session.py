"""Cookie de sessão de usuário assinado com HMAC-SHA256."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from fourqa.azure.config import env_value

USER_COOKIE = "fourqa_user"
SECRET_ENV = "FOURQA_SESSION_SECRET"
SESSION_TTL_SECONDS = 12 * 60 * 60


def session_configured() -> bool:
    return bool(env_value(SECRET_ENV))


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: str, secret: str) -> str:
    return _b64(hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())


def issue_session(user_id: int, now: float | None = None, ttl: int = SESSION_TTL_SECONDS) -> str:
    secret = env_value(SECRET_ENV)
    if not secret:
        raise RuntimeError(f"Configure {SECRET_ENV} neste ambiente.")
    issued = int(now if now is not None else time.time())
    payload = _b64(json.dumps({"uid": user_id, "exp": issued + ttl}, separators=(",", ":")).encode("utf-8"))
    return f"{payload}.{_sign(payload, secret)}"


def read_session(token: str | None, now: float | None = None) -> int | None:
    secret = env_value(SECRET_ENV)
    if not secret or not token or "." not in token or not token.isascii():
        return None
    payload, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(_sign(payload, secret), signature):
        return None
    try:
        data = json.loads(_unb64(payload))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("uid"), int) or not isinstance(data.get("exp"), int):
        return None
    if data["exp"] < int(now if now is not None else time.time()):
        return None
    return data["uid"]
