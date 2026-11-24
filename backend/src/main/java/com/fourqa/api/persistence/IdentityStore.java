package com.fourqa.api.persistence;

import com.fourqa.api.util.Py;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Users, PAT/Entra credentials, connections, members and invites. */
public final class IdentityStore {
  private final Database db;

  public IdentityStore(Database db) {
    this.db = db;
  }

  private Object now() {
    return db.isPostgres() ? PyTime.nowUtc() : PyTime.nowIso();
  }

  private static Long idOrNull(Object v) {
    return v == null ? null : Py.toLong(v);
  }

  static Map<String, Object> user(Map<String, Object> row) {
    if (row == null) return null;
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", Py.toLong(row.get("id")));
    out.put("ado_profile_id", row.get("ado_profile_id"));
    out.put("email", row.get("email"));
    out.put("display_name", row.get("display_name"));
    out.put("global_role", Py.truthy(row.get("global_role")) ? row.get("global_role") : "qa");
    out.put("created_at", PyTime.iso(row.get("created_at")));
    out.put("last_login_at", PyTime.iso(row.get("last_login_at")));
    return out;
  }

  static Map<String, Object> connection(Map<String, Object> row) {
    if (row == null) return null;
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", Py.toLong(row.get("id")));
    out.put("org", row.get("org"));
    out.put("project", row.get("project"));
    out.put("test_plan_id", Py.toLong(row.get("test_plan_id")));
    out.put("test_plan_name", row.get("test_plan_name"));
    out.put("plan_key", row.get("plan_key"));
    out.put("title", row.get("title"));
    out.put("legacy", Py.truthy(row.get("legacy")));
    out.put("created_by", idOrNull(row.get("created_by")));
    out.put("created_at", PyTime.iso(row.get("created_at")));
    if (row.containsKey("member_role")) out.put("member_role", row.get("member_role"));
    return out;
  }

  public Map<String, Object> upsertUser(String adoProfileId, String email, String displayName, boolean bootstrapHead) {
    return db.tx(conn -> {
      Object now = now();
      conn.execute(
          "INSERT INTO app_user (ado_profile_id, email, display_name, global_role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)"
              + " ON CONFLICT (ado_profile_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,"
              + " last_login_at = EXCLUDED.last_login_at",
          adoProfileId, email, displayName, bootstrapHead ? "head" : "qa", now, now);
      if (bootstrapHead) {
        conn.execute(
            "UPDATE app_user SET global_role = 'head' WHERE ado_profile_id = ?"
                + " AND NOT EXISTS (SELECT 1 FROM app_user h WHERE h.global_role = 'head')",
            adoProfileId);
      }
      return user(conn.one("SELECT * FROM app_user WHERE ado_profile_id = ?", adoProfileId));
    });
  }

  public Map<String, Object> getUser(long userId) {
    return user(db.one("SELECT * FROM app_user WHERE id = ?", userId));
  }

  public Map<String, Object> findUserByEmail(String email) {
    return user(db.one("SELECT * FROM app_user WHERE lower(email) = lower(?) ORDER BY id LIMIT 1", email.strip()));
  }

