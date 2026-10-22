import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, isConflict } from "../api";
import { LoadState } from "../components/LoadState";
import { PlanningAcompanhamentoSummary } from "../components/planning/PlanningAcompanhamentoSummary";
import { PlanningAcompanhamentoTable } from "../components/planning/PlanningAcompanhamentoTable";
import { PlanningFiltersBar } from "../components/planning/PlanningFiltersBar";
import { PlanningGridTable } from "../components/planning/PlanningGridTable";
import { PlanningPageHeader } from "../components/planning/PlanningPageHeader";
import { PlanningPagination, DEFAULT_PAGE_SIZE } from "../components/planning/PlanningPagination";
import { PlanningRevisoesPanel } from "../components/planning/PlanningRevisoesPanel";
import { PlanningTabs, type PlanningTabId } from "../components/planning/PlanningTabs";
import {
  atalhoDe,
  buildIdCols,
  compareByIdCol,
  idColFilterToken,
  daysInMonth,
  monthKeysInRange,
  onlyWeekdays,
  resolvePlanningDates,
  resolvePlanningRange,
  rowKey,
  soma,
  uniqueMonthKeys,
  type ColumnSort,
} from "../components/planning/planningUtils";
import { useReportChrome } from "../context/ReportChromeContext";
import type { PlanningItem, PlanningView } from "../types";

