import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanningItem } from "../../types";
import { api, type DistributionPreview } from "../../api";
import { useReportChrome } from "../../context/ReportChromeContext";
import { PlanningDistributeWeekendCalendar } from "./PlanningDistributeWeekendCalendar";
import { diaCheio, hojeIso, isPlanningOffDay, monthKeysInRange } from "./planningUtils";

const MODES = [
  { id: "completo", label: "Planejamento completo", hint: "Distribui o escopo no período inteiro, inclusive datas passadas." },
  { id: "saldo", label: "Replanejamento do saldo", hint: "Distribui o pendente a partir do corte, sem ampliar o fim." },
] as const;

const STRATEGIES = [
  { id: "montanha", label: "Montanha", hint: "Sobe até o meio do período e desce." },
  { id: "decrescente", label: "Decrescente", hint: "Mais no começo, menos no fim." },
  { id: "crescente", label: "Crescente", hint: "Pouco no começo, mais perto do fim." },
  { id: "uniforme", label: "Uniforme", hint: "Quase a mesma quantidade em cada dia habilitado." },
] as const;

export type DistributionStrategyId = (typeof STRATEGIES)[number]["id"];

const WEEK_COLUMNS = 4;

type Step = "config" | "weekends" | "preview";

type PreviewWeek = { index: number; total: number; start: string; end: string };

function mondayOf(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const cursor = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const weekday = cursor.getDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return shiftIso(iso, delta);
}

function previewWeeks(days: { date: string; quantity: number }[]): PreviewWeek[] {
  const sorted = days.filter((row) => mondayOf(row.date)).sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted.length > 0 ? mondayOf(sorted[0].date) : null;
  const last = sorted.length > 0 ? mondayOf(sorted[sorted.length - 1].date) : null;
  if (!first || !last) return [];
  const totals = new Map<string, number>();
  for (const row of sorted) {
    const monday = mondayOf(row.date);
    if (!monday) continue;
    totals.set(monday, (totals.get(monday) ?? 0) + row.quantity);
  }
  const weeks: PreviewWeek[] = [];
  let cursor = first;
  for (let guard = 0; cursor <= last && guard < 400; guard += 1) {
    const end = shiftIso(cursor, 6) ?? cursor;
    weeks.push({ index: weeks.length + 1, total: totals.get(cursor) ?? 0, start: cursor, end });
    const next = shiftIso(cursor, 7);
    if (!next) break;
    cursor = next;
  }
  return weeks;
}

function weekRows(weeks: PreviewWeek[]): PreviewWeek[][] {
  const rows: PreviewWeek[][] = [];
  for (let index = 0; index < weeks.length; index += WEEK_COLUMNS) rows.push(weeks.slice(index, index + WEEK_COLUMNS));
  return rows;
}

function shiftIso(iso: string, delta: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isInteger(delta)) return null;
  const cursor = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  cursor.setDate(cursor.getDate() + delta);
  const month = String(cursor.getMonth() + 1).padStart(2, "0");
  const day = String(cursor.getDate()).padStart(2, "0");
  return `${cursor.getFullYear()}-${month}-${day}`;
}

