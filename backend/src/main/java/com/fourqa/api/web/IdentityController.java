package com.fourqa.api.web;

import static com.fourqa.api.auth.Roles.ROLES;
import static com.fourqa.api.auth.Roles.ROLE_LABEL;
import static com.fourqa.api.auth.Roles.atLeast;
import static com.fourqa.api.auth.Roles.effectiveRole;
import static com.fourqa.api.auth.Roles.normalizeRole;

import com.fourqa.api.auth.Access;
import com.fourqa.api.auth.AdoIdentity;
import com.fourqa.api.auth.Credentials;
import com.fourqa.api.auth.Crypto;
import com.fourqa.api.auth.Entra;
import com.fourqa.api.auth.RequestIdentity;
import com.fourqa.api.auth.Session;
import com.fourqa.api.azure.AzureHttpError;
import com.fourqa.api.azure.Http;
import com.fourqa.api.azure.SyncConfig;
import com.fourqa.api.config.Env;
import com.fourqa.api.persistence.IdentityStore;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Login (Entra ID or dev PAT), Azure DevOps discovery, connections, members and roles (port of {@code identity_routes}). */
@RestController
@RequestMapping("/api")
public class IdentityController {

  private static IdentityStore store() {
    return Stores.get().identity;
  }

  static Set<String> bootstrapHeads() {
    Set<String> out = new HashSet<>();
    for (String e : Env.value("FOURQA_BOOTSTRAP_HEADS").split(",")) if (!e.strip().isEmpty()) out.add(e.strip().toLowerCase());
    return out;
  }

  public static Map<String, Object> presentUser(Map<String, Object> user) {
    String role = normalizeRole(user.get("global_role"));
    if (role == null) role = "qa";
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", user.get("id"));
    out.put("name", Py.truthy(user.get("display_name")) ? user.get("display_name")
        : Py.truthy(user.get("email")) ? user.get("email") : "Usuário");
    out.put("email", user.get("email"));
    out.put("globalRole", role);
    out.put("globalRoleLabel", ROLE_LABEL.get(role));
    return out;
  }

