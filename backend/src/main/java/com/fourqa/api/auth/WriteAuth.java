package com.fourqa.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Port of {@code fourqa.http.write_auth}. */
public final class WriteAuth {
  public static final String SESSION_COOKIE = "fourqa_session";

  private WriteAuth() {}

  public static String presentedAuthorization(String authorizationHeader, String sessionCookie) {
    String header = authorizationHeader == null ? "" : authorizationHeader.strip();
    if (!header.isEmpty()) return header;
    String cookie = sessionCookie == null ? "" : sessionCookie.strip();
    if (cookie.isEmpty()) return null;
    return "Bearer " + cookie;
  }

  public static boolean cookieIsSecure(boolean hosted, String scheme) {
    return hosted || "https".equals(scheme);
  }

  public static boolean openWritesAllowed(boolean hosted, String flag) {
    return !hosted && "1".equals(flag);
  }

  public static boolean tokenMatches(String configured, String presented) {
    byte[] a = configured.getBytes(StandardCharsets.UTF_8);
    byte[] b = presented.getBytes(StandardCharsets.UTF_8);
    return a.length == b.length && MessageDigest.isEqual(a, b);
  }

  /** "allow" | "unauthorized" | "unconfigured". */
  public static String decideWriteAuth(String configuredToken, boolean allowOpenWrites, String authorizationHeader) {
    String token = configuredToken.strip();
    if (token.isEmpty()) return allowOpenWrites ? "allow" : "unconfigured";
    byte[] expected = ("Bearer " + token).getBytes(StandardCharsets.UTF_8);
    byte[] received = (authorizationHeader == null ? "" : authorizationHeader).getBytes(StandardCharsets.UTF_8);
    return MessageDigest.isEqual(expected, received) ? "allow" : "unauthorized";
  }

  public static String decideReadAuth(boolean protectReads, String configuredToken, String authorizationHeader) {
    if (!protectReads) return "allow";
    return decideWriteAuth(configuredToken, false, authorizationHeader);
  }
}
