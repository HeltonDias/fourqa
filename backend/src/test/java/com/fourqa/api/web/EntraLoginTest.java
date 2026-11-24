package com.fourqa.api.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;

import com.fourqa.api.auth.AdoIdentity;
import com.fourqa.api.auth.AuthUnitTest;
import com.fourqa.api.auth.Credentials;
import com.fourqa.api.auth.Entra;
import com.fourqa.api.config.Env;
import com.fourqa.api.persistence.IdentityStore;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

/** Port of {@code backend/tests/test_entra_login.py} (HTTP parts). */
class EntraLoginTest extends IdentityTestSupport {
  static final Map<String, Object> PROFILE = Py.obj("id", "entra-head", "email", "head@x.com", "displayName", "Head Entra");
  MockedStatic<Entra> entra;
  final List<List<String>> exchanges = new ArrayList<>();
  final List<String> refreshes = new ArrayList<>();

  @BeforeEach
  void entraEnv() {
    Env.override("FOURQA_ENTRA_TENANT_ID", "tenant-1");
    Env.override("FOURQA_ENTRA_CLIENT_ID", "client-1");
    Env.override("FOURQA_ENTRA_CLIENT_SECRET", "secret-1");
    exchanges.clear();
    refreshes.clear();
    entra = Mockito.mockStatic(Entra.class, Mockito.CALLS_REAL_METHODS);
    entra.when(() -> Entra.exchangeCode(anyString(), anyString(), anyString())).thenAnswer(inv -> {
      exchanges.add(List.of(inv.getArgument(0), inv.getArgument(1), inv.getArgument(2)));
      return Py.obj("access_token", "at-1", "refresh_token", "rt-1", "expires_at", System.currentTimeMillis() / 1000 + 3600);
    });
    entra.when(() -> Entra.refreshTokens(anyString())).thenAnswer(inv -> {
      refreshes.add(inv.getArgument(0));
      return Py.obj("access_token", "at-2", "refresh_token", "rt-2", "expires_at", System.currentTimeMillis() / 1000 + 3600);
    });
    ado.when(() -> AdoIdentity.fetchGlobalProfile(anyString())).thenAnswer(inv -> {
      assertTrue(inv.<String>getArgument(0).startsWith("Bearer "));
      return PROFILE;
    });
  }

  @AfterEach
  void closeEntra() {
    entra.close();
  }

  static String[] start(TestClient client) {
    TestClient.Resp res = client.get("/api/auth/entra/start");
    assertEquals(302, res.status());
    String location = res.header("Location");
    return new String[] {location, AuthUnitTest.queryParam(location, "state")};
  }

  @Test
  void startRedirectsToMicrosoftWithPkce() {
    TestClient client = client();
    String location = start(client)[0];
    URI uri = URI.create(location);
    assertEquals("login.microsoftonline.com", uri.getHost());
    assertEquals("/tenant-1/oauth2/v2.0/authorize", uri.getPath());
    assertEquals("client-1", AuthUnitTest.queryParam(location, "client_id"));
    assertEquals("S256", AuthUnitTest.queryParam(location, "code_challenge_method"));
    assertEquals("http://localhost/api/auth/entra/callback", AuthUnitTest.queryParam(location, "redirect_uri"));
    assertTrue(AuthUnitTest.queryParam(location, "scope").contains("499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"));
    assertTrue(client.cookies.containsKey(Entra.OAUTH_COOKIE));
  }

  @Test
  void callbackCreatesSessionAndEntraCredential() {
    TestClient client = client();
    String state = start(client)[1];
    TestClient.Resp res = client.get("/api/auth/entra/callback?code=abc&state=" + state);
    assertEquals(302, res.status());
    assertEquals("/", res.header("Location"));
    TestClient.Resp me = client.get("/api/auth/me");
    assertEquals(true, me.json().get("authenticated"));
    assertEquals("head", user(me).get("globalRole"));
    assertEquals(true, me.json().get("entraEnabled"));
    assertEquals(false, me.json().get("patEnabled"));
    assertEquals("abc", exchanges.get(0).get(0));
    long userId = Py.toLong(user(me).get("id"));
    IdentityStore store = Stores.get().identity;
    assertEquals("entra", Credentials.credentialKind(Py.str(store.getCredential(userId).get("pat_encrypted"))));
    assertEquals("Bearer at-1", Credentials.authorizationFor(userId));
  }

  @Test
  void callbackRejectsWrongState() {
    TestClient client = client();
    start(client);
    TestClient.Resp res = client.get("/api/auth/entra/callback?code=abc&state=forjado");
    assertEquals(302, res.status());
    assertTrue(res.header("Location").startsWith("/login?erro="));
    assertTrue(exchanges.isEmpty());
    assertEquals(false, client.get("/api/auth/me").json().get("authenticated"));
  }

  @Test
  void callbackReportsMicrosoftError() {
    TestClient.Resp res = client().get("/api/auth/entra/callback?error=access_denied");
    assertTrue(res.header("Location").startsWith("/login?erro="));
  }

  @Test
  void expiredTokenIsRefreshedAndSaved() {
    client().get("/api/auth/me");
    IdentityStore store = Stores.get().identity;
    Map<String, Object> user = store.upsertUser("p-1", "qa@x.com", "QA", false);
    long userId = Py.toLong(user.get("id"));
    store.saveCredential(userId, Credentials.sealEntra(Py.obj("access_token", "old", "refresh_token", "rt-old", "expires_at", 0L)), null);
    assertEquals("Bearer at-2", Credentials.authorizationFor(userId));
    assertEquals(List.of("rt-old"), refreshes);
    assertEquals("Bearer at-2", Credentials.authorizationFor(userId));
    assertEquals(List.of("rt-old"), refreshes);
  }

  @Test
  void patLoginBlockedWhenEntraConfigured() {
    Map<String, Object> body = Map.of("pat", "pat-qa-xxxxxxxxxxxxxxxxxxxxxx", "organization", "org1");
    assertEquals(403, client().post("/api/auth/login", body).status());
    Env.override("FOURQA_PAT_LOGIN", "1");
    assertEquals(200, client().post("/api/auth/login", body).status());
  }

  @Test
  void sameEmailReusesUserBetweenPatAndEntra() {
    Env.override("FOURQA_PAT_LOGIN", "1");
    TestClient patClient = client();
    patClient.post("/api/auth/login", Map.of("pat", "pat-head-xxxxxxxxxxxxxxxxxxxx", "organization", "org1"));
    Object patId = user(patClient.get("/api/auth/me")).get("id");
    TestClient entraClient = client();
    String state = start(entraClient)[1];
    entraClient.get("/api/auth/entra/callback?code=abc&state=" + state);
    assertEquals(patId, user(entraClient.get("/api/auth/me")).get("id"));
  }

  @Test
  void startWithoutEntraConfigReturnsToLogin() {
    Env.override("FOURQA_ENTRA_TENANT_ID", "");
    TestClient.Resp res = client().get("/api/auth/entra/start");
    assertEquals(302, res.status());
    assertTrue(res.header("Location").startsWith("/login?erro="));
  }
}
