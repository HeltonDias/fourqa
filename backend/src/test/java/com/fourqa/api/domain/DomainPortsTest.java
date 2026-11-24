package com.fourqa.api.domain;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Ports of {@code test_distribute.py}, {@code test_dimensions.py} and {@code test_evolucao_qa.py}. */
class DomainPortsTest {

  @Test
  void spreadQuantityKeepsTotalAndShape() {
    assertArrayEquals(new long[] {2, 2, 2, 2}, Distribute.spreadQuantity(8, 4, "uniforme"));
    assertArrayEquals(new long[] {1, 2, 3, 4}, Distribute.spreadQuantity(10, 4, "crescente"));
    assertArrayEquals(new long[] {1, 2, 3, 2, 1}, Distribute.spreadQuantity(9, 5, "montanha"));
    assertArrayEquals(new long[] {0, 0, 0}, Distribute.spreadQuantity(0, 3, "decrescente"));
  }

  @Test
  void distributionSkipsWeekendUnlessEnabled() {
    List<String> days = Distribute.distributionDays("2026-10-26", "2026-11-01", 0, Set.of());
    assertTrue(days.contains("2026-10-26"));
    assertFalse(days.contains("2026-10-31"));
    assertFalse(days.contains("2026-11-01"));
    assertTrue(Distribute.distributionDays("2026-10-26", "2026-11-01", 0, Set.of("2026-10-31")).contains("2026-10-31"));
  }

  @Test
  void balanceCountsPassedAndNaAsFinalized() {
    assertEquals(Py.obj("scope", 3L, "finalized", 2L, "pending", 1L),
        normalizeLongs(Distribute.countPlanningBalance(List.of("passed", "na", "failed"))));
  }

  @Test
  void saldoRejectsInvalidPending() {
    IllegalArgumentException err = assertThrows(IllegalArgumentException.class,
        () -> Distribute.saldoDeltas(List.of(), List.of("2026-10-26"), "uniforme", Map.of("pending", -1L)));
    assertTrue(err.getMessage().contains("Saldo pendente inválido"));
  }

  private static Map<String, Object> normalizeLongs(Map<String, Object> in) {
    Map<String, Object> out = new java.util.LinkedHashMap<>();
    in.forEach((k, v) -> out.put(k, v instanceof Number n ? (Object) n.longValue() : v));
    return out;
  }

  private static Map<String, Object> path(String... names) {
    List<Object> ancestors = new ArrayList<>();
    for (String n : names) ancestors.add(Py.obj("name", n));
    return Py.obj("ancestors", ancestors);
  }

  @Test
  @SuppressWarnings("unchecked")
  void detectsPriorityAndFrontFromSuitePath() {
    List<Map<String, Object>> dims = Dimensions.detectDimensions(
        List.of(path("Prioridade 0", "GEATE", "Folha"), path("Prioridade 1", "GEDEV", "Folha")),
        Py.obj("known_fronts", List.of("GEATE", "GEDEV")));
    Map<String, Map<String, Object>> byRole = new HashMap<>();
    for (Map<String, Object> d : dims) byRole.put((String) d.get("role"), d);
    assertEquals(1L, ((Number) byRole.get("priority").get("level")).longValue());
    assertEquals(List.of("Prioridade 0", "Prioridade 1"), byRole.get("priority").get("values"));
    assertEquals(List.of("GEATE", "GEDEV"), byRole.get("front").get("values"));
    Map<String, Object> generic = byRole.get("generic");
    assertTrue(generic == null || ((Number) generic.get("level")).longValue() != 1);
  }

  @Test
  void overrideRenamesLevelWithoutGuessingRole() {
    List<Map<String, Object>> detected = Dimensions.detectDimensions(List.of(path("Bloco A", "Folha")), null);
    List<Map<String, Object>> renamed = Dimensions.applyHierarchyOverrides(
        detected, List.of(Py.obj("column_name", "Ciclo", "source_level", "1", "active", true)));
    assertEquals("Ciclo", renamed.get(0).get("label"));
    assertEquals(1.0, ((Number) renamed.get(0).get("confidence")).doubleValue());
  }

  @Test
  void ownerOf() {
    assertArrayEquals(new String[] {"Ana", null}, EvolucaoQa.ownerOf("Ana"));
    assertArrayEquals(new String[] {null, "sem_responsavel"}, EvolucaoQa.ownerOf("  "));
    assertArrayEquals(new String[] {null, "sem_responsavel"}, EvolucaoQa.ownerOf(null));
    assertArrayEquals(new String[] {null, "compartilhada"}, EvolucaoQa.ownerOf("Ana, Bia"));
    assertArrayEquals(new String[] {null, "compartilhada"}, EvolucaoQa.ownerOf("Ana e Bia"));
    assertArrayEquals(new String[] {null, "compartilhada"}, EvolucaoQa.ownerOf("Ana/Bia"));
    assertArrayEquals(new String[] {"Eduardo", null}, EvolucaoQa.ownerOf("Eduardo"));
  }

