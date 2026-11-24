package com.fourqa.api.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.config.Env;
import com.fourqa.api.persistence.MetaScope;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Port of {@code backend/tests/test_auth_connections.py} (HTTP parts). */
class AuthConnectionsTest extends IdentityTestSupport {

  @Test
  void loginDisabledWithoutSecrets() {
    Env.override("FOURQA_SESSION_SECRET", "");
    TestClient client = client();
    assertEquals(503, client.post("/api/auth/login", Map.of("pat", "pat-qa-xxxxxxxxxxxxxxxxxxxxxx")).status());
    assertEquals(false, client.get("/api/auth/me").json().get("loginEnabled"));
  }

  @Test
  void loginBootstrapHeadAndLogout() {
    TestClient client = client();
    assertEquals(400, client.post("/api/auth/login", Map.of("pat", "pat-head-xxxxxxxxxxxxxxxxxxxx")).status());
    assertEquals(401, client.post("/api/auth/login", Map.of("pat", "pat-invalido-xxxxxxxxxxxxxx", "organization", "org1")).status());
    TestClient head = login("pat-head-xxxxxxxxxxxxxxxxxxxx");
    String cookie = head.cookies.get("fourqa_user");
    assertTrue(cookie != null && !cookie.contains("pat-head"));
    TestClient.Resp me = head.get("/api/auth/me");
    assertEquals(true, me.json().get("authenticated"));
    assertEquals("head", user(me).get("globalRole"));
    TestClient qa = login("pat-qa-xxxxxxxxxxxxxxxxxxxxxx");
    assertEquals("qa", user(qa.get("/api/auth/me")).get("globalRole"));
    assertEquals(200, head.post("/api/auth/logout", null).status());
    head.cookies.clear();
    assertEquals(false, head.get("/api/auth/me").json().get("authenticated"));
  }

  @Test
  void connectionCreateJoinAndIsolation() {
    TestClient lider = login("pat-lider-xxxxxxxxxxxxxxxxxxx");
    TestClient qa = login("pat-qa-xxxxxxxxxxxxxxxxxxxxxx");
    TestClient out = login("pat-out-xxxxxxxxxxxxxxxxxxxxx");

    Map<String, Object> created = connect(lider);
    assertEquals(true, created.get("created"));
    Map<String, Object> conn = conn(created);
    assertEquals("org1/proj1/10", conn.get("planKey"));
    assertEquals(false, conn.get("legacy"));
    assertEquals("lider", conn.get("role"));

    Map<String, Object> joined = connect(qa);
    assertEquals(false, joined.get("created"));
    assertEquals(conn.get("id"), conn(joined).get("id"));
    assertEquals("qa", conn(joined).get("role"));

    String cid = String.valueOf(conn.get("id"));
    String[] header = {"X-FourQA-Connection", cid};
    assertEquals(200, qa.get("/api/home", header).status());
    assertEquals(403, out.get("/api/home", header).status());
    assertEquals(403, out.get("/api/home?planKey=" + conn.get("planKey")).status());
    assertEquals(401, client().get("/api/home", header).status());
    assertEquals(400, qa.get("/api/home?planKey=Outro", header).status());
    assertEquals(List.of(), ids(list(out.get("/api/connections"), "connections")));
    assertEquals(List.of(conn.get("id")), ids(list(qa.get("/api/connections"), "connections")));

    assertEquals(403, qa.put("/api/cabecalho", Map.of("title", "A", "subtitle", "B"), header).status());
    TestClient.Resp allowed = lider.put("/api/cabecalho", Map.of("title", "Projeto A", "subtitle", "Sub"), header);
    assertEquals(200, allowed.status(), allowed.text());
    assertEquals("Projeto A", lider.get("/api/home", header).json().get("title"));
    assertNotEquals("Projeto A", client().get("/api/home").json().get("title"));

    TestClient.Resp evolucao = qa.get("/api/evolucao-qa?from=2026-03-01&to=2026-03-31", header);
    assertEquals(200, evolucao.status(), evolucao.text());
    assertEquals(conn.get("planKey"), evolucao.json().get("planKey"));
    assertEquals(400, qa.get("/api/evolucao-qa?from=2026-13-01", header).status());
  }

