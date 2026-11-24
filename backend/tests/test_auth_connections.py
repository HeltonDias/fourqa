"""Login por PAT, conexões, papéis e isolamento por conexão (DEC-035/036)."""

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fourqa.auth import crypto, session
from fourqa.auth.roles import can_write, effective_role
from fourqa.azure.client import AzureHttpError
from fourqa.azure.in_memory_azure_cache import reset_in_memory_azure_cache

PROFILES = {
    "pat-head-xxxxxxxxxxxxxxxxxxxx": {"id": "p-head", "email": "head@x.com", "displayName": "Head"},
    "pat-lider-xxxxxxxxxxxxxxxxxxx": {"id": "p-lider", "email": "lider@x.com", "displayName": "Lider"},
    "pat-qa-xxxxxxxxxxxxxxxxxxxxxx": {"id": "p-qa", "email": "qa@x.com", "displayName": "QA"},
    "pat-out-xxxxxxxxxxxxxxxxxxxxx": {"id": "p-out", "email": "out@x.com", "displayName": "Fora"},
}


@pytest.fixture()
def env(monkeypatch: pytest.MonkeyPatch):
    import fourqa.db.db as db_module
    import fourqa.persistence.provider as provider_module

    monkeypatch.setattr(db_module, "_db", None)
    monkeypatch.setattr(provider_module, "_cached", None)
    monkeypatch.setenv("FOURQA_DB", str(Path(tempfile.mkdtemp()) / "fourqa.db"))
    monkeypatch.setenv("DB_PROVIDER", "sqlite")
    monkeypatch.setenv("AZURE_CACHE_READ", "1")
    monkeypatch.setenv("FOURQA_API_TOKEN", "")
    monkeypatch.setenv("FOURQA_SESSION_SECRET", "s" * 48)
    monkeypatch.setenv("FOURQA_PAT_ENCRYPTION_KEY", "k" * 48)
    monkeypatch.setenv("FOURQA_BOOTSTRAP_HEADS", "head@x.com")
    monkeypatch.setenv("AZURE_DEVOPS_ORG", "legorg")
    monkeypatch.setenv("AZURE_DEVOPS_PROJECT", "legproj")
    monkeypatch.setenv("SYNC_TEST_PLANS", '[{"PlanKey":"EndToEnd","PlanId":7,"Carregar":"SIM"}]')
    monkeypatch.setenv("SYNC_KPI_PLAN_KEY", "")
    monkeypatch.setenv("KPI_PLAN_KEY", "")
    for name in ("FOURQA_ENTRA_TENANT_ID", "FOURQA_ENTRA_CLIENT_ID", "FOURQA_ENTRA_CLIENT_SECRET", "FOURQA_ENTRA_REDIRECT_URI", "FOURQA_PAT_LOGIN"):
        monkeypatch.setenv(name, "")
    monkeypatch.delenv("FOURQA_ALLOW_OPEN_WRITES", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)

    async def fake_profile(pat, organization=None):
        if pat not in PROFILES:
            raise AzureHttpError("PAT recusado.", 401)
        return PROFILES[pat]

    async def fake_plan(pat, org, project, plan_id):
        return {"id": plan_id, "name": f"Plano {plan_id}"}

    monkeypatch.setattr("fourqa.auth.ado_identity.fetch_profile", fake_profile)
    monkeypatch.setattr("fourqa.auth.ado_identity.get_test_plan", fake_plan)
    reset_in_memory_azure_cache()
    from fourqa.app import create_app

    app = create_app(skip_operational_assert=True)
    yield app
    reset_in_memory_azure_cache()
    conn = db_module._db
    if conn is not None:
        conn.close()


def _login(app, pat: str) -> TestClient:
    client = TestClient(app)
    res = client.post("/api/auth/login", json={"pat": pat, "organization": "org1"})
    assert res.status_code == 200, res.text
    return client


