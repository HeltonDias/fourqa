import { useEffect } from "react";
import type { ClearPlanningPreview } from "../../api";

export function PlanningClearModal({
  preview,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  preview: ClearPlanningPreview | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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
        aria-labelledby="plan-clear-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="plan-clear-title">Limpar planejamento</h2>
        <p className="plan-modal-lead">
          A grade fica só com Passed e N/A. Failed, Blocked e o restante saem. O excesso sai dos dias mais recentes. Nenhuma data nova é criada. Baseline, execuções e revisão permanecem.
        </p>
        {preview ? (
          preview.unchanged ? (
            <p className="plan-modal-lead">A agenda já conserva só os finalizados.</p>
          ) : (
            <ul className="plan-modal-confirm">
              <li>{preview.finalized} finalizados no escopo.</li>
              <li>{preview.removed} saem da grade.</li>
              <li>{preview.kept} permanecem nos dias já lançados.</li>
              <li>{preview.suiteCount} {preview.suiteCount === 1 ? "suíte muda" : "suítes mudam"}.</li>
            </ul>
          )
        ) : (
          <p className="plan-modal-lead">{busy ? "Calculando…" : "A prévia não foi calculada."}</p>
        )}
        {error && <p className="plan-error">{error}</p>}
        <div className="plan-modal-actions">
          <button type="button" className="plan-modal-cancel" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button
            type="button"
            className="plan-filter-primary"
            onClick={onConfirm}
            disabled={busy || !preview || preview.unchanged}
          >
            {busy ? "Limpando…" : "Limpar e manter finalizados"}
          </button>
        </div>
      </div>
    </div>
  );
}
