package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/** Port of {@code fourqa.domain.distribute}. Deltas are maps {date, quantity, previous}. */
public final class Distribute {
  public static final List<String> STRATEGIES = List.of("montanha", "decrescente", "crescente", "uniforme");
  public static final String ASSIGNMENT = "manter";

  private Distribute() {}

  public static boolean isDistributionStrategy(String value) {
    return STRATEGIES.contains(value);
  }

  public static String shiftCalendarDay(String iso, int delta) {
    String day = Planning.calendarDate(iso);
    if (day == null) return null;
    return LocalDate.parse(day).plusDays(delta).toString();
  }

  public static List<String> distributionDays(String start, String end, int resguardo, Set<String> enabledOffDays) {
    if (resguardo < 0) return new ArrayList<>();
    String last = shiftCalendarDay(end, -resguardo);
    if (last == null) return new ArrayList<>();
    List<String> out = new ArrayList<>();
    for (String day : Planning.datesBetween(start, last))
      if (!OffDays.isOffDay(day) || enabledOffDays.contains(day)) out.add(day);
    return out;
  }

  static long[] weightsFor(int count, String strategy) {
    long[] w = new long[count];
    for (int i = 0; i < count; i++) {
      w[i] = switch (strategy) {
        case "uniforme" -> 1;
        case "decrescente" -> count - i;
        case "crescente" -> i + 1;
        default -> Math.min(i, count - 1 - i) + 1;
      };
    }
    return w;
  }

  static long[] allocateByRemainder(long total, long[] weights) {
    int count = weights.length;
    long[] out = new long[count];
    if (count == 0 || total <= 0) return out;
    long weightSum = Arrays.stream(weights).sum();
    List<long[]> pending = new ArrayList<>();
    long used = 0;
    for (int i = 0; i < count; i++) {
      long quota = total * weights[i];
      long floor = Math.floorDiv(quota, weightSum);
      out[i] = floor;
      used += floor;
      pending.add(new long[] {i, Math.floorMod(quota, weightSum), weights[i]});
    }
    pending.sort((a, b) -> {
      if (a[1] != b[1]) return Long.compare(b[1], a[1]);
      if (a[2] != b[2]) return Long.compare(b[2], a[2]);
      return Long.compare(a[0], b[0]);
    });
    long left = total - used;
    for (long[] p : pending) {
      if (left <= 0) break;
      out[(int) p[0]] += 1;
      left--;
    }
    return out;
  }

  static long[] fillZeros(long[] quantities, long total) {
    if (total < quantities.length) return quantities;
    long[] out = quantities.clone();
    while (Arrays.stream(out).anyMatch(v -> v == 0)) {
      int hole = -1;
      for (int i = 0; i < out.length; i++) {
        if (out[i] == 0) {
          hole = i;
          break;
        }
      }
      int donor = -1;
      for (int i = 0; i < out.length; i++) {
        long value = out[i];
        if (value <= 1) continue;
        if (donor < 0 || value > out[donor] || (value == out[donor] && i > donor)) donor = i;
      }
      if (hole < 0 || donor < 0) break;
      out[donor]--;
      out[hole]++;
    }
    return out;
  }

  public static long[] spreadQuantity(long total, int dayCount, String strategy) {
    if (dayCount <= 0) return new long[0];
    if (total <= 0) return new long[dayCount];
    if (dayCount == 1) return new long[] {total};
    return fillZeros(allocateByRemainder(total, weightsFor(dayCount, strategy)), total);
  }

  static Map<String, Long> takenQuantity(List<Map<String, Object>> allocations) {
    Map<String, Long> previous = new LinkedHashMap<>();
    for (Map<String, Object> row : allocations) {
      String day = Planning.calendarDate(Py.str(row.getOrDefault("date", "")));
      Object qty = row.get("quantity");
      if (day == null || !Py.isNumber(qty) || ((Number) qty).doubleValue() == 0) continue;
      previous.merge(day, (long) ((Number) qty).doubleValue(), Long::sum);
    }
    return previous;
  }