  @Test
  void legacyConnectionAdoptsEnvPlanKey() {
    TestClient head = login("pat-head-xxxxxxxxxxxxxxxxxxxx");
    Map<String, Object> conn = conn(connect(head, "LegOrg", "LegProj", 7));
    assertEquals("EndToEnd", conn.get("planKey"));
    assertEquals(true, conn.get("legacy"));
    String[] header = {"X-FourQA-Connection", String.valueOf(conn.get("id"))};
    TestClient out = login("pat-out-xxxxxxxxxxxxxxxxxxxxx");
    assertEquals(403, out.get("/api/home", header).status());
    assertEquals(403, out.get("/api/home?planKey=EndToEnd").status());
    assertEquals(200, head.get("/api/home", header).status());
  }

  @Test
  void onlyKpiEnvPlanUsesGlobalScope() {
    Env.override("SYNC_TEST_PLANS",
        "[{\"PlanKey\":\"EndToEnd\",\"PlanId\":7,\"Carregar\":\"SIM\"},{\"PlanKey\":\"UAT\",\"PlanId\":8,\"Carregar\":\"SIM\"}]");
    TestClient head = login("pat-head-xxxxxxxxxxxxxxxxxxxx");
    Map<String, Object> kpi = conn(connect(head, "legorg", "legproj", 7));
    Map<String, Object> uat = conn(connect(head, "legorg", "legproj", 8));
    assertEquals(List.of("EndToEnd", true), List.of(kpi.get("planKey"), kpi.get("legacy")));
    assertEquals(List.of("UAT", false), List.of(uat.get("planKey"), uat.get("legacy")));
  }

  @Test
  void loggedUserWithoutConnectionCannotReachLegacyScope() {
    TestClient head = login("pat-head-xxxxxxxxxxxxxxxxxxxx");
    connect(head, "LegOrg", "LegProj", 7);
    TestClient lider = login("pat-lider-xxxxxxxxxxxxxxxxxxx");
    for (String path : List.of("/api/home", "/api/meta", "/api/sync/config", "/api/sync/status"))
      assertEquals(400, lider.get(path).status(), path);
    assertEquals(400, lider.put("/api/cabecalho", Map.of("title", "X", "subtitle", "Y")).status());
    assertEquals(400, lider.put("/api/periodo", Map.of("inicio", "2026-01-01", "fim", "2026-01-31")).status());
    assertEquals(400, lider.post("/api/sync", null).status());
    assertEquals(200, lider.get("/api/connections").status());
    assertEquals(401, client().get("/api/home").status());
    assertNotEquals(401, client().send("OPTIONS", "/api/home?planKey=EndToEnd", null,
        "Origin", "http://localhost:5173", "Access-Control-Request-Method", "GET").status());
  }

  @Test
  void memberRolesAndVisitor() {
    TestClient lider = login("pat-lider-xxxxxxxxxxxxxxxxxxx");
    TestClient qa = login("pat-qa-xxxxxxxxxxxxxxxxxxxxxx");
    Map<String, Object> conn = conn(connect(lider));
    connect(qa);
    Object cid = conn.get("id");
    TestClient.Resp members = qa.get("/api/connections/" + cid + "/members");
    assertEquals(false, members.json().get("canManage"));
    Object qaId = idByEmail(list(members, "members"), "qa@x.com");
    Object liderId = idByEmail(list(members, "members"), "lider@x.com");
    assertEquals(403, qa.put("/api/connections/" + cid + "/members/" + liderId, Map.of("role", "qa")).status());
    assertEquals(403, lider.put("/api/connections/" + cid + "/members/" + qaId, Map.of("role", "head")).status());
    assertEquals(400, lider.put("/api/connections/" + cid + "/members/" + qaId, Map.of("role", "bogus")).status());
    assertEquals(200, lider.put("/api/connections/" + cid + "/members/" + qaId, Map.of("role", "visitante")).status());
    String[] header = {"X-FourQA-Connection", String.valueOf(cid)};
    assertEquals(200, qa.get("/api/home", header).status());
    assertEquals(403, qa.get("/api/execucoes", header).status());
    assertEquals(200, lider.delete("/api/connections/" + cid + "/members/" + qaId).status());
    assertEquals(403, qa.get("/api/home", header).status());
  }

