import { useEffect, useRef, useState } from "react";
import { fmtDateTime } from "../../api";

function toInputDate(value: string | undefined): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

export function PlanningPageHeader({
  periodoInicio,
  periodoFim,
  ultimaAtualizacao,
  onSavePeriodo,
  periodoSaving,
  periodoError,
}: {
  periodoInicio: string;
  periodoFim: string;
  ultimaAtualizacao: string | null;
  onSavePeriodo: (inicio: string, fim: string) => void | Promise<void>;
  periodoSaving?: boolean;
  periodoError?: string | null;
}) {
  const [draftStart, setDraftStart] = useState(() => toInputDate(periodoInicio));
  const [draftEnd, setDraftEnd] = useState(() => toInputDate(periodoFim));
  const commitLock = useRef(false);

  useEffect(() => {
    setDraftStart(toInputDate(periodoInicio));
    setDraftEnd(toInputDate(periodoFim));
  }, [periodoInicio, periodoFim]);

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
    <header className="plan-module-head">
      <div className="plan-module-titles">
        <h1>Planejamento</h1>
        <p>Planejamento e distribuição da execução diária da QA</p>
      </div>
      <div className="plan-module-meta">
        <div className="plan-meta-card plan-meta-card--period">
          <span className="plan-meta-label">Período planejado</span>
          <div className="plan-meta-period">
            <input
              className="plan-meta-date"
              type="date"
              value={draftStart}
              disabled={periodoSaving}
              aria-label="Data de início do período planejado"
              onChange={(event) => setDraftStart(event.target.value)}
              onBlur={commit}
            />
            <span className="plan-meta-period-sep" aria-hidden>–</span>
            <input
              className="plan-meta-date"
              type="date"
              value={draftEnd}
              disabled={periodoSaving}
              aria-label="Data de fim do período planejado"
              onChange={(event) => setDraftEnd(event.target.value)}
              onBlur={commit}
            />
          </div>
          {periodoError && <span className="plan-meta-period-error">{periodoError}</span>}
        </div>
        <div className="plan-meta-card">
          <span className="plan-meta-label">Última atualização</span>
          <strong>{ultimaAtualizacao ? fmtDateTime(ultimaAtualizacao) : "—"}</strong>
        </div>
      </div>
    </header>
  );
}
