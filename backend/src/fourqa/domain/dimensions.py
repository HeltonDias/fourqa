"""Dimensões dinâmicas (mirrors backend/src/domain/dimensions.ts)."""

from __future__ import annotations

import json
import re
from typing import Literal, TypedDict

DimensionRole = Literal["priority", "front", "process", "subprocess", "generic"]

PRIORITY_NAME = re.compile(r"^(prioridade\s*\d+|p\s*\d+)$", re.I)


class DetectedDimension(TypedDict, total=False):
    key: str
    label: str
    level: int
    values: list[str]
    role: DimensionRole
    confidence: float
    visible: bool


class HierarchyOverride(TypedDict):
    column_name: str
    source_level: str
    active: bool


class HierarchyLevelSource(TypedDict):
    type: Literal["hierarchy_level"]
    level: int


class CurrentSuiteSource(TypedDict):
    type: Literal["current_suite"]


DimensionSource = HierarchyLevelSource | CurrentSuiteSource


class DimensionDefinition(TypedDict):
    key: str
    label: str
    role: DimensionRole
    source: DimensionSource


class HierarchyConfigInput(TypedDict, total=False):
    order: int
    column_name: str
    source_level: str
    active: bool
    plan_key: str
    source_type: Literal["hierarchy_level", "current_suite"]


class DimensionResolutionContext(TypedDict):
    path_names: list[str]
    current_suite_name: str


def _role_from_column(name: str) -> DimensionRole | None:
    n = name.strip().lower()
    if not n or n.startswith(("nvl", "nivel", "nível")):
        return None
    if "subprocess" in n:
        return "subprocess"
    if "prior" in n:
        return "priority"
    if "frente" in n or n == "front":
        return "front"
    if "process" in n:
        return "process"
    return None


def _definition_key(role: DimensionRole, column_name: str) -> str:
    if role == "priority":
        return "priority"
    if role == "front":
        return "front"
    if role == "process":
        return "process"
    if role == "subprocess":
        return "subprocess"
    slug = re.sub(r"[^a-z0-9]+", "-", column_name.strip().lower()).strip("-")
    return f"dim-{slug}" if slug else f"dim-{role}"


def _resolve_source_value(context: DimensionResolutionContext, source: DimensionSource) -> str:
    if source["type"] == "current_suite":
        return context["current_suite_name"].strip()
    index = source["level"] - 1
    if index < 0 or index >= len(context["path_names"]):
        return ""
    return (context["path_names"][index] or "").strip()


def dimension_definitions_for_plan(plan_key: str, entries: list[HierarchyConfigInput]) -> list[DimensionDefinition]:
    norm = lambda value: value.strip().lower()
    keyed = [e for e in entries if e.get("active") and e.get("plan_key") and norm(e["plan_key"]) == norm(plan_key)]
    chosen = keyed if keyed else [e for e in entries if e.get("active") and not (e.get("plan_key") or "").strip()]
    out: list[DimensionDefinition] = []
    for entry in sorted(chosen, key=lambda e: e.get("order", 0)):
        label = entry["column_name"].strip()
        role = _role_from_column(label) or "generic"
        if entry.get("source_type") == "current_suite":
            source: DimensionSource = {"type": "current_suite"}
        else:
            source = {"type": "hierarchy_level", "level": max(1, int(entry.get("source_level") or 1))}
        out.append({"key": _definition_key(role, label), "label": label, "role": role, "source": source})
    return out


def resolve_dimension_values(
    context: DimensionResolutionContext,
    definitions: list[DimensionDefinition],
    suggestions: list[DetectedDimension] | None = None,
) -> dict[str, str]:
    suggestions = suggestions or []
    out: dict[str, str] = {}
    explicit_levels: set[int] = set()
    for defn in definitions:
        value = _resolve_source_value(context, defn["source"])
        if not value:
            continue
        out[defn["key"]] = value
        if defn["source"]["type"] == "hierarchy_level":
            explicit_levels.add(defn["source"]["level"])
    for dim in suggestions:
        if out.get(dim["key"]):
            continue
        if dim.get("level") in explicit_levels:
            continue
        if dim.get("level", 0) - 1 < len(context["path_names"]):
            name = (context["path_names"][dim["level"] - 1] or "").strip()
            if name:
                out[dim["key"]] = name
    return out


def build_dimension_catalog(
    definitions: list[DimensionDefinition],
    suggestions: list[DetectedDimension],
    paths: list[DimensionResolutionContext],
) -> list[DetectedDimension]:
    values_by_key: dict[str, set[str]] = {}
    for path in paths:
        resolved = resolve_dimension_values(path, definitions, suggestions)
        for key, value in resolved.items():
            values_by_key.setdefault(key, set()).add(value)
    explicit_keys = {d["key"] for d in definitions}
    explicit_dims: list[DetectedDimension] = []
    for defn in definitions:
        level = defn["source"]["level"] if defn["source"]["type"] == "hierarchy_level" else 0
        explicit_dims.append(
            {
                "key": defn["key"],
                "label": defn["label"],
                "role": defn["role"],
                "level": level,
                "values": sorted(values_by_key.get(defn["key"], set()), key=lambda s: s.lower()),
                "confidence": 1.0,
                "visible": True,
            }
        )
    suggested = [
        {
            **dim,
            "values": sorted(
                set(values_by_key.get(dim["key"], set(dim.get("values", [])))),
                key=lambda s: s.lower(),
            ),
        }
        for dim in suggestions
        if dim["key"] not in explicit_keys
        and not any(e.get("level") == dim.get("level") and dim.get("level", 0) > 0 for e in explicit_dims)
    ]
    return explicit_dims + suggested