  @Test
  void adminUsersHeadOnlyAndLastHead() {
    TestClient head = login("pat-head-xxxxxxxxxxxxxxxxxxxx");
    TestClient qa = login("pat-qa-xxxxxxxxxxxxxxxxxxxxxx");
    assertEquals(403, qa.get("/api/admin/users").status());
    List<Map<String, Object>> users = list(head.get("/api/admin/users"), "users");
    Object headId = idByEmail(users, "head@x.com");
    Object qaId = idByEmail(users, "qa@x.com");
    assertEquals(409, head.put("/api/admin/users/" + headId, Map.of("globalRole", "qa")).status());
    TestClient.Resp promoted = head.put("/api/admin/users/" + qaId, Map.of("globalRole", "lider"));
    assertEquals(200, promoted.status());
    assertEquals("lider", list(promoted, "users").stream().filter(u -> qaId.equals(u.get("id"))).findFirst().orElseThrow().get("globalRole"));
  }

  @Test
  void metaScopeAndSnapshotIsolation() {
    Stores stores = Stores.get();
    MetaScope.setMetaScope("conn:9");
    try {
      stores.meta.set("data_inicio", "2026-01-01");
      assertEquals("2026-01-01", stores.meta.get("data_inicio"));
    } finally {
      MetaScope.clear();
    }
    assertNotEquals("2026-01-01", stores.meta.get("data_inicio"));

    var snapshot = stores.durableSnapshot;
    snapshot.replaceSnapshot(Py.obj("execucoes", List.of(row("A", 1), row("B", 2)), "falhas", List.of(), "meta", Map.of()));
    snapshot.replaceSnapshot(Py.obj("execucoes", List.of(row("A", 3)), "falhas", List.of(), "meta", Map.of(), "plan_keys", List.of("A")));
    assertEquals(List.of(3L), points(snapshot.listExecucoes("A")));
    assertEquals(List.of(2L), points(snapshot.listExecucoes("B")));
    snapshot.replaceSnapshot(Py.obj("execucoes", List.of(), "falhas", List.of(), "meta", Map.of(), "plan_keys", List.of()));
    assertEquals(List.of(3L), points(snapshot.listExecucoes("A")));
    assertEquals(List.of(2L), points(snapshot.listExecucoes("B")));
  }

  static Map<String, Object> row(String planKey, long point) {
    return Py.obj("plan_key", planKey, "test_point_id", point, "suite_id", 1L, "outcome", "Passed");
  }

  static List<Object> points(List<Map<String, Object>> rows) {
    List<Object> out = new ArrayList<>();
    for (Map<String, Object> r : rows) out.add(r.get("test_point_id"));
    return out;
  }

  @Test
  void bootstrapHeadIsNotRepromotedAfterDemotion() {
    TestClient head = login("pat-head-xxxxxxxxxxxxxxxxxxxx");
    TestClient lider = login("pat-lider-xxxxxxxxxxxxxxxxxxx");
    List<Map<String, Object>> users = list(head.get("/api/admin/users"), "users");
    Object headId = idByEmail(users, "head@x.com");
    Object liderId = idByEmail(users, "lider@x.com");
    assertEquals(200, head.put("/api/admin/users/" + liderId, Map.of("globalRole", "head")).status());
    assertEquals(200, lider.put("/api/admin/users/" + headId, Map.of("globalRole", "qa")).status());
    TestClient again = login("pat-head-xxxxxxxxxxxxxxxxxxxx");
    assertEquals("qa", user(again.get("/api/auth/me")).get("globalRole"));
  }

  @Test
  void malformedCookieIsIgnored() {
    TestClient client = client();
    client.cookies.put("fourqa_user", "ção.abc");
    TestClient.Resp res = client.get("/api/auth/me");
    assertEquals(200, res.status());
    assertEquals(false, res.json().get("authenticated"));
  }

  @Test
  void inviteClaimOnLoginAndPermissions() {
    TestClient lider = login("pat-lider-xxxxxxxxxxxxxxxxxxx");
    TestClient qa = login("pat-qa-xxxxxxxxxxxxxxxxxxxxxx");
    Object cid = conn(connect(lider)).get("id");
    String base = "/api/connections/" + cid;

    assertEquals(403, qa.post(base + "/invites", Map.of("email", "novo@x.com", "role", "qa")).status());
    assertEquals(403, lider.post(base + "/invites", Map.of("email", "novo@x.com", "role", "head")).status());

    TestClient.Resp invited = lider.post(base + "/invites", Map.of("email", "Novo@X.com", "role", "qa"));
    assertEquals(200, invited.status(), invited.text());
    assertEquals(true, invited.json().get("invited"));
    assertEquals(false, invited.json().get("addedMember"));
    assertEquals("novo@x.com", Py.map(invited.json().get("invite")).get("email"));

    TestClient.Resp pending = lider.get(base + "/invites");
    assertEquals(200, pending.status());
    assertEquals(List.of("novo@x.com"), list(pending, "invites").stream().map(i -> i.get("email")).toList());

    PROFILES.put("pat-novo-xxxxxxxxxxxxxxxxxxxxx", Py.obj("id", "p-novo", "email", "NOVO@x.com", "displayName", "Novo"));
    TestClient novo = login("pat-novo-xxxxxxxxxxxxxxxxxxxxx");
    assertTrue(ids(list(novo.get("/api/connections"), "connections")).contains(cid));
    Map<String, Object> member = list(lider.get(base + "/members"), "members").stream()
        .filter(m -> "NOVO@x.com".equals(m.get("email"))).findFirst().orElseThrow();
    assertEquals("qa", member.get("memberRole"));
    assertEquals(List.of(), list(lider.get(base + "/invites"), "invites"));
  }

