"""Persistence contracts (mirrors backend/src/persistence/contracts.ts)."""

from __future__ import annotations

from typing import Protocol, TypeVar, TypedDict, runtime_checkable

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
    plan_key: str
    suite_id: int | None
    test_point_id: int | None
    suite_name: str | None
    field: str
    alloc_date: str | None
    old_value: str | None
    new_value: str | None
    actor: str | None


class AzureSnapshot(TypedDict):
    execucoes: list[dict[str, object]]
    falhas: list[dict[str, object]]
    meta: dict[str, str]


class PageParams(TypedDict, total=False):
    plan_key: str
    limit: int
    offset: int
    q: str


class PageResult(TypedDict, total=False):
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
    plan_key: str
    created_at: str
    version: int
    reason: str
    baseline_origin: str
    scope_snapshot: int
    scope: list[PlanningScopeWrite]
    items: list[PlanningItemWrite]
    base_revision_id: int | None
    base_fingerprint: str | None


@runtime_checkable
class MetaStore(Protocol):
    def get(self, key: str) -> str | None: ...
    def get_many(self, keys: list[str]) -> dict[str, str | None]: ...
    def set(self, key: str, value: str) -> None: ...
    def set_many(self, entries: dict[str, str]) -> None: ...
    def replace_header_if(
        self,
        expected_title: str,
        expected_subtitle: str,
        title: str,
        subtitle: str,
        default_title: str,
        default_subtitle: str,
    ) -> None: ...
    def replace_period_if(
        self, expected_inicio: str, expected_fim: str, inicio: str, fim: str
    ) -> None: ...


@runtime_checkable
class AzureSnapshotStore(Protocol):
    def replace_snapshot(self, input: AzureSnapshot) -> None: ...
    def list_execucoes(self, plan_key: str) -> list[ExecucaoRow]: ...
    def list_falhas(self, plan_key: str) -> list[FalhaRow]: ...
    def query_execucoes(self, params: PageParams) -> PageResult[ExecucaoRow]: ...
    def query_falhas(self, params: PageParams) -> PageResult[FalhaRow]: ...


@runtime_checkable
class LegacyPlanStore(Protocol):
    def list_base(self) -> list[LegacyPlanRow]: ...


@runtime_checkable
class PlanningStore(Protocol):
    def latest_revision(self, plan_key: str) -> PlanningRevisionRecord | None: ...
    def revision_by_version(self, plan_key: str, version: int) -> PlanningRevisionRecord | None: ...
    def list_revisions(self, plan_key: str) -> list[dict[str, object]]: ...
    def load_scope(self, revision_id: int) -> list[PlanningScopeWrite]: ...
    def load_schedule(self, revision_id: int) -> list[PlanningScheduleItem]: ...
    def commit_revision(self, input: CommitRevisionInput) -> int: ...
    def save_cell(self, input: dict[str, object]) -> None: ...
    def save_cells(self, inputs: list[dict[str, object]]) -> None: ...
    def append_change_log(self, input: PlanningChangeLogWrite) -> None: ...
    def list_change_log(self, plan_key: str, limit: int = 300) -> list[PlanningChangeLogEntry]: ...
    def change_log_supported(self) -> bool: ...


class PersistenceStores(TypedDict):
    meta: MetaStore
    azure_snapshot: AzureSnapshotStore
    legacy_plan: LegacyPlanStore
    planning: PlanningStore
