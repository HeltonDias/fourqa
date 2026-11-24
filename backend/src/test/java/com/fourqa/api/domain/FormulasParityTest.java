package com.fourqa.api.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fourqa.api.TestPaths;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

/** Same contract as scripts/check-formulas-parity.py over backend/shared/formulas-parity-vectors.json. */
class FormulasParityTest {

  @SuppressWarnings("unchecked")
  private static Map<String, Object> vectors() throws Exception {
    var path = TestPaths.find("backend/shared/formulas-parity-vectors.json", "shared/formulas-parity-vectors.json");
    return (Map<String, Object>) PyJson.loads(Files.readString(path));
  }

  static Object canon(Object v) {
    if (v instanceof Map<?, ?> m) {
      TreeMap<String, Object> out = new TreeMap<>();
      m.forEach((k, val) -> out.put(String.valueOf(k), canon(val)));
      return out;
    }
    if (v instanceof List<?> l) return l.stream().map(FormulasParityTest::canon).toList();
    if (Py.isNumber(v)) return ((Number) v).doubleValue();
    return v;
  }

  static void eq(Object expected, Object actual, String label) {
    assertEquals(canon(expected), canon(actual), label);
  }

  @Test
  void vectorsMatch() throws Exception {
    Map<String, Object> v = vectors();
    for (Map<String, Object> c : Py.rows(v.get("estadoPonto"))) {
      eq(c.get("expected"), Formulas.estadoPonto(Py.obj("outcome", c.get("outcome"), "test_point_state", c.get("test_point_state"))), "estadoPonto");
    }
    for (Map<String, Object> c : Py.rows(v.get("classifyExecution"))) {
      eq(
          c.get("expected"),
          Formulas.classifyExecution(
              Py.obj("outcome", c.get("outcome"), "test_case_state", c.get("test_case_state"), "test_point_state", c.get("test_point_state"))),
          "classifyExecution");
    }
    Map<String, Object> ce = Py.map(v.get("countExecucoes"));
    eq(ce.get("expected"), Formulas.countExecucoes(Py.rows(ce.get("rows")), Py.map(ce.get("filter"))), "countExecucoes");
    for (String k : List.of("metricasPorProcesso", "metricasPorProcessoEmpty")) {
      Map<String, Object> m = Py.map(v.get(k));
      eq(m.get("expected"), Formulas.metricasPorProcesso(Py.rows(m.get("rows")), (String) m.get("planKey"), (String) m.get("processo")), k);
    }
    Map<String, Object> tr = Py.map(v.get("totalRealizadoLinha"));
    eq(tr.get("expected"), Formulas.totalRealizadoLinha(Py.map(tr.get("metrics"))), "totalRealizadoLinha");
    Map<String, Object> fc = Py.map(v.get("finalizadosComCancelados"));
    eq(fc.get("expected"), Formulas.finalizadosComCancelados(Py.map(fc.get("metrics")), Py.toDouble(fc.get("cancelados"))), "finalizadosComCancelados");
    Map<String, Object> it = Py.map(v.get("impactoTotalTestPoint"));
    eq(it.get("expected"), Formulas.impactoTotalTestPoint(Py.rows(it.get("rows")), (String) it.get("planKey")), "impactoTotalTestPoint");
    Map<String, Object> ck = Py.map(v.get("classificarImpactosKpi"));
    eq(
        ck.get("expected"),
        Formulas.classificarImpactosKpi(Py.rows(ck.get("execRows")), Py.rows(ck.get("falhaRows")), (String) ck.get("planKey")),
        "classificarImpactosKpi");
    Map<String, Object> cf = Py.map(v.get("countFalhas"));
    eq(cf.get("expected"), Formulas.countFalhas(Py.rows(cf.get("rows")), Py.map(cf.get("filter"))), "countFalhas");
    Map<String, Object> sf = Py.map(v.get("sumifFrente"));
    eq(sf.get("expected"), Formulas.sumifFrente(Py.rows(sf.get("rows")), (String) sf.get("needle"), (String) sf.get("field")), "sumifFrente");
  }

  @Test
  void brazilianHolidaysMatchPythonLibrary() {
    String[] expected = {
      "2026-01-01", "2026-04-03", "2026-04-21", "2026-05-01", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15",
      "2026-11-20", "2026-12-25", "2027-03-26", "2028-04-14", "2029-03-30", "2030-04-19"
    };
    for (String d : expected) assertEquals(true, OffDays.isHolidayDate(d), d);
    assertEquals("Dia Nacional de Zumbi e da Consciência Negra", OffDays.holidayName("2027-11-20"));
    assertEquals(false, OffDays.isHolidayDate("2026-04-02"));
    assertEquals(true, OffDays.isWeekendDate("2026-11-07"));
  }
}