  public static Map<String, Object> presentConnection(Map<String, Object> conn, String role) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", conn.get("id"));
    out.put("organization", conn.get("org"));
    out.put("project", conn.get("project"));
    out.put("testPlanId", conn.get("test_plan_id"));
    out.put("testPlanName", conn.get("test_plan_name"));
    out.put("planKey", conn.get("plan_key"));
    out.put("title", Py.truthy(conn.get("title")) ? conn.get("title")
        : Py.truthy(conn.get("test_plan_name")) ? conn.get("test_plan_name") : conn.get("plan_key"));
    out.put("legacy", Py.truthy(conn.get("legacy")));
    out.put("role", role);
    out.put("roleLabel", role == null ? null : ROLE_LABEL.get(role));
    return out;
  }

  static HttpError azureError(AzureHttpError err) {
    if (err.status == 404) return HttpError.detail(404, err.getMessage());
    if (err.status == 401 || err.status == 403) return HttpError.detail(401, err.getMessage() + " Entre novamente.");
    return HttpError.detail(502, err.getMessage());
  }

  record UserPat(String authorization, Map<String, Object> credential) {}

  static UserPat userPat(Map<String, Object> user) {
    long userId = Py.toLong(user.get("id"));
    Map<String, Object> credential = store().getCredential(userId);
    if (credential == null) throw HttpError.detail(401, "Entre novamente.");
    String authorization;
    try {
      authorization = Credentials.authorizationFor(userId);
    } catch (Crypto.CredentialKeyError | Entra.EntraError err) {
      throw HttpError.detail(401, err.getMessage());
    }
    if (!Py.truthy(authorization)) throw HttpError.detail(401, "Entre novamente.");
    return new UserPat(authorization, credential);
  }

  static boolean loginReady() {
    return Session.sessionConfigured() && Crypto.encryptionConfigured();
  }

  /** PAT is the dev alternative: allowed without Entra configured or with FOURQA_PAT_LOGIN=1. */
  public static boolean patLoginEnabled() {
    return loginReady() && (!Entra.entraConfigured() || "1".equals(Env.value("FOURQA_PAT_LOGIN")));
  }

  public static boolean entraLoginEnabled() {
    return loginReady() && Entra.entraConfigured();
  }

  static void sessionCookie(HttpHeaders headers, Map<String, Object> user, HttpServletRequest request) {
    Requests.setCookie(headers, Session.USER_COOKIE, Session.issueSession(Py.toLong(user.get("id"))),
        Requests.secure(request), "/", Session.SESSION_TTL_SECONDS);
  }

  static Map<String, Object> upsertIdentity(Map<String, Object> profile) {
    String email = profile.get("email") == null ? "" : Py.str(profile.get("email")).strip();
    if (email.isEmpty()) email = null;
    IdentityStore store = store();
    String profileId = Py.str(profile.get("id"));
    if (email != null) {
      Map<String, Object> sameEmail = store.findUserByEmail(email);
      if (sameEmail != null) profileId = Py.str(sameEmail.get("ado_profile_id"));
    }
    Object displayName = profile.get("displayName");
    Map<String, Object> user = store.upsertUser(profileId, email, displayName == null ? null : Py.str(displayName),
        email != null && bootstrapHeads().contains(email.toLowerCase()));
    store.claimInvitesForUser(email, Py.toLong(user.get("id")));
    return user;
  }

  static String normalizeInviteEmail(Object raw) {
    if (!(raw instanceof String s)) return null;
    String email = s.strip().toLowerCase();
    if (!email.contains("@") || email.startsWith("@") || email.endsWith("@") || email.contains(" ")) return null;
    int at = email.indexOf('@');
    String local = email.substring(0, at);
    String domain = email.substring(at + 1);
    if (local.isEmpty() || !domain.contains(".")) return null;
    return email;
  }

  private static ResponseEntity<byte[]> redirect(String location, HttpHeaders headers) {
    headers.set(HttpHeaders.LOCATION, location);
    return ResponseEntity.status(302).headers(headers).build();
  }

  // --- Sessão ---------------------------------------------------------------

  @GetMapping("/auth/entra/start")
  public ResponseEntity<byte[]> entraStart(HttpServletRequest request) {
    HttpHeaders headers = new HttpHeaders();
    if (!entraLoginEnabled())
      return redirect("/login?erro=" + Http.quote("Login institucional não configurado neste ambiente."), headers);
    String[] flow = Entra.startFlow(Entra.redirectUri(Requests.scheme(request), Requests.host(request)));
    Requests.setCookie(headers, Entra.OAUTH_COOKIE, flow[1], Requests.secure(request), "/api/auth/entra", Entra.OAUTH_TTL_SECONDS);
    return redirect(flow[0], headers);
  }

  private static ResponseEntity<byte[]> entraFail(String message) {
    HttpHeaders headers = new HttpHeaders();
    Requests.deleteCookie(headers, Entra.OAUTH_COOKIE, "/api/auth/entra", false, false);
    return redirect("/login?erro=" + Http.quote(message), headers);
  }

  @GetMapping("/auth/entra/callback")
  public ResponseEntity<byte[]> entraCallback(HttpServletRequest request) {
    String code = Requests.query(request, "code");
    String state = Requests.query(request, "state");
    String error = Requests.query(request, "error");
    if (!entraLoginEnabled()) return entraFail("Login institucional não configurado neste ambiente.");
    if (Py.truthy(error))
      return entraFail("access_denied".equals(error) ? "Login cancelado ou recusado pela Microsoft." : "Microsoft: " + error + ".");
    Map<String, Object> tokens;
    Map<String, Object> profile;
    try {
      Map<String, String> flow = Entra.readFlow(Requests.cookie(request, Entra.OAUTH_COOKIE), state);
      if (!Py.truthy(code)) throw new Entra.EntraError("A Microsoft não devolveu o código de login.");
      tokens = Entra.exchangeCode(code, flow.get("verifier"), flow.get("redirect"));
      profile = AdoIdentity.fetchGlobalProfile("Bearer " + Py.str(tokens.get("access_token")));
    } catch (Entra.EntraError err) {
      return entraFail(err.getMessage());
    } catch (AzureHttpError err) {
      return entraFail("Sua conta entrou, mas o Azure DevOps recusou o acesso. Confirme que você tem acesso a uma organização.");
    }
    Map<String, Object> user = upsertIdentity(profile);
    store().saveCredential(Py.toLong(user.get("id")), Credentials.sealEntra(tokens), null);
    HttpHeaders headers = new HttpHeaders();
    sessionCookie(headers, user, request);
    Requests.deleteCookie(headers, Entra.OAUTH_COOKIE, "/api/auth/entra", false, false);
    return redirect("/", headers);
  }

  @PostMapping("/auth/login")
  public ResponseEntity<byte[]> login(@RequestBody(required = false) String raw, HttpServletRequest request) {
    Map<String, Object> body = Json.body(raw);
    if (!loginReady())
      throw HttpError.detail(503, "Login desabilitado. Configure FOURQA_SESSION_SECRET e FOURQA_PAT_ENCRYPTION_KEY neste ambiente.");
    if (!patLoginEnabled()) throw HttpError.detail(403, "Entre com sua conta institucional (Microsoft).");
    Object rawPat = body.get("pat");
    if (!(rawPat instanceof String p)) throw HttpError.detail(400, "Informe um PAT válido.");
    String pat = p.strip();
    int len = pat.codePointCount(0, pat.length());
    if (len < 20 || len > 200) throw HttpError.detail(400, "Informe um PAT válido.");
    String org = AdoIdentity.normalizeOrganization(body.get("organization"));
    if (org == null) throw HttpError.detail(400, "Informe a organização do Azure DevOps (dev.azure.com/<organização>).");
    Map<String, Object> profile;
    try {
      profile = AdoIdentity.fetchProfile(pat, org);
    } catch (AzureHttpError err) {
      throw HttpError.detail(401, err.getMessage());
    }
    Map<String, Object> user = upsertIdentity(profile);
    store().saveCredential(Py.toLong(user.get("id")), Credentials.sealPat(pat), org);
    HttpHeaders headers = new HttpHeaders();
    sessionCookie(headers, user, request);
    return Json.status(200, Py.obj("user", presentUser(user)), headers);
  }

  @GetMapping("/auth/me")
  public ResponseEntity<byte[]> me() {
    Map<String, Object> user = RequestIdentity.currentUser();
    return Json.ok(Py.obj(
        "authenticated", user != null,
        "user", user == null ? null : presentUser(user),
        "loginEnabled", loginReady(),
        "entraEnabled", entraLoginEnabled(),
        "patEnabled", patLoginEnabled()));
  }

  @PostMapping("/auth/logout")
  public ResponseEntity<byte[]> logout(HttpServletRequest request) {
    Map<String, Object> user = RequestIdentity.currentUser();
    if (user != null) store().deleteCredential(Py.toLong(user.get("id")));
    HttpHeaders headers = new HttpHeaders();
    Requests.deleteCookie(headers, Session.USER_COOKIE, "/", true, Requests.secure(request));
    return Json.status(200, Py.obj("ok", true), headers);
  }

  // --- Descoberta no Azure DevOps --------------------------------------------

  @GetMapping("/azure/orgs")
  public ResponseEntity<byte[]> azureOrgs() {
    Map<String, Object> user = Access.requireUser();
    UserPat pat = userPat(user);
    try {
      String memberId = Py.str(user.get("ado_profile_id"));
      if (pat.authorization().startsWith("Bearer "))
        memberId = Py.str(AdoIdentity.fetchGlobalProfile(pat.authorization()).get("id"));
      Object hint = pat.credential().get("org_hint");
      List<String> orgs = AdoIdentity.listOrganizations(pat.authorization(), memberId, hint == null ? null : Py.str(hint));
      return Json.ok(Py.obj("organizations", orgs));
    } catch (AzureHttpError err) {
      throw azureError(err);
    }
  }

  @GetMapping("/azure/orgs/{org}/projects")
  public ResponseEntity<byte[]> azureProjects(@PathVariable("org") String org) {
    UserPat pat = userPat(Access.requireUser());
    try {
      return Json.ok(Py.obj("projects", AdoIdentity.listProjects(pat.authorization(), org)));
    } catch (AzureHttpError err) {
      throw azureError(err);
    }
  }

  @GetMapping("/azure/orgs/{org}/projects/{project}/test-plans")
  public ResponseEntity<byte[]> azureTestPlans(@PathVariable("org") String org, @PathVariable("project") String project) {
    UserPat pat = userPat(Access.requireUser());
    try {
      return Json.ok(Py.obj("testPlans", AdoIdentity.listTestPlans(pat.authorization(), org, project)));
    } catch (AzureHttpError err) {
      throw azureError(err);
    }
  }

  // --- Conexões ---------------------------------------------------------------

  record LegacyPlan(String planKey, boolean scope) {}

  /** (env PlanKey, uses the global scope). Only the KPI plan inherits the global period and header. */
  static LegacyPlan legacyPlan(String org, String project, long planId) {
    Map<String, Object> settings = SyncConfig.readSyncSettings();
    if (!Py.str(Py.or(settings.get("organization"), "")).strip().equalsIgnoreCase(org.strip())) return new LegacyPlan(null, false);
    if (!Py.str(Py.or(settings.get("project"), "")).strip().equalsIgnoreCase(project.strip())) return new LegacyPlan(null, false);
    Object plans = Py.or(settings.get("plans"), List.of());
    if (plans instanceof List<?> list) {
      for (Object item : list) {
        Map<String, Object> plan = Py.map(item);
        if (plan == null || !Py.truthy(plan.get("planKey"))) continue;
        if (!Py.eq(plan.get("planId"), planId)) continue;
        String key = Py.str(plan.get("planKey"));
        String kpi = Py.str(Py.or(settings.get("kpiPlanKey"), "")).strip().toLowerCase();
        return new LegacyPlan(key, key.strip().toLowerCase().equals(kpi));
      }
    }
    return new LegacyPlan(null, false);
  }

  record ConnAccess(Map<String, Object> conn, String role) {}

  static ConnAccess connectionAccess(long connectionId, Map<String, Object> user) {
    IdentityStore store = store();
    Map<String, Object> conn = store.getConnection(connectionId);
    if (conn == null) throw HttpError.detail(404, "Conexão não encontrada.");
    Map<String, Object> member = store.getMember(Py.toLong(conn.get("id")), Py.toLong(user.get("id")));
    String role = effectiveRole(user, conn, member);
    if (role == null) throw HttpError.detail(403, "Você não tem acesso a este projeto.");
    return new ConnAccess(conn, role);
  }

  private static long pathId(String value, String name) {
    return Json.intParam(value, "path", name);
  }

  @GetMapping("/connections")
  public ResponseEntity<byte[]> listConnections() {
    Map<String, Object> user = Access.requireUser();
    IdentityStore store = store();
    List<Map<String, Object>> out = new ArrayList<>();
    if ("head".equals(normalizeRole(user.get("global_role")))) {
      for (Map<String, Object> c : store.listConnections()) out.add(presentConnection(c, "head"));
      return Json.ok(Py.obj("connections", out));
    }
    for (Map<String, Object> conn : store.listConnectionsForUser(Py.toLong(user.get("id"))))
      out.add(presentConnection(conn, effectiveRole(user, conn, Py.obj("role", conn.get("member_role")))));
    return Json.ok(Py.obj("connections", out));
  }

  @DeleteMapping("/connections/{connectionId}")
  public ResponseEntity<byte[]> deleteConnection(@PathVariable("connectionId") String connectionId) {
    Map<String, Object> user = Access.requireUser();
    ConnAccess access = connectionAccess(pathId(connectionId, "connection_id"), user);
    if (!atLeast(access.role(), "lider")) throw HttpError.detail(403, "Só Líder ou Head desconecta o projeto.");
    store().deleteConnection(Py.toLong(access.conn().get("id")));
    return Json.ok(Py.obj("ok", true));
  }

  @GetMapping("/connections/{connectionId}")
  public ResponseEntity<byte[]> getConnection(@PathVariable("connectionId") String connectionId) {
    Map<String, Object> user = Access.requireUser();
    ConnAccess access = connectionAccess(pathId(connectionId, "connection_id"), user);
    return Json.ok(presentConnection(access.conn(), access.role()));
  }

  @PostMapping("/connections")
  public ResponseEntity<byte[]> createConnection(@RequestBody(required = false) String raw) {
    Object parsed = Json.parse(raw);
    Map<String, Object> user = Access.requireUser();
    Map<String, Object> body = Json.dict(parsed);
    Object rawOrg = body.get("organization");
    Object rawProject = body.get("project");
    Object title = body.get("title");
    if (!(rawOrg instanceof String o) || o.strip().isEmpty() || !(rawProject instanceof String p) || p.strip().isEmpty())
      throw HttpError.detail(400, "Informe organização e projeto.");
    Long planId = HttpInputs.pyInt(body.get("testPlanId"));
    if (planId == null || planId <= 0) throw HttpError.detail(400, "Informe o Test Plan.");
    if (title != null && (!(title instanceof String t) || t.codePointCount(0, t.length()) > 200))
      throw HttpError.detail(400, "Nome de exibição até 200 caracteres.");
    String org = o.strip();
    String project = p.strip();
    UserPat pat = userPat(user);
    Map<String, Object> plan;
    try {
      plan = AdoIdentity.getTestPlan(pat.authorization(), org, project, planId);
    } catch (AzureHttpError err) {
      throw azureError(err);
    }
    IdentityStore store = store();
    long userId = Py.toLong(user.get("id"));
    Map<String, Object> existing = store.findConnection(org, project, planId);
    if (existing != null) {
      long existingId = Py.toLong(existing.get("id"));
      store.addMember(existingId, userId, null);
      Map<String, Object> member = store.getMember(existingId, userId);
      return Json.status(200, Py.obj("created", false, "connection", presentConnection(existing, effectiveRole(user, existing, member))));
    }
    LegacyPlan legacy = legacyPlan(org, project, planId);
    String planKey = legacy.planKey() != null && !legacy.planKey().isEmpty() ? legacy.planKey() : org + "/" + project + "/" + planId;
    if (store.getConnectionByPlanKey(planKey) != null) throw HttpError.detail(409, "Já existe uma conexão com este PlanKey.");
    String planName = Py.str(plan.get("name"));
    String displayTitle = title == null ? "" : ((String) title).strip();
    Map<String, Object> conn = store.createConnection(
        org, project, planId, planName, planKey, displayTitle.isEmpty() ? planName : displayTitle, legacy.scope(), userId);
    long connId = Py.toLong(conn.get("id"));
    store.addMember(connId, userId, "lider");
    Map<String, Object> member = store.getMember(connId, userId);
    return Json.status(201, Py.obj("created", true, "connection", presentConnection(conn, effectiveRole(user, conn, member))));
  }

  // --- Membros do projeto (DEC-036) ------------------------------------------

  static Map<String, Object> membersView(long connectionId, Map<String, Object> user) {
    ConnAccess access = connectionAccess(connectionId, user);
    if (!atLeast(access.role(), "qa")) throw HttpError.detail(403, "Seu acesso permite apenas o Report.");
    Map<String, Object> conn = access.conn();
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> m : store().listMembers(Py.toLong(conn.get("id")))) {
      String eff = effectiveRole(m, conn, Py.obj("role", m.get("member_role")));
      Map<String, Object> row = presentUser(m);
      row.put("memberRole", normalizeRole(m.get("member_role")));
      row.put("effectiveRole", eff);
      row.put("effectiveRoleLabel", eff == null ? null : ROLE_LABEL.get(eff));
      out.add(row);
    }
    return Py.obj(
        "connection", presentConnection(conn, access.role()),
        "canManage", atLeast(access.role(), "lider"),
        "members", out,
        "roles", new ArrayList<>(ROLES));
  }

  @GetMapping("/connections/{connectionId}/members")
  public ResponseEntity<byte[]> listMembers(@PathVariable("connectionId") String connectionId) {
    Map<String, Object> user = Access.requireUser();
    return Json.ok(membersView(pathId(connectionId, "connection_id"), user));
  }

  static ConnAccess guardMemberChange(long connectionId, long targetId, Map<String, Object> actor) {
    ConnAccess access = connectionAccess(connectionId, actor);
    if (!atLeast(access.role(), "lider")) throw HttpError.detail(403, "Só Líder ou Head altera papéis neste projeto.");
    IdentityStore store = store();
    Map<String, Object> target = store.getUser(targetId);
    Map<String, Object> member = store.getMember(Py.toLong(access.conn().get("id")), targetId);
    if (target == null || member == null) throw HttpError.detail(404, "Membro não encontrado.");
    String targetRole = effectiveRole(target, access.conn(), member);
    if ("head".equals(targetRole) && !"head".equals(access.role()))
      throw HttpError.detail(403, "Só Head altera o papel de um Head.");
    return access;
  }

  @PutMapping("/connections/{connectionId}/members/{userId}")
  public ResponseEntity<byte[]> setMemberRole(
      @PathVariable("connectionId") String connectionId, @PathVariable("userId") String userId, @RequestBody(required = false) String raw) {
    Object parsed = Json.parse(raw);
    Map<String, Object> user = Access.requireUser();
    long connId = pathId(connectionId, "connection_id");
    long targetId = pathId(userId, "user_id");
    Map<String, Object> body = Json.dict(parsed);
    ConnAccess access = guardMemberChange(connId, targetId, user);
    Object rawRole = body.get("role");
    boolean empty = rawRole == null || "".equals(rawRole);
    String role = empty ? null : normalizeRole(rawRole);
    if (!empty && role == null) throw HttpError.detail(400, "Papel inválido.");
    if ("head".equals(role) && !"head".equals(access.role())) throw HttpError.detail(403, "Só Head concede o papel Head.");
    store().setMemberRole(Py.toLong(access.conn().get("id")), targetId, role);
    return Json.ok(membersView(connId, user));
  }

  @DeleteMapping("/connections/{connectionId}/members/{userId}")
  public ResponseEntity<byte[]> removeMember(@PathVariable("connectionId") String connectionId, @PathVariable("userId") String userId) {
    Map<String, Object> user = Access.requireUser();
    long connId = pathId(connectionId, "connection_id");
    long targetId = pathId(userId, "user_id");
    ConnAccess access = guardMemberChange(connId, targetId, user);
    store().removeMember(Py.toLong(access.conn().get("id")), targetId);
    return Json.ok(membersView(connId, user));
  }

  // --- Convites por e-mail (OPEN-013 parcial) ---------------------------------

  static ConnAccess guardInviteManage(long connectionId, Map<String, Object> actor) {
    ConnAccess access = connectionAccess(connectionId, actor);
    if (!atLeast(access.role(), "lider")) throw HttpError.detail(403, "Só Líder ou Head convida usuários neste projeto.");
    return access;
  }

  static Map<String, Object> presentInvite(Map<String, Object> invite) {
    String role = normalizeRole(invite.get("role"));
    if (role == null) role = "qa";
    return Py.obj(
        "id", invite.get("id"),
        "email", invite.get("email"),
        "role", role,
        "roleLabel", ROLE_LABEL.get(role),
        "invitedBy", invite.get("invited_by"),
        "createdAt", invite.get("created_at"));
  }

  static Map<String, Object> invitesView(long connectionId, Map<String, Object> user) {
    ConnAccess access = guardInviteManage(connectionId, user);
    List<Map<String, Object>> invites = new ArrayList<>();
    for (Map<String, Object> i : store().listInvites(Py.toLong(access.conn().get("id")))) invites.add(presentInvite(i));
    return Py.obj(
        "connection", presentConnection(access.conn(), access.role()),
        "canManage", true,
        "invites", invites,
        "roles", new ArrayList<>(ROLES));
  }

  @GetMapping("/connections/{connectionId}/invites")
  public ResponseEntity<byte[]> listInvites(@PathVariable("connectionId") String connectionId) {
    Map<String, Object> user = Access.requireUser();
    return Json.ok(invitesView(pathId(connectionId, "connection_id"), user));
  }

  @PostMapping("/connections/{connectionId}/invites")
  public ResponseEntity<byte[]> createInvite(@PathVariable("connectionId") String connectionId, @RequestBody(required = false) String raw) {
    Object parsed = Json.parse(raw);
    Map<String, Object> user = Access.requireUser();
    long connId = pathId(connectionId, "connection_id");
    Map<String, Object> body = Json.dict(parsed);
    ConnAccess access = guardInviteManage(connId, user);
    String email = normalizeInviteEmail(body.get("email"));
    if (email == null) throw HttpError.detail(400, "Informe um e-mail válido.");
    String role = normalizeRole(body.get("role"));
    if (role == null) throw HttpError.detail(400, "Papel inválido.");
    if ("head".equals(role) && !"head".equals(access.role())) throw HttpError.detail(403, "Só Head concede o papel Head.");
    IdentityStore store = store();
    long cid = Py.toLong(access.conn().get("id"));
    Map<String, Object> existing = store.findUserByEmail(email);
    if (existing != null) {
      long existingId = Py.toLong(existing.get("id"));
      if (store.getMember(cid, existingId) == null) store.addMember(cid, existingId, role);
      store.deleteInvite(cid, email);
      return Json.ok(Py.obj("addedMember", true, "invited", false, "user", presentUser(existing)));
    }
    Map<String, Object> invite = store.upsertInvite(cid, email, role, Py.toLong(user.get("id")));
    return Json.ok(Py.obj("invited", true, "addedMember", false, "invite", presentInvite(invite)));
  }

  @DeleteMapping("/connections/{connectionId}/invites/{email}")
  public ResponseEntity<byte[]> cancelInvite(@PathVariable("connectionId") String connectionId, @PathVariable("email") String email) {
    Map<String, Object> user = Access.requireUser();
    long connId = pathId(connectionId, "connection_id");
    ConnAccess access = guardInviteManage(connId, user);
    String normalized = normalizeInviteEmail(email);
    if (normalized == null) throw HttpError.detail(400, "Informe um e-mail válido.");
    if (!store().deleteInvite(Py.toLong(access.conn().get("id")), normalized)) throw HttpError.detail(404, "Convite não encontrado.");
    return Json.ok(invitesView(connId, user));
  }

  // --- Papéis globais (só Head) -----------------------------------------------

  static void requireHead(Map<String, Object> user) {
    if (!"head".equals(normalizeRole(user.get("global_role")))) throw HttpError.detail(403, "Só Head acessa os papéis globais.");
  }

  private static Map<String, Object> usersView() {
    List<Map<String, Object>> users = new ArrayList<>();
    for (Map<String, Object> u : store().listUsers()) users.add(presentUser(u));
    return Py.obj("users", users, "roles", new ArrayList<>(ROLES));
  }

  @GetMapping("/admin/users")
  public ResponseEntity<byte[]> adminUsers() {
    requireHead(Access.requireUser());
    return Json.ok(usersView());
  }

  @PutMapping("/admin/users/{userId}")
  public ResponseEntity<byte[]> adminSetRole(@PathVariable("userId") String userId, @RequestBody(required = false) String raw) {
    Object parsed = Json.parse(raw);
    Map<String, Object> user = Access.requireUser();
    long targetId = pathId(userId, "user_id");
    Map<String, Object> body = Json.dict(parsed);
    requireHead(user);
    String role = normalizeRole(body.get("globalRole"));
    if (role == null) throw HttpError.detail(400, "Papel inválido.");
    IdentityStore store = store();
    Map<String, Object> target = store.getUser(targetId);
    if (target == null) throw HttpError.detail(404, "Usuário não encontrado.");
    if ("head".equals(normalizeRole(target.get("global_role"))) && !"head".equals(role) && store.countHeads() <= 1)
      throw HttpError.detail(409, "Não é possível rebaixar o último Head.");
    store.setGlobalRole(targetId, role);
    return Json.ok(usersView());
  }
}
