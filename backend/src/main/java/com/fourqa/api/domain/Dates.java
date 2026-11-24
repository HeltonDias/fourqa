package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Port of {@code fourqa.domain.dates}. */
public final class Dates {
  private static final Pattern ISO_HEAD = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})");

  private Dates() {}

  public static String persistTimestamp(Object value) {
    if (value == null) return "";
    String s = Py.str(value).strip();
    if (s.isEmpty()) return "";
    Matcher head = ISO_HEAD.matcher(s);
    if (head.find()) {
      String cal = PlanPeriod.parseCalendarDay(head.group(1));
      return cal != null ? cal : "";
    }
    String br = PlanPeriod.parseCalendarDay(s);
    if (br != null) return br;
    return s;
  }
}
