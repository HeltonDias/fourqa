package com.fourqa.api.domain;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Port of {@code fourqa.domain.plan_period}. */
public final class PlanPeriod {
  public static final int YEAR_MAX = 2100;
  public static final int MAX_DAYS = 2000;
  private static final Pattern ISO = Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})");
  private static final Pattern BR = Pattern.compile("^(\\d{2})/(\\d{2})/(\\d{4})$");

  private PlanPeriod() {}

  public static class PlanningPeriodError extends RuntimeException {
    public PlanningPeriodError(String message) {
      super(message);
    }
  }

  public static int yearMin(LocalDate reference) {
    return (reference != null ? reference : LocalDate.now(ZoneOffset.UTC)).getYear();
  }

  private static boolean realDate(int y, int m, int d) {
    try {
      LocalDate.of(y, m, d);
      return true;
    } catch (DateTimeException e) {
      return false;
    }
  }

  public static String parseCalendarDay(String value) {
    return parseCalendarDay(value, null);
  }

  public static String parseCalendarDay(String value, LocalDate reference) {
    if (value == null) return null;
    String trimmed = value.strip();
    if (trimmed.isEmpty()) return null;
    int min = yearMin(reference);
    Matcher iso = ISO.matcher(trimmed);
    if (iso.find()) {
      int year = Integer.parseInt(iso.group(1));
      int month = Integer.parseInt(iso.group(2));
      int day = Integer.parseInt(iso.group(3));
      if (year < min || year > YEAR_MAX) return null;
      if (!realDate(year, month, day)) return null;
      return iso.group(1) + "-" + iso.group(2) + "-" + iso.group(3);
    }
    Matcher br = BR.matcher(trimmed);
    if (br.matches()) {
      int year = Integer.parseInt(br.group(3));
      int month = Integer.parseInt(br.group(2));
      int day = Integer.parseInt(br.group(1));
      if (year < min || year > YEAR_MAX) return null;
      if (!realDate(year, month, day)) return null;
      return br.group(3) + "-" + pad2(month) + "-" + pad2(day);
    }
    return null;
  }

  private static String pad2(int n) {
    return n < 10 ? "0" + n : String.valueOf(n);
  }

  public static String invalidMessage(LocalDate reference) {
    return "Período inválido. Use datas de " + yearMin(reference) + " em diante (até " + YEAR_MAX + ") no formato aaaa-mm-dd.";
  }

  public static int calendarDaySpanInclusive(String startIso, String endIso) {
    String start = parseCalendarDay(startIso);
    String end = parseCalendarDay(endIso);
    if (start == null || end == null || start.compareTo(end) > 0) return 0;
    return (int) ChronoUnit.DAYS.between(LocalDate.parse(start), LocalDate.parse(end)) + 1;
  }

  public static Map<String, String> assertPlanningPeriod(String inicio, String fim) {
    return assertPlanningPeriod(inicio, fim, null);
  }

  public static Map<String, String> assertPlanningPeriod(String inicio, String fim, LocalDate reference) {
    String start = parseCalendarDay(inicio, reference);
    String end = parseCalendarDay(fim, reference);
    if (start == null || end == null) throw new PlanningPeriodError(invalidMessage(reference));
    if (start.compareTo(end) > 0) throw new PlanningPeriodError("A data de início não pode ser posterior à data de fim.");
    int span = calendarDaySpanInclusive(start, end);
    if (span > MAX_DAYS)
      throw new PlanningPeriodError("Período muito longo (" + span + " dias). O máximo permitido é " + MAX_DAYS + " dias.");
    return Map.of("inicio", start, "fim", end);
  }

  public static void assertStoredPlanningPeriod(String inicio, String fim) {
    String a = inicio == null ? "" : inicio.strip();
    String b = fim == null ? "" : fim.strip();
    if (a.isEmpty() || b.isEmpty()) return;
    assertPlanningPeriod(a, b);
  }

  public static void assertDateRangeForCalculation(LocalDate inicio, LocalDate fim) {
    if (fim.isBefore(inicio)) throw new PlanningPeriodError("Intervalo de datas inválido para cálculo.");
    int allowedMin = yearMin(null);
    if (inicio.getYear() < allowedMin || fim.getYear() > YEAR_MAX) throw new PlanningPeriodError(invalidMessage(null));
    long span = ChronoUnit.DAYS.between(inicio, fim) + 1;
    if (span > MAX_DAYS)
      throw new PlanningPeriodError(
          "Intervalo muito longo para cálculo (" + span + " dias). Máximo: " + MAX_DAYS + " dias.");
  }
}
