import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, isConflict, type ClearPlanningPreview, type DistributionPreview } from "../api";
import { LoadState } from "../components/LoadState";
import { PlanningAcompanhamentoSummary } from "../components/planning/PlanningAcompanhamentoSummary";
import { PlanningAcompanhamentoTable } from "../components/planning/PlanningAcompanhamentoTable";
import { PlanningBatchDateModal } from "../components/planning/PlanningBatchDateModal";
import { PlanningClearModal } from "../components/planning/PlanningClearModal";
import { PlanningDistributeModal, type DistributeInput } from "../components/planning/PlanningDistributeModal";
import { PlanningChangeHistoryPanel } from "../components/planning/PlanningChangeHistoryPanel";
import { PlanningWeekendOffModal } from "../components/planning/PlanningWeekendOffModal";
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
  isPlanningOffDay,
  monthKeysInRange,
  resolvePlanningDates,
  resolvePlanningRange,
  rowKey,
  shareUnchangedItems,
  soma,
  uniqueMonthKeys,
  type ColumnSort,
} from "../components/planning/planningUtils";
import { useReportChrome } from "../context/ReportChromeContext";
import type { PlanningItem, PlanningView } from "../types";

export function PlanejamentoPage() {
  const { dataVersion, home, planKey: chromePlanKey, canWrite } = useReportChrome();
  const [tab, setTab] = useState<PlanningTabId>("acompanhamento");
  const [planejarSubview, setPlanejarSubview] = useState<"grid" | "history">("grid");
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [view, setViewRaw] = useState<PlanningView | null>(null);
  const setView = useCallback(
    (next: PlanningView | null) => setViewRaw((prev) => shareUnchangedItems(prev, next)),
    [],
  );
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
  const [dirtyCells, setDirtyCells] = useState<Set<string>>(() => new Set());
  const [enabledWeekendDays, setEnabledWeekendDays] = useState<Set<string>>(() => new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearPreview, setClearPreview] = useState<ClearPlanningPreview | null>(null);
  const [weekendOff, setWeekendOff] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const pendingSaves = useRef(0);
  const viewStamp = useRef(0);
  const skipOffDaySync = useRef(false);
  const [distributeNote, setDistributeNote] = useState<string | null>(null);

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

  const planHasChanges = dirtyCells.size > 0;

  useEffect(() => {
    const stamp = viewStamp.current;
    let cancel = false;
    setLoading(true);
    setError(null);
    api
      .planejamento(version, chromePlanKey || undefined)
      .then((data) => {
        if (!cancel && stamp === viewStamp.current) setView(data);
      })
      .catch((err: Error) => {
        if (!cancel) {
          setError(err.message);
          setView(null);
        }
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
    if (!monthKey) return allDates;
    const allowed = new Set(allDates);
    return daysInMonth(monthKey).filter((date) => allowed.has(date));
  }, [allDates, monthKey]);

  const periodBounds = useMemo(() => {
    const inicio = home?.periodo?.inicio?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const fim = home?.periodo?.fim?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (inicio && fim && inicio <= fim) return { min: inicio, max: fim };
    if (planningRange) return { min: planningRange.start, max: planningRange.end };
    return null;
  }, [home?.periodo, planningRange]);

  useEffect(() => {
    if (!view) return;
    if (skipOffDaySync.current) {
      skipOffDaySync.current = false;
      return;
    }
    setEnabledWeekendDays((prev) => {
      const next = new Set(prev);
      for (const item of view.items) {
        for (const [date, qty] of Object.entries(item.allocations)) {
          if (qty > 0 && isPlanningOffDay(date)) next.add(date);
        }
      }
      return next;
    });
  }, [view?.items, view?.planning.planKey, view?.revision?.version, version, dataVersion]);

  const enableWeekendDay = useCallback((date: string) => {
    setEnabledWeekendDays((current) => {
      if (current.has(date)) return current;
      const next = new Set(current);
      next.add(date);
      return next;
    });
  }, []);

  const disableWeekendDay = useCallback((date: string) => {
    setEnabledWeekendDays((current) => {
      if (!current.has(date)) return current;
      const next = new Set(current);
      next.delete(date);
      return next;
    });
  }, []);

  const requestWeekendOff = useCallback(
    (date: string) => {
      setModalError(null);
      const affected = (view?.items ?? []).filter((item) => (item.allocations[date] ?? 0) > 0);
      if (affected.length === 0) {
        disableWeekendDay(date);
        return;
      }
      setWeekendOff(date);
    },
    [disableWeekendDay, view?.items],
  );

  const activeWeekendDays = useMemo(
    () => [...enabledWeekendDays].sort((a, b) => a.localeCompare(b)),
    [enabledWeekendDays],
  );

  const dimensions = view?.dimensions ?? [];
  const items = view?.items ?? [];
  const planKey = view?.planning.planKey ?? home?.planKey ?? "";
  const idCols = useMemo(
    () => buildIdCols(dimensions, items, { planKey, compact: true }),
    [dimensions, items, planKey],
  );
  const idColsAcc = useMemo(
    () => buildIdCols(dimensions, items, { startLeft: 0, planKey, compact: true }),
    [dimensions, items, planKey],
  );
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
  const selectedItems = useMemo(() => items.filter((item) => selected.has(rowKey(item))), [items, selected]);
  const allPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selected.has(key));

  const scopedPlanKey = view?.planning.planKey?.trim() || chromePlanKey || undefined;
  const summary = view?.summary;
  const canEdit = version == null && canWrite;
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

  async function salvar(
    item: PlanningItem,
    field: "start" | "end" | "day" | "responsavel" | "prioridade",
    date: string,
    quantity?: number,
  ) {
    if (!view || busy || version != null) return;
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
      if (field === "day" && isPlanningOffDay(date)) enableWeekendDay(date);
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

  async function salvarDatas(start: string, end: string) {
    if (!view || busy || !scopedPlanKey || selectedItems.length === 0) return;
    const changes = selectedItems.flatMap((item) => {
      const rows: {
        suiteId: number | null;
        testPointId: number | null;
        field: "start" | "end";
        date: string;
        baseDate: string | null;
      }[] = [];
      if (start) {
        rows.push({
          suiteId: item.suiteId,
          testPointId: item.testPointId ?? null,
          field: "start",
          date: start,
          baseDate: item.plannedStart,
        });
      }
      if (end) {
        rows.push({
          suiteId: item.suiteId,
          testPointId: item.testPointId ?? null,
          field: "end",
          date: end,
          baseDate: item.plannedEnd,
        });
      }
      return rows;
    });
    if (changes.length === 0) return;
    setBusy(true);
    setModalError(null);
    try {
      const next = await api.salvarLotePlanejamento({ changes }, scopedPlanKey);
      setView(next);
      setBatchOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Não foi possível gravar as datas.");
      if (isConflict(err)) {
        try {
          await reloadLatest();
        } catch {
          /* a mensagem de conflito já está visível */
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function preverDistribuicao(input: DistributeInput): Promise<DistributionPreview> {
    if (!view || busy || !scopedPlanKey) throw new Error("Não foi possível calcular a prévia.");
    setBusy(true);
    setModalError(null);
    try {
      const next = await api.distribuirPlanejamento({ ...input, assignment: "manter", preview: true }, scopedPlanKey);
      if (!("preview" in next) || next.preview !== true) throw new Error("A prévia não foi calculada.");
      return next;
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Não foi possível calcular a prévia.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function salvarDistribuicao(input: DistributeInput) {
    if (!view || busy || !scopedPlanKey) return;
    const stamp = ++viewStamp.current;
    setBusy(true);
    setModalError(null);
    setDistributeNote(null);
    try {
      const next = await api.distribuirPlanejamento({ ...input, assignment: "manter" }, scopedPlanKey);
      if (!("items" in next)) throw new Error("A distribuição não gravou a grade.");
      if (stamp !== viewStamp.current) return;
      setView(next);
      setEnabledWeekendDays((prev) => {
        const merged = new Set(prev);
        for (const day of input.enabledWeekendDays) {
          if (isPlanningOffDay(day)) merged.add(day);
        }
        for (const item of next.items) {
          for (const [date, qty] of Object.entries(item.allocations)) {
            if (qty > 0 && isPlanningOffDay(date)) merged.add(date);
          }
        }
        return merged;
      });
      setDirtyCells(new Set());
      setDistributeOpen(false);
      setDistributeNote("Distribuição gravada.");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Não foi possível distribuir.");
      if (isConflict(err)) {
        try {
          await reloadLatest();
        } catch {
          /* a mensagem de conflito já está visível */
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function abrirLimpeza() {
    if (!view || busy || !scopedPlanKey) return;
    setModalError(null);
    setDistributeNote(null);
    setClearPreview(null);
    setClearOpen(true);
    setBusy(true);
    try {
      const next = await api.limparPlanejamento({ preview: true }, scopedPlanKey);
      if (!("action" in next) || next.action !== "limpar") throw new Error("A prévia não foi calculada.");
      setClearPreview(next);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Não foi possível calcular a limpeza.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmarLimpeza() {
    if (!view || busy || !scopedPlanKey || !clearPreview || clearPreview.unchanged) return;
    const stamp = ++viewStamp.current;
    setBusy(true);
    setModalError(null);
    try {
      const next = await api.limparPlanejamento({}, scopedPlanKey);
      if (!("items" in next)) throw new Error("A limpeza não gravou a grade.");
      if (stamp !== viewStamp.current) return;
      skipOffDaySync.current = true;
      setEnabledWeekendDays(new Set());
      setView(next);
      setDirtyCells(new Set());
      setClearOpen(false);
      setClearPreview(null);
      setDistributeNote("Planejamento limpo. Só os finalizados permaneceram na grade.");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Não foi possível limpar o planejamento.");
      if (isConflict(err)) {
        try {
          await reloadLatest();
        } catch {
          /* a mensagem de conflito já está visível */
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmarWeekendOff() {
    if (!weekendOff || busy) return;
    const affected = items.filter((item) => (item.allocations[weekendOff] ?? 0) > 0);
    if (affected.length === 0) {
      disableWeekendDay(weekendOff);
      setWeekendOff(null);
      setModalError(null);
      return;
    }
    if (!scopedPlanKey) return;
    setBusy(true);
    setModalError(null);
    try {
      const next = await api.salvarLotePlanejamento(
        {
          changes: affected.map((item) => ({
            suiteId: item.suiteId,
            testPointId: item.testPointId ?? null,
            field: "day" as const,
            date: weekendOff,
            quantity: 0,
            baseQuantity: item.allocations[weekendOff] ?? 0,
          })),
        },
        scopedPlanKey,
      );
      setView(next);
      disableWeekendDay(weekendOff);
      setWeekendOff(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Não foi possível desativar o dia.");
      if (isConflict(err)) {
        try {
          await reloadLatest();
        } catch {
          /* a mensagem de conflito já está visível */
        }
      }
    } finally {
      setBusy(false);
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

  function handleTabChange(next: PlanningTabId) {
    setTab(next);
    if (next !== "revisoes") setVersion(undefined);
    if (next !== "planejar") setPlanejarSubview("grid");
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
    <div className="plan-page module-page">
      <PlanningPageHeader />
      <LoadState loading={loading && !view} error={error}>
        {view && summary && (
          <>
          <PlanningTabs active={tab} onChange={handleTabChange} />

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

          {tab === "planejar" && planejarSubview === "history" && scopedPlanKey && (
            <PlanningChangeHistoryPanel planKey={scopedPlanKey} onBack={() => setPlanejarSubview("grid")} />
          )}

          {tab === "planejar" && planejarSubview === "grid" && (
            <div className="plan-tab-panel">
              <PlanningFiltersBar
                monthKey={monthKey}
                monthKeys={monthKeys}
                onMonthChange={setMonthKey}
                query={query}
                onQueryChange={setQuery}
                onSaveChanges={salvarMudancasPlanejar}
                onOpenHistory={() => setPlanejarSubview("history")}
                onOpenDistribute={canEdit ? () => { setModalError(null); setDistributeNote(null); setDistributeOpen(true); } : undefined}
                onOpenClear={canEdit ? () => { void abrirLimpeza(); } : undefined}
                distributeBlocked={planHasChanges}
                saving={saveBusy}
                hasChanges={planHasChanges}
                activeWeekendDays={activeWeekendDays}
                weekendOffDisabled={!canEdit || saveBusy || busy}
                onWeekendOffRequest={canEdit ? requestWeekendOff : undefined}
              />

              {actionError && <p className="plan-error">{actionError}</p>}
              {distributeNote && <p className="plan-note">{distributeNote}</p>}

              <PlanningGridTable
                idCols={idCols}
                dates={displayDates}
                periodBounds={periodBounds}
                enabledWeekendDays={enabledWeekendDays}
                onEnableWeekendDay={enableWeekendDay}
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
                onOpenBatchDate={canEdit && selectedItems.length > 0 ? () => { setModalError(null); setBatchOpen(true); } : undefined}
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
          {clearOpen && (
            <PlanningClearModal
              preview={clearPreview}
              busy={busy}
              error={modalError}
              onCancel={() => { if (!busy) { setClearOpen(false); setClearPreview(null); setModalError(null); } }}
              onConfirm={() => void confirmarLimpeza()}
            />
          )}
          {distributeOpen && (
            <PlanningDistributeModal
              items={items}
              periodBounds={periodBounds}
              enabledWeekendDays={[...enabledWeekendDays]}
              busy={busy}
              error={modalError}
              onCancel={() => { if (!busy) { setDistributeOpen(false); setModalError(null); } }}
              onPreview={preverDistribuicao}
              onSave={(input) => void salvarDistribuicao(input)}
            />
          )}
          {batchOpen && (
            <PlanningBatchDateModal
              planKey={planKey}
              items={selectedItems}
              dimensions={dimensions}
              periodBounds={periodBounds}
              busy={busy}
              error={modalError}
              onCancel={() => { if (!busy) { setBatchOpen(false); setModalError(null); } }}
              onSave={(start, end) => void salvarDatas(start, end)}
            />
          )}
          {weekendOff && (
            <PlanningWeekendOffModal
              date={weekendOff}
              planKey={planKey}
              items={items}
              dimensions={dimensions}
              busy={busy}
              error={modalError}
              onCancel={() => { if (!busy) { setWeekendOff(null); setModalError(null); } }}
              onConfirm={() => void confirmarWeekendOff()}
            />
          )}
          </>
        )}
      </LoadState>
    </div>
  );
}
