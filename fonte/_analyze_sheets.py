import json
import re
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
path = ROOT / "Status_Report_Diario_QA_SIAS_EndToEnd_Fase3 (2).xlsx"
wb = openpyxl.load_workbook(path, data_only=False, read_only=True)

targets = [
    "Home PORT.",
    "2) Planejamento",
    "Status por frente",
    "Controle_Execusoes",
    "Controle_Falhas",
]

def resolve_sheet(name: str) -> str | None:
    if name in wb.sheetnames:
        return name
    key = name.lower().replace(" ", "")
    for s in wb.sheetnames:
        if key in s.lower().replace(" ", ""):
            return s
    return None

out = {"workbook_sheets": wb.sheetnames}

for label in targets:
    sheet_name = resolve_sheet(label)
    if not sheet_name:
        out[label] = {"error": "aba não encontrada"}
        continue

    ws = wb[sheet_name]
    formulas = []
    plankey_formulas = []

    max_scan = min(ws.max_row or 1, 350 if label == "2) Planejamento" else 220)

    for i, row in enumerate(
        ws.iter_rows(min_row=1, max_row=max_scan, max_col=min(ws.max_column or 1, 40), values_only=False),
        start=1,
    ):
        for cell in row:
            v = cell.value
            if isinstance(v, str) and v.startswith("="):
                entry = {"cell": cell.coordinate, "formula": v[:800]}
                formulas.append(entry)
                if "PLANKEY" in v.upper() or "TBCONTROLE" in v.upper():
                    plankey_formulas.append(entry)

    headers = {}
    if label == "Controle_Execusoes" or label == "Controle_Falhas":
        row2 = next(ws.iter_rows(min_row=2, max_row=2, max_col=25, values_only=True))
        headers["row2"] = list(row2)
    if label == "2) Planejamento":
        row7 = next(ws.iter_rows(min_row=7, max_row=7, max_col=25, values_only=True))
        headers["row7"] = list(row7)

    sample = {}
    if label == "Home PORT.":
        for coord in ["A2", "E3", "H3", "C6", "D6", "E6", "F6", "H6", "I6", "A10", "H10", "I10", "J10", "P10"]:
            sample[coord] = ws[coord].value
    if label == "Status por frente":
        for coord in ["A2", "K2", "U2", "A6", "K6", "U6"]:
            sample[coord] = ws[coord].value

    tables = []
    try:
        for tbl in ws.tables.values():
            tables.append({"name": tbl.name, "ref": tbl.ref})
    except Exception:
        pass

    funcs = Counter()
    for f in formulas:
        for fn in re.findall(r"([A-Z][A-Z0-9_.]+)\(", f["formula"], re.I):
            u = fn.upper()
            if u not in {"IF", "AND", "OR", "NOT"}:
                funcs[u] += 1

    out[label] = {
        "sheet_name": sheet_name,
        "max_row": ws.max_row,
        "max_col": ws.max_column,
        "tables": tables,
        "headers": headers,
        "key_cells": sample,
        "formula_count_in_scan": len(formulas),
        "plankey_or_table_formulas": plankey_formulas[:30],
        "formula_samples": formulas[:35],
        "top_functions": funcs.most_common(20),
    }

wb.close()

with open(ROOT / "_analysis_fase3.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print("OK", len(out))
