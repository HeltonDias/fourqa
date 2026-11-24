package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Port of {@code fourqa.domain.graficos}. */
public final class Graficos {
  private static final Pattern HEAD = Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})");

  private Graficos() {}

  static LocalDate toDateOnly(Object v) {
    if (!Py.truthy(v)) return null;
    String s = Py.str(v).strip();
    Matcher head = HEAD.matcher(s);
    String cal = PlanPeriod.parseCalendarDay(head.find() ? head.group(1) : s);
    return cal == null ? null : LocalDate.parse(cal);
  }

  static boolean isBusinessDay(LocalDate d) {
    DayOfWeek w = d.getDayOfWeek();
    return w != DayOfWeek.SATURDAY && w != DayOfWeek.SUNDAY;
  }

  public static List<LocalDate> businessDays(LocalDate inicio, LocalDate fim) {
    PlanPeriod.assertDateRangeForCalculation(inicio, fim);
    List<LocalDate> out = new ArrayList<>();
    for (LocalDate c = inicio; !c.isAfter(fim); c = c.plusDays(1)) if (isBusinessDay(c)) out.add(c);
    return out;
  }

  static boolean isRealizado(Map<String, Object> e, String planKey) {
    if (!Py.norm(e.get("plan_key")).equals(planKey)) return false;
    String s = Formulas.statusCenario(e);
    return s.equals("passed") || s.equals("na");
  }

  static LocalDate today(LocalDate hoje) {
    return hoje != null ? hoje : LocalDate.now(ZoneOffset.UTC);
  }

  /** Returns Long (rounded) or the original qty (Double) when the window has no business days. */
  public static Object planejadoAteHoje(double qtd, Object inicio, Object fim, LocalDate hoje) {
    LocalDate ini = toDateOnly(inicio);
    LocalDate end = toDateOnly(fim);
    if (qtd == 0 || ini == null || end == null) return 0L;
    LocalDate hojeUtc = today(hoje);
    List<LocalDate> dias = businessDays(ini, end);
    if (dias.isEmpty()) return !hojeUtc.isBefore(ini) ? (Object) qtd : (Object) 0L;
    long decorridos = dias.stream().filter(d -> !d.isAfter(hojeUtc)).count();
    return Py.round((qtd * decorridos) / dias.size());
  }

  public static List<Map<String, Object>> planejadoVsRealizado(
      List<Map<String, Object>> linhas,
      List<Map<String, Object>> execRows,
      String planKey,
      Map<String, Object> periodo,
      LocalDate hoje) {
    PlanPeriod.assertStoredPlanningPeriod(Py.text(periodo.get("inicio")), Py.text(periodo.get("fim")));
    List<Map<String, Object>> suites = new ArrayList<>();
    for (Map<String, Object> l : linhas)
      if (Py.truthy(l.get("processo")) && Py.toDouble(l.get("qtd_cts_plan")) > 0) suites.add(l);
    LocalDate minInicio = null;
    LocalDate maxFim = null;
    for (Map<String, Object> s : suites) {
      LocalDate d = toDateOnly(s.get("data_inicio"));
      if (d != null && (minInicio == null || d.isBefore(minInicio))) minInicio = d;
    }
    LocalDate inicio = toDateOnly(periodo.get("inicio"));
    if (inicio == null) inicio = minInicio;
    LocalDate periodoFim = toDateOnly(periodo.get("fim"));
    if (periodoFim != null) maxFim = periodoFim;
    for (Map<String, Object> s : suites) {
      LocalDate d = toDateOnly(s.get("data_fim"));
      if (d != null && (maxFim == null || d.isAfter(maxFim))) maxFim = d;
    }
    LocalDate fim = maxFim;
    if (inicio == null || fim == null || fim.isBefore(inicio)) return new ArrayList<>();
    List<LocalDate> eixo = businessDays(inicio, fim);
    if (eixo.isEmpty()) return new ArrayList<>();
    Map<String, Double> planPorDia = new LinkedHashMap<>();
    for (LocalDate d : eixo) planPorDia.put(d.toString(), 0.0);
    for (Map<String, Object> s : suites) {
      double plan = Py.toDouble(s.get("qtd_cts_plan"));
      LocalDate sIni = toDateOnly(s.get("data_inicio"));
      if (sIni == null) sIni = inicio;
      LocalDate sFim = toDateOnly(s.get("data_fim"));
      if (sFim == null) sFim = fim;
      List<LocalDate> dias = businessDays(sIni, sFim);
      if (dias.isEmpty()) {
        String k = eixo.get(0).toString();
        planPorDia.put(k, planPorDia.getOrDefault(k, 0.0) + plan);
        continue;
      }
      double porDia = plan / dias.size();
      for (LocalDate d : dias) {
        String k = d.toString();
        if (planPorDia.containsKey(k)) planPorDia.put(k, planPorDia.get(k) + porDia);
      }
    }
    Map<String, Long> realPorDia = new HashMap<>();
    for (Map<String, Object> e : execRows) {
      if (!isRealizado(e, planKey)) continue;
      LocalDate d = toDateOnly(e.get("date_completed"));
      if (d == null) d = toDateOnly(e.get("last_updated_date"));
      if (d == null) continue;
      realPorDia.merge(d.toString(), 1L, Long::sum);
    }
    String primeiro = eixo.get(0).toString();
    long realAntes = 0;
    for (var e : realPorDia.entrySet()) if (e.getKey().compareTo(primeiro) < 0) realAntes += e.getValue();
    String hojeKey = today(hoje).toString();
    double accPlan = 0;
    long accReal = realAntes;
    List<Map<String, Object>> pontos = new ArrayList<>();
    LocalDate cursor = eixo.get(0);
    for (LocalDate d : eixo) {
      accPlan += planPorDia.getOrDefault(d.toString(), 0.0);
      for (LocalDate x = cursor; !x.isAfter(d); x = x.plusDays(1)) accReal += realPorDia.getOrDefault(x.toString(), 0L);
      cursor = d.plusDays(1);
      String k = d.toString();
      Map<String, Object> p = new LinkedHashMap<>();
      p.put("data", k);
      p.put("planejado", Math.rint(accPlan * 10) / 10.0);
      p.put("realizado", k.compareTo(hojeKey) <= 0 ? accReal : null);
      pontos.add(p);
    }
    return pontos;
  }

  public static List<Map<String, Object>> statusExecucoes(Map<String, Object> totais) {
    List<Map<String, Object>> out = new ArrayList<>();
    out.add(fatia("passeds", "CTS Passeds", totais));
    out.add(fatia("na", "CTS N/A", totais));
    out.add(fatia("cancelados", "CTS Cancelados", totais));
    out.add(fatia("falhados", "CTS Falhados", totais));
    out.add(fatia("bloqueados", "CTS Bloqueados", totais));
    out.add(fatia("liberados", "CTS Liberados", totais));
    out.add(fatia("design", "CTS Design", totais));
    out.add(fatia("naoLiberados", "CTS Não Liberados", totais));
    return out;
  }

  private static Map<String, Object> fatia(String key, String label, Map<String, Object> totais) {
    return Py.obj("key", key, "label", label, "value", totais.getOrDefault(key, 0L));
  }
}
