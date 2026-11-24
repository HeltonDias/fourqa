package com.fourqa.api.services;

import com.fourqa.api.domain.EvolucaoQa;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Evolução QA: current planning plus executions of the PlanKey (port of {@code fourqa.services.evolucao_service}). */
public final class EvolucaoService {
  private static final Pattern ISO = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
  static final int MAX_RANGE_DAYS = 400;

  private EvolucaoService() {}

  static String validDay(String value) {
    if (value == null || value.isEmpty()) return null;
    String text = value.strip();
    if (text.codePointCount(0, text.length()) > 10) text = text.substring(0, text.offsetByCodePoints(0, 10));
    if (!ISO.matcher(text).matches()) throw new IllegalArgumentException("Data inválida. Use AAAA-MM-DD.");
    try {
      LocalDate.parse(text);
    } catch (DateTimeParseException e) {
      int year = Integer.parseInt(text.substring(0, 4));
      int month = Integer.parseInt(text.substring(5, 7));
      int day = Integer.parseInt(text.substring(8, 10));
      if (month < 1 || month > 12) throw new IllegalArgumentException("month must be in 1..12, not " + month);
      int last = java.time.YearMonth.of(year, month).lengthOfMonth();
      throw new IllegalArgumentException("day " + day + " must be in range 1.." + last + " for month " + month + " in year " + year);
    }
    return text;
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> getEvolucaoQa(String planKey, String start, String end) {
    String askedStart = validDay(start);
    String askedEnd = validDay(end);
    Map<String, Object> view = PlanningService.getPlanningView(planKey);
    Stores stores = Stores.get();
    List<Map<String, Object>> execRows = stores.azureSnapshot.listExecucoes(planKey);
    Map<String, String> bag = stores.meta.getMany(List.of("data_inicio", "data_fim"));
    List<Map<String, Object>> items = Py.rows(Py.or(view.get("items"), List.of()));
    List<String> allocDays = new ArrayList<>();
    for (Map<String, Object> i : items) {
      Map<String, Object> allocs = Py.map(Py.or(i.get("allocations"), Map.of()));
      for (String d : allocs.keySet()) allocDays.add(d.length() > 10 ? d.substring(0, 10) : d);
    }
    allocDays.sort(null);
    String asOf = PlanningService.hojeLocal();
    String first = askedStart != null ? askedStart : validDay(bag.get("data_inicio"));
    if (first == null) first = allocDays.isEmpty() ? asOf : allocDays.get(0);
    String last = askedEnd != null ? askedEnd : validDay(bag.get("data_fim"));
    if (last == null) last = allocDays.isEmpty() ? asOf : allocDays.get(allocDays.size() - 1);
    if (last.compareTo(first) < 0) throw new IllegalArgumentException("A data final deve ser igual ou posterior à inicial.");
    if (ChronoUnit.DAYS.between(LocalDate.parse(first), LocalDate.parse(last)) > MAX_RANGE_DAYS)
      throw new IllegalArgumentException("Intervalo máximo de " + MAX_RANGE_DAYS + " dias.");
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("planKey", planKey);
    out.put("dimensions", Py.or(view.get("dimensions"), new ArrayList<>()));
    out.putAll(EvolucaoQa.build(items, execRows, first, last, asOf));
    return out;
  }
}
