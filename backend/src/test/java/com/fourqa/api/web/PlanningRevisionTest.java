package com.fourqa.api.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.azure.InMemoryAzureCache;
import com.fourqa.api.config.Env;
import com.fourqa.api.domain.Planning;
import com.fourqa.api.util.Py;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Port of {@code backend/tests/test_planning_revision.py}. */
class PlanningRevisionTest extends ApiTestSupport {
  TestClient client;

  static Map<String, Object> row(long testPointId, long suiteId, String suiteName, String outcome) {
    return Py.obj(
        "plan_key", "Plano", "plan_id", 1L, "plan_name", "Plano", "suite_id", suiteId, "suite_name", suiteName,
        "test_point_id", testPointId, "test_case_id", testPointId + 1000, "test_case_title", "Caso " + testPointId,
        "test_case_state", "Ready", "test_point_state", "Ready", "outcome", outcome, "dimensions_json", null);
  }

  @BeforeEach
  void seed() {
    Env.override("FOURQA_ALLOW_OPEN_WRITES", "1");
    InMemoryAzureCache.get().commitSuccessfulRefresh(
        Py.obj(
            "kpiPlanKey", "Plano",
            "plans", List.of(Py.obj(
                "planKey", "Plano",
                "execucoes", List.of(row(1, 10, "Login", "Passed"), row(2, 10, "Login", "Failed"), row(3, 20, "Pagamento", "Active")),
                "falhas", List.of(), "dimensions", List.of(), "kpi", null)),
            "suiteRefs", List.of()),
        Py.obj(
            "fetchedAt", "2026-10-15T00:00:00.000Z",
            "dimensoesMeta", Map.of(),
            "workbookMeta", Map.of("kpi_plan_key", "Plano"),
            "summary", Py.obj("execucoes", 3L, "falhas", 0L, "suites", 2L, "runs", 0L, "kpi", null)));
    client = client();
    assertEquals(200, client.put("/api/periodo", Map.of("inicio", "2026-10-01", "fim", "2026-10-30")).status());
  }

  @Test
  void legacyBaselineMessageHasNoDecimal() {
    assertEquals("12 cenários ainda não distribuídos no cronograma", Planning.scheduleIntegrityMessage(12.0, 0));
    assertEquals("1 cenário distribuído além do baseline", Planning.scheduleIntegrityMessage(1.0, 2));
  }

  @Test
  void periodPersistsRealDates() {
    TestClient.Resp res = client.put("/api/periodo", Map.of("inicio", "2026-11-02", "fim", "2026-11-20"));
    assertEquals(200, res.status(), res.text());
    assertTrue(res.text().contains("2026-11-02") && res.text().contains("2026-11-20"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void confirmBaselineCreatesRevisionPerSuite() {
    TestClient.Resp res = client.post("/api/planejamento/revisao?planKey=Plano", Map.of("reason", "primeira"));
    assertEquals(200, res.status(), res.text());
    TestClient.Resp view = client.get("/api/planejamento?planKey=Plano");
    assertEquals(200, view.status(), view.text());
    List<Map<String, Object>> revisions = (List<Map<String, Object>>) view.json().get("revisions");
    assertEquals(1, revisions.size());
    assertEquals(1L, revisions.get(0).get("version"));
  }

  @Test
  void distributionPreviewRuns() {
    assertEquals(200, client.post("/api/planejamento/revisao?planKey=Plano", Map.of()).status());
    TestClient.Resp res = client.put("/api/planejamento/distribuir?planKey=Plano", Py.obj(
        "strategy", "uniforme", "start", "2026-10-05", "end", "2026-10-09", "resguardo", 0L,
        "enabledWeekendDays", List.of(), "preview", true));
    assertEquals(200, res.status(), res.text());
  }

  @Test
  void writesRequireExplicitPlanKey() {
    TestClient.Resp res = client.post("/api/planejamento/revisao", Map.of());
    assertEquals(400, res.status());
    assertEquals("Informe o planKey.", res.json().get("detail"));
  }
}
