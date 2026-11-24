"""Persistence contracts."""

from __future__ import annotations

from typing import Any, Generic, NotRequired, Protocol, Required, TypeVar, TypedDict, runtime_checkable

from fourqa.types import ExecucaoRow, FalhaRow

T = TypeVar("T")


class PlanningChangeLogEntry(TypedDict):
    id: int
    created_at: str
    actor: str | None
    suite_id: int | None
    test_point_id: int | None
    suite_name: str | None
    field: str
    alloc_date: str | None
    old_value: str | None
    new_value: str | None


class PlanningChangeLogWrite(TypedDict, total=False):
    plan_key: Required[str]
    suite_id: int | None
    test_point_id: int | None
    suite_name: str | None
    field: Required[str]
    alloc_date: str | None
    old_value: str | None
    new_value: str | None
    actor: str | None


class AzureSnapshot(TypedDict):
    execucoes: list[dict[str, Any]]
    falhas: list[dict[str, Any]]
    meta: dict[str, str]
    plan_keys: NotRequired[list[str]]


class PageParams(TypedDict):
    plan_key: str
    limit: int
    offset: int
    q: str


class PageResult(TypedDict, Generic[T], total=False):
    total: int
    limit: int
    offset: int
    rows: list[T]


class LegacyPlanRow(TypedDict, total=False):
    row_num: int
    qa: str | None
    prioridades: str | None
    frente: str | None
    processo: str | None
    data_inicio: str | None
    data_fim: str | None
    replanejamento: float
    qtd_cts_plan: float | None
    cts_plan_dia: float | None
    cts_cancelados: float


class PlanningRevisionRecord(TypedDict):
    id: int
    version: int
    created_at: str
    reason: str
    baseline_origin: str
    scope_snapshot: int


class PlanningScopeWrite(TypedDict, total=False):
    plan_id: int | None
    suite_id: int | None
    test_point_id: int | None
    test_case_id: int | None
    label: str | None


class PlanningAllocationWrite(TypedDict):
    date: str
    quantity: float


class PlanningItemWrite(TypedDict, total=False):
    suite_id: int | None
    suite_name: str | None
    test_point_id: int | None
    test_case_id: int | None
    planned_start: str | None
    planned_end: str | None
    responsavel: str | None
    prioridade: str | None
    baseline_quantity: float | None
    allocations: list[PlanningAllocationWrite]


class PlanningScheduleItem(PlanningItemWrite):
    id: int


class CommitRevisionInput(TypedDict, total=False):
    plan_key: Required[str]
    created_at: Required[str]
    version: Required[int]
    reason: Required[str]
    baseline_origin: Required[str]
    scope_snapshot: Required[int]
    scope: Required[list[PlanningScopeWrite]]
    items: Required[list[PlanningItemWrite]]
    base_revision_id: int | None
    base_fingerprint: str | None


@runtime_checkable
class MetaStore(Protocol):
    async def get(self, key: str) -> str | None: ...
    async def get_many(self, keys: list[str]) -> dict[str, str | None]: ...
    async def set(self, key: str, value: str) -> None: ...
    async def set_many(self, entries: dict[str, str]) -> None: ...
    async def replace_header_if(
        self,
        expected_title: str,
        expected_subtitle: str,
        title: str,
        subtitle: str,
        default_title: str,
        default_subtitle: str,
    ) -> None: ...
    async def replace_period_if(
        self, expected_inicio: str, expected_fim: str, inicio: str, fim: str
    ) -> None: ...


@runtime_checkable
class AzureSnapshotStore(Protocol):
    async def replace_snapshot(self, input: AzureSnapshot) -> None: ...
    async def list_execucoes(self, plan_key: str) -> list[ExecucaoRow]: ...
    async def list_falhas(self, plan_key: str) -> list[FalhaRow]: ...
    async def query_execucoes(self, params: PageParams) -> PageResult[ExecucaoRow]: ...
    async def query_falhas(self, params: PageParams) -> PageResult[FalhaRow]: ...


@runtime_checkable
class LegacyPlanStore(Protocol):
    async def list_base(self) -> list[LegacyPlanRow]: ...


@runtime_checkable
class PlanningStore(Protocol):
    async def latest_revision(self, plan_key: str) -> PlanningRevisionRecord | None: ...
    async def revision_by_version(self, plan_key: str, version: int) -> PlanningRevisionRecord | None: ...
    async def list_revisions(self, plan_key: str) -> list[dict[str, Any]]: ...
    async def load_scope(self, revision_id: int) -> list[PlanningScopeWrite]: ...
    async def load_schedule(self, revision_id: int) -> list[PlanningScheduleItem]: ...
    async def commit_revision(self, input: CommitRevisionInput) -> int: ...
    async def save_cell(self, input: dict[str, Any]) -> None: ...
    async def save_cells(self, inputs: list[dict[str, Any]]) -> None: ...
    async def append_change_log(self, input: PlanningChangeLogWrite) -> None: ...
    async def list_change_log(self, plan_key: str, limit: int = 300) -> list[PlanningChangeLogEntry]: ...
    async def change_log_supported(self) -> bool: ...


class PersistenceStores(TypedDict):
    meta: MetaStore
    azure_snapshot: AzureSnapshotStore
    legacy_plan: LegacyPlanStore
    planning: PlanningStore
