package com.fourqa.api.web;

import com.fourqa.api.auth.Access;
import com.fourqa.api.auth.RequestIdentity;
import com.fourqa.api.auth.WriteAuth;
import com.fourqa.api.azure.AzureCacheRead.AzureCacheUnavailableError;
import com.fourqa.api.azure.SyncConfig;
import com.fourqa.api.azure.SyncParameters;
import com.fourqa.api.config.Env;
import com.fourqa.api.domain.Formulas;
import com.fourqa.api.domain.PlanPeriod.PlanningPeriodError;
import com.fourqa.api.persistence.PlanKeys;
import com.fourqa.api.persistence.PlanningConflictError;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.services.EvolucaoService;
import com.fourqa.api.services.PlanningService;
import com.fourqa.api.services.ReportService;
import com.fourqa.api.services.SyncService;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Report, planning and sync routes (port of {@code fourqa.api.routes}). */
@RestController
@RequestMapping("/api")
public class ApiController {
  private static final Logger LOG = LoggerFactory.getLogger(ApiController.class);
  private static final List<String> CELL_FIELDS = List.of("start", "end", "day", "responsavel", "prioridade");
  private static final List<String> BATCH_FIELDS = List.of("start", "end", "day");

  static void ready() {
    try {
      Stores.get();
    } catch (RuntimeException err) {
      throw HttpError.detail(503, "Banco indisponível.");
    }
  }

  static String planKeyFromQuery(String planKey) {
    Map<String, Object> connection = RequestIdentity.currentConnection();
    if (connection != null)
      return planKey != null && !planKey.strip().isEmpty() ? planKey.strip() : Py.str(connection.get("plan_key"));
    String fallback;
    try {
      String kpi = Stores.get().meta.get("kpi_plan_key");
      fallback = Py.truthy(kpi) ? kpi : Formulas.DEFAULT_PLAN_KEY;
    } catch (RuntimeException err) {
      fallback = Formulas.DEFAULT_PLAN_KEY;
    }
    String resolved = PlanKeys.planKeyFromRaw(planKey, fallback);
    Access.guardPlanKey(resolved);
    return resolved;
  }

  static List<String> planKeyValues(String planKey) {
    if (planKey == null) return null;
    List<String> out = new ArrayList<>();
    out.add(planKey);
    return out;
  }

  static String explicitPlanKey(String planKey) {
    String pk = PlanKeys.explicitPlanKeyFromQuery(planKeyValues(planKey));
    if (pk == null) throw HttpError.detail(400, PlanKeys.planKeyWriteError(planKeyValues(planKey)));
    return pk;
  }

  static RuntimeException clientOrHide(RuntimeException err, String fallback) {
    if (err instanceof HttpError || err instanceof PlanningPeriodError || err instanceof AzureCacheUnavailableError) return err;
    if (err instanceof PlanningConflictError) return HttpError.detail(409, err.getMessage());
    if (err instanceof IllegalArgumentException) return HttpError.detail(400, err.getMessage());
    LOG.error(fallback, err);
    return HttpError.detail(500, fallback);
  }

  static HttpError badRequest(PlanningPeriodError err) {
    return HttpError.detail(400, err.getMessage());
  }

  static void requireWriteAuth(HttpServletRequest request) {
    Access.requireWriteAccess(Requests.presented(request));
  }

  private static String writeDecision(String authorization) {
    return WriteAuth.decideWriteAuth(
        Env.value("FOURQA_API_TOKEN"),
        WriteAuth.openWritesAllowed(Env.hosted(), Env.value("FOURQA_ALLOW_OPEN_WRITES")),
        authorization);
  }