  static List<Map<String, Object>> deltasFrom(Map<String, Long> previous, Map<String, Long> next) {
    TreeSet<String> dates = new TreeSet<>(previous.keySet());
    dates.addAll(next.keySet());
    List<Map<String, Object>> deltas = new ArrayList<>();
    for (String date : dates) {
      long before = previous.getOrDefault(date, 0L);
      long quantity = next.getOrDefault(date, 0L);
      if (before == quantity) continue;
      deltas.add(Py.obj("date", date, "quantity", quantity, "previous", before));
    }
    return deltas;
  }

  public static boolean isPlanningFinalized(String classification) {
    return classification.equals("passed") || classification.equals("na");
  }

  public static Map<String, Object> countPlanningBalance(List<String> classifications) {
    long scope = classifications.size();
    long finalized = classifications.stream().filter(Distribute::isPlanningFinalized).count();
    return Py.obj("scope", scope, "finalized", finalized, "pending", scope - finalized);
  }

  public static long quantityOutsideDays(List<Map<String, Object>> allocations, Collection<String> days) {
    Set<String> window = new HashSet<>(days);
    long total = 0;
    for (Map<String, Object> row : allocations) {
      String day = Planning.calendarDate(Py.str(row.getOrDefault("date", "")));
      if (day == null || window.contains(day)) continue;
      Object qty = row.get("quantity");
      if (Py.isNumber(qty) && ((Number) qty).doubleValue() > 0) total += (long) ((Number) qty).doubleValue();
    }
    return total;
  }

  public static long quantityBeforeCut(List<Map<String, Object>> allocations, String cut) {
    String limit = Planning.calendarDate(cut);
    if (limit == null) return 0;
    long total = 0;
    for (Map<String, Object> row : allocations) {
      String day = Planning.calendarDate(Py.str(row.getOrDefault("date", "")));
      Object qty = row.get("quantity");
      if (day != null && day.compareTo(limit) < 0 && Py.isNumber(qty) && ((Number) qty).doubleValue() > 0)
        total += (long) ((Number) qty).doubleValue();
    }
    return total;
  }

  /** mode: pending (int), protected_quantity (int), replace (bool). */
  public static List<Map<String, Object>> saldoDeltas(
      List<Map<String, Object>> allocations, List<String> days, String strategy, Map<String, Object> mode) {
    Object pendingObj = mode.get("pending");
    if (!Py.isInt(pendingObj) || ((Number) pendingObj).longValue() < 0) throw new IllegalArgumentException("Saldo pendente inválido.");
    long pending = ((Number) pendingObj).longValue();
    Object prot = mode.get("protected_quantity");
    long protectedQty = Py.isInt(prot) && ((Number) prot).longValue() > 0 ? ((Number) prot).longValue() : 0;
    long toPlace = Math.max(0, pending - protectedQty);
    Set<String> daySet = new HashSet<>(days);
    List<Map<String, Object>> windowRows = new ArrayList<>();
    for (Map<String, Object> row : allocations) {
      String d = Planning.calendarDate(Py.str(row.getOrDefault("date", "")));
      if (d != null && daySet.contains(d)) windowRows.add(row);
    }
    if (pending == 0) return null;
    boolean replace = Py.truthy(mode.get("replace"));
    if (toPlace == 0) {
      if (!replace) return new ArrayList<>();
      List<Map<String, Object>> out = new ArrayList<>();
      for (var e : takenQuantity(windowRows).entrySet())
        if (e.getValue() > 0) out.add(Py.obj("date", e.getKey(), "quantity", 0L, "previous", e.getValue()));
      return out;
    }
    return allocationDeltas(windowRows, days, strategy, replace, toPlace);
  }

  public static List<Map<String, Object>> trimAllocationsToKeep(List<Map<String, Object>> allocations, long keep) {
    if (keep < 0) throw new IllegalArgumentException("Quantidade finalizada inválida.");
    Map<String, Long> byDate = new HashMap<>();
    for (Map<String, Object> row : allocations) {
      String day = Planning.calendarDate(Py.str(row.getOrDefault("date", "")));
      Object qty = row.get("quantity");
      if (day == null || !Py.isNumber(qty) || ((Number) qty).doubleValue() <= 0) continue;
      byDate.merge(day, (long) ((Number) qty).doubleValue(), Long::sum);
    }
    List<String> dates = new ArrayList<>(new TreeSet<>(byDate.keySet()));
    long total = byDate.values().stream().mapToLong(Long::longValue).sum();
    long excess = total - keep;
    List<Map<String, Object>> deltas = new ArrayList<>();
    if (excess <= 0) return deltas;
    for (int i = dates.size() - 1; i >= 0; i--) {
      if (excess <= 0) break;
      String date = dates.get(i);
      long previous = byDate.get(date);
      long cut = Math.min(previous, excess);
      deltas.add(Py.obj("date", date, "quantity", previous - cut, "previous", previous));
      excess -= cut;
    }
    return deltas;
  }

