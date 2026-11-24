package com.fourqa.api.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;

import com.fourqa.api.auth.AdoIdentity;
import com.fourqa.api.azure.AzureHttpError;
import com.fourqa.api.config.Env;
import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

/** The {@code env} fixture of {@code test_auth_connections.py}: secrets, legacy plan env and a fake Azure DevOps. */
public abstract class IdentityTestSupport extends ApiTestSupport {
  static final Map<String, Map<String, Object>> PROFILES = new LinkedHashMap<>();
  MockedStatic<AdoIdentity> ado;

  @BeforeEach
  void identityEnv() {
    PROFILES.clear();
    PROFILES.put("pat-head-xxxxxxxxxxxxxxxxxxxx", Py.obj("id", "p-head", "email", "head@x.com", "displayName", "Head"));
    PROFILES.put("pat-lider-xxxxxxxxxxxxxxxxxxx", Py.obj("id", "p-lider", "email", "lider@x.com", "displayName", "Lider"));
    PROFILES.put("pat-qa-xxxxxxxxxxxxxxxxxxxxxx", Py.obj("id", "p-qa", "email", "qa@x.com", "displayName", "QA"));
    PROFILES.put("pat-out-xxxxxxxxxxxxxxxxxxxxx", Py.obj("id", "p-out", "email", "out@x.com", "displayName", "Fora"));
    Env.override("FOURQA_SESSION_SECRET", "s".repeat(48));
    Env.override("FOURQA_PAT_ENCRYPTION_KEY", "k".repeat(48));
    Env.override("FOURQA_BOOTSTRAP_HEADS", "head@x.com");
    Env.override("AZURE_DEVOPS_ORG", "legorg");
    Env.override("AZURE_DEVOPS_PROJECT", "legproj");
    Env.override("SYNC_TEST_PLANS", "[{\"PlanKey\":\"EndToEnd\",\"PlanId\":7,\"Carregar\":\"SIM\"}]");
    Env.override("SYNC_KPI_PLAN_KEY", "");
    Env.override("KPI_PLAN_KEY", "");
    for (String name : List.of("FOURQA_ENTRA_TENANT_ID", "FOURQA_ENTRA_CLIENT_ID", "FOURQA_ENTRA_CLIENT_SECRET", "FOURQA_ENTRA_REDIRECT_URI", "FOURQA_PAT_LOGIN"))
      Env.override(name, "");
    ado = Mockito.mockStatic(AdoIdentity.class, Mockito.CALLS_REAL_METHODS);
    ado.when(() -> AdoIdentity.fetchProfile(anyString(), any())).thenAnswer(inv -> {
      Map<String, Object> profile = PROFILES.get(inv.<String>getArgument(0));
      if (profile == null) throw new AzureHttpError("PAT recusado.", 401);
      return profile;
    });
    ado.when(() -> AdoIdentity.getTestPlan(anyString(), anyString(), anyString(), anyLong()))
        .thenAnswer(inv -> Py.obj("id", inv.getArgument(3), "name", "Plano " + inv.getArgument(3)));
  }

  @AfterEach
  void closeMocks() {
    ado.close();
  }

  TestClient login(String pat) {
    TestClient client = client();
    TestClient.Resp res = client.post("/api/auth/login", Map.of("pat", pat, "organization", "org1"));
    assertEquals(200, res.status(), res.text());
    return client;
  }

  static Map<String, Object> connect(TestClient client, String org, String project, long plan) {
    TestClient.Resp res = client.post("/api/connections", Map.of("organization", org, "project", project, "testPlanId", plan));
    assertTrue(res.status() == 200 || res.status() == 201, res.text());
    return res.json();
  }

  static Map<String, Object> connect(TestClient client) {
    return connect(client, "org1", "proj1", 10);
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> conn(Map<String, Object> created) {
    return (Map<String, Object>) created.get("connection");
  }

  @SuppressWarnings("unchecked")
  static List<Map<String, Object>> list(TestClient.Resp res, String key) {
    return (List<Map<String, Object>>) res.json().get(key);
  }

  static List<Object> ids(List<Map<String, Object>> rows) {
    List<Object> out = new ArrayList<>();
    for (Map<String, Object> r : rows) out.add(r.get("id"));
    return out;
  }

  static Object idByEmail(List<Map<String, Object>> rows, String email) {
    return rows.stream().filter(m -> email.equals(m.get("email"))).findFirst().orElseThrow().get("id");
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> user(TestClient.Resp me) {
    return (Map<String, Object>) me.json().get("user");
  }
}
