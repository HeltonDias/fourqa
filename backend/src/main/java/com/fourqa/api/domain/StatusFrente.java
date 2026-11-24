package com.fourqa.api.domain;

import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of {@code fourqa.domain.status_frente}, {@code evolucao_status} and {@code legacy_plan_owner}. */
public final class StatusFrente {
  private StatusFrente() {}

  public static String statusEvolucao(double gap, double ttl, double finalizados, double na) {
    if (ttl > 0 && na >= ttl) return "na";
    if (ttl > 0 && finalizados >= ttl) return "done";
    if (gap > 3) return "risk";
    if (gap > 0) return "warn";
    return "ok";
  }

  public static String statusGeralDe(List<String> statuses) {
    List<String> votos = new ArrayList<>();
    for (String s : statuses) if (!s.equals("na")) votos.add(s);
    if (votos.isEmpty()) return statuses.contains("na") ? "na" : "ok";
    String[] ordem = {"risk", "warn", "ok", "done"};
    String best = ordem[0];
    for (int i = 1; i < ordem.length; i++) {
      if (count(votos, ordem[i]) > count(votos, best)) best = ordem[i];
    }
    return best;
  }

  private static long count(List<String> votos, String s) {
    return votos.stream().filter(s::equals).count();
  }

  /** Returns values with Python numeric types: ratios are floats; others keep the input type. */
  public static Map<String, Object> indicadoresFrente(Map<String, Object> c) {
    double planAteHoje = Py.toDouble(c.get("plan_ate_hoje"));
    double finalizado = Py.toDouble(c.get("finalizado"));
    double gap = planAteHoje - finalizado;
    double executados = Py.toDouble(c.get("passeds")) + Py.toDouble(c.get("falha")) + Py.toDouble(c.get("bloqueado"));
    double ttl = Py.toDouble(c.get("ttl"));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("plan_ate_hoje", c.get("plan_ate_hoje"));
    out.put("na", c.get("na"));
    out.put("passeds", c.get("passeds"));
    out.put("gap", sameKind(gap, c.get("plan_ate_hoje"), c.get("finalizado")));
    out.put("pct_plan", ttl > 0 ? (Object) (planAteHoje / ttl) : (Object) 0L);
    out.put("pct_real", ttl > 0 ? (Object) (finalizado / ttl) : (Object) 0L);
    out.put("pct_bugs_dev", executados > 0 ? (Object) (Py.toDouble(c.get("impactos_dev")) / executados) : (Object) 0L);
    out.put(
        "pct_bugs_cliente",
        executados > 0 ? (Object) (Py.toDouble(c.get("impactos_cliente")) / executados) : (Object) 0L);
    double abertos = Py.toDouble(c.get("bugs_total")) - Py.toDouble(c.get("bugs_fechados"));
    out.put("bugs_abertos", abertos > 0 ? sameKind(abertos, c.get("bugs_total"), c.get("bugs_fechados")) : (Object) 0L);
    out.put("status", statusEvolucao(gap, ttl, finalizado, Py.toDouble(c.get("na"))));
    return out;
  }

  private static Object sameKind(double value, Object a, Object b) {
    if (Py.isInt(a) && Py.isInt(b)) return (long) value;
    return value;
  }

  public static boolean haSobreposicaoFrentes(List<String> nomes) {
    List<String> norm = new ArrayList<>();
    for (String n : nomes) if (!n.strip().isEmpty()) norm.add(n.strip().toLowerCase());
    for (int i = 0; i < norm.size(); i++)
      for (int j = 0; j < norm.size(); j++) if (i != j && norm.get(j).contains(norm.get(i))) return true;
    return false;
  }

  public static boolean isLegacyPlanOwner(String planKey, String owner) {
    String stored = owner == null ? "" : owner.strip();
    if (stored.isEmpty()) return false;
    return stored.toLowerCase().equals(planKey.strip().toLowerCase());
  }
}
