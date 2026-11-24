package com.fourqa.api.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.util.Py;
import com.fourqa.api.web.HttpInputs;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Ports of {@code test_status_frente.py} and {@code test_planning_cell_base.py}. */
class ReportPortsTest {
  static final Set<String> FRONT_KEYS = Set.of(
      "planAteHoje", "na", "passeds", "gap", "pctPlan", "pctReal", "pctBugsDev", "pctBugsCliente", "bugsAbertos", "status");

  @Test
  @SuppressWarnings("unchecked")
  void emptyTotalDoesNotCrash() {
    Map<String, Object> total = ReportService.somarBlocos(List.of());
    assertEquals(FRONT_KEYS, ((Map<String, Object>) total.get("indicadores")).keySet());
  }

  @Test
  void indicadoresUseFrontendContract() {
    Map<String, Object> cenarios = Py.obj(
        "ttl", 10L, "plan", 10L, "planAteHoje", 6L, "na", 1L, "passeds", 3L, "finalizado", 4L, "falha", 1L,
        "bloqueado", 1L, "liberado", 0L, "design", 0L, "naoLib", 0L);
    Map<String, Object> bugs = Py.obj("total", 5L, "fechados", 2L, "impactosDev", 1L, "impactosCliente", 2L);
    Map<String, Object> ind = ReportService.indicadoresDto(cenarios, bugs);
    assertEquals(FRONT_KEYS, ind.keySet());
    assertEquals(2.0, ((Number) ind.get("gap")).doubleValue());
    assertEquals(0.6, ((Number) ind.get("pctPlan")).doubleValue());
    assertEquals(0.4, ((Number) ind.get("pctReal")).doubleValue());
    assertEquals(0.2, ((Number) ind.get("pctBugsDev")).doubleValue());
    assertEquals(0.4, ((Number) ind.get("pctBugsCliente")).doubleValue());
    assertEquals(3.0, ((Number) ind.get("bugsAbertos")).doubleValue());
  }

  @Test
  void parseDayBaseMapsToExpectedQuantityKey() {
    Map<String, Object> parsed = HttpInputs.parsePlanningCellBase(Py.obj("baseQuantity", 5L), "day");
    assertEquals(true, parsed.get("guard"));
    assertEquals(5.0, parsed.get("expected_quantity"));
    assertNull(parsed.get("expectedQuantity"));
  }

  @Test
  void parseStartBaseMapsToExpectedTextKey() {
    Map<String, Object> parsed = HttpInputs.parsePlanningCellBase(Py.obj("baseDate", "2026-10-29"), "start");
    assertEquals(true, parsed.get("guard"));
    assertEquals("2026-10-29", parsed.get("expected_text"));
  }

  @Test
  void malformedBaseIsRejected() {
    assertNull(HttpInputs.parsePlanningCellBase(Py.obj("baseQuantity", -1L), "day"));
    assertNull(HttpInputs.parsePlanningCellBase(Py.obj("baseDate", 3L), "end"));
    assertTrue(HttpInputs.parsePlanningCellBase(Map.of(), "responsavel").get("guard").equals(false));
  }
}
