package com.fourqa.api.auth;

import com.fourqa.api.config.Env;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** HMAC-SHA256 signed user session cookie, byte-compatible with {@code fourqa.auth.session}. */
public final class Session {
  public static final String USER_COOKIE = "fourqa_user";
  public static final String SECRET_ENV = "FOURQA_SESSION_SECRET";
  public static final int SESSION_TTL_SECONDS = 12 * 60 * 60;

  private Session() {}

  public static boolean sessionConfigured() {
    return !Env.value(SECRET_ENV).isEmpty();
  }

  public static String b64(byte[] data) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
  }

  public static byte[] unb64(String text) {
    return Base64.getUrlDecoder().decode(text);
  }

  public static byte[] hmac(String secret, String payload) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return mac.doFinal(payload.getBytes(StandardCharsets.US_ASCII));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  static String sign(String payload, String secret) {
    return b64(hmac(secret, payload));
  }

  public static boolean constantEquals(String a, String b) {
    return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
  }

  static boolean isAscii(String s) {
    for (int i = 0; i < s.length(); i++) if (s.charAt(i) > 127) return false;
    return true;
  }

  public static String issueSession(long userId) {
    return issueSession(userId, System.currentTimeMillis() / 1000, SESSION_TTL_SECONDS);
  }

  public static String issueSession(long userId, long now, int ttl) {
    String secret = Env.value(SECRET_ENV);
    if (secret.isEmpty()) throw new IllegalStateException("Configure " + SECRET_ENV + " neste ambiente.");
    String payload = b64(PyJson.dumpsCompact(Py.obj("uid", userId, "exp", now + ttl)).getBytes(StandardCharsets.UTF_8));
    return payload + "." + sign(payload, secret);
  }

  public static Long readSession(String token) {
    return readSession(token, System.currentTimeMillis() / 1000);
  }

  public static Long readSession(String token, long now) {
    String secret = Env.value(SECRET_ENV);
    if (secret.isEmpty() || token == null || token.isEmpty() || !token.contains(".") || !isAscii(token)) return null;
    int dot = token.lastIndexOf('.');
    String payload = token.substring(0, dot);
    String signature = token.substring(dot + 1);
    if (!constantEquals(sign(payload, secret), signature)) return null;
    Map<String, Object> data;
    try {
      data = Py.map(PyJson.loads(new String(unb64(payload), StandardCharsets.UTF_8)));
    } catch (RuntimeException e) {
      return null;
    }
    if (data == null || !Py.isInt(data.get("uid")) || !Py.isInt(data.get("exp"))) return null;
    if (((Number) data.get("exp")).longValue() < now) return null;
    return ((Number) data.get("uid")).longValue();
  }
}
