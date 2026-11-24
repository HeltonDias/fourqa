package com.fourqa.api.services;

import com.fourqa.api.domain.Dimensions;
import com.fourqa.api.domain.Formulas;
import com.fourqa.api.domain.Graficos;
import com.fourqa.api.domain.PlanPeriod;
import com.fourqa.api.domain.ReportGroups;
import com.fourqa.api.domain.StatusFrente;
import com.fourqa.api.persistence.PyTime;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.regex.Pattern;

/** Report service (port of {@code fourqa.services.report_service}). */
public final class ReportService {
  static final List<String> PERIOD_KEYS = List.of("data_inicio", "data_fim", "data_fim_linha");
  static final List<String> HEADER_KEYS = List.of("cabecalho_titulo", "title", "cabecalho_subtitulo");
  public static final String DEFAULT_REPORT_TITLE = "STATUS REPORT QA";
  public static final String DEFAULT_REPORT_SUBTITLE = "FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3";
  private static final Pattern LINHA_TOTAIS = Pattern.compile("valores\\s+totais", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

  private ReportService() {}

  static Stores stores() {
    return Stores.get();
  }

  static Map<String, String> loadMeta(List<String> keys) {
    return stores().meta.getMany(keys);
  }

  static List<String> homeMetaKeys(String planKey) {
    List<String> out = new ArrayList<>(PERIOD_KEYS);
    out.add("planejamento_legado_plan_key");
    out.add("dimensoes_catalog:" + planKey);
    out.add("kpi_impactos:" + planKey);
    out.addAll(HEADER_KEYS);
    out.add("ultima_sincronizacao_azure");
    out.add("imported_at");
    return out;
  }

  static String suiteLabel(String processo) {
    String p = processo.strip();
    int len = p.codePointCount(0, p.length());
    return len <= 36 ? p : p.substring(0, p.offsetByCodePoints(0, 33)) + "…";
  }

  static boolean isLinhaTotais(Map<String, Object> row) {
    return LINHA_TOTAIS.matcher(Py.orText(row.get("processo"), "")).find();
  }

  static String orEmpty(String v) {
    return v == null || v.isEmpty() ? "" : v;
  }

  static Map<String, Object> periodoFrom(Map<String, String> bag) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("inicio", orEmpty(bag.get("data_inicio")));
    out.put("fim", orEmpty(bag.get("data_fim")));
    out.put("referencia", orEmpty(bag.get("data_fim_linha")));
    return out;
  }

  static Map<String, Object> periodoGeral() {
    return periodoFrom(loadMeta(PERIOD_KEYS));
  }

