package com.fourqa.api.auth;

import com.fourqa.api.azure.Http;
import com.fourqa.api.config.Env;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.Map;

/** Microsoft Entra ID login: authorization code + PKCE, confidential client (port of {@code fourqa.auth.entra}). */
public final class Entra {
  public static final String TENANT_ENV = "FOURQA_ENTRA_TENANT_ID";
  public static final String CLIENT_ID_ENV = "FOURQA_ENTRA_CLIENT_ID";
  public static final String CLIENT_SECRET_ENV = "FOURQA_ENTRA_CLIENT_SECRET";
  public static final String REDIRECT_ENV = "FOURQA_ENTRA_REDIRECT_URI";
  public static final String CALLBACK_PATH = "/api/auth/entra/callback";
  public static final String OAUTH_COOKIE = "fourqa_oauth";
  public static final int OAUTH_TTL_SECONDS = 10 * 60;
  public static final String AZURE_DEVOPS_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";
  public static final String SCOPES = AZURE_DEVOPS_RESOURCE + "/user_impersonation offline_access openid profile email";
  private static final SecureRandom RANDOM = new SecureRandom();

  private Entra() {}

  public static class EntraError extends RuntimeException {
    public EntraError(String message) {
      super(message);
    }
  }

  public static boolean entraConfigured() {
    return !Env.value(TENANT_ENV).isEmpty() && !Env.value(CLIENT_ID_ENV).isEmpty() && !Env.value(CLIENT_SECRET_ENV).isEmpty();
  }

  static String authority() {
    return "https://login.microsoftonline.com/" + Env.value(TENANT_ENV) + "/oauth2/v2.0";
  }

  public static String redirectUri(String scheme, String host) {
    String configured = Env.value(REDIRECT_ENV);
    return configured.isEmpty() ? scheme + "://" + host + CALLBACK_PATH : configured;
  }

  static String sign(String payload) {
    return Session.b64(Session.hmac(Env.value(Session.SECRET_ENV), payload));
  }

  static String tokenUrlsafe(int bytes) {
    byte[] b = new byte[bytes];
    RANDOM.nextBytes(b);
    return Session.b64(b);
  }

  /** [authorization URL, signed cookie value with state + verifier]. */
  public static String[] startFlow(String redirect) {
    return startFlow(redirect, System.currentTimeMillis() / 1000);
  }

  public static String[] startFlow(String redirect, long now) {
    String state = tokenUrlsafe(24);
    String verifier = tokenUrlsafe(64);
    String challenge;
    try {
      challenge = Session.b64(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
    String payload = Session.b64(
        PyJson.dumps(Py.obj("s", state, "v", verifier, "r", redirect, "exp", now + OAUTH_TTL_SECONDS)).getBytes(StandardCharsets.UTF_8));
    Map<String, Object> query = new LinkedHashMap<>();
    query.put("client_id", Env.value(CLIENT_ID_ENV));
    query.put("response_type", "code");
    query.put("redirect_uri", redirect);
    query.put("response_mode", "query");
    query.put("scope", SCOPES);
    query.put("state", state);
    query.put("code_challenge", challenge);
    query.put("code_challenge_method", "S256");
    query.put("prompt", "select_account");
    return new String[] {authority() + "/authorize?" + Http.urlencode(query), payload + "." + sign(payload)};
  }

  public static Map<String, String> readFlow(String cookie, String state) {
    return readFlow(cookie, state, System.currentTimeMillis() / 1000);
  }

  public static Map<String, String> readFlow(String cookie, String state, long now) {
    if (!Py.truthy(cookie) || !Py.truthy(state) || !cookie.contains(".") || !Session.isAscii(cookie))
      throw new EntraError("Sessão de login expirada. Tente entrar novamente.");
    int dot = cookie.lastIndexOf('.');
    String payload = cookie.substring(0, dot);
    String signature = cookie.substring(dot + 1);
    if (!Session.constantEquals(sign(payload), signature)) throw new EntraError("Sessão de login inválida. Tente entrar novamente.");
    Map<String, Object> data;
    try {
      data = Py.map(PyJson.loads(new String(Session.unb64(payload), StandardCharsets.UTF_8)));
    } catch (RuntimeException e) {
      throw new EntraError("Sessão de login inválida. Tente entrar novamente.");
    }
    if (data == null || Py.toDouble(data.getOrDefault("exp", 0L)) < now)
      throw new EntraError("Sessão de login expirada. Tente entrar novamente.");
    if (!Session.constantEquals(Py.str(data.get("s")), state)) throw new EntraError("Sessão de login inválida. Tente entrar novamente.");
    return Map.of("verifier", Py.str(data.get("v")), "redirect", Py.str(data.get("r")));
  }

  static Map<String, Object> tokenRequest(Map<String, Object> form) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("client_id", Env.value(CLIENT_ID_ENV));
    body.put("client_secret", Env.value(CLIENT_SECRET_ENV));
    body.put("scope", SCOPES);
    body.putAll(form);
    HttpResponse<String> res;
    try {
      res = Http.send("POST", authority() + "/token", Map.of("Content-Type", "application/x-www-form-urlencoded"), Http.urlencode(body), 30);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new EntraError("Falha de rede ao falar com a Microsoft. Tente novamente.");
    } catch (Exception e) {
      throw new EntraError("Falha de rede ao falar com a Microsoft. Tente novamente.");
    }
    Map<String, Object> data = null;
    if (res.headers().firstValue("content-type").orElse("").startsWith("application/json")) data = Py.map(PyJson.loads(res.body()));
    if (data == null) data = new LinkedHashMap<>();
    if (res.statusCode() != 200 || !Py.truthy(data.get("access_token"))) {
      String code = Py.orText(data.get("error"), "HTTP " + res.statusCode());
      if (code.equals("invalid_grant")) throw new EntraError("Sua sessão Microsoft expirou. Entre novamente.");
      throw new EntraError("A Microsoft recusou o login (" + code + ").");
    }
    long expiresIn = Py.truthy(data.get("expires_in")) ? Py.toLong(data.get("expires_in")) : 3600;
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("access_token", data.get("access_token"));
    Object refresh = Py.or(data.get("refresh_token"), Py.or(form.get("refresh_token"), ""));
    out.put("refresh_token", refresh);
    out.put("expires_at", System.currentTimeMillis() / 1000 + expiresIn);
    return out;
  }

  public static Map<String, Object> exchangeCode(String code, String verifier, String redirect) {
    return tokenRequest(Py.obj("grant_type", "authorization_code", "code", code, "redirect_uri", redirect, "code_verifier", verifier));
  }

  public static Map<String, Object> refreshTokens(String refreshToken) {
    if (!Py.truthy(refreshToken)) throw new EntraError("Sua sessão Microsoft expirou. Entre novamente.");
    return tokenRequest(Py.obj("grant_type", "refresh_token", "refresh_token", refreshToken));
  }
}
