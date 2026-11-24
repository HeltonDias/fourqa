package com.fourqa.api.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;

import com.fourqa.api.azure.InMemoryAzureCache;
import com.fourqa.api.config.Env;
import com.fourqa.api.persistence.PlanningConflictError;
import com.fourqa.api.services.ReportService;
import com.fourqa.api.util.Py;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

/** Port of {@code backend/tests/test_write_routes.py} and {@code test_write_routes_smoke.py}. */
class WriteRoutesTest extends ApiTestSupport {

  @Test
  void health() {
    TestClient.Resp res = client().get("/api/health");
    assertEquals(200, res.status());
    assertEquals(Map.of("ok", true, "database", "ready"), res.json());
  }

  @Test
  void writesClosedWithoutToken() {
    Object[][] cases = {
        {"PUT", "/api/cabecalho", Map.of()},
        {"PUT", "/api/periodo", Map.of()},
        {"POST", "/api/planejamento/revisao", null},
        {"PUT", "/api/planejamento/celula", Map.of()},
        {"PUT", "/api/planejamento/distribuir", Map.of()},
        {"POST", "/api/sync", null},
    };
    TestClient client = client();
    for (Object[] c : cases) {
      TestClient.Resp res = client.send((String) c[0], (String) c[1], c[2]);
      assertEquals(503, res.status(), (String) c[1]);
      assertTrue(Py.str(res.json().get("detail")).contains("Escrita desabilitada"), (String) c[1]);
    }
  }

  @Test
  void bearerAuth() {
    Env.override("FOURQA_API_TOKEN", "segredo-local");
    TestClient client = client();
    assertEquals(401, client.post("/api/sync", null).status());
    assertEquals(401, client.post("/api/sync", null, "Authorization", "Bearer outro").status());
    TestClient.Resp opened = client.put("/api/cabecalho", Map.of("title", "", "subtitle", ""), "Authorization", "Bearer segredo-local");
    assertEquals(400, opened.status());
  }

  @Test
  void openWritesOptIn() {
    Env.override("FOURQA_ALLOW_OPEN_WRITES", "1");
    assertEquals(400, client().put("/api/cabecalho", Map.of("title", "", "subtitle", "")).status());
  }

  @Test
  void cacheReadExecucoes() {
    TestClient client = client();
    TestClient.Resp closed = client.get("/api/execucoes?planKey=Vazio");
    assertEquals(200, closed.status());
    assertEquals(0L, closed.json().get("total"));
    InMemoryAzureCache.get().commitSuccessfulRefresh(
        Py.obj(
            "kpiPlanKey", "Vazio",
            "plans", List.of(Py.obj("planKey", "Vazio", "execucoes", List.of(), "falhas", List.of(), "dimensions", List.of(), "kpi", null)),
            "suiteRefs", List.of()),
        Py.obj(
            "fetchedAt", "2026-10-15T00:00:00.000Z",
            "dimensoesMeta", Map.of(),
            "workbookMeta", Map.of("kpi_plan_key", "Vazio"),
            "summary", Py.obj("execucoes", 0L, "falhas", 0L, "suites", 0L, "runs", 0L, "kpi", null)));
    TestClient.Resp empty = client.get("/api/execucoes?planKey=Vazio");
    assertEquals(200, empty.status());
    assertEquals(0L, empty.json().get("total"));
    TestClient.Resp other = client.get("/api/falhas?planKey=Outro");
    assertEquals(200, other.status());
    assertEquals(0L, other.json().get("total"));
  }

  @Test
  void hostedReadAuth() {
    Env.override("FOURQA_HOSTED", "1");
    Env.override("FOURQA_PROTECT_READS", "1");
    Env.override("FOURQA_API_TOKEN", "segredo-vercel");
    TestClient client = client();
    assertEquals(401, client.get("/api/execucoes?planKey=Vazio").status());
    assertEquals(200, client.get("/api/health").status());
    assertNotEquals(401, client.get("/api/execucoes?planKey=Vazio", "Authorization", "Bearer segredo-vercel").status());
    Env.override("FOURQA_API_TOKEN", "");
    Env.override("FOURQA_ALLOW_OPEN_WRITES", "1");
    assertEquals(503, client.post("/api/sync", null).status());
  }

