package com.fourqa.api.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Brazilian national holidays, same set as Python {@code holidays.country_holidays("BR")} (public category):
 * fixed dates, Good Friday (Easter - 2) and Consciência Negra (20/11, from 2024).
 */
public final class OffDays {
  private static final Map<MonthDay, String> FIXED = new LinkedHashMap<>();

  static {
    FIXED.put(MonthDay.of(1, 1), "Confraternização Universal");
    FIXED.put(MonthDay.of(4, 21), "Tiradentes");
    FIXED.put(MonthDay.of(5, 1), "Dia do Trabalhador");
    FIXED.put(MonthDay.of(9, 7), "Independência do Brasil");
    FIXED.put(MonthDay.of(10, 12), "Nossa Senhora Aparecida");
    FIXED.put(MonthDay.of(11, 2), "Finados");
    FIXED.put(MonthDay.of(11, 15), "Proclamação da República");
    FIXED.put(MonthDay.of(12, 25), "Natal");
  }

  private OffDays() {}

  /** Gregorian Easter Sunday (anonymous algorithm). */
  public static LocalDate easter(int year) {
    int a = year % 19;
    int b = year / 100;
    int c = year % 100;
    int d = b / 4;
    int e = b % 4;
    int f = (b + 8) / 25;
    int g = (b - f + 1) / 3;
    int h = (19 * a + b - d - g + 15) % 30;
    int i = c / 4;
    int k = c % 4;
    int l = (32 + 2 * e + 2 * i - h - k) % 7;
    int m = (a + 11 * h + 22 * l) / 451;
    int month = (h + l - 7 * m + 114) / 31;
    int day = ((h + l - 7 * m + 114) % 31) + 1;
    return LocalDate.of(year, month, day);
  }

  public static String holidayName(String iso) {
    String day = Planning.calendarDate(iso);
    if (day == null) return null;
    LocalDate date = LocalDate.parse(day);
    String names = null;
    String fixed = FIXED.get(MonthDay.from(date));
    if (fixed != null) names = fixed;
    if (date.getYear() >= 2024 && date.getMonthValue() == 11 && date.getDayOfMonth() == 20)
      names = join(names, "Dia Nacional de Zumbi e da Consciência Negra");
    if (date.equals(easter(date.getYear()).minusDays(2))) names = join(names, "Sexta-feira Santa");
    return names;
  }

  private static String join(String a, String b) {
    return a == null ? b : a + "; " + b;
  }

  public static boolean isHolidayDate(String iso) {
    return holidayName(iso) != null;
  }

  public static boolean isWeekendDate(String iso) {
    String day = Planning.calendarDate(iso);
    if (day == null) return false;
    DayOfWeek w = LocalDate.parse(day).getDayOfWeek();
    return w == DayOfWeek.SATURDAY || w == DayOfWeek.SUNDAY;
  }

  public static boolean isOffDay(String iso) {
    return isWeekendDate(iso) || isHolidayDate(iso);
  }
}
