"""Azure/sync config."""

from __future__ import annotations

import os
import re
from pathlib import Path

_root = Path(__file__).resolve().parents[4]


def _read_env_file() -> dict[str, str]:
    out: dict[str, str] = {}
    file = _root / ".env"
    if not file.is_file():
        return out
    for line in file.read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith("#"):
            continue
        m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if not m:
            continue
        value = m.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[m.group(1)] = value
    return out


def _file_env() -> dict[str, str]:
    if os.environ.get("VERCEL") == "1":
        return {}
    return _read_env_file()


def env_value(name: str) -> str:
    if name in os.environ:
        return os.environ[name].strip()
    return (_file_env().get(name) or "").strip()


class SyncConfigError(Exception):
    def __init__(self, message: str, missing: list[str] | None = None) -> None:
        super().__init__(message)
        self.name = "SyncConfigError"
        self.missing = missing or []


def _json_env(name: str) -> object | None:
    raw = env_value(name)
    if not raw:
        return None
    import json

    try:
        return json.loads(raw)
    except json.JSONDecodeError as err:
        raise SyncConfigError(f"A variável {name} do .env não é um JSON válido (mantenha em uma única linha).") from err


def _yes(value: object) -> bool:
    from fourqa.azure.util import normalize

    return normalize(value) in ("sim", "s", "yes", "true", "1")


def read_sync_settings() -> dict[str, object]:
    warnings: list[str] = []
    plans_raw = _json_env("SYNC_TEST_PLANS")
    if plans_raw is None:
        plans_raw = []
    if not isinstance(plans_raw, list):
        warnings.append("SYNC_TEST_PLANS inválido.")
        plans_raw = []
    plans = []
    for plan in plans_raw:
        if not isinstance(plan, dict):
            continue
        plans.append(
            {
                "planKey": str(plan.get("PlanKey") or "").strip(),
                "planId": int(plan.get("PlanId") or 0) or 0,
                "planName": str(plan.get("PlanName") or "").strip(),
                "suiteNameFilter": str(plan.get("SuiteNameFilter") or "").strip(),
                "maxSuites": int(plan.get("MaxSuites") or 0) or 0,
                "load": _yes(plan.get("Carregar")) if plan.get("Carregar") is not None else True,
            }
        )
    plans = [p for p in plans if p["planKey"] or p["planId"] > 0]
    return {
        "organization": env_value("AZURE_DEVOPS_ORG"),
        "project": env_value("AZURE_DEVOPS_PROJECT"),
        "apiVersion": env_value("AZURE_DEVOPS_API_VERSION") or "7.1",
        "credentialConfigured": bool(env_value("AZURE_DEVOPS_PAT")),
        "kpiPlanKey": env_value("SYNC_KPI_PLAN_KEY") or env_value("KPI_PLAN_KEY") or (plans[0]["planKey"] if plans else ""),
        "plans": plans,
        "hierarchy": [],
        "responsibilities": [],
        "executionFields": [],
        "failureFields": [],
        "warning": "; ".join(warnings) if warnings else None,
    }


def load_sync_config(override: dict[str, object] | None = None) -> dict[str, object]:
    missing = [n for n in ("AZURE_DEVOPS_ORG", "AZURE_DEVOPS_PROJECT", "AZURE_DEVOPS_PAT") if not env_value(n)]
    if missing:
        raise SyncConfigError(
            f"Configuração do Azure DevOps incompleta: preencha {', '.join(missing)} no arquivo .env (veja .env.example) e tente novamente.",
            missing,
        )
    plans_raw = _json_env("SYNC_TEST_PLANS") or []
    plans = []
    for p in plans_raw if isinstance(plans_raw, list) else []:
        if not isinstance(p, dict):
            continue
        carregar = _yes(p.get("Carregar")) if p.get("Carregar") is not None else True
        plan_id = int(p.get("PlanId") or 0)
        plan_key = str(p.get("PlanKey") or "").strip()
        if carregar and plan_id > 0 and plan_key:
            plans.append(
                {
                    "planKey": plan_key,
                    "planId": plan_id,
                    "planName": str(p.get("PlanName") or ""),
                    "suiteNameFilter": str(p.get("SuiteNameFilter") or ""),
                    "maxSuites": int(p.get("MaxSuites") or 0) or 0,
                }
            )
    if not plans:
        raise SyncConfigError('Nenhum Test Plan ativo em SYNC_TEST_PLANS (Carregar = "SIM").')
    hierarchy = override.get("hierarchy") if override else None
    if hierarchy is None:
        hierarchy = []
    kpi = (override or {}).get("kpiPlanKey") or env_value("SYNC_KPI_PLAN_KEY") or plans[0]["planKey"]
    return {
        "azure": {
            "organization": env_value("AZURE_DEVOPS_ORG"),
            "project": env_value("AZURE_DEVOPS_PROJECT"),
            "apiVersion": env_value("AZURE_DEVOPS_API_VERSION") or "7.1",
            "pat": env_value("AZURE_DEVOPS_PAT"),
        },
        "plans": plans,
        "hierarchy": hierarchy,
        "responsibilities": (override or {}).get("responsibilities") or {},
        "validFronts": [s.strip() for s in env_value("SYNC_FRENTES_VALIDAS").split(",") if s.strip()],
        "kpiPlanKey": str(kpi).strip(),
    }
