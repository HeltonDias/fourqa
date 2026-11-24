package com.fourqa.api.auth;

import com.fourqa.api.config.Env;
import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import com.fourqa.api.web.HttpError;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Read and write access rules per request (port of {@code fourqa.auth.access}). */
public final class Access {
  public static final Set<String> PUBLIC_PATHS = Set.of(
      "/api/auth/login", "/api/auth/me", "/api/auth/logout", "/api/auth/entra/start", "/api/auth/entra/callback", "/api/session");
  public static final List<String> VISITOR_PREFIXES =
      List.of("/api/home", "/api/meta", "/api/sync/status", "/api/auth/", "/api/connections", "/api/session");
  public static final List<String> USER_SCOPE_PREFIXES =
      List.of("/api/auth/", "/api/connections", "/api/azure/", "/api/admin/", "/api/session", "/api/health");

  private Access() {}

  public record Presented(String authorizationHeader, String sessionCookie) {}

  public record AccessError(int status, String message) {}

  static String serviceToken() {
    return Env.value("FOURQA_API_TOKEN").strip();
  }

  public static boolean serviceTokenOk(Presented p) {
    String token = serviceToken();
    if (token.isEmpty()) return false;
    String presented = WriteAuth.presentedAuthorization(p.authorizationHeader(), p.sessionCookie());
    return "allow".equals(WriteAuth.decideWriteAuth(token, false, presented));
  }

  static boolean readsProtected() {
    return Env.hosted() && !"0".equals(Env.value("FOURQA_PROTECT_READS"));
  }

  private static boolean startsWithAny(String path, List<String> prefixes) {
    for (String p : prefixes) if (path.startsWith(p)) return true;
    return false;
  }

  public static AccessError readAccessError(String method, String path, Presented presented, RequestIdentity ident) {
    if (PUBLIC_PATHS.contains(path)) return null;
    boolean service = serviceTokenOk(presented);
    if (ident.connection != null && !service) {
      if (ident.user == null) return new AccessError(401, "Entre para acessar este projeto.");
      if (ident.role == null) return new AccessError(403, "Você não tem acesso a este projeto.");
    }
    if (ident.user != null && ident.connection == null && !service && !startsWithAny(path, USER_SCOPE_PREFIXES))
      return new AccessError(400, "Selecione um projeto conectado.");
    if (!method.equals("GET") && !method.equals("HEAD")) return null;
    if ("visitante".equals(ident.role) && !startsWithAny(path, VISITOR_PREFIXES))
      return new AccessError(403, "Seu acesso permite apenas o Report.");
    if (readsProtected() && !service && ident.user == null) {
      if (serviceToken().isEmpty() && !Session.sessionConfigured())
        return new AccessError(503, "Acesso desabilitado. Configure FOURQA_SESSION_SECRET neste ambiente.");
      return new AccessError(401, "Não autorizado.");
    }
    return null;
  }

  public static void requireWriteAccess(Presented presented) {
    if (serviceTokenOk(presented)) return;
    if (RequestIdentity.currentUser() != null) {
      if (Roles.canWrite(RequestIdentity.currentRole())) return;
      throw HttpError.detail(403, "Seu cargo neste projeto permite apenas consulta.");
    }
    String token = serviceToken();
    if (token.isEmpty() && WriteAuth.openWritesAllowed(Env.hosted(), Env.value("FOURQA_ALLOW_OPEN_WRITES"))) return;
    if (token.isEmpty() && !Session.sessionConfigured())
      throw HttpError.detail(503, "Escrita desabilitada. Configure FOURQA_API_TOKEN ou FOURQA_ALLOW_OPEN_WRITES=1 neste ambiente.");
    throw HttpError.detail(401, "Não autorizado.");
  }

  public static void guardPlanKey(String planKey) {
    if (RequestIdentity.serviceAccess()) return;
    var store = Stores.get().identity;
    Map<String, Object> connection = store.getConnectionByPlanKey(planKey);
    if (connection == null) return;
    Map<String, Object> user = RequestIdentity.currentUser();
    if (user == null) throw HttpError.detail(401, "Entre para acessar este projeto.");
    Map<String, Object> member = store.getMember(Py.toLong(connection.get("id")), Py.toLong(user.get("id")));
    if (Roles.effectiveRole(user, connection, member) == null) throw HttpError.detail(403, "Você não tem acesso a este projeto.");
  }

  public static Map<String, Object> requireUser() {
    Map<String, Object> user = RequestIdentity.currentUser();
    if (user == null) throw HttpError.detail(401, "Entre para continuar.");
    return user;
  }
}
