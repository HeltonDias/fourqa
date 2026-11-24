import { useEffect, useRef, useState } from "react";
import calendarIcon from "../../../../fonte/util/calendar-icons.png";
import { diaCheio } from "./planningUtils";

export function PlanningWeekendOffMenu({
  activeDays,
  disabled,
  onRequestOff,
}: {
  activeDays: string[];
  disabled?: boolean;
  onRequestOff: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inactive = disabled || activeDays.length === 0;

  useEffect(() => {
    if (open) return;
    setConfirmDate(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (confirmDate) setConfirmDate(null);
        else setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [confirmDate, open]);

  function confirmOff(date: string) {
    onRequestOff(date);
    setConfirmDate(null);
    setOpen(false);
  }

  return (
    <div className="plan-weekend-off-menu" ref={rootRef}>
      <button
        type="button"
        className="plan-filter-history"
        disabled={inactive}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={inactive ? "Nenhum feriado/fim de semana ativo na grade" : "Desativar um feriado ou fim de semana ativo"}
        title={inactive ? "Nenhum feriado/fim de semana ativo na grade" : "Desativar um feriado ou fim de semana ativo"}
        onClick={() => {
          if (inactive) return;
          setOpen((value) => !value);
        }}
      >
        <img src={calendarIcon} alt="" className="plan-filter-history-icon" width={18} height={18} />
      </button>
      {open && (
        <div className="plan-weekend-off-popover" role="dialog" aria-label="Feriados e fins de semana ativos">
          <p className="plan-weekend-off-popover-title">Feriados/fins de semana ativos</p>
          <ul className="plan-weekend-off-popover-list">
            {activeDays.map((date) => {
              const confirming = confirmDate === date;
              return (
                <li key={date} className="plan-weekend-off-popover-row">
                  <span className="plan-weekend-off-popover-date" title={diaCheio(date)}>
                    {diaCheio(date)}
                  </span>
                  {confirming ? (
                    <div className="plan-weekend-off-popover-confirm">
                      <span className="plan-weekend-off-popover-question">Tem certeza?</span>
                      <button
                        type="button"
                        className="plan-weekend-off-popover-choice plan-weekend-off-popover-choice--no"
                        onClick={() => setConfirmDate(null)}
                      >
                        Não
                      </button>
                      <button
                        type="button"
                        className="plan-weekend-off-popover-choice plan-weekend-off-popover-choice--yes"
                        onClick={() => confirmOff(date)}
                      >
                        Sim
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="plan-weekend-off-popover-action"
                      onClick={() => setConfirmDate(date)}
                    >
                      Desativar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