  /** {@code mode=None} is replace=true, total=null. */
  public static List<Map<String, Object>> allocationDeltas(
      List<Map<String, Object>> allocations, List<String> days, String strategy, boolean replace, Long requested) {
    Map<String, Long> previous = takenQuantity(allocations);
    long allocated = previous.values().stream().mapToLong(Long::longValue).sum();
    long target = requested != null && requested > 0 ? requested : allocated;
    if (target == 0) return null;
    if (target < 0) throw new IllegalArgumentException("Quantidade planejada inválida.");
    if (!replace) {
      List<String> freeDays = new ArrayList<>();
      for (String day : days) if (previous.getOrDefault(day, 0L) == 0) freeDays.add(day);
      long locked = allocated;
      long remainder = Math.max(0, target - locked);
      if (remainder == 0) return new ArrayList<>();
      if (freeDays.isEmpty()) throw new IllegalArgumentException("Não há dia em zero nesse período.");
      long[] spread = spreadQuantity(remainder, freeDays.size(), strategy);
      Map<String, Long> next = new LinkedHashMap<>(previous);
      for (int i = 0; i < Math.min(freeDays.size(), spread.length); i++) next.put(freeDays.get(i), spread[i]);
      return deltasFrom(previous, next);
    }
    long[] spread = spreadQuantity(target, days.size(), strategy);
    Map<String, Long> next = new LinkedHashMap<>();
    for (int i = 0; i < days.size(); i++) next.put(days.get(i), i < spread.length ? spread[i] : 0L);
    return deltasFrom(previous, next);
  }

  /** quotas: [{key, quota}]. */
  static Map<String, Map<String, Long>> dealDays(List<Map<String, Object>> quotas, List<String> days, long[] curve) {
    Map<String, Long> left = new HashMap<>();
    for (Map<String, Object> row : quotas) left.put(Py.str(row.get("key")), Py.toLong(row.get("quota")));
    Map<String, Map<String, Long>> out = new HashMap<>();
    List<Map<String, Object>> order = new ArrayList<>(quotas);
    order.sort((a, b) -> Py.str(a.get("key")).compareTo(Py.str(b.get("key"))));
    for (int index = 0; index < days.size(); index++) {
      String day = days.get(index);
      long need = index < curve.length ? curve[index] : 0;
      if (day == null || day.isEmpty() || need <= 0) continue;
      while (need > 0) {
        String pick = null;
        long best = 0;
        for (Map<String, Object> row : order) {
          String key = Py.str(row.get("key"));
          long remaining = left.getOrDefault(key, 0L);
          if (remaining > best) {
            best = remaining;
            pick = key;
          }
        }
        if (pick == null || pick.isEmpty() || best <= 0) break;
        out.computeIfAbsent(pick, k -> new HashMap<>()).merge(day, 1L, Long::sum);
        left.put(pick, best - 1);
        need--;
      }
    }
    return out;
  }

