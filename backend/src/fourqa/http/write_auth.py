"""HTTP write/read auth."""

from __future__ import annotations

import hmac
from typing import Literal

WriteAuthDecision = Literal["allow", "unauthorized", "unconfigured"]
SESSION_COOKIE = "fourqa_session"


def presented_authorization(authorization_header: str | None, session_cookie: str | None) -> str | None:
    header = (authorization_header or "").strip()
    if header:
        return header
    cookie = (session_cookie or "").strip()
    if not cookie:
        return None
    return f"Bearer {cookie}"


def cookie_is_secure(*, vercel: bool, scheme: str) -> bool:
    if vercel:
        return True
    return scheme == "https"


def open_writes_allowed(*, vercel: bool, allow_open_writes_flag: str) -> bool:
    if vercel:
        return False
    return allow_open_writes_flag == "1"


def token_matches(configured: str, presented: str) -> bool:
    expected = configured.encode()
    received = presented.encode()
    if len(expected) != len(received):
        return False
    return hmac.compare_digest(expected, received)


def _bearer_matches(token: str, authorization_header: str | None) -> bool:
    expected = f"Bearer {token}".encode()
    received = (authorization_header or "").encode()
    return hmac.compare_digest(expected, received)


def decide_write_auth(
    *,
    configured_token: str,
    allow_open_writes: bool,
    authorization_header: str | None,
) -> WriteAuthDecision:
    token = configured_token.strip()
    if not token:
        return "allow" if allow_open_writes else "unconfigured"
    if _bearer_matches(token, authorization_header):
        return "allow"
    return "unauthorized"


def decide_read_auth(
    *,
    protect_reads: bool,
    configured_token: str,
    authorization_header: str | None,
) -> WriteAuthDecision:
    if not protect_reads:
        return "allow"
    return decide_write_auth(
        configured_token=configured_token,
        allow_open_writes=False,
        authorization_header=authorization_header,
    )