  @Test
  void inviteExistingUserAddsMemberImmediately() {
    TestClient lider = login("pat-lider-xxxxxxxxxxxxxxxxxxx");
    TestClient qa = login("pat-qa-xxxxxxxxxxxxxxxxxxxxxx");
    Object cid = conn(connect(lider)).get("id");
    String base = "/api/connections/" + cid;
    assertTrue(list(lider.get(base + "/members"), "members").stream().noneMatch(m -> "qa@x.com".equals(m.get("email"))));

    TestClient.Resp added = lider.post(base + "/invites", Map.of("email", "qa@x.com", "role", "visitante"));
    assertEquals(200, added.status(), added.text());
    assertEquals(true, added.json().get("addedMember"));
    assertEquals(false, added.json().get("invited"));
    Map<String, Object> member = list(lider.get(base + "/members"), "members").stream()
        .filter(m -> "qa@x.com".equals(m.get("email"))).findFirst().orElseThrow();
    assertEquals("visitante", member.get("memberRole"));
    assertEquals(List.of(), list(lider.get(base + "/invites"), "invites"));
    assertFalse(list(qa.get("/api/connections"), "connections").isEmpty());
  }

  @Test
  void inviteCancelAndNoDemoteExistingMember() {
    TestClient lider = login("pat-lider-xxxxxxxxxxxxxxxxxxx");
    Object cid = conn(connect(lider)).get("id");
    String base = "/api/connections/" + cid;

    assertEquals(200, lider.post(base + "/invites", Map.of("email", "pendente@x.com", "role", "lider")).status());
    TestClient.Resp cancelled = lider.delete(base + "/invites/pendente%40x.com");
    assertEquals(200, cancelled.status());
    assertEquals(List.of(), list(cancelled, "invites"));

    PROFILES.put("pat-pend-xxxxxxxxxxxxxxxxxxxxx", Py.obj("id", "p-pend", "email", "pendente@x.com", "displayName", "Pendente"));
    TestClient pend = login("pat-pend-xxxxxxxxxxxxxxxxxxxxx");
    assertFalse(ids(list(pend.get("/api/connections"), "connections")).contains(cid));

    login("pat-qa-xxxxxxxxxxxxxxxxxxxxxx");
    lider.post(base + "/invites", Map.of("email", "qa@x.com", "role", "lider"));
    Object qaId = idByEmail(list(lider.get(base + "/members"), "members"), "qa@x.com");
    assertEquals(200, lider.put(base + "/members/" + qaId, Map.of("role", "lider")).status());
    TestClient.Resp again = lider.post(base + "/invites", Map.of("email", "qa@x.com", "role", "visitante"));
    assertEquals(200, again.status());
    assertEquals(true, again.json().get("addedMember"));
    Map<String, Object> member = list(lider.get(base + "/members"), "members").stream()
        .filter(m -> qaId.equals(m.get("id"))).findFirst().orElseThrow();
    assertEquals("lider", member.get("memberRole"));

    lider.post(base + "/invites", Map.of("email", "outro@x.com", "role", "qa"));
    assertEquals(200, lider.delete(base).status());
    Object cid2 = conn(connect(lider)).get("id");
    assertEquals(List.of(), list(lider.get("/api/connections/" + cid2 + "/invites"), "invites"));
  }

  @Test
  void invalidPathIdIs422() {
    TestClient lider = login("pat-lider-xxxxxxxxxxxxxxxxxxx");
    TestClient.Resp res = lider.get("/api/connections/abc");
    assertEquals(422, res.status());
    assertTrue(res.text().contains("int_parsing"));
  }
}
