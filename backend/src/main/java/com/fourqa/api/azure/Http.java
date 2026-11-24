package com.fourqa.api.azure;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.StringJoiner;

/** Shared JDK HTTP client (no redirects, like {@code httpx(follow_redirects=False)}). */
public final class Http {
  private static final HttpClient CLIENT = HttpClient.newBuilder()
      .followRedirects(HttpClient.Redirect.NEVER)
      .connectTimeout(Duration.ofSeconds(30))
      .build();

  private Http() {}

  public static HttpResponse<String> send(String method, String url, Map<String, String> headers, String body, int timeoutSeconds)
      throws IOException, InterruptedException {
    HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(timeoutSeconds));
    headers.forEach(b::header);
    b.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
    return CLIENT.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
  }

  /** Python {@code urllib.parse.urlencode} (quote_plus). */
  public static String urlencode(Map<String, ?> params) {
    StringJoiner j = new StringJoiner("&");
    for (var e : params.entrySet()) j.add(quotePlus(e.getKey()) + "=" + quotePlus(pyStr(e.getValue())));
    return j.toString();
  }

  static String pyStr(Object v) {
    return com.fourqa.api.util.Py.str(v);
  }

  public static String quotePlus(String s) {
    return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("%7E", "~").replace("*", "%2A");
  }

  /** Python {@code urllib.parse.quote} with {@code safe='/'}. */
  public static String quote(String s) {
    StringBuilder sb = new StringBuilder();
    for (byte b : s.getBytes(StandardCharsets.UTF_8)) {
      int c = b & 0xff;
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || "_.-~/".indexOf(c) >= 0) sb.append((char) c);
      else sb.append('%').append(String.format("%02X", c));
    }
    return sb.toString();
  }

  public static String basic(String pat) {
    return "Basic " + Base64.getEncoder().encodeToString((":" + pat).getBytes(StandardCharsets.UTF_8));
  }
}