function daysFrom(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];
  const out: string[] = [];
  const cursor = new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)));
  const last = new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)));
  while (cursor <= last) {
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    out.push(`${cursor.getFullYear()}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
    if (out.length > 2000) return [];
  }
  return out;
}

function initialCalendarMonth(windowStart: string, monthKeys: string[]): string {
  const today = hojeIso().slice(0, 7);
  if (monthKeys.includes(today)) return today;
  const startMonth = windowStart.slice(0, 7);
  if (monthKeys.includes(startMonth)) return startMonth;
  return monthKeys[0] ?? startMonth;
}

export type DistributeInput = {
  strategy: DistributionStrategyId;
  start: string;
  end: string;
  resguardo: number;
  replace: boolean;
  enabledWeekendDays: string[];
  mode: "completo" | "saldo";
  cut?: string;
};

export function PlanningDistributeModal({
  items,
  periodBounds,
  enabledWeekendDays,
  busy,
  error,
  onCancel,
  onPreview,
  onSave,
}: {
  items: PlanningItem[];
  periodBounds: { min: string; max: string } | null;
  enabledWeekendDays: string[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onPreview: (input: DistributeInput) => Promise<DistributionPreview>;
  onSave: (input: DistributeInput) => void;
}) {
  const [strategy, setStrategy] = useState<DistributionStrategyId>("montanha");
  const [mode, setMode] = useState<"completo" | "saldo">("completo");
  const [cut, setCut] = useState(hojeIso);
  const [start, setStart] = useState(periodBounds?.min ?? "");
  const [end, setEnd] = useState(periodBounds?.max ?? "");
  const [resguardo, setResguardo] = useState(0);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [step, setStep] = useState<Step>("config");
  const [preview, setPreview] = useState<DistributionPreview | null>(null);
  const [pickedWeekends, setPickedWeekends] = useState<Set<string>>(() => new Set());
  const [calendarMonth, setCalendarMonth] = useState("");
  const [periodError, setPeriodError] = useState<string | null>(null);
  const periodSave = useRef<Promise<void> | null>(null);
  const { patchPeriodo } = useReportChrome();
  const yearMin = new Date().getFullYear();
  const dateMin = `${yearMin}-01-01`;
  const dateMax = "2100-12-31";
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const strategyRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const selectedStrategy = STRATEGIES.find((row) => row.id === strategy) ?? STRATEGIES[0];
  const selectedMode = MODES.find((row) => row.id === mode) ?? MODES[0];

  const curveEnd = shiftIso(end, -resguardo);
  const windowStart = mode === "saldo" && cut > start ? cut : start;

  const calendarMonthKeys = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(windowStart) || !curveEnd) return [];
    return monthKeysInRange(windowStart, curveEnd);
  }, [curveEnd, windowStart]);

  const effectiveWeekendDays = useMemo(() => {
    const merged = includeWeekends
      ? [...new Set([...enabledWeekendDays, ...pickedWeekends])]
      : [...enabledWeekendDays];
    return merged.filter((day) => isPlanningOffDay(day)).sort();
  }, [enabledWeekendDays, includeWeekends, pickedWeekends]);

  const enabled = new Set(effectiveWeekendDays);

  let invalid = "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) invalid = "Informe início e fim.";
  else if (start < dateMin || end > dateMax) invalid = "Data fora do intervalo permitido.";
  else if (start > end) invalid = "A data de início não pode ser posterior à data de fim.";
  else if (!Number.isInteger(resguardo) || resguardo < 0) invalid = "Resguardo inválido.";
  else if (!curveEnd || curveEnd < start) invalid = "O resguardo passa do início do período.";
  else if (mode === "saldo" && !/^\d{4}-\d{2}-\d{2}$/.test(cut)) invalid = "Informe a data de corte do saldo.";
  else if (mode === "saldo" && curveEnd && cut > curveEnd) invalid = "A data de corte passa do fim do período.";

  const eligible = invalid || !curveEnd
    ? []
    : daysFrom(windowStart, curveEnd).filter((day) => !isPlanningOffDay(day) || enabled.has(day));

  const eligibleWeekendsInWindow = useMemo(() => {
    if (invalid || !curveEnd) return [];
    return daysFrom(windowStart, curveEnd).filter((day) => isPlanningOffDay(day));
  }, [curveEnd, invalid, windowStart]);

  if (!invalid && eligible.length === 0) invalid = "Nenhum dia habilitado nesse período.";
  if (!invalid && items.length === 0) invalid = "Não há quantidade planejada para distribuir.";
  if (!invalid && includeWeekends && eligibleWeekendsInWindow.length === 0) {
    invalid = "Não há feriado/fim de semana no período da curva.";
  }

  const canContinue = !invalid && !busy;
  const curveQty = preview?.days.reduce((sum, row) => sum + row.quantity, 0) ?? 0;
  const weekendsInCurve = useMemo(
    () => effectiveWeekendDays.filter((day) => day >= windowStart && curveEnd && day <= curveEnd).length,
    [curveEnd, effectiveWeekendDays, windowStart],
  );

  useEffect(() => {
    if (!strategyOpen && !modeOpen) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (strategyOpen && !strategyRef.current?.contains(target)) setStrategyOpen(false);
      if (modeOpen && !modeRef.current?.contains(target)) setModeOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [strategyOpen, modeOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      if (modeOpen) {
        setModeOpen(false);
        return;
      }
      if (strategyOpen) {
        setStrategyOpen(false);
        return;
      }
      if (step === "preview") {
        setStep(includeWeekends ? "weekends" : "config");
        setPreview(null);
        return;
      }
      if (step === "weekends") {
        setStep("config");
        return;
      }
      onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, includeWeekends, modeOpen, onCancel, step, strategyOpen]);

  function commitPeriod(): Promise<void> {
    if (periodSave.current) return periodSave.current;
    const baseInicio = periodBounds?.min ?? "";
    const baseFim = periodBounds?.max ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return Promise.resolve();
    if (start === baseInicio && end === baseFim) return Promise.resolve();
    const job = api
      .salvarPeriodoPlano(start, end, baseInicio && baseFim ? { inicio: baseInicio, fim: baseFim } : undefined)
      .then((periodo) => {
        patchPeriodo(periodo);
        setPeriodError(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Não foi possível gravar o período.";
        setPeriodError(message);
        throw err;
      })
      .finally(() => {
        periodSave.current = null;
      });
    periodSave.current = job;
    return job;
  }

  function draft(): DistributeInput {
    return {
      strategy,
      start,
      end,
      resguardo,
      replace: replaceExisting,
      enabledWeekendDays: effectiveWeekendDays,
      mode,
      cut: mode === "saldo" ? cut : undefined,
    };
  }

  function resetPreview() {
    setStep("config");
    setPreview(null);
  }

  function openWeekendStep() {
    const prefill = new Set<string>();
    for (const day of enabledWeekendDays) {
      if (eligibleWeekendsInWindow.includes(day)) prefill.add(day);
    }
    setPickedWeekends(prefill);
    setCalendarMonth(initialCalendarMonth(windowStart, calendarMonthKeys));
    setStep("weekends");
  }

  function toggleWeekend(date: string) {
    setPickedWeekends((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
    setPreview(null);
  }

  function runPreview() {
    void commitPeriod()
      .then(() => onPreview(draft()))
      .then((next) => {
        setPreview(next);
        setStep("preview");
      })
      .catch(() => {
        setPreview(null);
        if (step === "preview") setStep(includeWeekends ? "weekends" : "config");
      });
  }

  function handlePrimaryFromConfig() {
    if (includeWeekends && eligibleWeekendsInWindow.length > 0) {
      void commitPeriod().then(openWeekendStep);
      return;
    }
    runPreview();
  }

  function handleBack() {
    if (step === "preview") {
      setPreview(null);
      setStep(includeWeekends ? "weekends" : "config");
      return;
    }
    if (step === "weekends") {
      setStep("config");
    }
  }

  const title =
    step === "weekends"
      ? "Feriados/fins de semana da distribuição"
      : "Distribuição automática";

  return (
    <div className="plan-modal-backdrop" onMouseDown={() => { if (!busy) onCancel(); }}>
      <div
        className={`plan-modal plan-modal--distribute${step === "preview" && preview ? " plan-modal--preview" : ""}${step === "weekends" ? " plan-modal--weekends" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-distribute-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="plan-distribute-title">{title}</h2>
        {step === "preview" && preview ? (
          <>
            <p className="plan-modal-lead">
              {preview.mode === "saldo"
                ? `Replanejamento do saldo: ${preview.pending} pendentes. ${preview.finalized} finalizados (Passed e N/A) ficam fora. Failed e Blocked continuam no saldo.`
                : `Planejamento completo: ${preview.finalized + preview.pending} no escopo, inclusive datas passadas. ${preview.finalized} finalizados permanecem na curva.`}
            </p>
            <ul className="plan-modal-confirm">
              <li>Estratégia: {selectedStrategy.label}.</li>
              <li>
                {preview.mode === "saldo"
                  ? `Da data de corte ${diaCheio(preview.cut ?? cut)} até ${diaCheio(curveEnd ?? end)}. O fim ${diaCheio(end)} não muda. Datas anteriores ao corte permanecem.`
                  : `De ${diaCheio(start)} até ${diaCheio(curveEnd ?? end)}. O fim informado continua ${diaCheio(end)}.`}
              </li>
              <li>Resguardo: {resguardo} {resguardo === 1 ? "dia corrido" : "dias corridos"}, sem nova quantidade.</li>
              <li>
                {replaceExisting
                  ? preview.mode === "saldo"
                    ? "Substitui só os dias da data de corte até o fim."
                    : "Substitui os dias que já têm quantidade."
                  : "Mantém os dias que já têm quantidade e preenche só os dias em zero."}
              </li>
              {weekendsInCurve > 0 && (
                <li>
                  Feriados/fins de semana na curva: {weekendsInCurve} {weekendsInCurve === 1 ? "dia" : "dias"} (incluídos nos totais por semana).
                </li>
              )}
              <li>Quantidade na curva: {curveQty}.</li>
            </ul>
            {preview.days.length > 0 && (
              <div className="plan-week-scroll" tabIndex={0} aria-label="Prévia por semana">
                <table className="plan-week-table">
                  {weekRows(previewWeeks(preview.days)).map((row) => (
                    <tbody key={row[0].index}>
                      <tr>
                        {Array.from({ length: WEEK_COLUMNS }, (_, column) => {
                          const week = row[column];
                          return (
                            <th
                              key={week?.index ?? `h-${row[0].index}-${column}`}
                              scope="col"
                              title={week ? `${diaCheio(week.start)} a ${diaCheio(week.end)}` : undefined}
                            >
                              {week ? `Semana ${week.index}` : ""}
                            </th>
                          );
                        })}
                      </tr>
                      <tr>
                        {Array.from({ length: WEEK_COLUMNS }, (_, column) => {
                          const week = row[column];
                          return <td key={week?.index ?? `d-${row[0].index}-${column}`}>{week ? week.total : ""}</td>;
                        })}
                      </tr>
                    </tbody>
                  ))}
                </table>
              </div>
            )}
            {preview.unchanged && <p className="plan-modal-lead">A agenda já segue essa distribuição.</p>}
            <p className="plan-modal-lead">Cancelar não grava.</p>
          </>
        ) : step === "weekends" && curveEnd ? (
          <PlanningDistributeWeekendCalendar
            monthKey={calendarMonth || calendarMonthKeys[0] || hojeIso().slice(0, 7)}
            monthKeys={calendarMonthKeys}
            onMonthChange={setCalendarMonth}
            windowStart={windowStart}
            windowEnd={curveEnd}
            selected={pickedWeekends}
            onToggle={toggleWeekend}
            disabled={busy}
          />
        ) : (
          <>
            <p className="plan-modal-lead">Escolha a modalidade, a estratégia e o período. A prévia mostra as quantidades antes de gravar. Responsáveis ficam como estão.</p>
            <div className="plan-modal-fields">
              <div className="plan-strategy-select plan-field-span" ref={modeRef}>
                <span id="plan-mode-label">Modalidade</span>
                <button
                  type="button"
                  className="plan-strategy-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={modeOpen}
                  aria-labelledby="plan-mode-label"
                  disabled={busy}
                  onClick={() => {
                    setStrategyOpen(false);
                    setModeOpen((open) => !open);
                  }}
                >
                  <span>{selectedMode.label}</span>
                  <span className="plan-strategy-chevron" aria-hidden />
                </button>
                {modeOpen && (
                  <ul className="plan-strategy-menu" role="listbox" aria-labelledby="plan-mode-label">
                    {MODES.map((row) => (
                      <li key={row.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={mode === row.id}
                          className={mode === row.id ? "is-selected" : undefined}
                          onClick={() => {
                            setMode(row.id);
                            setModeOpen(false);
                            resetPreview();
                          }}
                        >
                          {row.label}
                          <small>{row.hint}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="plan-strategy-select" ref={strategyRef}>
                <span id="plan-strategy-label">Estratégia</span>
                <button
                  type="button"
                  className="plan-strategy-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={strategyOpen}
                  aria-labelledby="plan-strategy-label"
                  disabled={busy}
                  onClick={() => {
                    setModeOpen(false);
                    setStrategyOpen((open) => !open);
                  }}
                >
                  <span>{selectedStrategy.label}</span>
                  <span className="plan-strategy-chevron" aria-hidden />
                </button>
                {strategyOpen && (
                  <ul className="plan-strategy-menu" role="listbox" aria-labelledby="plan-strategy-label">
                    {STRATEGIES.map((row) => (
                      <li key={row.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={strategy === row.id}
                          className={strategy === row.id ? "is-selected" : undefined}
                          onClick={() => {
                            setStrategy(row.id);
                            setStrategyOpen(false);
                            resetPreview();
                          }}
                        >
                          {row.label}
                          <small>{row.hint}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <label>
                Dias de resguardo
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={resguardo}
                  onChange={(event) => {
                    const next = event.target.value === "" ? 0 : Number(event.target.value);
                    setResguardo(next);
                    resetPreview();
                  }}
                />
              </label>
              <label>
                Data Início
                <input
                  type="date"
                  value={start}
                  min={dateMin}
                  max={dateMax}
                  aria-label="Data Início"
                  onChange={(event) => { setPeriodError(null); setStart(event.target.value); resetPreview(); }}
                  onBlur={() => { void commitPeriod(); }}
                />
              </label>
              <label>
                Data Fim
                <input
                  type="date"
                  value={end}
                  min={dateMin}
                  max={dateMax}
                  aria-label="Data Fim"
                  onChange={(event) => { setPeriodError(null); setEnd(event.target.value); resetPreview(); }}
                  onBlur={() => { void commitPeriod(); }}
                />
              </label>
              {mode === "saldo" && (
                <label className="plan-field-span">
                  Data de corte
                  <input type="date" value={cut} min={dateMin} max={dateMax} onChange={(event) => { setCut(event.target.value); resetPreview(); }} />
                </label>
              )}
              <label className="plan-replace-choice">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  disabled={busy}
                  onChange={(event) => {
                    setReplaceExisting(event.target.checked);
                    resetPreview();
                  }}
                />
                <span>
                  Substituir dias que já têm quantidade
                  <small>
                    {replaceExisting
                      ? mode === "saldo"
                        ? "Reescreve só os dias da data de corte até o fim. Datas anteriores permanecem."
                        : "A curva reescreve todos os dias habilitados entre o início e o fim."
                      : "Dias com número permanecem. A quantidade que falta entra só nos dias em zero."}
                  </small>
                </span>
              </label>
              <label className="plan-replace-choice plan-field-span">
                <input
                  type="checkbox"
                  checked={includeWeekends}
                  disabled={busy}
                  onChange={(event) => {
                    setIncludeWeekends(event.target.checked);
                    resetPreview();
                  }}
                />
                <span>
                  Incluir feriados/fins de semana selecionados
                  <small>Abre um calendário para marcar feriados e fins de semana antes da prévia.</small>
                </span>
              </label>
            </div>
            {!invalid && curveEnd && (
              <p className="plan-modal-lead">A curva termina em {diaCheio(curveEnd)}, antes do fim quando há resguardo.</p>
            )}
          </>
        )}
        {invalid && step === "config" && <p className="plan-error">{invalid}</p>}
        {(periodError || error) && <p className="plan-error">{periodError || error}</p>}
        <div className="plan-modal-actions">
          <button
            type="button"
            className="plan-modal-cancel"
            onClick={step === "config" ? onCancel : handleBack}
            disabled={busy}
          >
            {step === "config" ? "Cancelar" : "Voltar"}
          </button>
          {step === "preview" && preview ? (
            <button
              type="button"
              className="plan-filter-primary"
              disabled={!canContinue || preview.unchanged}
              onClick={() => { void commitPeriod().then(() => onSave(draft())); }}
            >
              {busy ? "Salvando…" : "Confirmar e salvar"}
            </button>
          ) : step === "weekends" ? (
            <button type="button" className="plan-filter-primary" disabled={!canContinue} onClick={runPreview}>
              {busy ? "Calculando…" : "Ver prévia"}
            </button>
          ) : (
            <button type="button" className="plan-filter-primary" disabled={!canContinue} onClick={handlePrimaryFromConfig}>
              {busy
                ? "Calculando…"
                : includeWeekends && eligibleWeekendsInWindow.length > 0
                  ? "Escolher feriados/fins de semana"
                  : "Ver prévia"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