def _connect(client: TestClient, org="org1", project="proj1", plan=10) -> dict:
    res = client.post("/api/connections", json={"organization": org, "project": project, "testPlanId": plan})
    assert res.status_code in (200, 201), res.text
    return res.json()


def test_session_token_roundtrip(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_SESSION_SECRET", "x" * 40)
    token = session.issue_session(42, now=1000)
    assert session.read_session(token, now=1001) == 42
    assert session.read_session(token, now=1000 + session.SESSION_TTL_SECONDS + 1) is None
    assert session.read_session(token[:-2] + "aa", now=1001) is None
    monkeypatch.setenv("FOURQA_SESSION_SECRET", "y" * 40)
    assert session.read_session(token, now=1001) is None


def test_pat_encryption_roundtrip(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_PAT_ENCRYPTION_KEY", "a" * 40)
    sealed = crypto.encrypt_secret("meu-pat")
    assert "meu-pat" not in sealed
    assert crypto.decrypt_secret(sealed) == "meu-pat"
    monkeypatch.setenv("FOURQA_PAT_ENCRYPTION_KEY", "b" * 40)
    with pytest.raises(crypto.CredentialKeyError):
        crypto.decrypt_secret(sealed)


def test_profile_uses_organization(monkeypatch: pytest.MonkeyPatch):
    import asyncio

    from fourqa.auth import ado_identity

    async def fake_get(url: str, pat: str):
        assert url == "https://dev.azure.com/Delivery-Un2/_apis/connectionData"
        return {"authenticatedUser": {"id": "u1", "providerDisplayName": "Helton", "properties": {"Account": {"$value": "h@x.com"}}}}

    monkeypatch.setattr(ado_identity, "_get_json", fake_get)
    with pytest.raises(AzureHttpError) as err:
        asyncio.run(ado_identity.fetch_profile("pat"))
    assert err.value.args[0] == ado_identity.ORG_REQUIRED
    profile = asyncio.run(ado_identity.fetch_profile("pat", "Delivery-Un2"))
    assert profile == {"id": "u1", "email": "h@x.com", "displayName": "Helton"}


def test_normalize_organization():
    from fourqa.auth.ado_identity import normalize_organization

    assert normalize_organization(" Delivery-Un2 ") == "Delivery-Un2"
    assert normalize_organization("https://dev.azure.com/Delivery-Un2/") == "Delivery-Un2"
    assert normalize_organization("https://dev.azure.com/Delivery-Un2/CVP%20-%20SIAS") == "Delivery-Un2"
    assert normalize_organization("delivery-un2.visualstudio.com") == "delivery-un2"
    assert normalize_organization("") is None
    assert normalize_organization("org/../x") is None
    assert normalize_organization(None) is None


def test_effective_role_matrix():
    conn = {"id": 1}
    head = {"global_role": "head"}
    qa = {"global_role": "qa"}
    assert effective_role(None, conn, None) is None
    assert effective_role(head, conn, None) == "head"
    assert effective_role(qa, conn, None) is None
    assert effective_role(qa, conn, {"role": None}) == "qa"
    assert effective_role(qa, conn, {"role": "lider"}) == "lider"
    assert effective_role(head, conn, {"role": "visitante"}) == "head"
    assert effective_role(qa, None, None) == "qa"
    assert can_write("lider") and can_write("head")
    assert not can_write("qa") and not can_write("visitante") and not can_write(None)


def test_login_disabled_without_secrets(env, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_SESSION_SECRET", "")
    client = TestClient(env)
    res = client.post("/api/auth/login", json={"pat": "pat-qa-xxxxxxxxxxxxxxxxxxxxxx"})
    assert res.status_code == 503
    assert client.get("/api/auth/me").json()["loginEnabled"] is False


def test_login_bootstrap_head_and_logout(env):
    client = TestClient(env)
    assert client.post("/api/auth/login", json={"pat": "pat-head-xxxxxxxxxxxxxxxxxxxx"}).status_code == 400
    invalid = client.post("/api/auth/login", json={"pat": "pat-invalido-xxxxxxxxxxxxxx", "organization": "org1"})
    assert invalid.status_code == 401
    head = _login(env, "pat-head-xxxxxxxxxxxxxxxxxxxx")
    cookie = head.cookies.get("fourqa_user")
    assert cookie and "pat-head" not in cookie
    me = head.get("/api/auth/me").json()
    assert me["authenticated"] is True
    assert me["user"]["globalRole"] == "head"
    qa = _login(env, "pat-qa-xxxxxxxxxxxxxxxxxxxxxx")
    assert qa.get("/api/auth/me").json()["user"]["globalRole"] == "qa"
    assert head.post("/api/auth/logout").status_code == 200
    head.cookies.clear()
    assert head.get("/api/auth/me").json()["authenticated"] is False


def test_connection_create_join_and_isolation(env):
    lider = _login(env, "pat-lider-xxxxxxxxxxxxxxxxxxx")
    qa = _login(env, "pat-qa-xxxxxxxxxxxxxxxxxxxxxx")
    out = _login(env, "pat-out-xxxxxxxxxxxxxxxxxxxxx")

    created = _connect(lider)
    assert created["created"] is True
    conn = created["connection"]
    assert conn["planKey"] == "org1/proj1/10"
    assert conn["legacy"] is False
    assert conn["role"] == "lider"

    joined = _connect(qa)
    assert joined["created"] is False
    assert joined["connection"]["id"] == conn["id"]
    assert joined["connection"]["role"] == "qa"

    header = {"X-FourQA-Connection": str(conn["id"])}
    assert qa.get("/api/home", headers=header).status_code == 200
    assert out.get("/api/home", headers=header).status_code == 403
    assert out.get(f"/api/home?planKey={conn['planKey']}").status_code == 403
    assert TestClient(env).get("/api/home", headers=header).status_code == 401
    assert qa.get("/api/home?planKey=Outro", headers=header).status_code == 400
    assert [c["id"] for c in out.get("/api/connections").json()["connections"]] == []
    assert [c["id"] for c in qa.get("/api/connections").json()["connections"]] == [conn["id"]]

    write = qa.put("/api/cabecalho", headers=header, json={"title": "A", "subtitle": "B"})
    assert write.status_code == 403
    allowed = lider.put("/api/cabecalho", headers=header, json={"title": "Projeto A", "subtitle": "Sub"})
    assert allowed.status_code == 200, allowed.text
    assert lider.get("/api/home", headers=header).json()["title"] == "Projeto A"
    assert TestClient(env).get("/api/home").json()["title"] != "Projeto A"

    evolucao = qa.get("/api/evolucao-qa?from=2026-03-01&to=2026-03-31", headers=header)
    assert evolucao.status_code == 200, evolucao.text
    assert evolucao.json()["planKey"] == conn["planKey"]
    assert qa.get("/api/evolucao-qa?from=2026-13-01", headers=header).status_code == 400


def test_legacy_connection_adopts_env_plan_key(env):
    head = _login(env, "pat-head-xxxxxxxxxxxxxxxxxxxx")
    conn = _connect(head, org="LegOrg", project="LegProj", plan=7)["connection"]
    assert conn["planKey"] == "EndToEnd"
    assert conn["legacy"] is True
    header = {"X-FourQA-Connection": str(conn["id"])}
    out = _login(env, "pat-out-xxxxxxxxxxxxxxxxxxxxx")
    assert out.get("/api/home", headers=header).status_code == 403
    assert out.get("/api/home?planKey=EndToEnd").status_code == 403
    assert head.get("/api/home", headers=header).status_code == 200


def test_only_kpi_env_plan_uses_global_scope(env, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv(
        "SYNC_TEST_PLANS",
        '[{"PlanKey":"EndToEnd","PlanId":7,"Carregar":"SIM"},{"PlanKey":"UAT","PlanId":8,"Carregar":"SIM"}]',
    )
    head = _login(env, "pat-head-xxxxxxxxxxxxxxxxxxxx")
    kpi = _connect(head, org="legorg", project="legproj", plan=7)["connection"]
    uat = _connect(head, org="legorg", project="legproj", plan=8)["connection"]
    assert (kpi["planKey"], kpi["legacy"]) == ("EndToEnd", True)
    assert (uat["planKey"], uat["legacy"]) == ("UAT", False)


def test_logged_user_without_connection_cannot_reach_legacy_scope(env):
    head = _login(env, "pat-head-xxxxxxxxxxxxxxxxxxxx")
    _connect(head, org="LegOrg", project="LegProj", plan=7)
    lider = _login(env, "pat-lider-xxxxxxxxxxxxxxxxxxx")
    for method, path in (("get", "/api/home"), ("get", "/api/meta"), ("get", "/api/sync/config"), ("get", "/api/sync/status")):
        assert getattr(lider, method)(path).status_code == 400, path
    assert lider.put("/api/cabecalho", json={"title": "X", "subtitle": "Y"}).status_code == 400
    assert lider.put("/api/periodo", json={"inicio": "2026-01-01", "fim": "2026-01-31"}).status_code == 400
    assert lider.post("/api/sync").status_code == 400
    assert lider.get("/api/connections").status_code == 200
    assert TestClient(env).get("/api/home").status_code == 401
    assert TestClient(env).options("/api/home?planKey=EndToEnd").status_code != 401


def test_member_roles_and_visitor(env):
    lider = _login(env, "pat-lider-xxxxxxxxxxxxxxxxxxx")
    qa = _login(env, "pat-qa-xxxxxxxxxxxxxxxxxxxxxx")
    conn = _connect(lider)["connection"]
    _connect(qa)
    cid = conn["id"]
    members = qa.get(f"/api/connections/{cid}/members").json()
    assert members["canManage"] is False
    qa_id = next(m["id"] for m in members["members"] if m["email"] == "qa@x.com")
    lider_id = next(m["id"] for m in members["members"] if m["email"] == "lider@x.com")
    assert qa.put(f"/api/connections/{cid}/members/{lider_id}", json={"role": "qa"}).status_code == 403
    assert lider.put(f"/api/connections/{cid}/members/{qa_id}", json={"role": "head"}).status_code == 403
    assert lider.put(f"/api/connections/{cid}/members/{qa_id}", json={"role": "bogus"}).status_code == 400
    changed = lider.put(f"/api/connections/{cid}/members/{qa_id}", json={"role": "visitante"})
    assert changed.status_code == 200
    header = {"X-FourQA-Connection": str(cid)}
    assert qa.get("/api/home", headers=header).status_code == 200
    assert qa.get("/api/execucoes", headers=header).status_code == 403
    assert lider.delete(f"/api/connections/{cid}/members/{qa_id}").status_code == 200
    assert qa.get("/api/home", headers=header).status_code == 403


def test_admin_users_head_only_and_last_head(env):
    head = _login(env, "pat-head-xxxxxxxxxxxxxxxxxxxx")
    qa = _login(env, "pat-qa-xxxxxxxxxxxxxxxxxxxxxx")
    assert qa.get("/api/admin/users").status_code == 403
    users = head.get("/api/admin/users").json()["users"]
    head_id = next(u["id"] for u in users if u["email"] == "head@x.com")
    qa_id = next(u["id"] for u in users if u["email"] == "qa@x.com")
    assert head.put(f"/api/admin/users/{head_id}", json={"globalRole": "qa"}).status_code == 409
    promoted = head.put(f"/api/admin/users/{qa_id}", json={"globalRole": "lider"})
    assert promoted.status_code == 200
    assert next(u for u in promoted.json()["users"] if u["id"] == qa_id)["globalRole"] == "lider"


def test_meta_scope_and_snapshot_isolation(env):
    from fourqa.db.sqlite_azure_snapshot_store import list_execucoes, replace_snapshot
    from fourqa.db.sqlite_meta_store import get, set as set_meta
    from fourqa.persistence.meta_scope import reset_meta_scope, set_meta_scope

    token = set_meta_scope("conn:9")
    try:
        set_meta("data_inicio", "2026-01-01")
        assert get("data_inicio") == "2026-01-01"
    finally:
        reset_meta_scope(token)
    assert get("data_inicio") != "2026-01-01"

    def row(plan_key: str, point: int) -> dict:
        return {"plan_key": plan_key, "test_point_id": point, "suite_id": 1, "outcome": "Passed"}

    replace_snapshot({"execucoes": [row("A", 1), row("B", 2)], "falhas": [], "meta": {}})
    replace_snapshot({"execucoes": [row("A", 3)], "falhas": [], "meta": {}, "plan_keys": ["A"]})
    assert [r["test_point_id"] for r in list_execucoes("A")] == [3]
    assert [r["test_point_id"] for r in list_execucoes("B")] == [2]
    replace_snapshot({"execucoes": [], "falhas": [], "meta": {}, "plan_keys": []})
    assert [r["test_point_id"] for r in list_execucoes("A")] == [3]
    assert [r["test_point_id"] for r in list_execucoes("B")] == [2]


def test_bootstrap_head_is_not_repromoted_after_demotion(env):
    head = _login(env, "pat-head-xxxxxxxxxxxxxxxxxxxx")
    lider = _login(env, "pat-lider-xxxxxxxxxxxxxxxxxxx")
    users = head.get("/api/admin/users").json()["users"]
    head_id = next(u["id"] for u in users if u["email"] == "head@x.com")
    lider_id = next(u["id"] for u in users if u["email"] == "lider@x.com")
    assert head.put(f"/api/admin/users/{lider_id}", json={"globalRole": "head"}).status_code == 200
    assert lider.put(f"/api/admin/users/{head_id}", json={"globalRole": "qa"}).status_code == 200
    again = _login(env, "pat-head-xxxxxxxxxxxxxxxxxxxx")
    assert again.get("/api/auth/me").json()["user"]["globalRole"] == "qa"


def test_malformed_cookie_is_ignored(env):
    client = TestClient(env)
    res = client.get("/api/auth/me", headers={"cookie": "fourqa_user=ção.abc".encode("latin-1")})  # type: ignore[dict-item]
    assert res.status_code == 200
    assert res.json()["authenticated"] is False


def test_invite_claim_on_login_and_permissions(env):
    lider = _login(env, "pat-lider-xxxxxxxxxxxxxxxxxxx")
    qa = _login(env, "pat-qa-xxxxxxxxxxxxxxxxxxxxxx")
    cid = _connect(lider)["connection"]["id"]

    assert qa.post(f"/api/connections/{cid}/invites", json={"email": "novo@x.com", "role": "qa"}).status_code == 403
    assert lider.post(f"/api/connections/{cid}/invites", json={"email": "novo@x.com", "role": "head"}).status_code == 403

    invited = lider.post(f"/api/connections/{cid}/invites", json={"email": "Novo@X.com", "role": "qa"})
    assert invited.status_code == 200, invited.text
    body = invited.json()
    assert body["invited"] is True and body["addedMember"] is False
    assert body["invite"]["email"] == "novo@x.com"

    pending = lider.get(f"/api/connections/{cid}/invites")
    assert pending.status_code == 200
    assert [i["email"] for i in pending.json()["invites"]] == ["novo@x.com"]

    PROFILES["pat-novo-xxxxxxxxxxxxxxxxxxxxx"] = {
        "id": "p-novo",
        "email": "NOVO@x.com",
        "displayName": "Novo",
    }
    novo = _login(env, "pat-novo-xxxxxxxxxxxxxxxxxxxxx")
    connections = novo.get("/api/connections").json()["connections"]
    assert any(c["id"] == cid for c in connections)
    member = next(m for m in lider.get(f"/api/connections/{cid}/members").json()["members"] if m["email"] == "NOVO@x.com")
    assert member["memberRole"] == "qa"
    assert lider.get(f"/api/connections/{cid}/invites").json()["invites"] == []


def test_invite_existing_user_adds_member_immediately(env):
    lider = _login(env, "pat-lider-xxxxxxxxxxxxxxxxxxx")
    qa = _login(env, "pat-qa-xxxxxxxxxxxxxxxxxxxxxx")
    cid = _connect(lider)["connection"]["id"]
    # QA ainda não é membro deste projeto (conectou outro escopo ou só login).
    assert all(m["email"] != "qa@x.com" for m in lider.get(f"/api/connections/{cid}/members").json()["members"])

    added = lider.post(f"/api/connections/{cid}/invites", json={"email": "qa@x.com", "role": "visitante"})
    assert added.status_code == 200, added.text
    assert added.json()["addedMember"] is True
    assert added.json()["invited"] is False
    member = next(m for m in lider.get(f"/api/connections/{cid}/members").json()["members"] if m["email"] == "qa@x.com")
    assert member["memberRole"] == "visitante"
    assert lider.get(f"/api/connections/{cid}/invites").json()["invites"] == []
    assert qa.get("/api/connections").json()["connections"]


def test_invite_cancel_and_no_demote_existing_member(env):
    lider = _login(env, "pat-lider-xxxxxxxxxxxxxxxxxxx")
    cid = _connect(lider)["connection"]["id"]

    created = lider.post(f"/api/connections/{cid}/invites", json={"email": "pendente@x.com", "role": "lider"})
    assert created.status_code == 200
    cancelled = lider.delete(f"/api/connections/{cid}/invites/pendente%40x.com")
    assert cancelled.status_code == 200
    assert cancelled.json()["invites"] == []

    # Sem convite, login não adiciona projeto.
    PROFILES["pat-pend-xxxxxxxxxxxxxxxxxxxxx"] = {
        "id": "p-pend",
        "email": "pendente@x.com",
        "displayName": "Pendente",
    }
    pend = _login(env, "pat-pend-xxxxxxxxxxxxxxxxxxxxx")
    assert all(c["id"] != cid for c in pend.get("/api/connections").json()["connections"])

    # Membro existente não é rebaixado por convite posterior.
    qa = _login(env, "pat-qa-xxxxxxxxxxxxxxxxxxxxxx")
    lider.post(f"/api/connections/{cid}/invites", json={"email": "qa@x.com", "role": "lider"})
    qa_id = next(m["id"] for m in lider.get(f"/api/connections/{cid}/members").json()["members"] if m["email"] == "qa@x.com")
    assert lider.put(f"/api/connections/{cid}/members/{qa_id}", json={"role": "lider"}).status_code == 200
    again = lider.post(f"/api/connections/{cid}/invites", json={"email": "qa@x.com", "role": "visitante"})
    assert again.status_code == 200 and again.json()["addedMember"] is True
    member = next(m for m in lider.get(f"/api/connections/{cid}/members").json()["members"] if m["id"] == qa_id)
    assert member["memberRole"] == "lider"

    # Excluir projeto remove convites pendentes em cascata.
    lider.post(f"/api/connections/{cid}/invites", json={"email": "outro@x.com", "role": "qa"})
    assert lider.delete(f"/api/connections/{cid}").status_code == 200
    # Novo projeto com mesmo org/plan não herda convites.
    cid2 = _connect(lider)["connection"]["id"]
    assert lider.get(f"/api/connections/{cid2}/invites").json()["invites"] == []
