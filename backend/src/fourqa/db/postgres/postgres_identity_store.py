"""PostgreSQL identity store: users, PAT credentials, connections and members."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fourqa.db.postgres.pool import get_pool, query, trusted_sql


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _user(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "id": int(row["id"]),
        "ado_profile_id": row["ado_profile_id"],
        "email": row.get("email"),
        "display_name": row.get("display_name"),
        "global_role": row.get("global_role") or "qa",
        "created_at": _iso(row.get("created_at")),
        "last_login_at": _iso(row.get("last_login_at")),
    }


def _connection(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    out = {
        "id": int(row["id"]),
        "org": row["org"],
        "project": row["project"],
        "test_plan_id": int(row["test_plan_id"]),
        "test_plan_name": row.get("test_plan_name"),
        "plan_key": row["plan_key"],
        "title": row.get("title"),
        "legacy": bool(row.get("legacy")),
        "created_by": int(row["created_by"]) if row.get("created_by") is not None else None,
        "created_at": _iso(row.get("created_at")),
    }
    if "member_role" in row:
        out["member_role"] = row["member_role"]
    return out


async def _exec(sql: str, params: list[Any]) -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(trusted_sql(sql), params)


async def _one(sql: str, params: list[Any]) -> dict[str, Any] | None:
    rows = await query(sql, params)
    return rows[0] if rows else None


async def upsert_user(ado_profile_id: str, email: str | None, display_name: str | None, bootstrap_head: bool) -> dict[str, Any]:
    row = await _one(
        """
        INSERT INTO app_user (ado_profile_id, email, display_name, global_role, last_login_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (ado_profile_id) DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          last_login_at = now(),
          global_role = CASE
            WHEN $5::boolean AND NOT EXISTS (SELECT 1 FROM app_user h WHERE h.global_role = 'head') THEN 'head'
            ELSE app_user.global_role
          END
        RETURNING *
        """,
        [ado_profile_id, email, display_name, "head" if bootstrap_head else "qa", bootstrap_head],
    )
    user = _user(row)
    assert user is not None
    return user


async def get_user(user_id: int) -> dict[str, Any] | None:
    return _user(await _one("SELECT * FROM app_user WHERE id = $1", [user_id]))


async def find_user_by_email(email: str) -> dict[str, Any] | None:
    return _user(
        await _one("SELECT * FROM app_user WHERE lower(email) = lower($1) ORDER BY id LIMIT 1", [email.strip()])
    )


async def list_users() -> list[dict[str, Any]]:
    rows = await query("SELECT * FROM app_user ORDER BY lower(coalesce(display_name, email, ''))", [])
    return [u for u in (_user(r) for r in rows) if u]


async def set_global_role(user_id: int, role: str) -> None:
    await _exec("UPDATE app_user SET global_role = $1 WHERE id = $2", [role, user_id])


async def count_heads() -> int:
    row = await _one("SELECT COUNT(*) AS n FROM app_user WHERE global_role = 'head'", [])
    return int(row["n"]) if row else 0


async def save_credential(user_id: int, pat_encrypted: str, org_hint: str | None) -> None:
    await _exec(
        """
        INSERT INTO user_credential (user_id, pat_encrypted, org_hint, validated_at) VALUES ($1, $2, $3, now())
        ON CONFLICT (user_id) DO UPDATE SET
          pat_encrypted = EXCLUDED.pat_encrypted, org_hint = EXCLUDED.org_hint, validated_at = now()
        """,
        [user_id, pat_encrypted, org_hint],
    )


async def get_credential(user_id: int) -> dict[str, Any] | None:
    row = await _one("SELECT * FROM user_credential WHERE user_id = $1", [user_id])
    if not row:
        return None
    return {
        "user_id": int(row["user_id"]),
        "pat_encrypted": row["pat_encrypted"],
        "org_hint": row.get("org_hint"),
        "validated_at": _iso(row.get("validated_at")),
    }


async def delete_credential(user_id: int) -> None:
    await _exec("DELETE FROM user_credential WHERE user_id = $1", [user_id])


async def create_connection(
    org: str,
    project: str,
    test_plan_id: int,
    test_plan_name: str | None,
    plan_key: str,
    title: str | None,
    legacy: bool,
    created_by: int | None,
) -> dict[str, Any]:
    row = await _one(
        """
        INSERT INTO qa_connection (org, project, test_plan_id, test_plan_name, plan_key, title, legacy, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        """,
        [org, project, test_plan_id, test_plan_name, plan_key, title, legacy, created_by],
    )
    conn = _connection(row)
    assert conn is not None
    return conn


async def find_connection(org: str, project: str, test_plan_id: int) -> dict[str, Any] | None:
    return _connection(
        await _one(
            "SELECT * FROM qa_connection WHERE lower(org) = lower($1) AND lower(project) = lower($2) AND test_plan_id = $3",
            [org, project, test_plan_id],
        )
    )


async def get_connection(connection_id: int) -> dict[str, Any] | None:
    return _connection(await _one("SELECT * FROM qa_connection WHERE id = $1", [connection_id]))


async def get_connection_by_plan_key(plan_key: str) -> dict[str, Any] | None:
    return _connection(await _one("SELECT * FROM qa_connection WHERE lower(plan_key) = lower($1)", [plan_key.strip()]))


async def list_connections() -> list[dict[str, Any]]:
    rows = await query("SELECT *, NULL::text AS member_role FROM qa_connection ORDER BY id", [])
    return [c for c in (_connection(r) for r in rows) if c]


async def list_connections_for_user(user_id: int) -> list[dict[str, Any]]:
    rows = await query(
        """
        SELECT c.*, m.role AS member_role FROM qa_connection c
        JOIN connection_member m ON m.connection_id = c.id
        WHERE m.user_id = $1 ORDER BY c.id
        """,
        [user_id],
    )
    return [c for c in (_connection(r) for r in rows) if c]


async def add_member(connection_id: int, user_id: int, role: str | None) -> None:
    await _exec(
        "INSERT INTO connection_member (connection_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [connection_id, user_id, role],
    )


async def get_member(connection_id: int, user_id: int) -> dict[str, Any] | None:
    row = await _one("SELECT * FROM connection_member WHERE connection_id = $1 AND user_id = $2", [connection_id, user_id])
    if not row:
        return None
    return {
        "connection_id": int(row["connection_id"]),
        "user_id": int(row["user_id"]),
        "role": row.get("role"),
        "added_at": _iso(row.get("added_at")),
    }


async def list_members(connection_id: int) -> list[dict[str, Any]]:
    rows = await query(
        """
        SELECT u.*, m.role AS member_role, m.added_at FROM connection_member m
        JOIN app_user u ON u.id = m.user_id
        WHERE m.connection_id = $1 ORDER BY lower(coalesce(u.display_name, u.email, ''))
        """,
        [connection_id],
    )
    out = []
    for row in rows:
        user = _user(row)
        if user:
            out.append({**user, "member_role": row.get("member_role"), "added_at": _iso(row.get("added_at"))})
    return out


async def set_member_role(connection_id: int, user_id: int, role: str | None) -> None:
    await _exec(
        "UPDATE connection_member SET role = $1 WHERE connection_id = $2 AND user_id = $3", [role, connection_id, user_id]
    )


async def remove_member(connection_id: int, user_id: int) -> None:
    await _exec("DELETE FROM connection_member WHERE connection_id = $1 AND user_id = $2", [connection_id, user_id])