  static List<Map<String, Object>> legacyBase(String planKey, Map<String, String> bag) {
    String owner = bag != null ? bag.get("planejamento_legado_plan_key") : stores().meta.get("planejamento_legado_plan_key");
    if (!StatusFrente.isLegacyPlanOwner(planKey, owner)) return new ArrayList<>();
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : stores().legacyPlan.listBase()) if (!isLinhaTotais(r)) out.add(r);
    return out;
  }

  static String key(Object s) {
    return Py.orText(s, "").strip().toLowerCase();
  }

  @SuppressWarnings("unchecked")
  static List<Map<String, Object>> buildPlanejamento(
      String planKey, List<Map<String, Object>> execRows, List<Map<String, Object>> dimensoes, Map<String, String> bag) {
    Map<String, Object> periodo = bag != null ? periodoFrom(bag) : periodoGeral();
    Map<String, Map<String, Object>> planejamento = new LinkedHashMap<>();
    for (Map<String, Object> r : legacyBase(planKey, bag)) planejamento.put(key(r.get("processo")), r);
    Set<String> legacyQtyApplied = new HashSet<>();
    List<Map<String, Object>> out = new ArrayList<>();
    List<Map<String, Object>> groups = ReportGroups.groupExecucoesForReport(execRows, dimensoes);
    for (int i = 0; i < groups.size(); i++) {
      Map<String, Object> s = groups.get(i);
      String legacyKey = key(s.get("processo"));
      Map<String, Object> p = planejamento.get(legacyKey);
      boolean applyLegacy = Py.truthy(p) && !legacyQtyApplied.contains(legacyKey);
      if (applyLegacy) legacyQtyApplied.add(legacyKey);
      List<Map<String, Object>> pontos = (List<Map<String, Object>>) s.get("rows");
      Map<String, Object> m = Formulas.metricasDosPontos(pontos);
      Object ctsCancelados = applyLegacy ? (Object) Py.toDouble(p.get("cts_cancelados")) : (Object) 0L;
      long qtd = pontos.size();
      boolean datasConfirmadas = Py.truthy(p) && (Py.truthy(p.get("data_inicio")) || Py.truthy(p.get("data_fim")));
      Object dataInicio = Py.or(p != null ? p.get("data_inicio") : null, Py.or(periodo.get("inicio"), null));
      Object dataFim = Py.or(p != null ? p.get("data_fim") : null, Py.or(periodo.get("fim"), null));
      Map<String, Object> row = new LinkedHashMap<>(s);
      row.put("row_num", (long) (i + 1));
      row.put("qa", p != null ? p.get("qa") : null);
      row.put("prioridades", p != null ? p.get("prioridades") : null);
      row.put("data_inicio", dataInicio);
      row.put("data_fim", dataFim);
      row.put("replanejamento", applyLegacy ? (Object) Py.toDouble(p.get("replanejamento")) : (Object) 0L);
      row.put("qtd_cts_plan", qtd);
      row.put("cts_plan_dia", intLike(Graficos.planejadoAteHoje(qtd, dataInicio, dataFim, null)));
      row.put("cts_cancelados", ctsCancelados);
      row.putAll(m);
      row.put("total_realizado", Formulas.totalRealizadoLinha(m));
      row.put(
          "planejamentoOrigem",
          datasConfirmadas ? "confirmado" : (Py.truthy(dataInicio) || Py.truthy(dataFim)) ? "periodo_plano" : "ausente");
      out.add(row);
    }
    return out;
  }

  /** {@code planejado_ate_hoje} returns the int quantity unchanged when the window has no business days. */
  static Object intLike(Object v) {
    return v instanceof Double d ? Py.intIfWhole(d) : v;
  }

  static Map<String, Object> sumTotals(List<Map<String, Object>> linhas) {
    Function<String, Double> s = k -> {
      double total = 0;
      for (Map<String, Object> r : linhas) total += Py.toDouble(r.get(k));
      return total;
    };
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ctsPlan", s.apply("qtd_cts_plan"));
    out.put("ctsPlanAteHoje", s.apply("cts_plan_dia"));
    out.put("totalRealizado", s.apply("total_realizado"));
    out.put("passeds", s.apply("cts_passeds"));
    out.put("na", s.apply("cts_na"));
    out.put("cancelados", s.apply("cts_cancelados"));
    out.put("falhados", s.apply("cts_falhados"));
    out.put("bloqueados", s.apply("cts_bloqueados"));
    out.put("liberados", s.apply("cts_liberados"));
    out.put("design", s.apply("cts_design"));
    out.put("naoLiberados", s.apply("cts_nao_liberados"));
    return out;
  }

  static List<Map<String, Object>> contarPor(List<String> values) {
    TreeMap<String, Long> counts = new TreeMap<>();
    for (String v : values) counts.merge(v, 1L, Long::sum);
    List<Map<String, Object>> out = new ArrayList<>();
    for (var e : counts.entrySet()) out.add(Py.obj("key", e.getKey(), "label", e.getKey(), "value", e.getValue()));
    return out;
  }

  static List<Map<String, Object>> catalog(String planKey, List<Map<String, Object>> execRows, Map<String, String> bag) {
    String raw = bag.get("dimensoes_catalog:" + planKey);
    if (Py.truthy(raw)) {
      try {
        Object parsed = PyJson.loads(raw);
        if (parsed instanceof List<?> list && !list.isEmpty()) {
          List<Map<String, Object>> out = new ArrayList<>();
          for (Object d : list) {
            Map<String, Object> dim = Py.map(d);
            if (dim != null && !Boolean.FALSE.equals(dim.get("visible"))) out.add(dim);
          }
          return out;
        }
      } catch (PyJson.DecodeException ignored) {
        // falls back to inference
      }
    }
    return Dimensions.inferDimensions(execRows);
  }

  static Map<String, Object> kpiFrom(String planKey, Map<String, String> bag) {
    String raw = bag.get("kpi_impactos:" + planKey);
    if (!Py.truthy(raw)) return null;
    try {
      Map<String, Object> k = Py.map(PyJson.loads(raw));
      if (k == null) return null;
      if (Py.isNumber(k.get("foursys")) && Py.isNumber(k.get("cliente")) && Py.isNumber(k.get("reteste")))
        return Py.obj("foursys", Py.toDouble(k.get("foursys")), "cliente", Py.toDouble(k.get("cliente")), "reteste", Py.toDouble(k.get("reteste")));
    } catch (PyJson.DecodeException ignored) {
      // falls back to the live classification
    }
    return null;
  }

  static Map<String, Object> cabecalhoFrom(Map<String, String> bag) {
    String title = Py.truthy(bag.get("cabecalho_titulo")) ? bag.get("cabecalho_titulo")
        : Py.truthy(bag.get("title")) ? bag.get("title") : DEFAULT_REPORT_TITLE;
    String subtitle = Py.truthy(bag.get("cabecalho_subtitulo")) ? bag.get("cabecalho_subtitulo") : DEFAULT_REPORT_SUBTITLE;
    return Py.obj("title", title.strip(), "subtitle", subtitle.strip());
  }

  public static Map<String, Object> getCabecalho() {
    return cabecalhoFrom(loadMeta(HEADER_KEYS));
  }

  /** opts: guard, baseTitle, baseSubtitle. */
  public static Map<String, Object> setCabecalho(String title, String subtitle, Map<String, Object> opts) {
    if (opts != null && Py.truthy(opts.get("guard"))) {
      stores().meta.replaceHeaderIf(
          Py.orText(opts.get("baseTitle"), ""), Py.orText(opts.get("baseSubtitle"), ""), title, subtitle, DEFAULT_REPORT_TITLE,
          DEFAULT_REPORT_SUBTITLE);
    } else {
      Map<String, String> entries = new LinkedHashMap<>();
      entries.put("cabecalho_titulo", title.strip());
      entries.put("cabecalho_subtitulo", subtitle.strip());
      stores().meta.setMany(entries);
    }
    return getCabecalho();
  }

  /** opts: guard, baseInicio, baseFim. */
  public static Map<String, Object> setPeriodoPlano(String inicio, String fim, Map<String, Object> opts) {
    Map<String, String> period = PlanPeriod.assertPlanningPeriod(inicio, fim);
    String start = period.get("inicio");
    String end = period.get("fim");
    if (opts != null && Py.truthy(opts.get("guard"))) {
      stores().meta.replacePeriodIf(Py.orText(opts.get("baseInicio"), ""), Py.orText(opts.get("baseFim"), ""), start, end);
    } else {
      Map<String, String> entries = new LinkedHashMap<>();
      entries.put("data_inicio", start);
      entries.put("data_fim", end);
      stores().meta.setMany(entries);
    }
    return periodoGeral();
  }

  static List<Map<String, Object>> buildReportSuites(List<Map<String, Object>> linhas) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> row : linhas) {
      String processo = Py.orText(row.get("processo"), "");
      double ttlCts = Py.toDouble(row.get("qtd_cts_plan"));
      double fin = Py.toDouble(row.get("total_realizado"));
      double gap = Py.toDouble(row.get("cts_plan_dia")) - fin;
      double denom = ttlCts != 0 ? ttlCts : 1;
      String st = StatusFrente.statusEvolucao(gap, ttlCts, fin, Py.toDouble(row.get("cts_na")));
      Map<String, Object> suite = new LinkedHashMap<>(row);
      suite.put("suiteLabel", suiteLabel(processo));
      suite.put("ttlCts", ttlCts);
      suite.put("gap", gap);
      suite.put("aprovUatPct", fin / denom);
      suite.put("conclusaoE2ePct", Py.toDouble(row.get("cts_passeds")) / denom);
      suite.put("status", st);
      out.add(suite);
    }
    return out;
  }

  public static Map<String, Object> getHome() {
    return getHome(Formulas.DEFAULT_PLAN_KEY);
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> getHome(String planKey) {
    Map<String, String> bag = loadMeta(homeMetaKeys(planKey));
    Map<String, Object> periodo = periodoFrom(bag);
    PlanPeriod.assertStoredPlanningPeriod((String) periodo.get("inicio"), (String) periodo.get("fim"));
    List<Map<String, Object>> execRows = stores().azureSnapshot.listExecucoes(planKey);
    List<Map<String, Object>> falhas = stores().azureSnapshot.listFalhas(planKey);
    List<Map<String, Object>> dimensoes = catalog(planKey, execRows, bag);
    List<Map<String, Object>> linhas = buildPlanejamento(planKey, execRows, dimensoes, bag);
    Map<String, Object> totais = sumTotals(linhas);
    Map<String, Object> kpi = kpiFrom(planKey, bag);
    if (kpi == null) kpi = Formulas.classificarImpactosKpi(execRows, falhas, planKey);
    List<Map<String, Object>> suites = buildReportSuites(linhas);
    List<String> statuses = new ArrayList<>();
    double gapTotal = 0;
    for (Map<String, Object> s : suites) {
      statuses.add((String) s.get("status"));
      gapTotal += Py.toDouble(s.get("gap"));
    }
    String statusGeral = StatusFrente.statusGeralDe(statuses);
    double ttlCts = (double) totais.get("ctsPlan");
    double executados = (double) totais.get("passeds") + (double) totais.get("falhados") + (double) totais.get("bloqueados");
    Function<Double, Object> sobreTtl = x -> ttlCts > 0 ? (Object) (x / ttlCts) : (Object) 0L;
    Function<Double, Object> sobreExec = x -> executados > 0 ? (Object) (x / executados) : (Object) 0L;
    Function<String, Double> falhasPor = resp -> {
      long n = 0;
      for (Map<String, Object> f : falhas) if (Py.orText(f.get("responsavel"), "").strip().equals(resp)) n++;
      return (double) n;
    };
    double replanejamento = 0;
    for (Map<String, Object> r : linhas) replanejamento += Py.toDouble(r.get("replanejamento"));
    Map<String, Object> out = new LinkedHashMap<>(cabecalhoFrom(bag));
    out.put("planKey", planKey);
    out.put("periodo", periodo);
    out.put("atualizadoEm", PyTime.nowIso());
    out.put("ultimaImportacao", Py.truthy(bag.get("ultima_sincronizacao_azure")) ? bag.get("ultima_sincronizacao_azure") : bag.get("imported_at"));
    out.put("replanejamentoTotal", replanejamento);
    out.put("ttlCts", ttlCts);
    out.put("gap", gapTotal);
    out.put("statusTotais", statusGeral);
    out.put("percentBugsDev", sobreExec.apply(falhasPor.apply("Desenvolvimento Foursys")));
    out.put("percentBugsCliente", sobreExec.apply(falhasPor.apply("Cliente CVP")));
    out.put("percentTotalImpactados", sobreExec.apply((double) falhas.size()));
    out.put("statusGeral", statusGeral);
    out.put("totais", totais);
    out.put("percentuais", Py.obj("plan", sobreTtl.apply((double) totais.get("ctsPlanAteHoje")), "real", sobreTtl.apply((double) totais.get("totalRealizado"))));
    out.put(
        "impactos",
        Py.obj(
            "totalTestPointFailedBlocked", (long) Formulas.impactoTotalTestPoint(execRows, planKey),
            "foursys", kpi.get("foursys"),
            "cliente", kpi.get("cliente"),
            "reteste", kpi.get("reteste")));
    out.put("suites", suites);
    out.put("dimensoes", dimensoes);
    out.put("bugs", bugsPainel(planKey, falhas));
    out.put(
        "graficos",
        Py.obj(
            "planejadoVsRealizado", Graficos.planejadoVsRealizado(linhas, execRows, planKey, periodo, null),
            "statusExecucoes", Graficos.statusExecucoes(totais)));
    out.put("gestaoImpactos", gestaoImpactos(planKey, falhas));
    return out;
  }

  static long count(List<Map<String, Object>> falhas, Object... filter) {
    return Formulas.countFalhas(falhas, Py.obj(filter));
  }

  static Map<String, Object> bugsPainel(String planKey, List<Map<String, Object>> falhas) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("total", count(falhas, "planKey", planKey, "idNotEmpty", true));
    out.put("fechados", count(falhas, "planKey", planKey, "fechamentoNotEmpty", true));
    out.put("abertosDev", count(falhas, "planKey", planKey, "fechamentoEmpty", true, "statusNot", "Resolved", "responsavel", "Desenvolvimento Foursys", "idNotEmpty", true));
    out.put("fechadosDev", count(falhas, "planKey", planKey, "fechamentoEmpty", true, "status", "Resolved", "responsavel", "Desenvolvimento Foursys", "idNotEmpty", true));
    out.put("abertosCliente", count(falhas, "planKey", planKey, "fechamentoEmpty", true, "statusNot", "Resolved", "responsavel", "Cliente CVP", "idNotEmpty", true));
    out.put("fechadosCliente", count(falhas, "planKey", planKey, "status", "Closed", "responsavel", "Cliente CVP"));
    out.put("retesteResolved", count(falhas, "planKey", planKey, "status", "Resolved"));
    out.put("outros", count(falhas, "planKey", planKey, "fechamentoEmpty", true, "statusNot", "Resolved", "responsavel", "Outros", "idNotEmpty", true));
    return out;
  }

  static boolean vazio(Object v) {
    return Py.orText(v, "").strip().isEmpty();
  }

  static String statusOf(Map<String, Object> f) {
    return Py.orText(f.get("status"), "").strip();
  }

  static Map<String, Object> gestaoImpactos(String planKey, List<Map<String, Object>> falhas) {
    List<Map<String, Object>> bugs = new ArrayList<>();
    for (Map<String, Object> f : falhas)
      if (Py.orText(f.get("plan_key"), "").strip().equals(planKey) && f.get("bug_id") != null) bugs.add(f);
    List<Map<String, Object>> abertos = new ArrayList<>();
    for (Map<String, Object> f : bugs) if (vazio(f.get("fechamento"))) abertos.add(f);
    Function<String, Long> abertosPor = resp -> {
      long n = 0;
      for (Map<String, Object> f : abertos)
        if (!statusOf(f).equals("Resolved") && Py.orText(f.get("responsavel"), "").strip().equals(resp)) n++;
      return n;
    };
    long fechados = 0;
    for (Map<String, Object> f : bugs) if (!vazio(f.get("fechamento"))) fechados++;
    long emRetestes = 0;
    for (Map<String, Object> f : abertos) if (statusOf(f).equals("Resolved")) emRetestes++;
    Map<String, Object> cards = new LinkedHashMap<>();
    cards.put("total", (long) bugs.size());
    cards.put("fechados", fechados);
    cards.put("pendentes", bugs.size() - fechados);
    cards.put("emRetestes", emRetestes);
    cards.put("abertosDev", abertosPor.apply("Desenvolvimento Foursys"));
    cards.put("abertosCliente", abertosPor.apply("Cliente CVP"));
    cards.put("abertosOutros", abertosPor.apply("Outros"));
    List<String> frentes = new ArrayList<>();
    List<String> status = new ArrayList<>();
    List<String> categoria = new ArrayList<>();
    for (Map<String, Object> f : abertos) {
      for (String parte : Py.orText(f.get("frente"), "").split("\\|", -1)) if (!parte.strip().isEmpty()) frentes.add(parte.strip());
      status.add(statusOf(f).isEmpty() ? "(vazio)" : statusOf(f));
      String cat = Py.orText(f.get("categoria"), "").strip();
      categoria.add(cat.isEmpty() ? "(vazio)" : cat);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("cards", cards);
    out.put("frentes", contarPor(frentes));
    out.put("status", contarPor(status));
    out.put("categoria", contarPor(categoria));
    return out;
  }

  public static Map<String, Object> getStatusPorFrente(String planKey) {
    List<String> keys = new ArrayList<>(PERIOD_KEYS);
    keys.add("planejamento_legado_plan_key");
    keys.add("dimensoes_catalog:" + planKey);
    Map<String, String> bag = loadMeta(keys);
    Map<String, Object> periodo = periodoFrom(bag);
    PlanPeriod.assertStoredPlanningPeriod((String) periodo.get("inicio"), (String) periodo.get("fim"));
    List<Map<String, Object>> execRows = stores().azureSnapshot.listExecucoes(planKey);
    List<Map<String, Object>> dimensoes = catalog(planKey, execRows, bag);
    List<Map<String, Object>> linhas = buildPlanejamento(planKey, execRows, dimensoes, bag);
    Map<String, Object> frenteDim = null;
    for (Map<String, Object> d : dimensoes) {
      if ("front".equals(d.get("role")) && Py.toDouble(d.get("confidence")) >= 0.8) {
        frenteDim = d;
        break;
      }
    }
    List<String> frentes = new ArrayList<>();
    if (frenteDim != null && frenteDim.get("values") instanceof List<?> values) for (Object v : values) frentes.add(Py.str(v));
    List<Map<String, Object>> falhas = stores().azureSnapshot.listFalhas(planKey);
    List<Map<String, Object>> falhasUat = planKey.toLowerCase().equals("uat") ? falhas : stores().azureSnapshot.listFalhas("UAT");
    List<Map<String, Object>> blocos = new ArrayList<>();
    for (String frente : frentes) {
      Object ttl = Formulas.sumifFrente(linhas, frente, "qtd_cts_plan");
      Map<String, Object> cenarios = new LinkedHashMap<>();
      cenarios.put("ttl", ttl);
      cenarios.put("plan", ttl);
      cenarios.put("planAteHoje", Formulas.sumifFrente(linhas, frente, "cts_plan_dia"));
      cenarios.put("na", Formulas.sumifFrente(linhas, frente, "cts_na"));
      cenarios.put("passeds", Formulas.sumifFrente(linhas, frente, "cts_passeds"));
      cenarios.put(
          "finalizado",
          Py.intIfWhole(Formulas.finalizadosComCancelados(
              Py.obj("cts_passeds", Formulas.sumifFrente(linhas, frente, "cts_passeds"), "cts_na", Formulas.sumifFrente(linhas, frente, "cts_na")),
              Py.toDouble(Formulas.sumifFrente(linhas, frente, "cts_cancelados")))));
      cenarios.put("falha", Formulas.sumifFrente(linhas, frente, "cts_falhados"));
      cenarios.put("bloqueado", Formulas.sumifFrente(linhas, frente, "cts_bloqueados"));
      cenarios.put("liberado", Formulas.sumifFrente(linhas, frente, "cts_liberados"));
      cenarios.put("design", Formulas.sumifFrente(linhas, frente, "cts_design"));
      cenarios.put("naoLib", Formulas.sumifFrente(linhas, frente, "cts_nao_liberados"));
      Map<String, Object> bugs = bugsPorFrente(planKey, frente, falhas, falhasUat);
      Map<String, Object> bloco = new LinkedHashMap<>();
      bloco.put("frente", frente);
      bloco.put("cenarios", cenarios);
      bloco.put("bugs", bugs);
      bloco.put("indicadores", indicadoresDto(cenarios, bugs));
      blocos.add(bloco);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("planKey", planKey);
    out.put("blocos", blocos);
    out.put("total", somarBlocos(blocos));
    out.put("sobreposicao", StatusFrente.haSobreposicaoFrentes(frentes));
    return out;
  }

  static Map<String, Object> bugsPorFrente(String planKey, String frente, List<Map<String, Object>> falhas, List<Map<String, Object>> falhasUat) {
    Object[] base = {"planKey", planKey, "frenteContains", frente, "idNotEmpty", true};
    Function<Object[], Long> c = extra -> {
      Object[] all = new Object[base.length + extra.length];
      System.arraycopy(base, 0, all, 0, base.length);
      System.arraycopy(extra, 0, all, base.length, extra.length);
      return count(falhas, all);
    };
    String dev = "Desenvolvimento Foursys";
    String cli = "Cliente CVP";
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("total", c.apply(new Object[] {}));
    out.put("fechados", c.apply(new Object[] {"status", "Closed"}));
    out.put("abertosDev", c.apply(new Object[] {"responsavel", dev, "status", "New"}) + c.apply(new Object[] {"responsavel", dev, "status", "Active"}));
    out.put("fechadosDev", c.apply(new Object[] {"responsavel", dev, "status", "Closed"}));
    out.put("abertosCliente", c.apply(new Object[] {"responsavel", cli, "status", "New"}) + c.apply(new Object[] {"responsavel", cli, "status", "Active"}));
    out.put("fechadosCliente", c.apply(new Object[] {"responsavel", cli, "status", "Closed"}));
    out.put("reteste", c.apply(new Object[] {"status", "Resolved"}));
    out.put("outrosUat", count(falhasUat, "planKey", "UAT", "frenteContains", frente, "responsavel", "Outros", "fechamentoNotEmpty", true, "idNotEmpty", true));
    out.put("impactosDev", c.apply(new Object[] {"responsavel", dev}));
    out.put("impactosCliente", c.apply(new Object[] {"responsavel", cli}));
    return out;
  }

  static Map<String, Object> indicadoresDto(Map<String, Object> cenarios, Map<String, Object> bugs) {
    Map<String, Object> input = new LinkedHashMap<>();
    input.put("ttl", Py.toDouble(cenarios.getOrDefault("ttl", 0L)));
    input.put("plan_ate_hoje", Py.toDouble(cenarios.getOrDefault("planAteHoje", 0L)));
    input.put("finalizado", Py.toDouble(cenarios.getOrDefault("finalizado", 0L)));
    input.put("na", Py.toDouble(cenarios.getOrDefault("na", 0L)));
    input.put("passeds", Py.toDouble(cenarios.getOrDefault("passeds", 0L)));
    input.put("falha", Py.toDouble(cenarios.getOrDefault("falha", 0L)));
    input.put("bloqueado", Py.toDouble(cenarios.getOrDefault("bloqueado", 0L)));
    input.put("impactos_dev", Py.toDouble(bugs.getOrDefault("impactosDev", 0L)));
    input.put("impactos_cliente", Py.toDouble(bugs.getOrDefault("impactosCliente", 0L)));
    input.put("bugs_total", Py.toDouble(bugs.getOrDefault("total", 0L)));
    input.put("bugs_fechados", Py.toDouble(bugs.getOrDefault("fechados", 0L)));
    Map<String, Object> ind = StatusFrente.indicadoresFrente(input);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("planAteHoje", ind.get("plan_ate_hoje"));
    out.put("na", ind.get("na"));
    out.put("passeds", ind.get("passeds"));
    out.put("gap", ind.get("gap"));
    out.put("pctPlan", ind.get("pct_plan"));
    out.put("pctReal", ind.get("pct_real"));
    out.put("pctBugsDev", ind.get("pct_bugs_dev"));
    out.put("pctBugsCliente", ind.get("pct_bugs_cliente"));
    out.put("bugsAbertos", ind.get("bugs_abertos"));
    out.put("status", ind.get("status"));
    return out;
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> somarBlocos(List<Map<String, Object>> blocos) {
    List<String> cenariosKeys = blocos.isEmpty() ? List.of() : new ArrayList<>(((Map<String, Object>) blocos.get(0).get("cenarios")).keySet());
    List<String> bugsKeys = blocos.isEmpty() ? List.of() : new ArrayList<>(((Map<String, Object>) blocos.get(0).get("bugs")).keySet());
    Map<String, Object> cenarios = new LinkedHashMap<>();
    Map<String, Object> bugs = new LinkedHashMap<>();
    for (String k : cenariosKeys) cenarios.put(k, 0L);
    for (String k : bugsKeys) bugs.put(k, 0L);
    for (Map<String, Object> bloco : blocos) {
      Map<String, Object> bc = (Map<String, Object>) bloco.get("cenarios");
      Map<String, Object> bb = (Map<String, Object>) bloco.get("bugs");
      for (String k : cenariosKeys) cenarios.put(k, add(cenarios.get(k), bc.get(k)));
      for (String k : bugsKeys) bugs.put(k, add(bugs.get(k), bb.get(k)));
    }
    Map<String, Object> indicadores = indicadoresDto(cenarios, bugs);
    if (!blocos.isEmpty()) {
      List<String> statuses = new ArrayList<>();
      for (Map<String, Object> b : blocos) statuses.add((String) ((Map<String, Object>) b.get("indicadores")).get("status"));
      indicadores.put("status", StatusFrente.statusGeralDe(statuses));
    }
    return Py.obj("cenarios", cenarios, "bugs", bugs, "indicadores", indicadores);
  }

  static Object add(Object a, Object b) {
    if (Py.isInt(a) && Py.isInt(b)) return ((Number) a).longValue() + ((Number) b).longValue();
    return Py.toDouble(a) + Py.toDouble(b);
  }
}
