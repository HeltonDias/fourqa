package com.fourqa.api.azure;

import com.fourqa.api.util.PyJson;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Azure DevOps REST client with retry/backoff (port of {@code fourqa.azure.client}). */
public class AzureClient {
  static final int MAX_RETRIES = 5;
  static final Set<Integer> RETRYABLE = Set.of(429, 502, 503, 504);

  private final Map<String, Object> cfg;
  private final String authorization;
  public final String baseUrl;

  public AzureClient(Map<String, Object> cfg) {
    this.cfg = cfg;
    String token = String.valueOf(cfg.get("pat"));
    this.authorization = token.startsWith("Basic ") || token.startsWith("Bearer ") ? token : Http.basic(token);
    this.baseUrl = "https://dev.azure.com/" + Http.quote(String.valueOf(cfg.get("organization"))) + "/"
        + Http.quote(String.valueOf(cfg.get("project")));
  }

  public String workItemLink(long id) {
    return baseUrl + "/_workitems/edit/" + id;
  }

  public String url(String apiPath, Map<String, Object> query) {
    Map<String, Object> parts = new LinkedHashMap<>(query == null ? Map.of() : query);
    Object version = cfg.get("apiVersion");
    if (version == null || String.valueOf(version).isEmpty()) version = cfg.get("api_version");
    parts.put("api-version", version == null || String.valueOf(version).isEmpty() ? "7.1" : version);
    return baseUrl + apiPath + "?" + Http.urlencode(parts);
  }

  public Object get(String url) {
    return request("GET", url, null);
  }

  public Object post(String url, Object body) {
    return request("POST", url, body);
  }

  protected Object request(String method, String url, Object body) {
    String where = URI.create(url).getRawPath();
    for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      HttpResponse<String> res;
      try {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Authorization", authorization);
        headers.put("Accept", "application/json");
        if (body != null) headers.put("Content-Type", "application/json");
        res = Http.send(method, url, headers, body == null ? null : PyJson.dumps(body), 60);
      } catch (IOException e) {
        if (attempt < MAX_RETRIES) {
          sleep(Math.min(30, 1L << attempt) * 1000);
          continue;
        }
        throw new AzureHttpError("Falha de rede ao acessar o Azure DevOps (" + where + ").", 0);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new AzureHttpError("Falha de rede ao acessar o Azure DevOps (" + where + ").", 0);
      }
      int status = res.statusCode();
      if (status == 203 || status == 401 || status == 403 || (status >= 300 && status < 400))
        throw new AzureHttpError(
            "O Azure DevOps recusou a autenticação. Verifique se o PAT está correto, não expirou e tem permissão de leitura em Test Management e Work Items.",
            status == 203 ? 401 : status);
      if (RETRYABLE.contains(status) && attempt < MAX_RETRIES) {
        int retryAfter = 0;
        try {
          retryAfter = Integer.parseInt(res.headers().firstValue("retry-after").orElse("0").strip());
        } catch (NumberFormatException ignored) {
          retryAfter = 0;
        }
        long waitMs = retryAfter > 0 ? retryAfter * 1000L : 1000L * (1L << attempt);
        sleep(Math.min(60_000, waitMs));
        continue;
      }
      if (status >= 400) {
        String text = res.body().replace("\n", " ");
        String snippet = text.length() > 200 ? text.substring(0, 200) : text;
        throw new AzureHttpError(("Azure DevOps respondeu HTTP " + status + " em " + where + ". " + snippet).strip(), status);
      }
      return PyJson.loads(res.body());
    }
    throw new AzureHttpError("Falha de rede ao acessar o Azure DevOps (" + where + ").", 0);
  }

  private static void sleep(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
