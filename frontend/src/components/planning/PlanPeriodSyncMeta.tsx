import { useEffect, useRef, useState } from "react";

function toInputDate(value: string | undefined): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

export function PlanPeriodSyncMeta({
  periodoInicio,
  periodoFim,
  onSavePeriodo,
  onClearPeriodoError,
  periodoSaving,
  periodoError,
  onPeriodDirtyChange,
  periodLabel = "Período planejado",
}: {
  periodoInicio: string;
  periodoFim: string;
  onSavePeriodo: (inicio: string, fim: string) => void | Promise<void>;
  onClearPeriodoError?: () => void;
  periodoSaving?: boolean;
  periodoError?: string | null;
  onPeriodDirtyChange?: (dirty: boolean) => void;
  periodLabel?: string;
}) {
  const [draftStart, setDraftStart] = useState(() => toInputDate(periodoInicio));
  const [draftEnd, setDraftEnd] = useState(() => toInputDate(periodoFim));
  const commitLock = useRef(false);
  const yearMin = new Date().getFullYear();
  const dateMin = `${yearMin}-01-01`;
  const dateMax = "2100-12-31";

  useEffect(() => {
    setDraftStart(toInputDate(periodoInicio));
    setDraftEnd(toInputDate(periodoFim));
  }, [periodoInicio, periodoFim]);

  useEffect(() => {
    const dirty =
      draftStart !== toInputDate(periodoInicio) || draftEnd !== toInputDate(periodoFim);
    onPeriodDirtyChange?.(dirty);
  }, [draftStart, draftEnd, periodoInicio, periodoFim, onPeriodDirtyChange]);

  function commit() {
    if (periodoSaving || commitLock.current) return;
    if (!draftStart || !draftEnd) return;
    const currentStart = toInputDate(periodoInicio);
    const currentEnd = toInputDate(periodoFim);
    if (draftStart === currentStart && draftEnd === currentEnd) return;
    if (draftStart > draftEnd) return;
    commitLock.current = true;
    Promise.resolve(onSavePeriodo(draftStart, draftEnd)).finally(() => {
      commitLock.current = false;
    });
  }

  return (
    <div className="plan-module-meta">
      <div className="plan-meta-card plan-meta-card--period">
          <span className="plan-meta-label">{periodLabel}</span>
          <div className="plan-meta-period">
            <input
              className="plan-meta-date"
              type="date"
              value={draftStart}
              min={dateMin}
              max={dateMax}
              disabled={periodoSaving}
              aria-label="Data de início do período planejado"
              onChange={(event) => {
                onClearPeriodoError?.();
                setDraftStart(event.target.value);
              }}
              onBlur={commit}
            />
            <span className="plan-meta-period-sep" aria-hidden>–</span>
            <input
              className="plan-meta-date"
              type="date"
              value={draftEnd}
              min={dateMin}
              max={dateMax}
              disabled={periodoSaving}
              aria-label="Data de fim do período planejado"
              onChange={(event) => {
                onClearPeriodoError?.();
                setDraftEnd(event.target.value);
              }}
              onBlur={commit}
            />
          </div>
          {periodoError && <span className="plan-meta-period-error">{periodoError}</span>}
      </div>
    </div>
  );
}
