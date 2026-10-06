import type { PlanningView } from "../../types";
import { origemRevisao } from "./planningUtils";

export function PlanningRevisoesPanel({
  view,
  version,
  onVersionChange,
  reason,
  onReasonChange,
  adoptSource,
  onAdoptSourceChange,
  busy,
  confirmed,
  actionError,
  onSubmit,
}: {
  view: PlanningView;
  version: number | undefined;
  onVersionChange: (version: number | undefined) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  adoptSource: boolean;
  onAdoptSourceChange: (value: boolean) => void;
  busy: boolean;
  confirmed: boolean;
  actionError: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="plan-tab-panel plan-revisoes-panel">
      <p className="muted">{origemRevisao(view)}</p>
      {view.revisions.length > 0 && (
        <label className="plan-version">
          Revisão
          <select
            value={version ?? ""}
            onChange={(event) => onVersionChange(event.target.value ? Number(event.target.value) : undefined)}
          >
            <option value="">Mais recente</option>
            {[...view.revisions].reverse().map((revision) => (
              <option key={revision.version} value={revision.version}>
                v{revision.version} · {revision.reason}
              </option>
            ))}
          </select>
        </label>
      )}
      {actionError && <p className="plan-error">{actionError}</p>}
      <form
        className="plan-revise"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label>
          Motivo
          <input value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Por que esta revisão?" />
        </label>
        {confirmed && (
          <label className="plan-checkline">
            <input type="checkbox" checked={adoptSource} onChange={(event) => onAdoptSourceChange(event.target.checked)} />
            Usar o escopo atual da fonte como novo baseline
          </label>
        )}
        <button type="submit" disabled={busy || (confirmed && version != null)}>
          {busy ? "Gravando…" : confirmed ? "Replanejar" : "Confirmar planejamento"}
        </button>
      </form>
    </div>
  );
}