  @Test
  void sessionCookieAuthorizesWithoutExposingToken() {
    Env.override("FOURQA_API_TOKEN", "segredo-local");
    TestClient client = client();
    TestClient.Resp denied = client.post("/api/session", Map.of("token", "outro"));
    assertEquals(401, denied.status());
    assertTrue(denied.headers("Set-Cookie").isEmpty());
    TestClient.Resp opened = client.post("/api/session", Map.of("token", "segredo-local"));
    assertEquals(200, opened.status());
    assertEquals(Map.of("ok", true), opened.json());
    assertFalse(opened.text().contains("segredo-local"));
    String cookie = opened.header("Set-Cookie").toLowerCase();
    assertTrue(cookie.contains("httponly"));
    assertTrue(cookie.contains("fourqa_session="));
    assertEquals(true, client.get("/api/session").json().get("active"));
    assertEquals(400, client.put("/api/cabecalho", Map.of("title", "", "subtitle", "")).status());
    client.delete("/api/session");
    assertEquals(401, client.put("/api/cabecalho", Map.of("title", "A", "subtitle", "B")).status());
  }

  @Test
  void hostedReadAcceptsSessionCookie() {
    Env.override("FOURQA_HOSTED", "1");
    Env.override("FOURQA_PROTECT_READS", "1");
    Env.override("FOURQA_API_TOKEN", "segredo-vercel");
    TestClient client = client();
    client.cookies.put("fourqa_session", "segredo-vercel");
    assertNotEquals(401, client.get("/api/execucoes?planKey=Vazio").status());
  }

  private TestClient.Resp cabecalhoWith(RuntimeException failure) {
    Env.override("FOURQA_ALLOW_OPEN_WRITES", "1");
    try (MockedStatic<ReportService> mocked = Mockito.mockStatic(ReportService.class, Mockito.CALLS_REAL_METHODS)) {
      mocked.when(() -> ReportService.setCabecalho(anyString(), anyString(), any())).thenThrow(failure);
      return client().put("/api/cabecalho", Map.of("title", "Titulo", "subtitle", "Sub"));
    }
  }

  @Test
  void unexpectedWriteHidesInternalDetail() {
    TestClient.Resp res = cabecalhoWith(new RuntimeException("postgres://user:secret@db/fourqa"));
    assertEquals(500, res.status());
    assertFalse(res.text().contains("secret"));
    assertFalse(res.text().contains("postgres://"));
    assertTrue(res.text().contains("Não foi possível gravar o cabeçalho."));
  }

  @Test
  void validationErrorStays400() {
    TestClient.Resp res = cabecalhoWith(new IllegalArgumentException("Título rejeitado pela regra."));
    assertEquals(400, res.status());
    assertTrue(res.text().contains("Título rejeitado pela regra."));
  }

  @Test
  void conflictStays409() {
    TestClient.Resp res = cabecalhoWith(new PlanningConflictError(PlanningConflictError.HEADER_CHANGED));
    assertEquals(409, res.status());
    assertTrue(res.text().contains(PlanningConflictError.HEADER_CHANGED));
  }

  @Test
  void bodyValidationMatchesFastApi() {
    Env.override("FOURQA_ALLOW_OPEN_WRITES", "1");
    TestClient.Resp missing = client().put("/api/cabecalho", null);
    assertEquals(422, missing.status());
    assertTrue(missing.text().contains("\"missing\""));
    TestClient.Resp list = client().put("/api/cabecalho", List.of(1L));
    assertEquals(422, list.status());
    assertTrue(list.text().contains("dict_type"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void syncWithoutAzureConfigReportsMissing() {
    Env.override("FOURQA_ALLOW_OPEN_WRITES", "1");
    TestClient client = client();
    TestClient.Resp res = client.post("/api/sync", null);
    assertEquals(400, res.status(), res.text());
    Map<String, Object> detail = (Map<String, Object>) res.json().get("detail");
    assertTrue(((List<Object>) detail.get("missing")).contains("AZURE_DEVOPS_ORG"));
    TestClient.Resp status = client.get("/api/sync/status");
    assertEquals(200, status.status());
    assertEquals("idle", status.json().get("status"));
  }

  @Test
  void syncConfigReadAndReset() {
    Env.override("FOURQA_ALLOW_OPEN_WRITES", "1");
    TestClient client = client();
    assertEquals(200, client.get("/api/sync/config").status());
    TestClient.Resp reset = client.put("/api/sync/config", Map.of("reset", true));
    assertEquals(200, reset.status(), reset.text());
  }

  @Test
  void securityHeadersOnEveryResponse() {
    TestClient.Resp res = client().get("/api/health");
    assertEquals("nosniff", res.header("X-Content-Type-Options"));
    assertEquals("DENY", res.header("X-Frame-Options"));
    assertEquals("no-referrer", res.header("Referrer-Policy"));
  }
}