  private static Map<String, Object> item(long suiteId, String responsavel, Map<String, Object> allocations, long baseline, long passed) {
    return Py.obj(
        "suiteId", suiteId, "testPointId", null, "suiteName", "S" + suiteId, "responsavel", responsavel,
        "baselineCount", baseline, "allocations", allocations, "passed", passed, "na", 0L, "failed", 0L, "blocked", 0L);
  }

  private static Map<String, Object> exec(long suiteId, String outcome, String day) {
    return Py.obj("suite_id", suiteId, "test_point_id", null, "outcome", outcome, "date_completed", day + "T10:00:00Z");
  }

  private static long n(Object v) {
    return ((Number) v).longValue();
  }

  @Test
  @SuppressWarnings("unchecked")
  void buildEvolucaoAttributesOnlySingleOwner() {
    Map<String, Object> first = item(1, "Ana", Py.obj("2026-03-02", 2L, "2026-03-03", 2L), 4, 2);
    first.put("failed", 1L);
    List<Map<String, Object>> items = List.of(
        first,
        item(2, "ana", Py.obj("2026-03-03", 1L), 1, 0),
        item(3, "Ana, Bia", Py.obj("2026-03-02", 3L), 3, 1),
        item(4, "", Py.obj("2026-03-04", 2L), 2, 0));
    List<Map<String, Object>> rows = List.of(
        exec(1, "Passed", "2026-03-02"), exec(1, "Passed", "2026-03-03"), exec(1, "Failed", "2026-03-03"),
        exec(3, "Passed", "2026-03-02"), exec(1, "Passed", "2026-02-20"));
    Map<String, Object> out = EvolucaoQa.build(items, rows, "2026-03-01", "2026-03-05", "2026-03-03");
    List<Map<String, Object>> qas = (List<Map<String, Object>>) out.get("qas");
    assertEquals(List.of("Ana"), qas.stream().map(q -> q.get("name")).toList());
    Map<String, Object> ana = qas.get(0);
    assertEquals(2, n(ana.get("suiteCount")));
    assertEquals(5, n(ana.get("baseline")));
    assertEquals(5, n(ana.get("planned")));
    assertEquals(5, n(ana.get("plannedToDate")));
    assertEquals(2, n(ana.get("finalizedInRange")));
    assertEquals(2, n(ana.get("finalized")));
    assertEquals(3, n(ana.get("executed")));
    assertEquals(3, n(ana.get("gap")));
    assertEquals("warn", ana.get("status"));
    List<Map<String, Object>> daily = (List<Map<String, Object>>) ana.get("daily");
    Map<String, Object> day3 = daily.stream().filter(d -> "2026-03-03".equals(d.get("date"))).findFirst().orElseThrow();
    assertEquals("2026-03-03", day3.get("date"));
    assertEquals(3, n(day3.get("planned")));
    assertEquals(1, n(day3.get("finalized")));
    assertEquals(2, n(day3.get("executed")));
    assertEquals(5, n(day3.get("plannedCumulative")));
    assertEquals(2, n(day3.get("finalizedCumulative")));
    assertEquals(6, day3.size());
    assertNull(daily.stream().filter(d -> "2026-03-04".equals(d.get("date"))).findFirst().orElseThrow().get("finalizedCumulative"));

    Map<String, Object> shared = (Map<String, Object>) out.get("unattributed");
    assertEquals(EvolucaoQa.UNATTRIBUTED_KEY, shared.get("key"));
    assertNull(shared.get("status"));
    Map<String, Object> reasons = (Map<String, Object>) shared.get("reasons");
    assertEquals(1, n(reasons.get("sem_responsavel")));
    assertEquals(1, n(reasons.get("compartilhada")));
    assertEquals(2, reasons.size());
    assertEquals(1, n(shared.get("finalizedInRange")));
    assertEquals(5, n(shared.get("planned")));
  }

  @Test
  void buildEvolucaoEmpty() {
    Map<String, Object> out = EvolucaoQa.build(List.of(), List.of(), "2026-03-01", "2026-03-02", "2026-03-01");
    assertEquals(List.of(), out.get("qas"));
    assertNull(out.get("unattributed"));
  }
}
