package com.fourqa.api.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;

import com.fourqa.api.azure.AzureHttpError;
import com.fourqa.api.config.Env;
import com.fourqa.api.util.Py;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

/** Unit parts of {@code test_auth_connections.py}, {@code test_entra_login.py} and {@code test_write_auth.py}. */
public class AuthUnitTest {

  @AfterEach
  void clear() {
    Env.clearOverrides();
  }

  @Test
  void sessionTokenRoundtrip() {
    Env.override("FOURQA_SESSION_SECRET", "x".repeat(40));
    String token = Session.issueSession(42, 1000, Session.SESSION_TTL_SECONDS);
    assertEquals(42L, Session.readSession(token, 1001));
    assertNull(Session.readSession(token, 1000 + Session.SESSION_TTL_SECONDS + 1));
    assertNull(Session.readSession(token.substring(0, token.length() - 2) + "aa", 1001));
    Env.override("FOURQA_SESSION_SECRET", "y".repeat(40));
    assertNull(Session.readSession(token, 1001));
  }

  @Test
  void patEncryptionRoundtrip() {
    Env.override("FOURQA_PAT_ENCRYPTION_KEY", "a".repeat(40));
    String sealed = Crypto.encryptSecret("meu-pat");
    assertFalse(sealed.contains("meu-pat"));
    assertEquals("meu-pat", Crypto.decryptSecret(sealed));
    Env.override("FOURQA_PAT_ENCRYPTION_KEY", "b".repeat(40));
    assertThrows(Crypto.CredentialKeyError.class, () -> Crypto.decryptSecret(sealed));
  }

  static final String VECTOR_KEY = "vetor-de-teste-fernet-nao-operacional-0123456789";
  static final String VECTOR_SECRET = "segredo-sessao-de-teste-nao-operacional-0123456789";

  /** Token produced by the Python {@code crypto.encrypt_secret} with {@link #VECTOR_KEY}. */
  @Test
  void decryptsFernetTokenFromPython() throws Exception {
    Env.override("FOURQA_PAT_ENCRYPTION_KEY", VECTOR_KEY);
    String python = "gAAAAABq6378FD2q97nqK_sXKXvnXbnXneETja_Zkd80GHkXaJ4BspURXHxZ48UYwXOrUbZg516dZbchuG_BQAKgaUKWAl0toSiFSpzUwNIgm7V5AF0ZEuA=";
    assertEquals("pat-de-teste-ção-123", Crypto.decryptSecret(python));
    java.nio.file.Path out = java.nio.file.Path.of("target", "fernet-java-vector.txt");
    java.nio.file.Files.writeString(out, Crypto.encryptSecret("pat-de-teste-ção-123"));
  }

  /** Token produced by the Python {@code session.issue_session(42, now=1000)} with {@link #VECTOR_SECRET}. */
  @Test
  void sessionTokenMatchesPython() {
    Env.override("FOURQA_SESSION_SECRET", VECTOR_SECRET);
    assertEquals("eyJ1aWQiOjQyLCJleHAiOjQ0MjAwfQ.l_MuggROuVPnJS4sjVL3UB_-hUjdnrxXwHddzqpLzC0",
        Session.issueSession(42, 1000, Session.SESSION_TTL_SECONDS));
  }

  @Test
  void profileUsesOrganization() {
    try (MockedStatic<AdoIdentity> mocked = Mockito.mockStatic(AdoIdentity.class, Mockito.CALLS_REAL_METHODS)) {
      mocked.when(() -> AdoIdentity.getJson(anyString(), anyString())).thenAnswer(inv -> {
        assertEquals("https://dev.azure.com/Delivery-Un2/_apis/connectionData", inv.getArgument(0));
        return Py.obj("authenticatedUser", Py.obj(
            "id", "u1", "providerDisplayName", "Helton", "properties", Py.obj("Account", Py.obj("$value", "h@x.com"))));
      });
      AzureHttpError err = assertThrows(AzureHttpError.class, () -> AdoIdentity.fetchProfile("pat", null));
      assertEquals(AdoIdentity.ORG_REQUIRED, err.getMessage());
      assertEquals(Py.obj("id", "u1", "email", "h@x.com", "displayName", "Helton"), AdoIdentity.fetchProfile("pat", "Delivery-Un2"));
    }
  }

