package com.fourqa.api.persistence;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/** Python {@code datetime} text forms used by the API and stored in the database. */
public final class PyTime {
  private PyTime() {}

  public static OffsetDateTime nowUtc() {
    return OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS);
  }

  /** {@code datetime.isoformat()}: {@code 2026-11-04T12:00:00.123456+00:00}. */
  public static String isoformat(OffsetDateTime t) {
    return body(t.toLocalDateTime(), 'T') + offset(t.getOffset());
  }

  /** {@code datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()}. */
  public static String isoFromMillis(long ms) {
    return isoformat(OffsetDateTime.ofInstant(Instant.ofEpochMilli(ms), ZoneOffset.UTC));
  }

  /** {@code datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp() * 1000}; naive text counts as UTC. */
  public static Double parseIsoMillis(String text) {
    if (text == null || text.isEmpty()) return null;
    String t = text.replace("Z", "+00:00");
    try {
      return (double) OffsetDateTime.parse(t).toInstant().toEpochMilli()
          + (OffsetDateTime.parse(t).getNano() % 1_000_000) / 1e6;
    } catch (java.time.format.DateTimeParseException e) {
      try {
        LocalDateTime local = LocalDateTime.parse(t.replace(' ', 'T'));
        return (double) local.toInstant(ZoneOffset.UTC).toEpochMilli();
      } catch (java.time.format.DateTimeParseException e2) {
        try {
          return (double) OffsetDateTime.parse(t.replace(' ', 'T')).toInstant().toEpochMilli();
        } catch (java.time.format.DateTimeParseException e3) {
          return null;
        }
      }
    }
  }

  public static long nowMillis() {
    return System.currentTimeMillis();
  }

  /** {@code str(datetime)}: {@code 2026-11-04 12:00:00.123456+00:00}. */
  public static String str(OffsetDateTime t) {
    return body(t.toLocalDateTime(), ' ') + offset(t.getOffset());
  }

  /** {@code datetime.now(timezone.utc).isoformat()}. */
  public static String nowIso() {
    return isoformat(nowUtc());
  }

  /** Naive UTC isoformat + {@code Z} ({@code _utc_stamp}). */
  public static String utcStamp() {
    return body(nowUtc().toLocalDateTime(), 'T') + "Z";
  }

  /** {@code isoformat(timespec="milliseconds")} with {@code Z}. */
  public static String nowMillisZ() {
    Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    return now.toString().length() == 20 ? now.toString().replace("Z", ".000Z") : now.toString();
  }

  private static String body(LocalDateTime t, char sep) {
    StringBuilder sb = new StringBuilder();
    sb.append(String.format("%04d-%02d-%02d", t.getYear(), t.getMonthValue(), t.getDayOfMonth()));
    sb.append(sep);
    sb.append(String.format("%02d:%02d:%02d", t.getHour(), t.getMinute(), t.getSecond()));
    int micros = t.getNano() / 1000;
    if (micros != 0) sb.append(String.format(".%06d", micros));
    return sb.toString();
  }

  private static String offset(ZoneOffset o) {
    int total = o.getTotalSeconds();
    char sign = total < 0 ? '-' : '+';
    total = Math.abs(total);
    return String.format("%c%02d:%02d", sign, total / 3600, (total % 3600) / 60);
  }

  /** Value read from a timestamptz column, rendered like psycopg's datetime through {@code isoformat()}. */
  public static String iso(Object value) {
    if (value == null) return null;
    if (value instanceof OffsetDateTime t) return isoformat(t);
    return String.valueOf(value);
  }

  /** Value rendered like Python {@code str(value)} ({@code as_text}). */
  public static String text(Object value) {
    if (value == null) return null;
    if (value instanceof OffsetDateTime t) return str(t);
    return com.fourqa.api.util.Py.text(value);
  }
}
