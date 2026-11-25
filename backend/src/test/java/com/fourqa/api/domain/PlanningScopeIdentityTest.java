package com.fourqa.api.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Caracterização (ADR 009, E1): identidade de escopo do Azure usada por baseline e revisões. Não altera produção. */
class PlanningScopeIdentityTest {
  private static Map<String, Object> ref(Object planId, Object suiteId, Object pointId, Object caseId) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("plan_id", planId);
    m.put("suite_id", suiteId);
    m.put("test_point_id", pointId);
    m.put("test_case_id", caseId);
    return m;
  }

  @Test
  void identityIsPipeSeparatedWithEmptyForMissing() {
    assertEquals("42|10|100|1000", Planning.scopeIdentity(ref(42L, 10L, 100L, 1000L)));
    assertEquals("42||100|", Planning.scopeIdentity(ref(42L, null, 100L, null)));
  }

  @Test
  void integerAndLongProduceSameIdentity() {
    assertEquals(Planning.scopeIdentity(ref(42L, 10L, 100L, 1000L)), Planning.scopeIdentity(ref(42, 10, 100, 1000)));
  }

  @Test
  void doubleTypedIdProducesDifferentIdentity() {
    // Risco registrado no ADR 009: divergência de tipo gera diff falso. A E1 não altera esse comportamento.
    assertNotEquals(Planning.scopeIdentity(ref(42L, 10L, 100L, 1000L)), Planning.scopeIdentity(ref(42L, 10L, 100.0, 1000L)));
  }

  @Test
  void diffScopeReportsAddedAndRemovedByIdentity() {
    List<Map<String, Object>> baseline = List.of(ref(42L, 10L, 100L, 1000L), ref(42L, 10L, 101L, 1001L));
    List<Map<String, Object>> source = List.of(ref(42L, 10L, 101L, 1001L), ref(42L, 20L, 200L, 2000L));
    Map<String, Object> diff = Planning.diffScope(baseline, source);
    assertEquals(2L, diff.get("baseline_count"));
    assertEquals(2L, diff.get("source_count"));
    assertEquals(1L, diff.get("added_count"));
    assertEquals(1L, diff.get("removed_count"));
    assertEquals(0L, diff.get("scope_delta"));
  }

  @Test
  void identicalScopeHasNoDiff() {
    List<Map<String, Object>> scope = List.of(ref(42L, 10L, 100L, 1000L));
    Map<String, Object> diff = Planning.diffScope(scope, scope);
    assertEquals(0L, diff.get("added_count"));
    assertEquals(0L, diff.get("removed_count"));
  }
}
