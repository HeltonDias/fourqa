package com.fourqa.api.auth;

import com.fourqa.api.persistence.Stores;
import com.fourqa.api.util.Py;
import java.util.Map;

/** User, connection, member and role resolved per request (Python contextvars in {@code fourqa.auth.context}). */
public final class RequestIdentity {
  public static final String CONNECTION_HEADER = "x-fourqa-connection";

  public Map<String, Object> user;
  public Map<String, Object> connection;
  public Map<String, Object> member;
  public String role;
  public boolean serviceAccess;

  private static final ThreadLocal<RequestIdentity> CURRENT = new ThreadLocal<>();

  public static class IdentityError extends RuntimeException {
    public final int status;

    public IdentityError(int status, String message) {
      super(message);
      this.status = status;
    }
  }

  public static RequestIdentity current() {
    RequestIdentity ident = CURRENT.get();
    return ident == null ? new RequestIdentity() : ident;
  }

  public static Map<String, Object> currentUser() {
    return current().user;
  }

  public static Map<String, Object> currentConnection() {
    return current().connection;
  }

  public static String currentRole() {
    return current().role;
  }

  public static boolean serviceAccess() {
    return current().serviceAccess;
  }

  public static void set(RequestIdentity ident) {
    if (ident == null) CURRENT.remove();
    else CURRENT.set(ident);
  }

  public static Object snapshot() {
    return CURRENT.get();
  }

  public static void restore(Object snapshot) {
    set(snapshot instanceof RequestIdentity r ? r : null);
  }

  public static boolean needsIdentity(String userCookie, String connectionHeader, String planKey) {
    return Py.truthy(userCookie) || Py.truthy(connectionHeader) || Py.truthy(planKey);
  }

  public static RequestIdentity resolve(String userCookie, String connectionHeader, String planKeyQuery) {
    RequestIdentity ident = new RequestIdentity();
    if (!needsIdentity(userCookie, connectionHeader, planKeyQuery)) return ident;
    var store = Stores.get().identity;
    if (Py.truthy(userCookie) && Session.sessionConfigured()) {
      Long userId = Session.readSession(userCookie);
      if (userId != null) ident.user = store.getUser(userId);
    }
    String rawHeader = connectionHeader == null ? "" : connectionHeader.strip();
    String planKey = planKeyQuery == null ? "" : planKeyQuery.strip();
    if (!rawHeader.isEmpty()) {
      if (!rawHeader.chars().allMatch(Character::isDigit)) throw new IdentityError(400, "Conexão inválida.");
      long id;
      try {
        id = Long.parseLong(rawHeader);
      } catch (NumberFormatException e) {
        throw new IdentityError(404, "Conexão não encontrada.");
      }
      ident.connection = store.getConnection(id);
      if (ident.connection == null) throw new IdentityError(404, "Conexão não encontrada.");
      if (!planKey.isEmpty() && !planKey.toLowerCase().equals(Py.str(ident.connection.get("plan_key")).toLowerCase()))
        throw new IdentityError(400, "planKey não pertence à conexão selecionada.");
    } else if (!planKey.isEmpty()) {
      ident.connection = store.getConnectionByPlanKey(planKey);
    }
    if (Py.truthy(ident.user) && Py.truthy(ident.connection))
      ident.member = store.getMember(Py.toLong(ident.connection.get("id")), Py.toLong(ident.user.get("id")));
    ident.role = Roles.effectiveRole(ident.user, ident.connection, ident.member);
    return ident;
  }
}