  @PostMapping("/session")
  public ResponseEntity<byte[]> openSession(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Map<String, Object> body = Json.body(raw);
    if (!(body.get("token") instanceof String presented)) throw HttpError.detail(400, "Informe o token.");
    String configured = Env.value("FOURQA_API_TOKEN").strip();
    if (configured.isEmpty())
      throw HttpError.detail(503, "Escrita desabilitada. Configure FOURQA_API_TOKEN neste ambiente.");
    if (!WriteAuth.tokenMatches(configured, presented.strip())) throw HttpError.detail(401, "Não autorizado.");
    HttpHeaders headers = new HttpHeaders();
    Requests.setCookie(headers, WriteAuth.SESSION_COOKIE, configured, Requests.secure(request), "/", 12 * 60 * 60);
    return Json.status(200, Py.obj("ok", true), headers);
  }

  @DeleteMapping("/session")
  public ResponseEntity<byte[]> closeSession(HttpServletRequest request) {
    HttpHeaders headers = new HttpHeaders();
    Requests.deleteCookie(headers, WriteAuth.SESSION_COOKIE, "/", true, Requests.secure(request));
    return Json.status(200, Py.obj("ok", true), headers);
  }

  @GetMapping("/session")
  public ResponseEntity<byte[]> sessionState(HttpServletRequest request) {
    String configured = Env.value("FOURQA_API_TOKEN").strip();
    Access.Presented p = Requests.presented(request);
    String decision = writeDecision(WriteAuth.presentedAuthorization(p.authorizationHeader(), p.sessionCookie()));
    return Json.ok(Py.obj("active", !configured.isEmpty() && "allow".equals(decision)));
  }

  @GetMapping("/health")
  public ResponseEntity<byte[]> health() {
    boolean ok = Stores.persistenceReady();
    return Json.ok(Py.obj("ok", ok, "database", ok ? "ready" : "unavailable"));
  }

  @GetMapping("/meta")
  public ResponseEntity<byte[]> meta() {
    ready();
    try {
      return Json.ok(ReportService.getHome().get("periodo"));
    } catch (PlanningPeriodError err) {
      throw badRequest(err);
    }
  }

  @GetMapping("/home")
  public ResponseEntity<byte[]> home(HttpServletRequest request) {
    ready();
    try {
      return Json.ok(ReportService.getHome(planKeyFromQuery(Requests.query(request, "planKey"))));
    } catch (PlanningPeriodError err) {
      throw badRequest(err);
    }
  }

  @PutMapping("/cabecalho")
  public ResponseEntity<byte[]> cabecalho(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Object parsed = Json.parse(raw);
    requireWriteAuth(request);
    Map<String, Object> body = Json.dict(parsed);
    ready();
    Object title = body.get("title");
    Object subtitle = body.get("subtitle");
    if (!(title instanceof String t) || t.strip().isEmpty() || !(subtitle instanceof String s))
      throw HttpError.detail(400, "Informe o título (obrigatório) e o subtítulo.");
    if (t.codePointCount(0, t.length()) > 200 || s.codePointCount(0, s.length()) > 300)
      throw HttpError.detail(400, "Título até 200 e subtítulo até 300 caracteres.");
    HttpInputs.PairBase base = HttpInputs.parseMetaPair(body, "baseTitle", "baseSubtitle");
    if (base.present() && !base.valid()) throw HttpError.detail(400, "Informe a base do cabeçalho.");
    try {
      return Json.ok(ReportService.setCabecalho(t, s, Py.obj("guard", base.present(), "baseTitle", base.a(), "baseSubtitle", base.b())));
    } catch (RuntimeException err) {
      throw clientOrHide(err, "Não foi possível gravar o cabeçalho.");
    }
  }

  @PutMapping("/periodo")
  public ResponseEntity<byte[]> periodo(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Object parsed = Json.parse(raw);
    requireWriteAuth(request);
    Map<String, Object> body = Json.dict(parsed);
    ready();
    if (!(body.get("inicio") instanceof String inicio) || !(body.get("fim") instanceof String fim))
      throw HttpError.detail(400, "Informe início e fim.");
    HttpInputs.PairBase base = HttpInputs.parseMetaPair(body, "baseInicio", "baseFim");
    if (base.present() && !base.valid()) throw HttpError.detail(400, "Informe a base do período.");
    try {
      return Json.ok(ReportService.setPeriodoPlano(inicio, fim, Py.obj("guard", base.present(), "baseInicio", base.a(), "baseFim", base.b())));
    } catch (RuntimeException err) {
      throw clientOrHide(err, "Não foi possível gravar o período.");
    }
  }

