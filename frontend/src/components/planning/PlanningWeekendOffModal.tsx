import { useEffect } from "react";
import type { DetectedDimension, PlanningItem } from "../../types";
import { diaCheio, offDayLabel } from "./planningUtils";

function dimText(item: PlanningItem, dimensions: DetectedDimension[], role: "front" | "process"): string {
  const dim = dimensions.find((row) => row.role === role);
  const value = dim ? item.dimensions[dim.key]?.trim() : "";
  if (value) return value;
  if (role === "process") return item.suiteName || "—";
  return "—";
}

export function PlanningWeekendOffModal({
  date,
  planKey,
  items,
  dimensions,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  date: string;
  planKey: string;
  items: PlanningItem[];
  dimensions: DetectedDimension[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const affected = items.filter((item) => (item.allocations[date] ?? 0) > 0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="plan-modal-backdrop" onMouseDown={() => { if (!busy) onCancel(); }}>
      <div
        className="plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-weekend-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="plan-weekend-title">Desativar {diaCheio(date)} ({offDayLabel(date)})</h2>
        <p className="plan-modal-lead">
          O feriado/fim de semana deixa de aceitar distribuição. Cenários, baseline e revisões permanecem. Não há redistribuição automática.
        </p>
        {affected.length === 0 ? (
          <p>Nenhuma quantidade neste dia.</p>
        ) : (
          <ul className="plan-modal-list">
            <li className="plan-modal-list-head">
              <span>Test Plan</span>
              <span>Frente/Feature</span>
              <span>Processo/Function</span>
              <span>Qtd</span>
            </li>
            {affected.map((item) => (
              <li key={`${item.suiteId ?? "s"}-${item.testPointId ?? "p"}-${item.suiteName}`}>
                <span>{planKey}</span>
                <span>{dimText(item, dimensions, "front")}</span>
                <span>{dimText(item, dimensions, "process")}</span>
                <span>{item.allocations[date]}</span>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="plan-error">{error}</p>}
        <div className="plan-modal-actions">
          <button type="button" className="plan-modal-cancel" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="plan-filter-primary" onClick={onConfirm} disabled={busy}>
            {affected.length > 0 ? "Remover distribuição e deixar pendente" : "Desativar dia"}
          </button>
        </div>
      </div>
    </div>
  );
}
