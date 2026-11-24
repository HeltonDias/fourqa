package com.fourqa.api.persistence;

import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Port of {@code fourqa.persistence.schedule_fingerprint}. */
public final class ScheduleFingerprint {
  private ScheduleFingerprint() {}

  private static String num(Object n) {
    if (!Py.isNumber(n)) return "";
    double d = ((Number) n).doubleValue();
    if (Double.isNaN(d)) return "";
    return Py.str(n);
  }

  private static String orEmpty(Object v) {
    return Py.truthy(v) ? Py.str(v) : "";
  }

  public static String of(List<Map<String, Object>> items) {
    List<Map<String, Object>> sorted = new ArrayList<>(items);
    sorted.sort(Comparator.comparingLong(r -> Py.toLong(r.get("id"))));
    List<String> lines = new ArrayList<>();
    for (Map<String, Object> item : sorted) {
      lines.add(String.join(
          "\t",
          Py.str(item.get("id")),
          Py.str(item.get("suite_id")),
          Py.str(item.get("test_point_id")),
          Py.str(item.get("test_case_id")),
          orEmpty(item.get("planned_start")),
          orEmpty(item.get("planned_end")),
          orEmpty(item.get("responsavel")),
          orEmpty(item.get("prioridade")),
          num(item.get("baseline_quantity")),
          orEmpty(item.get("suite_name"))));
      List<Map<String, Object>> allocs = new ArrayList<>(Py.rows(Py.or(item.get("allocations"), List.of())));
      allocs.sort(Comparator.<Map<String, Object>, String>comparing(a -> Py.str(a.get("date")))
          .thenComparingDouble(a -> Py.toDouble(a.get("quantity"))));
      for (Map<String, Object> a : allocs) lines.add(Py.str(a.get("date")) + "=" + num(a.get("quantity")));
    }
    return String.join("\n", lines) + "\n";
  }
}
