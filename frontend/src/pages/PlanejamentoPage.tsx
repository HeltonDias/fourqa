import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
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
  const { dataVersion, home, handleAtualizar, syncing, homeLoading, patchPeriodo } = useReportChrome();
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

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    api
      .planejamento(version)
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
  }, [version, dataVersion]);

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
    if (!monthKey) return allDates;
    return daysInMonth(monthKey);
  }, [allDates, monthKey]);

  const dimensions = view?.dimensions ?? [];

  const items = view?.items ?? [];
  const idCols = useMemo(() => buildIdCols(dimensions, items), [dimensions, items]);
  const idColsAcc = useMemo(() => buildIdCols(dimensions, items, { startLeft: 0 }), [dimensions, items]);
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

  const summary = view?.summary;
  const canEdit = Boolean(view?.editable);
  const confirmed = view?.revision?.baselineOrigin === "motor";
  const baseline = summary ? (summary.sourceCount > 0 ? summary.sourceCount : summary.baselineCount) : 0;

  const ultimaAtualizacao = home?.ultimaImportacao ?? home?.atualizadoEm ?? view?.revision?.createdAt ?? null;

  async function confirmar() {
    if (!view || busy) return;
    setBusy(true);
    setActionError(null);
    const first = view.revision?.baselineOrigin !== "motor";
    try {
      const next = await api.confirmarPlanejamento({
        reason: reason.trim(),
        adoptSource: first ? true : adoptSource,
      });
      setView(next);
      setVersion(undefined);
      setReason("");
      setAdoptSource(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível gravar a revisão.");
    } finally {
      setBusy(false);
    }
  }

  async function salvarPeriodo(inicio: string, fim: string) {
    setPeriodoSaving(true);
    setPeriodoError(null);
    try {
      const periodo = await api.salvarPeriodoPlano(inicio, fim);
      patchPeriodo(periodo);
      const next = await api.planejamento(version);
      setView(next);
    } catch (err) {
      setPeriodoError(err instanceof Error ? err.message : "Não foi possível gravar o período.");
    } finally {
      setPeriodoSaving(false);
    }
  }

  async function salvar(item: PlanningItem, field: "start" | "end" | "day", date: string, quantity?: number) {
    if (!view?.editable || busy) return;
    setActionError(null);
    try {
      const next = await api.salvarCelulaPlanejamento({
        suiteId: item.suiteId,
        field,
        date: date || undefined,
        quantity,
      });
      setView(next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível gravar a célula.");
    }
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
        <div className="plan-page">
          <PlanningPageHeader
            periodoInicio={home?.periodo?.inicio ?? ""}
            periodoFim={home?.periodo?.fim ?? ""}
            ultimaAtualizacao={ultimaAtualizacao}
            onSavePeriodo={salvarPeriodo}
            periodoSaving={periodoSaving}
            periodoError={periodoError}
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
                <button
                  type="button"
                  className="plan-filter-primary"
                  onClick={handleAtualizar}
                  disabled={syncing || homeLoading}
                >
                  {syncing || homeLoading ? "Atualizando…" : "Atualizar"}
                </button>
              </div>

              <PlanningAcompanhamentoSummary
                baseline={baseline}
                finalizados={summary.finalizedCount}
                falhos={soma(items, (item) => item.failed)}
                naoClassificados={summary.unclassifiedCount}
                inconsistentes={summary.inconsistentCount}
              />

              <PlanningAcompanhamentoTable idCols={idColsAcc} pageRows={pageRowsAcc} allRows={rowsAcc} />

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
                onRefresh={handleAtualizar}
                refreshing={syncing || homeLoading}
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
