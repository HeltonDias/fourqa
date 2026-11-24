package com.fourqa.api.auth;

import com.fourqa.api.azure.Http;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.util.LinkedHashMap;
import java.util.Map;

/** Azure DevOps credential of the user: PAT (dev) or Entra ID tokens, always encrypted (port of {@code credentials}). */
public final class Credentials {
  static final int REFRESH_MARGIN_SECONDS = 120;
  private static final String ENTRA_PREFIX = "{\"kind\": \"entra\"";

  private Credentials() {}

  public static String sealPat(String pat) {
    return Crypto.encryptSecret(pat);
  }

  public static String sealEntra(Map<String, Object> tokens) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("kind", "entra");
    body.putAll(tokens);
    return Crypto.encryptSecret(PyJson.dumps(body));
  }

  public static String credentialKind(String sealed) {
    return Crypto.decryptSecret(sealed).startsWith(ENTRA_PREFIX) ? "entra" : "pat";
  }

  public static String authorizationFor(long userId) {
    var store = Stores.get().identity;
    Map<String, Object> credential = store.getCredential(userId);
    if (!Py.truthy(credential)) return null;
    String raw = Crypto.decryptSecret(Py.str(credential.get("pat_encrypted")));
    if (!raw.startsWith(ENTRA_PREFIX)) return Http.basic(raw);
    Map<String, Object> tokens = Py.map(PyJson.loads(raw));
    if (Py.toLong(tokens.get("expires_at")) - REFRESH_MARGIN_SECONDS <= System.currentTimeMillis() / 1000) {
      tokens = Entra.refreshTokens(Py.orText(tokens.get("refresh_token"), ""));
      Object hint = credential.get("org_hint");
      store.saveCredential(userId, sealEntra(tokens), hint == null ? null : Py.str(hint));
    }
    return "Bearer " + Py.str(tokens.get("access_token"));
  }
}