  @Test
  void normalizeOrganization() {
    assertEquals("Delivery-Un2", AdoIdentity.normalizeOrganization(" Delivery-Un2 "));
    assertEquals("Delivery-Un2", AdoIdentity.normalizeOrganization("https://dev.azure.com/Delivery-Un2/"));
    assertEquals("Delivery-Un2", AdoIdentity.normalizeOrganization("https://dev.azure.com/Delivery-Un2/CVP%20-%20SIAS"));
    assertEquals("delivery-un2", AdoIdentity.normalizeOrganization("delivery-un2.visualstudio.com"));
    assertNull(AdoIdentity.normalizeOrganization(""));
    assertNull(AdoIdentity.normalizeOrganization("org/../x"));
    assertNull(AdoIdentity.normalizeOrganization(null));
  }

  private static Map<String, Object> role(String key, Object value) {
    Map<String, Object> m = new HashMap<>();
    m.put(key, value);
    return m;
  }

  @Test
  void effectiveRoleMatrix() {
    Map<String, Object> conn = Map.of("id", 1L);
    Map<String, Object> head = Map.of("global_role", "head");
    Map<String, Object> qa = Map.of("global_role", "qa");
    assertNull(Roles.effectiveRole(null, conn, null));
    assertEquals("head", Roles.effectiveRole(head, conn, null));
    assertNull(Roles.effectiveRole(qa, conn, null));
    assertEquals("qa", Roles.effectiveRole(qa, conn, role("role", null)));
    assertEquals("lider", Roles.effectiveRole(qa, conn, role("role", "lider")));
    assertEquals("head", Roles.effectiveRole(head, conn, role("role", "visitante")));
    assertEquals("qa", Roles.effectiveRole(qa, null, null));
    assertTrue(Roles.canWrite("lider") && Roles.canWrite("head"));
    assertFalse(Roles.canWrite("qa") || Roles.canWrite("visitante") || Roles.canWrite(null));
  }

  @Test
  void flowCookieExpires() {
    Env.override("FOURQA_SESSION_SECRET", "s".repeat(48));
    Env.override("FOURQA_ENTRA_TENANT_ID", "t");
    Env.override("FOURQA_ENTRA_CLIENT_ID", "c");
    String[] flow = Entra.startFlow("http://x/cb", 1000);
    String state = queryParam(flow[0], "state");
    String cookie = flow[1];
    assertEquals("http://x/cb", Entra.readFlow(cookie, state, 1001).get("redirect"));
    assertThrows(Entra.EntraError.class, () -> Entra.readFlow(cookie, "outro", 1001));
    assertThrows(Entra.EntraError.class, () -> Entra.readFlow(cookie, state, 1000 + Entra.OAUTH_TTL_SECONDS + 1));
    assertThrows(Entra.EntraError.class, () -> Entra.readFlow(cookie.substring(0, cookie.length() - 3) + "abc", state, 1001));
  }

  public static String queryParam(String url, String name) {
    String query = url.substring(url.indexOf('?') + 1);
    String found = null;
    for (String part : query.split("&")) {
      int eq = part.indexOf('=');
      String k = java.net.URLDecoder.decode(part.substring(0, eq), java.nio.charset.StandardCharsets.UTF_8);
      if (k.equals(name)) found = java.net.URLDecoder.decode(part.substring(eq + 1), java.nio.charset.StandardCharsets.UTF_8);
    }
    return found;
  }

  @Test
  void writeAuthDecisions() {
    assertEquals("allow", WriteAuth.decideWriteAuth("segredo", false, "Bearer segredo"));
    assertEquals("unauthorized", WriteAuth.decideWriteAuth("segredo", false, null));
    assertEquals("unauthorized", WriteAuth.decideWriteAuth("segredo", false, "Bearer outro"));
    assertEquals("unconfigured", WriteAuth.decideWriteAuth("  ", false, null));
    assertEquals("allow", WriteAuth.decideWriteAuth("", true, null));
    assertEquals("Bearer segredo", WriteAuth.presentedAuthorization("Bearer segredo", "outro"));
    assertEquals("Bearer segredo", WriteAuth.presentedAuthorization(null, "segredo"));
    assertNull(WriteAuth.presentedAuthorization("  ", null));
    assertTrue(WriteAuth.tokenMatches("segredo", "segredo"));
    assertFalse(WriteAuth.tokenMatches("segredo", "outro"));
    assertTrue(WriteAuth.cookieIsSecure(true, "http"));
    assertFalse(WriteAuth.cookieIsSecure(false, "http"));
    assertTrue(WriteAuth.cookieIsSecure(false, "https"));
    assertFalse(WriteAuth.openWritesAllowed(true, "1"));
    assertTrue(WriteAuth.openWritesAllowed(false, "1"));
    assertEquals("unconfigured", WriteAuth.decideReadAuth(true, "", null));
    assertEquals("allow", WriteAuth.decideReadAuth(false, "", null));
  }
}
