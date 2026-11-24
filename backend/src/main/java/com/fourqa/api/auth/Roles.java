package com.fourqa.api.auth;

import com.fourqa.api.util.Py;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of {@code fourqa.auth.roles} (DEC-036, DEC-038). */
public final class Roles {
  public static final List<String> ROLES = List.of("head", "lider", "qa", "visitante");
  public static final Map<String, String> ROLE_LABEL = new LinkedHashMap<>();
  private static final Map<String, Integer> RANK = Map.of("visitante", 0, "qa", 1, "lider", 2, "head", 3);

  static {
    ROLE_LABEL.put("head", "Head");
    ROLE_LABEL.put("lider", "Líder");
    ROLE_LABEL.put("qa", "QA");
    ROLE_LABEL.put("visitante", "Visitante");
  }

  private Roles() {}

  public static String normalizeRole(Object value) {
    if (!(value instanceof String s)) return null;
    String key = s.strip().toLowerCase().replace("í", "i");
    return RANK.containsKey(key) ? key : null;
  }

  public static int rank(String role) {
    return role == null ? -1 : RANK.getOrDefault(role, -1);
  }

  public static boolean atLeast(String role, String minimum) {
    return rank(role) >= RANK.get(minimum);
  }

  public static String effectiveRole(Map<String, Object> user, Map<String, Object> connection, Map<String, Object> member) {
    if (!Py.truthy(user)) return null;
    String global = normalizeRole(user.get("global_role"));
    if (global == null) global = "qa";
    if (global.equals("head")) return "head";
    if (connection == null) return global;
    if (member == null) return null;
    String memberRole = normalizeRole(member.get("role"));
    return memberRole != null ? memberRole : global;
  }

  public static boolean canWrite(String role) {
    return atLeast(role, "lider");
  }
}
