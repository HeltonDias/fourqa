import { useEffect, useState } from "react";
import type { DetectedDimension, PlanningItem } from "../../types";
import { diaCheio } from "./planningUtils";

function dimText(item: PlanningItem, dimensions: DetectedDimension[], role: "front" | "process"): string {
  const dim = dimensions.find((row) => row.role === role);
  const value = dim ? item.dimensions[dim.key]?.trim() : "";
  if (value) return value;
  if (role === "process") return item.suiteName || "—";
  return "—";
}

function insidePeriod(date: string, bounds: { min: string; max: string } | null): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (!bounds) return true;
  return date >= bounds.min && date <= bounds.max;
}

export function PlanningBatchDateModal({
  planKey,
  items,
  dimensions,
  periodBounds,
  busy,
  error,
  onCancel,
  onSave,
}: {
  planKey: string;
  items: PlanningItem[];
  dimensions: DetectedDimension[];
  periodBounds: { min: string; max: string } | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  let invalid = "";
  if (start && !insidePeriod(start, periodBounds)) invalid = "Data Início fora do período do plano.";
  else if (end && !insidePeriod(end, periodBounds)) invalid = "Data Fim fora do período do plano.";
  else if (start || end) {
    for (const item of items) {
      const nextStart = start || item.plannedStart;
      const nextEnd = end || item.plannedEnd;
      if (nextStart && nextEnd && nextStart > nextEnd) {
        invalid = "A data de início não pode ser posterior à data de fim.";
        break;
      }
    }
  }
  const changed = items.some((item) => {
    if (start && start !== (item.plannedStart ?? "")) return true;
    if (end && end !== (item.plannedEnd ?? "")) return true;
    return false;
  });
  const canSave = changed && !invalid && !busy && items.length > 0;

  const impacts = items.flatMap((item) => {
    const nextStart = start || item.plannedStart;
    const nextEnd = end || item.plannedEnd;
    const outside = Object.entries(item.allocations).filter(([date, qty]) => {
      if (!qty) return false;
      if (nextStart && date < nextStart) return true;
      if (nextEnd && date > nextEnd) return true;
      return false;
    });
    return outside.length === 0 ? [] : [{ item, outside }];
  });

  return (
    <div className="plan-modal-backdrop" onMouseDown={() => { if (!busy) onCancel(); }}>
      <div
        className="plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-batch-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="plan-batch-title">Alterar datas</h2>
        <p className="plan-modal-lead">Campo em branco mantém a data de cada linha.</p>
        <ul className="plan-modal-list plan-modal-list--dates">
          <li className="plan-modal-list-head">
            <span>Test Plan</span>
            <span>Frente/Feature</span>
            <span>Processo/Function</span>
          </li>
          {items.map((item) => (
            <li key={`${item.suiteId ?? "s"}-${item.testPointId ?? "p"}-${item.suiteName}`}>
              <span>{planKey}</span>
              <span>{dimText(item, dimensions, "front")}</span>
              <span>{dimText(item, dimensions, "process")}</span>
            </li>
          ))}
        </ul>
        <div className="plan-modal-fields">
          <label>
            Data Início
            <input type="date" value={start} min={periodBounds?.min} max={periodBounds?.max} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            Data Fim
            <input type="date" value={end} min={periodBounds?.min} max={periodBounds?.max} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        {invalid && <p className="plan-error">{invalid}</p>}
        {impacts.length > 0 && (
          <div className="plan-modal-impact">
            <p>Quantidades fora do novo período permanecem. Nada é redistribuído.</p>
            <ul>
              {impacts.map(({ item, outside }) => (
                <li key={`${item.suiteId ?? "s"}-${item.suiteName}`}>
                  {dimText(item, dimensions, "process")}:{" "}
                  {outside.map(([date, qty]) => `${diaCheio(date)} (${qty})`).join(", ")}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="plan-error">{error}</p>}
        <div className="plan-modal-actions">
          <button type="button" className="plan-modal-cancel" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="plan-filter-primary" onClick={() => onSave(start, end)} disabled={!canSave}>
            Salvar alteração
          </button>
        </div>
      </div>
    </div>
  );
}
