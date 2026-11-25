package com.fourqa.api.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fourqa.api.util.Py;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Caracterização (ADR 009, E1): {@link Dimensions} só depende de uma lista ordenada de nomes, sem Azure. Não altera produção. */
class DimensionsGenericPathTest {
  private static Map<String, Object> hierarchyLevel(String key, long level) {
    return Py.obj("key", key, "label", key, "role", "generic", "source", Py.obj("type", "hierarchy_level", "level", level));
  }

  @Test
  void resolvesHierarchyLevelsFromGenericPathNames() {
    Map<String, Object> ctx = Dimensions.context(List.of("Regressão", "Pagamentos", "Cartão"), "Cartão");
    Map<String, String> out = Dimensions.resolveDimensionValues(
        ctx, List.of(hierarchyLevel("n1", 1), hierarchyLevel("n2", 2)), List.of());
    assertEquals("Regressão", out.get("n1"));
    assertEquals("Pagamentos", out.get("n2"));
  }

  @Test
  void levelBeyondPathYieldsNoValue() {
    Map<String, Object> ctx = Dimensions.context(List.of("Raiz"), "Raiz");
    Map<String, String> out = Dimensions.resolveDimensionValues(ctx, List.of(hierarchyLevel("n3", 3)), List.of());
    assertEquals(Map.of(), out);
  }

  @Test
  void currentSuiteSourceUsesNodeName() {
    Map<String, Object> ctx = Dimensions.context(List.of("A", "B"), " Folha ");
    Map<String, Object> defn = Py.obj("key", "atual", "label", "Atual", "role", "generic", "source", Py.obj("type", "current_suite"));
    assertEquals("Folha", Dimensions.resolveDimensionValues(ctx, List.of(defn), List.of()).get("atual"));
  }
}
