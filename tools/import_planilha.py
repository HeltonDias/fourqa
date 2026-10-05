"""Importa abas da planilha Fase 3 para SQLite (sem Config_Teste / PAT)."""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = ROOT / "fonte" / "Status_Report_Diario_QA_SIAS_EndToEnd_Fase3 (2).xlsx"
DB_PATH = ROOT / "data" / "motor_qa.db"

EXEC_HEADERS = [
    "plan_key",
    "plan_id",
    "plan_name",
    "frente",
    "atalho",
    "processo",
    "suite_id",
    "suite_name",
    "test_point_id",
    "test_case_id",
    "test_case_title",
    "responsabilidade",
    "test_case_state",
    "test_point_state",
    "outcome",
    "date_completed",
    "run_by",
    "last_updated_date",
    "last_test_run_id",
    "last_result_id",
    "test_case_link",
    "test_case_tags",
]

FALHAS_HEADERS = [
    "plan_key",
    "responsavel",
    "ambiente",
    "categoria",
    "bug_id",
    "impacto",
    "frente",
    "titulo",
    "status",
    "criacao",
    "fechamento",
    "links",
    "tags",
]


def cell_str(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat(sep=" ", timespec="seconds")
    if isinstance(v, date):
        return v.isoformat()
    return str(v).strip() if str(v).strip() else None


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS execucoes;
        DROP TABLE IF EXISTS falhas;
        DROP TABLE IF EXISTS planejamento_linhas;
        DROP TABLE IF EXISTS workbook_meta;

        CREATE TABLE execucoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_key TEXT,
            plan_id INTEGER,
            plan_name TEXT,
            frente TEXT,
            atalho TEXT,
            processo TEXT,
            suite_id INTEGER,
            suite_name TEXT,
            test_point_id INTEGER,
            test_case_id INTEGER,
            test_case_title TEXT,
            responsabilidade TEXT,
            test_case_state TEXT,
            test_point_state TEXT,
            outcome TEXT,
            date_completed TEXT,
            run_by TEXT,
            last_updated_date TEXT,
            last_test_run_id INTEGER,
            last_result_id INTEGER,
            test_case_link TEXT,
            test_case_tags TEXT
        );

        CREATE TABLE falhas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_key TEXT,
            responsavel TEXT,
            ambiente TEXT,
            categoria TEXT,
            bug_id INTEGER,
            impacto REAL,
            frente TEXT,
            titulo TEXT,
            status TEXT,
            criacao TEXT,
            fechamento TEXT,
            links TEXT,
            tags TEXT
        );

        CREATE TABLE planejamento_linhas (
            row_num INTEGER PRIMARY KEY,
            qa TEXT,
            prioridades TEXT,
            frente TEXT,
            processo TEXT,
            data_inicio TEXT,
            data_fim TEXT,
            replanejamento REAL,
            qtd_cts_plan REAL,
            cts_plan_dia REAL,
            cts_cancelados REAL
        );

        CREATE TABLE workbook_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX idx_exec_plan ON execucoes(plan_key);
        CREATE INDEX idx_exec_suite ON execucoes(suite_name);
        CREATE INDEX idx_falhas_plan ON falhas(plan_key);
        CREATE INDEX idx_falhas_frente ON falhas(frente);
        """
    )


def import_execucoes(ws, conn: sqlite3.Connection) -> int:
    rows = []
    for r in range(3, (ws.max_row or 2) + 1):
        plan_key = ws.cell(r, 1).value
        if not plan_key or str(plan_key).startswith("PLANO:"):
            continue
        vals = [cell_str(ws.cell(r, c).value) for c in range(1, 23)]
        rows.append(vals)
    conn.executemany(
        f"INSERT INTO execucoes ({','.join(EXEC_HEADERS)}) VALUES ({','.join('?' * len(EXEC_HEADERS))})",
        rows,
    )
    return len(rows)


def import_falhas(ws, conn: sqlite3.Connection) -> int:
    rows = []
    # Planilha pode ter milhares de linhas vazias reservadas para o script Azure.
    max_row = min(ws.max_row or 2, 400)
    for r in range(3, max_row + 1):
        bug_id = ws.cell(r, 5).value
        if bug_id is None or str(bug_id).strip() in ("", "ID"):
            continue
        try:
            bug_id_int = int(bug_id)
        except (TypeError, ValueError):
            continue
        vals = []
        for c in range(1, 14):
            v = ws.cell(r, c).value
            if c == 5:
                vals.append(bug_id_int)
            elif c == 6 and v is not None:
                try:
                    vals.append(float(v))
                except (TypeError, ValueError):
                    vals.append(None)
            else:
                vals.append(cell_str(v))
        rows.append(vals)
    conn.executemany(
        f"INSERT INTO falhas ({','.join(FALHAS_HEADERS)}) VALUES ({','.join('?' * len(FALHAS_HEADERS))})",
        rows,
    )
    return len(rows)


def import_planejamento(ws, conn: sqlite3.Connection) -> int:
    count = 0
    for r in range(8, 33):
        processo = ws.cell(r, 4).value
        if not processo:
            continue
        conn.execute(
            """
            INSERT INTO planejamento_linhas (
                row_num, qa, prioridades, frente, processo,
                data_inicio, data_fim, replanejamento,
                qtd_cts_plan, cts_plan_dia, cts_cancelados
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                r,
                cell_str(ws.cell(r, 1).value),
                cell_str(ws.cell(r, 2).value),
                cell_str(ws.cell(r, 3).value),
                cell_str(processo),
                cell_str(ws.cell(r, 5).value),
                cell_str(ws.cell(r, 6).value),
                ws.cell(r, 7).value if ws.cell(r, 7).value is not None else 0,
                ws.cell(r, 8).value,
                ws.cell(r, 9).value,
                ws.cell(r, 14).value if ws.cell(r, 14).value is not None else 0,
            ),
        )
        count += 1
    return count


def main() -> None:
    xlsx = Path(__import__("os").environ.get("MOTOR_QA_XLSX", str(DEFAULT_XLSX)))
    if not xlsx.is_file():
        raise SystemExit(f"Planilha não encontrada: {xlsx}")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.load_workbook(xlsx, data_only=True, read_only=True)

    conn = sqlite3.connect(DB_PATH)
    try:
        init_db(conn)
        meta = {
            "source_file": xlsx.name,
            "imported_at": datetime.now().isoformat(timespec="seconds"),
            "title": "STATUS REPORT QA: CVP-SIAS - End-to-End - Fase 3",
        }
        ws_plan = wb["2) Planejamento"]
        meta["data_inicio"] = cell_str(ws_plan["D3"].value) or ""
        meta["data_fim"] = cell_str(ws_plan["F3"].value) or ""
        meta["data_fim_linha"] = cell_str(ws_plan["E6"].value) or meta["data_fim"]

        n_exec = import_execucoes(wb["Controle_Execusoes"], conn)
        n_fal = import_falhas(wb["Controle_Falhas"], conn)
        n_plan = import_planejamento(ws_plan, conn)

        for k, v in meta.items():
            conn.execute(
                "INSERT INTO workbook_meta (key, value) VALUES (?, ?)", (k, str(v))
            )

        conn.commit()
        print(
            json.dumps(
                {
                    "db": str(DB_PATH),
                    "execucoes": n_exec,
                    "falhas": n_fal,
                    "planejamento_linhas": n_plan,
                },
                ensure_ascii=False,
            )
        )
    finally:
        conn.close()
        wb.close()


if __name__ == "__main__":
    main()