def legacy_role_value(
    role: DimensionRole,
    classificacao: dict[str, str],
    definitions: list[DimensionDefinition],
    catalog: list[DetectedDimension],
) -> str:
    keys: list[str] = []
    keys.extend(d["key"] for d in definitions if d["role"] == role)
    keys.extend(d["key"] for d in catalog if d.get("role") == role)
    seen: set[str] = set()
    for key in keys:
        if key in seen:
            continue
        seen.add(key)
        value = (classificacao.get(key) or "").strip()
        if value:
            return value
    return ""


def _label_for(role: DimensionRole, level: int, column_name: str | None = None) -> str:
    if column_name and role != "generic":
        return column_name
    mapping = {
        "priority": "Prioridade",
        "front": "Frente",
        "process": "Processo",
        "subprocess": "Subprocesso",
    }
    return mapping.get(role, f"Nível {level}")


def detect_dimensions(
    paths: list[dict[str, list[dict[str, str]]]],
    hints: dict[str, list[str]] | None = None,
) -> list[DetectedDimension]:
    by_level: dict[int, set[str]] = {}
    for path in paths:
        nodes = path.get("ancestors") or []
        for index, node in enumerate(nodes):
            if index == len(nodes) - 1 and len(nodes) > 1:
                continue
            name = (node.get("name") or "").strip()
            if not name:
                continue
            level = index + 1
            by_level.setdefault(level, set()).add(name)
    fronts = {s.strip().upper() for s in (hints or {}).get("known_fronts", []) if s.strip()}
    found: list[DetectedDimension] = []
    for level in sorted(by_level):
        values = sorted(by_level[level], key=lambda s: s.lower())
        if not values:
            continue
        priority_ratio = sum(1 for v in values if PRIORITY_NAME.match(v.strip())) / len(values)
        front_ratio = 0.0
        if fronts:
            def matches_front(value: str) -> bool:
                up = value.strip().upper()
                if up in fronts:
                    return True
                tokens = [part for part in re.split(r"[^A-Z0-9]+", up) if part]
                return any(token in fronts for token in tokens)

            front_ratio = sum(1 for value in values if matches_front(value)) / len(values)
        role: DimensionRole = "generic"
        confidence = 0.2
        if priority_ratio >= 0.7:
            role, confidence = "priority", 0.9
        elif front_ratio >= 0.7:
            role, confidence = "front", 0.85
        found.append(
            {
                "key": role if role != "generic" else f"nivel-{level}",
                "label": _label_for(role, level),
                "level": level,
                "values": values,
                "role": role,
                "confidence": confidence,
                "visible": True,
            }
        )
    seen: dict[str, int] = {}
    out: list[DetectedDimension] = []
    for d in found:
        n = seen.get(d["key"], 0) + 1
        seen[d["key"]] = n
        out.append(d if n == 1 else {**d, "key": f"{d['key']}-{d['level']}"})
    return out


def apply_hierarchy_overrides(
    dims: list[DetectedDimension],
    overrides: list[HierarchyOverride],
) -> list[DetectedDimension]:
    result: list[DetectedDimension] = []
    for dim in dims:
        manual = next(
            (h for h in overrides if h.get("active") and str(h.get("source_level")) == str(dim.get("level"))),
            None,
        )
        if not manual:
            result.append(dim)
            continue
        role = _role_from_column(manual["column_name"])
        if not role:
            result.append({**dim, "label": manual["column_name"].strip() or dim["label"], "confidence": 1.0})
            continue
        result.append(
            {
                **dim,
                "role": role,
                "key": role,
                "label": _label_for(role, dim.get("level", 0), manual["column_name"].strip()),
                "confidence": 1.0,
                "visible": True,
            }
        )
    return result


def values_for_path(ancestors: list[dict[str, str]], dims: list[DetectedDimension]) -> dict[str, str]:
    path_names = [a.get("name") or "" for a in ancestors]
    leaf = path_names[-1] if path_names else ""
    return resolve_dimension_values({"path_names": path_names, "current_suite_name": leaf}, [], dims)


def infer_dimensions(rows: list[dict[str, str | None]]) -> list[DetectedDimension]:
    from_json: dict[str, set[str]] = {}
    for row in rows:
        raw = row.get("dimensions_json")
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed, dict):
            continue
        for key, value in parsed.items():
            if isinstance(value, str) and value.strip():
                from_json.setdefault(key, set()).add(value.strip())
    if from_json:
        out: list[DetectedDimension] = []
        for key, values in from_json.items():
            level = int(re.search(r"(\d+)$", key).group(1)) if re.search(r"(\d+)$", key) else 1
            if key.startswith("priority"):
                role: DimensionRole = "priority"
            elif key.startswith("front"):
                role = "front"
            elif key.startswith("process"):
                role = "process"
            elif key.startswith("subprocess"):
                role = "subprocess"
            else:
                role = "generic"
            out.append(
                {
                    "key": key,
                    "label": _label_for(role, level),
                    "level": level,
                    "values": sorted(values, key=lambda s: s.lower()),
                    "role": role,
                    "confidence": 0.2 if role == "generic" else 0.9,
                    "visible": True,
                }
            )
        return out
    values = sorted({(r.get("frente") or "").strip() for r in rows if (r.get("frente") or "").strip()}, key=str.lower)
    if not values:
        return []
    priority_ratio = sum(1 for v in values if PRIORITY_NAME.match(v)) / len(values)
    if priority_ratio >= 0.7:
        return [
            {
                "key": "priority",
                "label": "Prioridade",
                "level": 1,
                "values": values,
                "role": "priority",
                "confidence": 0.9,
                "visible": True,
            }
        ]
    return [
        {
            "key": "nivel-1",
            "label": "Nível 1",
            "level": 1,
            "values": values,
            "role": "generic",
            "confidence": 0.2,
            "visible": True,
        }
    ]