  /** shares: [{key, total (Long), allocations, clear_window}]. */
  public static Map<String, List<Map<String, Object>>> apportionDistribution(
      List<Map<String, Object>> shares, List<String> days, String strategy, boolean replace) {
    Set<String> seen = new HashSet<>();
    for (Map<String, Object> share : shares) {
      String key = Py.str(share.get("key"));
      if (!seen.add(key)) throw new IllegalArgumentException("Suíte repetida na distribuição.");
      Object total = share.get("total");
      if (!Py.isInt(total) || ((Number) total).longValue() < 0) throw new IllegalArgumentException("Quantidade planejada inválida.");
    }
    Map<String, List<Map<String, Object>>> result = new LinkedHashMap<>();
    List<Object[]> active = new ArrayList<>();
    for (Map<String, Object> share : shares) {
      String key = Py.str(share.get("key"));
      Map<String, Long> previous = takenQuantity(Py.rows(Py.or(share.get("allocations"), List.of())));
      long total = Py.toLong(share.get("total"));
      if (total == 0) {
        if (!Py.truthy(share.get("clear_window"))) continue;
        if (!replace) {
          result.put(key, new ArrayList<>());
          continue;
        }
        Map<String, Long> next = new LinkedHashMap<>(previous);
        for (String day : days) next.put(day, 0L);
        result.put(key, deltasFrom(previous, next));
        continue;
      }
      active.add(new Object[] {share, previous});
    }
    long curveTotal = 0;
    for (Object[] a : active) curveTotal += Py.toLong(((Map<?, ?>) a[0]).get("total"));
    if (days.isEmpty()) {
      if (curveTotal > 0) throw new IllegalArgumentException("Nenhum dia habilitado nesse período.");
      return result;
    }
    if (replace) {
      long[] curve = curveTotal > 0 ? spreadQuantity(curveTotal, days.size(), strategy) : new long[0];
      List<Map<String, Object>> quotas = new ArrayList<>();
      for (Object[] a : active) {
        Map<?, ?> s = (Map<?, ?>) a[0];
        quotas.add(Py.obj("key", s.get("key"), "quota", s.get("total")));
      }
      Map<String, Map<String, Long>> dealt = dealDays(quotas, days, curve);
      for (Object[] a : active) {
        Map<?, ?> s = (Map<?, ?>) a[0];
        @SuppressWarnings("unchecked")
        Map<String, Long> previous = (Map<String, Long>) a[1];
        Map<String, Long> assigned = dealt.getOrDefault(Py.str(s.get("key")), Map.of());
        Map<String, Long> next = new LinkedHashMap<>();
        for (String day : days) next.put(day, assigned.getOrDefault(day, 0L));
        result.put(Py.str(s.get("key")), deltasFrom(previous, next));
      }
      return result;
    }
    List<Object[]> remainders = new ArrayList<>();
    long remainderTotal = 0;
    for (Object[] a : active) {
      Map<?, ?> s = (Map<?, ?>) a[0];
      @SuppressWarnings("unchecked")
      Map<String, Long> previous = (Map<String, Long>) a[1];
      long locked = previous.values().stream().mapToLong(Long::longValue).sum();
      long quota = Math.max(0, Py.toLong(s.get("total")) - locked);
      remainders.add(new Object[] {Py.str(s.get("key")), quota, previous});
      remainderTotal += quota;
    }
    if (remainderTotal == 0) {
      for (Object[] r : remainders) result.put((String) r[0], new ArrayList<>());
      return result;
    }
    Set<String> occupied = new HashSet<>();
    for (Map<String, Object> share : shares)
      for (var e : takenQuantity(Py.rows(Py.or(share.get("allocations"), List.of()))).entrySet())
        if (e.getValue() > 0) occupied.add(e.getKey());
    List<String> freeDays = new ArrayList<>();
    for (String day : days) if (!occupied.contains(day)) freeDays.add(day);
    if (freeDays.isEmpty()) throw new IllegalArgumentException("Não há dia em zero nesse período.");
    long[] curve = spreadQuantity(remainderTotal, freeDays.size(), strategy);
    List<Map<String, Object>> quotas = new ArrayList<>();
    for (Object[] r : remainders) if ((Long) r[1] > 0) quotas.add(Py.obj("key", r[0], "quota", r[1]));
    Map<String, Map<String, Long>> dealt = dealDays(quotas, freeDays, curve);
    for (Object[] r : remainders) {
      Map<String, Long> assigned = dealt.getOrDefault((String) r[0], Map.of());
      @SuppressWarnings("unchecked")
      Map<String, Long> previous = (Map<String, Long>) r[2];
      Map<String, Long> next = new LinkedHashMap<>(previous);
      for (String day : freeDays) {
        long add = assigned.getOrDefault(day, 0L);
        if (add > 0) next.put(day, previous.getOrDefault(day, 0L) + add);
      }
      result.put((String) r[0], deltasFrom(previous, next));
    }
    return result;
  }
}
