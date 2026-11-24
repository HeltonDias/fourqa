"""Login com conta institucional (Entra ID): fluxo OAuth, credencial e renovação."""

import asyncio
import time
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from fourqa.auth import entra

from test_auth_connections import env  # noqa: F401  (fixture compartilhada)

PROFILE = {"id": "entra-head", "email": "head@x.com", "displayName": "Head Entra"}


@pytest.fixture()
def entra_env(env, monkeypatch: pytest.MonkeyPatch):  # noqa: F811
    monkeypatch.setenv("FOURQA_ENTRA_TENANT_ID", "tenant-1")
    monkeypatch.setenv("FOURQA_ENTRA_CLIENT_ID", "client-1")
    monkeypatch.setenv("FOURQA_ENTRA_CLIENT_SECRET", "secret-1")
    calls: dict[str, list] = {"exchange": [], "refresh": []}

    async def fake_exchange(code, verifier, redirect):
        calls["exchange"].append((code, verifier, redirect))
        return {"access_token": "at-1", "refresh_token": "rt-1", "expires_at": int(time.time()) + 3600}

    async def fake_refresh(refresh_token):
        calls["refresh"].append(refresh_token)
        return {"access_token": "at-2", "refresh_token": "rt-2", "expires_at": int(time.time()) + 3600}

    async def fake_global_profile(authorization):
        assert authorization.startswith("Bearer ")
        return PROFILE

    monkeypatch.setattr(entra, "exchange_code", fake_exchange)
    monkeypatch.setattr(entra, "refresh_tokens", fake_refresh)
    monkeypatch.setattr("fourqa.auth.ado_identity.fetch_global_profile", fake_global_profile)
    return env, calls


def _start(client: TestClient) -> tuple[str, str]:
    res = client.get("/api/auth/entra/start", follow_redirects=False)
    assert res.status_code == 302
    location = res.headers["location"]
    return location, parse_qs(urlparse(location).query)["state"][0]


def test_start_redirects_to_microsoft_with_pkce(entra_env):
    app, _ = entra_env
    client = TestClient(app)
    location, _ = _start(client)
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert parsed.netloc == "login.microsoftonline.com"
    assert parsed.path == "/tenant-1/oauth2/v2.0/authorize"
    assert query["client_id"] == ["client-1"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["redirect_uri"] == ["http://testserver/api/auth/entra/callback"]
    assert "499b84ac-1321-427f-aa17-267ca6975798/user_impersonation" in query["scope"][0]
    assert client.cookies.get(entra.OAUTH_COOKIE)


def test_callback_creates_session_and_entra_credential(entra_env):
    app, calls = entra_env
    client = TestClient(app)
    _, state = _start(client)
    res = client.get(f"/api/auth/entra/callback?code=abc&state={state}", follow_redirects=False)
    assert res.status_code == 302 and res.headers["location"] == "/"
    me = client.get("/api/auth/me").json()
    assert me["authenticated"] is True
    assert me["user"]["globalRole"] == "head"
    assert me["entraEnabled"] is True and me["patEnabled"] is False
    assert calls["exchange"][0][0] == "abc"

    from fourqa.auth.credentials import authorization_for, credential_kind
    from fourqa.db.sqlite_identity_store import get_credential

    user_id = me["user"]["id"]
    assert credential_kind(get_credential(user_id)["pat_encrypted"]) == "entra"
    assert asyncio.run(authorization_for(user_id)) == "Bearer at-1"


def test_callback_rejects_wrong_state(entra_env):
    app, calls = entra_env
    client = TestClient(app)
    _start(client)
    res = client.get("/api/auth/entra/callback?code=abc&state=forjado", follow_redirects=False)
    assert res.status_code == 302 and res.headers["location"].startswith("/login?erro=")
    assert calls["exchange"] == []
    assert client.get("/api/auth/me").json()["authenticated"] is False


def test_callback_reports_microsoft_error(entra_env):
    app, _ = entra_env
    res = TestClient(app).get("/api/auth/entra/callback?error=access_denied", follow_redirects=False)
    assert res.headers["location"].startswith("/login?erro=")


def test_expired_token_is_refreshed_and_saved(entra_env):
    app, calls = entra_env
    from fourqa.auth.credentials import authorization_for, seal_entra
    from fourqa.db.sqlite_identity_store import save_credential, upsert_user

    TestClient(app).get("/api/auth/me")
    user = upsert_user("p-1", "qa@x.com", "QA", False)
    save_credential(user["id"], seal_entra({"access_token": "old", "refresh_token": "rt-old", "expires_at": 0}), None)
    assert asyncio.run(authorization_for(user["id"])) == "Bearer at-2"
    assert calls["refresh"] == ["rt-old"]
    assert asyncio.run(authorization_for(user["id"])) == "Bearer at-2"
    assert calls["refresh"] == ["rt-old"]


def test_pat_login_blocked_when_entra_configured(entra_env, monkeypatch: pytest.MonkeyPatch):
    app, _ = entra_env
    body = {"pat": "pat-qa-xxxxxxxxxxxxxxxxxxxxxx", "organization": "org1"}
    assert TestClient(app).post("/api/auth/login", json=body).status_code == 403
    monkeypatch.setenv("FOURQA_PAT_LOGIN", "1")
    assert TestClient(app).post("/api/auth/login", json=body).status_code == 200


def test_same_email_reuses_user_between_pat_and_entra(entra_env, monkeypatch: pytest.MonkeyPatch):
    app, _ = entra_env
    monkeypatch.setenv("FOURQA_PAT_LOGIN", "1")
    pat_client = TestClient(app)
    pat_client.post("/api/auth/login", json={"pat": "pat-head-xxxxxxxxxxxxxxxxxxxx", "organization": "org1"})
    pat_id = pat_client.get("/api/auth/me").json()["user"]["id"]
    entra_client = TestClient(app)
    _, state = _start(entra_client)
    entra_client.get(f"/api/auth/entra/callback?code=abc&state={state}", follow_redirects=False)
    assert entra_client.get("/api/auth/me").json()["user"]["id"] == pat_id


def test_start_without_entra_config_returns_to_login(env):  # noqa: F811
    res = TestClient(env).get("/api/auth/entra/start", follow_redirects=False)
    assert res.status_code == 302 and res.headers["location"].startswith("/login?erro=")


def test_flow_cookie_expires(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_SESSION_SECRET", "s" * 48)
    monkeypatch.setenv("FOURQA_ENTRA_TENANT_ID", "t")
    monkeypatch.setenv("FOURQA_ENTRA_CLIENT_ID", "c")
    url, cookie = entra.start_flow("http://x/cb", now=1000)
    state = parse_qs(urlparse(url).query)["state"][0]
    assert entra.read_flow(cookie, state, now=1001)["redirect"] == "http://x/cb"
    with pytest.raises(entra.EntraError):
        entra.read_flow(cookie, "outro", now=1001)
    with pytest.raises(entra.EntraError):
        entra.read_flow(cookie, state, now=1000 + entra.OAUTH_TTL_SECONDS + 1)
    with pytest.raises(entra.EntraError):
        entra.read_flow(cookie[:-3] + "abc", state, now=1001)