  @GetMapping("/planejamento")
  public ResponseEntity<byte[]> planejamento(HttpServletRequest request) {
    Long version = Json.optionalIntQuery(Requests.query(request, "version"), "version");
    ready();
    try {
      return Json.ok(PlanningService.getPlanningView(
          planKeyFromQuery(Requests.query(request, "planKey")), version != null && version > 0 ? version : null));
    } catch (PlanningPeriodError err) {
      throw badRequest(err);
    }
  }

  @GetMapping("/planejamento/alteracoes")
  public ResponseEntity<byte[]> planejamentoAlteracoes(HttpServletRequest request) {
    ready();
    try {
      return Json.ok(PlanningService.getPlanningHistory(planKeyFromQuery(Requests.query(request, "planKey"))));
    } catch (PlanningPeriodError err) {
      throw badRequest(err);
    }
  }

  @PostMapping("/planejamento/revisao")
  public ResponseEntity<byte[]> planejamentoRevisao(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Object parsed = Json.parse(raw);
    requireWriteAuth(request);
    Map<String, Object> body = Json.dict(parsed);
    ready();
    String pk = explicitPlanKey(Requests.query(request, "planKey"));
    try {
      Map<String, Object> input = new LinkedHashMap<>();
      input.put("reason", body.get("reason") instanceof String r ? r : "");
      input.put("adoptSource", !Boolean.FALSE.equals(body.get("adoptSource")));
      return Json.ok(PlanningService.confirmOrRevise(pk, input));
    } catch (RuntimeException err) {
      throw clientOrHide(err, "Não foi possível gravar a revisão.");
    }
  }

