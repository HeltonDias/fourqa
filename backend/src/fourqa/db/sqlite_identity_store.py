"""SQLite identity store: users, PAT credentials, connections and members."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fourqa.db.db import get_db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _user(row: Any) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "id": int(row["id"]),
        "ado_profile_id": row["ado_profile_id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "global_role": row["global_role"],
        "created_at": row["created_at"],
        "last_login_at": row["last_login_at"],
    }


def _connection(row: Any) -> dict[str, Any] | None:
    if not row:
        return None
    out = {
        "id": int(row["id"]),
        "org": row["org"],
        "project": row["project"],
        "test_plan_id": int(row["test_plan_id"]),
        "test_plan_name": row["test_plan_name"],
        "plan_key": row["plan_key"],
        "title": row["title"],
        "legacy": bool(row["legacy"]),
        "created_by": row["created_by"],
        "created_at": row["created_at"],
    }
    if "member_role" in row.keys():
        out["member_role"] = row["member_role"]
    return out


def upsert_user(ado_profile_id: str, email: str | None, display_name: str | None, bootstrap_head: bool) -> dict[str, Any]:
    db = get_db()
    now = _now()
    db.execute(
        """
        INSERT INTO app_user (ado_profile_id, email, display_name, global_role, created_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (ado_profile_id) DO UPDATE SET
          email = excluded.email, display_name = excluded.display_name, last_login_at = excluded.last_login_at
        """,
        (ado_profile_id, email, display_name, "head" if bootstrap_head else "qa", now, now),
    )
    if bootstrap_head:
        db.execute(
            "UPDATE app_user SET global_role = 'head' WHERE ado_profile_id = ? "
            "AND NOT EXISTS (SELECT 1 FROM app_user WHERE global_role = 'head')",
            (ado_profile_id,),
        )
    db.commit()
    row = db.execute("SELECT * FROM app_user WHERE ado_profile_id = ?", (ado_profile_id,)).fetchone()
    user = _user(row)
    assert user is not None
    return user


def get_user(user_id: int) -> dict[str, Any] | None:
    return _user(get_db().execute("SELECT * FROM app_user WHERE id = ?", (user_id,)).fetchone())


def find_user_by_email(email: str) -> dict[str, Any] | None:
    row = get_db().execute(
        "SELECT * FROM app_user WHERE lower(email) = lower(?) ORDER BY id LIMIT 1", (email.strip(),)
    ).fetchone()
    return _user(row)


def list_users() -> list[dict[str, Any]]:
    rows = get_db().execute("SELECT * FROM app_user ORDER BY lower(coalesce(display_name, email, ''))").fetchall()
    return [u for u in (_user(r) for r in rows) if u]


def set_global_role(user_id: int, role: str) -> None:
    db = get_db()
    db.execute("UPDATE app_user SET global_role = ? WHERE id = ?", (role, user_id))
    db.commit()


def count_heads() -> int:
    row = get_db().execute("SELECT COUNT(*) FROM app_user WHERE global_role = 'head'").fetchone()
    return int(row[0]) if row else 0


def save_credential(user_id: int, pat_encrypted: str, org_hint: str | None) -> None:
    db = get_db()
    db.execute(
        """
        INSERT INTO user_credential (user_id, pat_encrypted, org_hint, validated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          pat_encrypted = excluded.pat_encrypted, org_hint = excluded.org_hint, validated_at = excluded.validated_at
        """,
        (user_id, pat_encrypted, org_hint, _now()),
    )
    db.commit()


def get_credential(user_id: int) -> dict[str, Any] | None:
    row = get_db().execute("SELECT * FROM user_credential WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return {"user_id": int(row["user_id"]), "pat_encrypted": row["pat_encrypted"], "org_hint": row["org_hint"], "validated_at": row["validated_at"]}


def delete_credential(user_id: int) -> None:
    db = get_db()
    db.execute("DELETE FROM user_credential WHERE user_id = ?", (user_id,))
    db.commit()


def create_connection(
    org: str,
    project: str,
    test_plan_id: int,
    test_plan_name: str | None,
    plan_key: str,
    title: str | None,
    legacy: bool,
    created_by: int | None,
) -> dict[str, Any]:
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO qa_connection (org, project, test_plan_id, test_plan_name, plan_key, title, legacy, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (org, project, test_plan_id, test_plan_name, plan_key, title, 1 if legacy else 0, created_by, _now()),
    )
    db.commit()
    conn = get_connection(int(cur.lastrowid or 0))
    assert conn is not None
    return conn


def find_connection(org: str, project: str, test_plan_id: int) -> dict[str, Any] | None:
    row = get_db().execute(
        "SELECT * FROM qa_connection WHERE lower(org) = lower(?) AND lower(project) = lower(?) AND test_plan_id = ?",
        (org, project, test_plan_id),
    ).fetchone()
    return _connection(row)


def get_connection(connection_id: int) -> dict[str, Any] | None:
    return _connection(get_db().execute("SELECT * FROM qa_connection WHERE id = ?", (connection_id,)).fetchone())


def get_connection_by_plan_key(plan_key: str) -> dict[str, Any] | None:
    row = get_db().execute(
        "SELECT * FROM qa_connection WHERE lower(plan_key) = lower(?)", (plan_key.strip(),)
    ).fetchone()
    return _connection(row)


def list_connections() -> list[dict[str, Any]]:
    rows = get_db().execute("SELECT *, NULL AS member_role FROM qa_connection ORDER BY id").fetchall()
    return [c for c in (_connection(r) for r in rows) if c]


def list_connections_for_user(user_id: int) -> list[dict[str, Any]]:
    rows = get_db().execute(
        """
        SELECT c.*, m.role AS member_role FROM qa_connection c
        JOIN connection_member m ON m.connection_id = c.id
        WHERE m.user_id = ? ORDER BY c.id
        """,
        (user_id,),
    ).fetchall()
    return [c for c in (_connection(r) for r in rows) if c]


def add_member(connection_id: int, user_id: int, role: str | None) -> None:
    db = get_db()
    db.execute(
        "INSERT OR IGNORE INTO connection_member (connection_id, user_id, role, added_at) VALUES (?, ?, ?, ?)",
        (connection_id, user_id, role, _now()),
    )
    db.commit()


def get_member(connection_id: int, user_id: int) -> dict[str, Any] | None:
    row = get_db().execute(
        "SELECT * FROM connection_member WHERE connection_id = ? AND user_id = ?", (connection_id, user_id)
    ).fetchone()
    if not row:
        return None
    return {"connection_id": int(row["connection_id"]), "user_id": int(row["user_id"]), "role": row["role"], "added_at": row["added_at"]}


def list_members(connection_id: int) -> list[dict[str, Any]]:
    rows = get_db().execute(
        """
        SELECT u.*, m.role AS member_role, m.added_at FROM connection_member m
        JOIN app_user u ON u.id = m.user_id
        WHERE m.connection_id = ? ORDER BY lower(coalesce(u.display_name, u.email, ''))
        """,
        (connection_id,),
    ).fetchall()
    out = []
    for row in rows:
        user = _user(row)
        if user:
            out.append({**user, "member_role": row["member_role"], "added_at": row["added_at"]})
    return out


def set_member_role(connection_id: int, user_id: int, role: str | None) -> None:
    db = get_db()
    db.execute(
        "UPDATE connection_member SET role = ? WHERE connection_id = ? AND user_id = ?", (role, connection_id, user_id)
    )
    db.commit()


def remove_member(connection_id: int, user_id: int) -> None:
    db = get_db()
    db.execute("DELETE FROM connection_member WHERE connection_id = ? AND user_id = ?", (connection_id, user_id))
    db.commit()


sqlite_identity_store = {
    "upsert_user": upsert_user,
    "get_user": get_user,
    "find_user_by_email": find_user_by_email,
    "list_users": list_users,
    "set_global_role": set_global_role,
    "count_heads": count_heads,
    "save_credential": save_credential,
    "get_credential": get_credential,
    "delete_credential": delete_credential,
    "create_connection": create_connection,
    "find_connection": find_connection,
    "get_connection": get_connection,
    "get_connection_by_plan_key": get_connection_by_plan_key,
    "list_connections": list_connections,
    "list_connections_for_user": list_connections_for_user,
    "add_member": add_member,
    "get_member": get_member,
    "list_members": list_members,
    "set_member_role": set_member_role,
    "remove_member": remove_member,
}