  public List<Map<String, Object>> listUsers() {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : db.query("SELECT * FROM app_user ORDER BY lower(coalesce(display_name, email, ''))")) out.add(user(r));
    return out;
  }

  public void setGlobalRole(long userId, String role) {
    db.execute("UPDATE app_user SET global_role = ? WHERE id = ?", role, userId);
  }

  public long countHeads() {
    Map<String, Object> row = db.one("SELECT COUNT(*) AS n FROM app_user WHERE global_role = 'head'");
    return row == null ? 0 : Py.toLong(row.get("n"));
  }

  public void saveCredential(long userId, String patEncrypted, String orgHint) {
    db.execute(
        "INSERT INTO user_credential (user_id, pat_encrypted, org_hint, validated_at) VALUES (?, ?, ?, ?)"
            + " ON CONFLICT (user_id) DO UPDATE SET pat_encrypted = EXCLUDED.pat_encrypted, org_hint = EXCLUDED.org_hint,"
            + " validated_at = EXCLUDED.validated_at",
        userId, patEncrypted, orgHint, now());
  }

  public Map<String, Object> getCredential(long userId) {
    Map<String, Object> row = db.one("SELECT * FROM user_credential WHERE user_id = ?", userId);
    if (row == null) return null;
    return Py.obj(
        "user_id", Py.toLong(row.get("user_id")),
        "pat_encrypted", row.get("pat_encrypted"),
        "org_hint", row.get("org_hint"),
        "validated_at", PyTime.iso(row.get("validated_at")));
  }

  public void deleteCredential(long userId) {
    db.execute("DELETE FROM user_credential WHERE user_id = ?", userId);
  }

  public Map<String, Object> createConnection(
      String org, String project, long testPlanId, String testPlanName, String planKey, String title, boolean legacy, Long createdBy) {
    return db.tx(conn -> connection(conn.one(
        "INSERT INTO qa_connection (org, project, test_plan_id, test_plan_name, plan_key, title, legacy, created_by, created_at)"
            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        org, project, testPlanId, testPlanName, planKey, title, legacy, createdBy, now())));
  }

  public Map<String, Object> findConnection(String org, String project, long testPlanId) {
    return connection(db.one(
        "SELECT * FROM qa_connection WHERE lower(org) = lower(?) AND lower(project) = lower(?) AND test_plan_id = ?",
        org, project, testPlanId));
  }

  public Map<String, Object> getConnection(long connectionId) {
    return connection(db.one("SELECT * FROM qa_connection WHERE id = ?", connectionId));
  }

  public Map<String, Object> getConnectionByPlanKey(String planKey) {
    return connection(db.one("SELECT * FROM qa_connection WHERE lower(plan_key) = lower(?)", planKey.strip()));
  }

  public List<Map<String, Object>> listConnections() {
    List<Map<String, Object>> out = new ArrayList<>();
    String nullRole = db.isPostgres() ? "NULL::text" : "NULL";
    for (Map<String, Object> r : db.query("SELECT *, " + nullRole + " AS member_role FROM qa_connection ORDER BY id")) out.add(connection(r));
    return out;
  }

  public List<Map<String, Object>> listConnectionsForUser(long userId) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : db.query(
        "SELECT c.*, m.role AS member_role FROM qa_connection c JOIN connection_member m ON m.connection_id = c.id"
            + " WHERE m.user_id = ? ORDER BY c.id",
        userId)) out.add(connection(r));
    return out;
  }

  public void addMember(long connectionId, long userId, String role) {
    db.execute(
        "INSERT INTO connection_member (connection_id, user_id, role, added_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
        connectionId, userId, role, now());
  }

  public Map<String, Object> getMember(long connectionId, long userId) {
    Map<String, Object> row = db.one("SELECT * FROM connection_member WHERE connection_id = ? AND user_id = ?", connectionId, userId);
    if (row == null) return null;
    return Py.obj(
        "connection_id", Py.toLong(row.get("connection_id")),
        "user_id", Py.toLong(row.get("user_id")),
        "role", row.get("role"),
        "added_at", PyTime.iso(row.get("added_at")));
  }

  public List<Map<String, Object>> listMembers(long connectionId) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> row : db.query(
        "SELECT u.*, m.role AS member_role, m.added_at FROM connection_member m JOIN app_user u ON u.id = m.user_id"
            + " WHERE m.connection_id = ? ORDER BY lower(coalesce(u.display_name, u.email, ''))",
        connectionId)) {
      Map<String, Object> u = user(row);
      u.put("member_role", row.get("member_role"));
      u.put("added_at", PyTime.iso(row.get("added_at")));
      out.add(u);
    }
    return out;
  }

  public void setMemberRole(long connectionId, long userId, String role) {
    db.execute("UPDATE connection_member SET role = ? WHERE connection_id = ? AND user_id = ?", role, connectionId, userId);
  }

  public void removeMember(long connectionId, long userId) {
    db.execute("DELETE FROM connection_member WHERE connection_id = ? AND user_id = ?", connectionId, userId);
  }

  public void deleteConnection(long connectionId) {
    db.tx(conn -> {
      conn.execute("DELETE FROM connection_invite WHERE connection_id = ?", connectionId);
      conn.execute("DELETE FROM connection_member WHERE connection_id = ?", connectionId);
      conn.execute("DELETE FROM qa_connection WHERE id = ?", connectionId);
      return null;
    });
  }

  static Map<String, Object> invite(Map<String, Object> r) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", Py.toLong(r.get("id")));
    out.put("connection_id", Py.toLong(r.get("connection_id")));
    out.put("email", r.get("email"));
    out.put("role", r.get("role"));
    out.put("invited_by", idOrNull(r.get("invited_by")));
    out.put("created_at", PyTime.iso(r.get("created_at")));
    return out;
  }

  public Map<String, Object> upsertInvite(long connectionId, String email, String role, Long invitedBy) {
    String normalized = email.strip().toLowerCase();
    return db.tx(conn -> invite(conn.one(
        "INSERT INTO connection_invite (connection_id, email, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?)"
            + " ON CONFLICT (connection_id, email) DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by,"
            + " created_at = EXCLUDED.created_at RETURNING *",
        connectionId, normalized, role, invitedBy, now())));
  }

  public List<Map<String, Object>> listInvites(long connectionId) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : db.query("SELECT * FROM connection_invite WHERE connection_id = ? ORDER BY lower(email)", connectionId))
      out.add(invite(r));
    return out;
  }

  public boolean deleteInvite(long connectionId, String email) {
    return db.execute("DELETE FROM connection_invite WHERE connection_id = ? AND lower(email) = lower(?)", connectionId, email.strip()) > 0;
  }

  public long claimInvitesForUser(String email, long userId) {
    if (email == null || email.isBlank()) return 0;
    String e = email.strip();
    return db.tx(conn -> {
      long claimed = 0;
      for (Map<String, Object> row : conn.query("SELECT connection_id, role FROM connection_invite WHERE lower(email) = lower(?)", e)) {
        conn.execute(
            "INSERT INTO connection_member (connection_id, user_id, role, added_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
            Py.toLong(row.get("connection_id")), userId, row.get("role"), now());
        claimed++;
      }
      if (claimed > 0) conn.execute("DELETE FROM connection_invite WHERE lower(email) = lower(?)", e);
      return claimed;
    });
  }
}
