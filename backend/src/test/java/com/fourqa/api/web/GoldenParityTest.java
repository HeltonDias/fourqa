package com.fourqa.api.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.azure.InMemoryAzureCache;
import com.fourqa.api.config.Env;
import com.fourqa.api.services.PlanningService;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * Replays {@code golden/http-golden.json} (captured from the Python API by {@code scripts/golden-capture-python.py})
 * and requires the same status and JSON, int/float kind included. Timestamps are masked.
 */
class GoldenParityTest extends ApiTestSupport {
  /** Data em que {@code golden/http-golden.json} foi capturado do Python (ver {@code range.asOf} do golden). */
  private static final LocalDate GOLDEN_CAPTURE_DATE = LocalDate.of(2026, 11, 4);
  private static final Pattern TIMESTAMP = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}.*");

  static Object mask(Object value) {
    if (value instanceof String s) return TIMESTAMP.matcher(s).matches() ? "<ts>" : s;
    if (value instanceof Map<?, ?> m) {
      Map<String, Object> out = new LinkedHashMap<>();
      m.forEach((k, v) -> out.put(String.valueOf(k), mask(v)));
      return out;
    }
    if (value instanceof List<?> l) {
      List<Object> out = new ArrayList<>();
      for (Object o : l) out.add(mask(o));
      return out;
    }
    return value;
  }

  @Test
  @SuppressWarnings("unchecked")
  void javaMatchesPythonGolden() throws Exception {
    Env.override("FOURQA_ALLOW_OPEN_WRITES", "1");
    // O golden Python foi capturado em GOLDEN_CAPTURE_DATE; "hoje" precisa ser a mesma data para o asOf e os
    // indicadores dependentes de data serem comparáveis. O relógio é restaurado em ApiTestSupport.resetState().
    PlanningService.setTodayForTests(GOLDEN_CAPTURE_DATE);
    InMemoryAzureCache.get().commitSuccessfulRefresh(
        Py.obj(
            "kpiPlanKey", "Plano",
            "plans", List.of(Py.obj(
                "planKey", "Plano",
                "execucoes", List.of(
                    PlanningRevisionTest.row(1, 10, "Login", "Passed"),
                    PlanningRevisionTest.row(2, 10, "Login", "Failed"),
                    PlanningRevisionTest.row(3, 20, "Pagamento", "Active")),
                "falhas", List.of(), "dimensions", List.of(), "kpi", null)),
            "suiteRefs", List.of()),
        Py.obj(
            "fetchedAt", "2026-10-15T00:00:00.000Z",
            "dimensoesMeta", Map.of(),
            "workbookMeta", Map.of("kpi_plan_key", "Plano"),
            "summary", Py.obj("execucoes", 3L, "falhas", 0L, "suites", 2L, "runs", 0L, "kpi", null)));
    List<Map<String, Object>> scenarios;
    try (InputStream in = getClass().getResourceAsStream("/golden/http-golden.json")) {
      scenarios = (List<Map<String, Object>>) PyJson.loads(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    }
    // Guarda: o golden precisa carregar a data de captura fixada; atualizar o golden para outra data exige
    // alterar GOLDEN_CAPTURE_DATE de forma consciente.
    int asOfChecked = 0;
    for (Map<String, Object> s : scenarios) {
      if (s.get("response") instanceof Map<?, ?> r && r.get("range") instanceof Map<?, ?> range && range.containsKey("asOf")) {
        assertEquals(GOLDEN_CAPTURE_DATE.toString(), range.get("asOf"), "asOf do golden diverge da data de captura fixada");
        asOfChecked++;
      }
    }
    assertTrue(asOfChecked > 0, "o golden deve conter ao menos um asOf para validar a data de captura");
    TestClient client = client();
    List<String> mismatches = new ArrayList<>();
    for (Map<String, Object> s : scenarios) {
      String label = s.get("method") + " " + s.get("path");
      TestClient.Resp res = client.send((String) s.get("method"), (String) s.get("path"), s.get("body"));
      long expectedStatus = Py.toLong(s.get("status"));
      if (res.status() != expectedStatus) {
        mismatches.add(label + ": status " + res.status() + " != " + expectedStatus + " body=" + res.text());
        continue;
      }
      Object actual;
      try {
        actual = PyJson.loads(res.text());
      } catch (PyJson.DecodeException e) {
        actual = res.text();
      }
      Object expected = mask(s.get("response"));
      Object got = mask(actual);
      if (!expected.equals(got))
        mismatches.add(label + "\n  python: " + PyJson.dumpsResponse(expected) + "\n  java:   " + PyJson.dumpsResponse(got));
    }
    assertTrue(mismatches.isEmpty(), mismatches.size() + " divergências:\n" + String.join("\n", mismatches));
  }
}