export function PlanejamentoPage() {
  const { dataVersion, home, patchPeriodo, refreshHome, planKey: chromePlanKey } = useReportChrome();
  const [periodoSaving, setPeriodoSaving] = useState(false);
  const [periodoError, setPeriodoError] = useState<string | null>(null);
  const [tab, setTab] = useState<PlanningTabId>("acompanhamento");
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [view, setView] = useState<PlanningView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [queryAcc, setQueryAcc] = useState("");
  const [pageAcc, setPageAcc] = useState(0);
  const [pageSizeAcc, setPageSizeAcc] = useState(DEFAULT_PAGE_SIZE);
  const [reason, setReason] = useState("");
  const [adoptSource, setAdoptSource] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [monthKey, setMonthKey] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [columnSort, setColumnSort] = useState<ColumnSort | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [periodDirty, setPeriodDirty] = useState(false);
  const [dirtyCells, setDirtyCells] = useState<Set<string>>(() => new Set());
  const pendingSaves = useRef(0);

  const setCellDirty = useCallback((cellKey: string, dirty: boolean) => {
    setDirtyCells((prev) => {
      if (dirty) {
        if (prev.has(cellKey)) return prev;
        const next = new Set(prev);
        next.add(cellKey);
        return next;
      }
      if (!prev.has(cellKey)) return prev;
      const next = new Set(prev);
      next.delete(cellKey);
      return next;
    });
  }, []);

  const planHasChanges = periodDirty || dirtyCells.size > 0;

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    api
      .planejamento(version, chromePlanKey || undefined)
      .then((data) => {
        if (!cancel) setView(data);
      })
      .catch((err: Error) => {
        if (!cancel) setError(err.message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [version, dataVersion, chromePlanKey]);

  const planningRange = useMemo(
    () => (view ? resolvePlanningRange(view.dates, view.items, home?.periodo ?? null) : null),
    [view, home?.periodo],
  );
  const allDates = useMemo(
    () => (view ? resolvePlanningDates(view.dates, view.items, home?.periodo ?? null) : []),
    [view, home?.periodo],
  );
  const monthKeys = useMemo(() => {
    if (planningRange) return monthKeysInRange(planningRange.start, planningRange.end);
    return uniqueMonthKeys(allDates);
  }, [planningRange, allDates]);

  useEffect(() => {
    if (monthKeys.length === 0) {
      setMonthKey("");
      return;
    }
    if (!monthKey || !monthKeys.includes(monthKey)) setMonthKey(monthKeys[0]);
  }, [monthKeys, monthKey]);

  const displayDates = useMemo(() => {
    const dates = !monthKey ? allDates : daysInMonth(monthKey);
    return onlyWeekdays(dates);
  }, [allDates, monthKey]);

  const dimensions = view?.dimensions ?? [];

  const items = view?.items ?? [];
  const planKey = view?.planning.planKey ?? home?.planKey ?? "";
  const idCols = useMemo(() => buildIdCols(dimensions, items, { planKey }), [dimensions, items, planKey]);
  const idColsAcc = useMemo(() => buildIdCols(dimensions, items, { startLeft: 0, planKey }), [dimensions, items, planKey]);
  const idColByKey = useMemo(() => new Map(idCols.map((col) => [col.key, col])), [idCols]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      for (const [colKey, allowed] of Object.entries(columnFilters)) {
        const col = idColByKey.get(colKey);
        if (!col || !allowed) continue;
        if (!allowed.has(idColFilterToken(item, col))) return false;
      }
      if (!needle) return true;
      const blob = [item.suiteName, atalhoDe(item.suiteName), ...Object.values(item.dimensions)].join(" ").toLowerCase();
      return blob.includes(needle);
    });
    const sortCol = columnSort ? idColByKey.get(columnSort.key) : undefined;
    if (!sortCol) {
      return [...filtered].sort((a, b) => a.suiteName.localeCompare(b.suiteName, "pt-BR"));
    }
    const dir = columnSort!.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compareByIdCol(a, b, sortCol) * dir);
  }, [items, query, columnFilters, columnSort, idColByKey]);

  const rowsAcc = useMemo(() => {
    const needle = queryAcc.trim().toLowerCase();
    const filtered = needle
      ? items.filter((item) => {
          const blob = [item.suiteName, atalhoDe(item.suiteName), ...Object.values(item.dimensions)].join(" ").toLowerCase();
          return blob.includes(needle);
        })
      : items;
    return [...filtered].sort((a, b) => a.suiteName.localeCompare(b.suiteName, "pt-BR"));
  }, [items, queryAcc]);

  useEffect(() => {
    setPage(0);
  }, [query, version, columnFilters, columnSort, monthKey, pageSize]);

  useEffect(() => {
    setPageAcc(0);
  }, [queryAcc, version, pageSizeAcc]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pageCountAcc = Math.max(1, Math.ceil(rowsAcc.length / pageSizeAcc));
  const safePageAcc = Math.min(pageAcc, pageCountAcc - 1);
  const pageRowsAcc = rowsAcc.slice(safePageAcc * pageSizeAcc, safePageAcc * pageSizeAcc + pageSizeAcc);
  const pageKeys = pageRows.map(rowKey);
  const allPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selected.has(key));

  const scopedPlanKey = view?.planning.planKey?.trim() || chromePlanKey || undefined;
  const summary = view?.summary;
  const canEdit = Boolean(view?.editable);
  const confirmed = view?.revision?.baselineOrigin === "motor";
  const baseline = summary ? (summary.sourceCount > 0 ? summary.sourceCount : summary.baselineCount) : 0;

  async function confirmar() {
    if (!view || busy) return;
    setBusy(true);
    setActionError(null);
    const first = view.revision?.baselineOrigin !== "motor";
    try {
      const next = await api.confirmarPlanejamento(
        {
          reason: reason.trim(),
          adoptSource: first ? true : adoptSource,
        },
        scopedPlanKey,
      );
      setView(next);
      setVersion(undefined);
      setReason("");
      setAdoptSource(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível gravar a revisão.");
      if (isConflict(err)) await reloadLatest();
    } finally {
      setBusy(false);
    }
  }

  async function reloadLatest() {
    const next = await api.planejamento(undefined, scopedPlanKey);
    setView(next);
    setVersion(undefined);
  }

  async function salvarPeriodo(inicio: string, fim: string, baseInicio: string, baseFim: string) {
    setPeriodoSaving(true);
    setPeriodoError(null);
    try {
      const periodo = await api.salvarPeriodoPlano(inicio, fim, { inicio: baseInicio, fim: baseFim });
      patchPeriodo(periodo);
      setPeriodoError(null);
      refreshHome(true);
      const next = await api.planejamento(version, scopedPlanKey);
      setView(next);
    } catch (err) {
      setPeriodoError(err instanceof Error ? err.message : "Não foi possível gravar o período.");
      if (isConflict(err)) {
        refreshHome(true);
        try {
          await reloadLatest();
        } catch {
          /* a mensagem de conflito já está visível */
        }
      }
    } finally {
      setPeriodoSaving(false);
    }
  }

  async function salvar(
    item: PlanningItem,
    field: "start" | "end" | "day" | "responsavel" | "prioridade",
    date: string,
    quantity?: number,
  ) {
    if (!view?.editable || busy) return;
    setActionError(null);
    pendingSaves.current += 1;
    setSaveBusy(true);
    try {
      const base =
        field === "day"
          ? { baseQuantity: item.allocations[date] ?? 0 }
          : field === "start"
            ? { baseDate: item.plannedStart ?? null }
            : field === "end"
              ? { baseDate: item.plannedEnd ?? null }
              : field === "responsavel"
                ? { baseValue: item.responsavel ?? null }
                : { baseValue: item.prioridade ?? null };
      const next = await api.salvarCelulaPlanejamento(
        {
          suiteId: item.suiteId,
          testPointId: item.testPointId,
          field,
          date: field === "responsavel" || field === "prioridade" ? undefined : date || undefined,
          quantity,
          value: field === "responsavel" || field === "prioridade" ? date : undefined,
          ...base,
        },
        scopedPlanKey,
      );
      setView(next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível gravar a célula.");
      if (isConflict(err)) {
        try {
          await reloadLatest();
        } catch {
          /* a mensagem de conflito já está visível */
        }
      }
    } finally {
      pendingSaves.current -= 1;
      if (pendingSaves.current <= 0) {
        pendingSaves.current = 0;
        setSaveBusy(false);
      }
    }
  }

  function salvarMudancasPlanejar() {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) pageKeys.forEach((key) => next.delete(key));
      else pageKeys.forEach((key) => next.add(key));
      return next;
    });
  }

  function toggleOne(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <LoadState loading={loading && !view} error={error && !view ? error : null}>
      {view && summary && (
        <div className="plan-page module-page">
          <PlanningPageHeader
            periodoInicio={home?.periodo?.inicio ?? ""}
            periodoFim={home?.periodo?.fim ?? ""}
            onSavePeriodo={salvarPeriodo}
            onClearPeriodoError={() => setPeriodoError(null)}
            periodoSaving={periodoSaving}
            periodoError={periodoError}
            onPeriodDirtyChange={setPeriodDirty}
          />
          <PlanningTabs active={tab} onChange={setTab} />

          {tab === "acompanhamento" && (
            <div className="plan-tab-panel">
              <div className="plan-acc-toolbar">
                <input
                  className="plan-filter-search"
                  type="search"
                  placeholder="Buscar processo, suite ou atalho..."
                  value={queryAcc}
                  onChange={(event) => setQueryAcc(event.target.value)}
                  aria-label="Buscar no acompanhamento"
                />
              </div>

              <PlanningAcompanhamentoSummary
                baseline={baseline}
                finalizados={summary.finalizedCount}
                falhos={soma(items, (item) => item.failed)}
                naoClassificados={summary.unclassifiedCount}
                inconsistentes={summary.inconsistentCount}
              />

              <PlanningAcompanhamentoTable
                idCols={idColsAcc}
                pageRows={pageRowsAcc}
                allRows={rowsAcc}
                canEdit={canEdit}
                onSave={salvar}
              />

              <PlanningPagination
                page={safePageAcc}
                pageCount={pageCountAcc}
                pageSize={pageSizeAcc}
                totalRows={rowsAcc.length}
                pageRows={pageRowsAcc.length}
                onPageChange={setPageAcc}
                onPageSizeChange={setPageSizeAcc}
              />
            </div>
          )}

          {tab === "revisoes" && (
            <PlanningRevisoesPanel
              view={view}
              version={version}
              onVersionChange={setVersion}
              reason={reason}
              onReasonChange={setReason}
              adoptSource={adoptSource}
              onAdoptSourceChange={setAdoptSource}
              busy={busy}
              confirmed={confirmed}
              actionError={actionError}
              onSubmit={() => void confirmar()}
            />
          )}

          {tab === "planejar" && (
            <div className="plan-tab-panel">
              <PlanningFiltersBar
                monthKey={monthKey}
                monthKeys={monthKeys}
                onMonthChange={setMonthKey}
                query={query}
                onQueryChange={setQuery}
                onSaveChanges={salvarMudancasPlanejar}
                saving={saveBusy || periodoSaving}
                hasChanges={planHasChanges}
              />

              {actionError && <p className="plan-error">{actionError}</p>}

              <PlanningGridTable
                idCols={idCols}
                dates={displayDates}
                pageRows={pageRows}
                allRows={rows}
                sourceItems={items}
                columnFilters={columnFilters}
                columnSort={columnSort}
                onColumnFilterApply={(colKey, selected) => {
                  setColumnFilters((current) => {
                    const next = { ...current };
                    if (selected == null) delete next[colKey];
                    else next[colKey] = selected;
                    return next;
                  });
                }}
                onColumnFilterClear={(colKey) => {
                  setColumnFilters((current) => {
                    const next = { ...current };
                    delete next[colKey];
                    return next;
                  });
                }}
                onColumnSort={(colKey, direction) => setColumnSort({ key: colKey, direction })}
                canEdit={canEdit}
                selected={selected}
                allPageSelected={allPageSelected}
                onToggleAll={toggleAll}
                onToggleOne={toggleOne}
                onSave={salvar}
                onCellDirtyChange={setCellDirty}
              />

              <PlanningPagination
                page={safePage}
                pageCount={pageCount}
                pageSize={pageSize}
                totalRows={rows.length}
                pageRows={pageRows.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </div>
      )}
    </LoadState>
  );
}