  private static Map<String, Object> cellChange(Map<String, Object> row, String field, Map<String, Object> base, boolean withValue) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("suiteId", HttpInputs.pyInt(row.get("suiteId")));
    out.put("testPointId", HttpInputs.pyInt(row.get("testPointId")));
    out.put("field", field);
    out.put("date", HttpInputs.pyStr(row.get("date")));
    out.put("quantity", HttpInputs.pyNumber(row.get("quantity")));
    if (withValue) out.put("value", HttpInputs.pyStr(row.get("value")));
    out.put("guard", base.get("guard"));
    out.put("expectedText", base.get("expected_text"));
    out.put("expectedQuantity", base.get("expected_quantity"));
    return out;
  }

  @PutMapping("/planejamento/celula")
  public ResponseEntity<byte[]> planejamentoCelula(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Object parsed = Json.parse(raw);
    requireWriteAuth(request);
    Map<String, Object> body = Json.dict(parsed);
    ready();
    Object field = body.get("field");
    if (!(field instanceof String f) || !CELL_FIELDS.contains(f)) throw HttpError.detail(400, "Campo inválido.");
    String pk = explicitPlanKey(Requests.query(request, "planKey"));
    Map<String, Object> base = HttpInputs.parsePlanningCellBase(body, f);
    if (base == null) throw HttpError.detail(400, "Base da célula inválida.");
    try {
      return Json.ok(PlanningService.savePlanningCell(pk, cellChange(body, f, base, true)));
    } catch (RuntimeException err) {
      throw clientOrHide(err, "Não foi possível gravar a célula.");
    }
  }

  @PutMapping("/planejamento/lote")
  public ResponseEntity<byte[]> planejamentoLote(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Object parsed = Json.parse(raw);
    requireWriteAuth(request);
    Map<String, Object> body = Json.dict(parsed);
    ready();
    String pk = explicitPlanKey(Requests.query(request, "planKey"));
    if (!(body.get("changes") instanceof List<?> rawChanges) || rawChanges.isEmpty())
      throw HttpError.detail(400, "Nenhuma alteração.");
    List<Map<String, Object>> changes = new ArrayList<>();
    for (Object item : rawChanges) {
      Map<String, Object> row = Py.map(item);
      if (row == null) throw HttpError.detail(400, "Alteração inválida.");
      if (!(row.get("field") instanceof String f) || !BATCH_FIELDS.contains(f)) throw HttpError.detail(400, "Campo inválido.");
      Map<String, Object> base = HttpInputs.parsePlanningCellBase(row, f);
      if (base == null) throw HttpError.detail(400, "Base da célula inválida.");
      changes.add(cellChange(row, f, base, false));
    }
    try {
      return Json.ok(PlanningService.savePlanningBatch(pk, changes));
    } catch (RuntimeException err) {
      throw clientOrHide(err, "Não foi possível gravar as alterações.");
    }
  }

  @PutMapping("/planejamento/distribuir")
  public ResponseEntity<byte[]> planejamentoDistribuir(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Object parsed = Json.parse(raw);
    requireWriteAuth(request);
    Map<String, Object> body = Json.dict(parsed);
    ready();
    String pk = explicitPlanKey(Requests.query(request, "planKey"));
    Object weekends = body.get("enabledWeekendDays");
    boolean weekendsOk = weekends instanceof List<?> list && list.stream().allMatch(d -> d instanceof String);
    if (!weekendsOk) throw HttpError.detail(400, "Dias de feriado/fim de semana inválidos.");
    Long resguardo = HttpInputs.pyInt(body.get("resguardo"));
    if (resguardo == null) throw HttpError.detail(400, "Resguardo inválido.");
    try {
      Map<String, Object> input = new LinkedHashMap<>();
      input.put("strategy", body.get("strategy") instanceof String s ? s : "");
      input.put("start", body.get("start") instanceof String s ? s : "");
      input.put("end", body.get("end") instanceof String s ? s : "");
      input.put("resguardo", resguardo);
      input.put("enabledWeekendDays", weekends);
      input.put("replace", Boolean.TRUE.equals(body.get("replace")));
      input.put("assignment", HttpInputs.pyStr(body.get("assignment")));
      input.put("mode", HttpInputs.pyStr(body.get("mode")));
      input.put("cut", HttpInputs.pyStr(body.get("cut")));
      input.put("preview", Boolean.TRUE.equals(body.get("preview")));
      return Json.ok(PlanningService.distributePlanning(pk, input));
    } catch (RuntimeException err) {
      throw clientOrHide(err, "Não foi possível distribuir.");
    }
  }

  @PutMapping("/planejamento/limpar")
  public ResponseEntity<byte[]> planejamentoLimpar(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Object parsed = Json.parse(raw);
    requireWriteAuth(request);
    Map<String, Object> body = Json.optionalDict(parsed);
    ready();
    String pk = explicitPlanKey(Requests.query(request, "planKey"));
    if (body == null) body = Map.of();
    try {
      return Json.ok(PlanningService.clearPlanningToFinalized(pk, Py.obj("preview", Boolean.TRUE.equals(body.get("preview")))));
    } catch (RuntimeException err) {
      throw clientOrHide(err, "Não foi possível limpar o planejamento.");
    }
  }

  @GetMapping("/status-frente")
  public ResponseEntity<byte[]> statusFrente(HttpServletRequest request) {
    ready();
    return Json.ok(ReportService.getStatusPorFrente(planKeyFromQuery(Requests.query(request, "planKey"))));
  }

  @GetMapping("/evolucao-qa")
  public ResponseEntity<byte[]> evolucaoQa(HttpServletRequest request) {
    ready();
    try {
      return Json.ok(EvolucaoService.getEvolucaoQa(
          planKeyFromQuery(Requests.query(request, "planKey")), Requests.query(request, "from"), Requests.query(request, "to")));
    } catch (IllegalArgumentException | PlanningPeriodError err) {
      throw HttpError.detail(400, err.getMessage());
    }
  }

  @PostMapping("/sync")
  public ResponseEntity<byte[]> syncStart(HttpServletRequest request) {
    requireWriteAuth(request);
    ready();
    try {
      Map<String, Object> result = SyncService.startSync();
      return Json.status(Py.truthy(result.get("started")) ? 202 : 200, result);
    } catch (SyncConfig.SyncConfigError err) {
      throw HttpError.detail(400, Py.obj("error", err.getMessage(), "missing", err.missing));
    } catch (HttpError err) {
      throw err;
    } catch (RuntimeException err) {
      LOG.error("Falha ao iniciar a sincronização.", err);
      throw HttpError.detail(500, Py.obj("error", "Falha ao iniciar a sincronização."));
    }
  }

  @GetMapping("/sync/status")
  public ResponseEntity<byte[]> syncStatus() {
    return Json.ok(SyncService.getSyncState());
  }

  private static Map<String, Object> syncSettingsView() {
    Map<String, Object> connection = RequestIdentity.currentConnection();
    return connection == null ? SyncConfig.readSyncSettings() : SyncService.connectionSyncSettings(connection);
  }

  private static ResponseEntity<byte[]> present(Map<String, Object> settings, Map<String, Object> decoded) {
    return Json.ok(SyncParameters.presentParameters(settings, Py.map(decoded.get("draft")), (String) decoded.get("warning")));
  }

  @GetMapping("/sync/config")
  public ResponseEntity<byte[]> syncConfig() {
    ready();
    String raw = Stores.get().meta.get(SyncParameters.SYNC_PARAMETERS_KEY);
    return present(syncSettingsView(), SyncParameters.decodeStoredParameters(raw));
  }

  @PutMapping("/sync/config")
  public ResponseEntity<byte[]> syncConfigPut(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Object parsed = Json.parse(raw);
    requireWriteAuth(request);
    Map<String, Object> body = Json.dict(parsed);
    ready();
    var meta = Stores.get().meta;
    Map<String, Object> connection = RequestIdentity.currentConnection();
    if (Boolean.TRUE.equals(body.get("reset"))) {
      meta.set(SyncParameters.SYNC_PARAMETERS_KEY, "");
      Map<String, Object> settings = syncSettingsView();
      if (Py.truthy(settings.get("kpiPlanKey"))) meta.set("kpi_plan_key", Py.str(settings.get("kpiPlanKey")));
      return present(settings, SyncParameters.decodeStoredParameters(""));
    }
    try {
      Map<String, Object> input = body;
      if (connection != null) {
        input = new LinkedHashMap<>(body);
        input.put("kpiPlanKey", connection.get("plan_key"));
      }
      Map<String, Object> draft = SyncParameters.parseSyncParameters(input);
      meta.set(SyncParameters.SYNC_PARAMETERS_KEY, PyJson.dumps(draft));
      meta.set("kpi_plan_key", Py.str(draft.get("kpiPlanKey")));
      return Json.ok(SyncParameters.presentParameters(syncSettingsView(), draft, null));
    } catch (RuntimeException err) {
      throw clientOrHide(err, "Não foi possível gravar os parâmetros.");
    }
  }

  private static Map<String, Object> page(HttpServletRequest request) {
    String planKey = planKeyFromQuery(Requests.query(request, "planKey"));
    return HttpInputs.parsePageQuery(
        Requests.query(request, "limit"), Requests.query(request, "offset"), Requests.query(request, "q"), planKey);
  }

  @GetMapping("/execucoes")
  public ResponseEntity<byte[]> execucoes(HttpServletRequest request) {
    ready();
    Stores stores = Stores.get();
    return Json.ok(stores.azureSnapshot.queryExecucoes(page(request)));
  }

  @GetMapping("/falhas")
  public ResponseEntity<byte[]> falhas(HttpServletRequest request) {
    ready();
    Stores stores = Stores.get();
    return Json.ok(stores.azureSnapshot.queryFalhas(page(request)));
  }
}
