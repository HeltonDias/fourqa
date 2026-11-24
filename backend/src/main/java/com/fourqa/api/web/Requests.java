package com.fourqa.api.web;

import com.fourqa.api.auth.Access;
import com.fourqa.api.auth.WriteAuth;
import com.fourqa.api.config.Env;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;

/** Request helpers shared by controllers and the identity filter. */
public final class Requests {
  private Requests() {}

  public static String cookie(HttpServletRequest request, String name) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) return null;
    String found = null;
    for (Cookie c : cookies) if (c.getName().equals(name)) found = c.getValue();
    return found;
  }

  /** Starlette {@code query_params.get}: last value wins. */
  public static String query(HttpServletRequest request, String name) {
    String[] values = request.getParameterMap().get(name);
    if (values == null || values.length == 0 || request.getQueryString() == null) return null;
    return values[values.length - 1];
  }

  public static Access.Presented presented(HttpServletRequest request) {
    return new Access.Presented(request.getHeader("authorization"), cookie(request, WriteAuth.SESSION_COOKIE));
  }

  public static String scheme(HttpServletRequest request) {
    String forwarded = request.getHeader("x-forwarded-proto");
    return forwarded != null ? forwarded : request.getScheme();
  }

  public static boolean secure(HttpServletRequest request) {
    return WriteAuth.cookieIsSecure(Env.hosted(), scheme(request));
  }

  public static String host(HttpServletRequest request) {
    String host = request.getHeader("x-forwarded-host");
    if (host == null || host.isEmpty()) host = request.getHeader("host");
    if (host != null && !host.isEmpty()) return host;
    int port = request.getServerPort();
    boolean defaultPort = port <= 0 || ("http".equals(request.getScheme()) && port == 80) || ("https".equals(request.getScheme()) && port == 443);
    return defaultPort ? request.getServerName() : request.getServerName() + ":" + port;
  }

  public static void setCookie(HttpHeaders headers, String name, String value, boolean secure, String path, long maxAge) {
    headers.add(HttpHeaders.SET_COOKIE, ResponseCookie.from(name, value)
        .httpOnly(true).secure(secure).sameSite("Lax").path(path).maxAge(maxAge).build().toString());
  }

  public static void deleteCookie(HttpHeaders headers, String name, String path, boolean httpOnly, boolean secure) {
    headers.add(HttpHeaders.SET_COOKIE, ResponseCookie.from(name, "")
        .httpOnly(httpOnly).secure(secure).sameSite("Lax").path(path).maxAge(0).build().toString());
  }
}
