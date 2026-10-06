import type { SyncState } from "../api";

export function SyncMessage({ sync, error }: { sync: SyncState | null; error: string | null }) {
  const message = error ?? (sync?.status === "error" ? sync.error : null);
  if (message) {
    return (
      <p className="sync-msg sync-msg--error module-sync-msg" role="alert">
        {message}
      </p>
    );
  }
  if (sync?.status === "running") {
    const p = sync.progress;
    return (
      <p className="sync-msg module-sync-msg" role="status">
        <span className="sync-spinner" aria-hidden="true" />
        {sync.step}
        {p ? ` — ${p.done}/${p.total}` : "…"}
      </p>
    );
  }
  if (sync?.status === "success" && sync.summary) {
    const s = sync.summary;
    return (
      <p className="sync-msg sync-msg--ok module-sync-msg" role="status">
        Atualizado em {Math.round(s.duracaoMs / 1000)}s: {s.execucoes} execuções, {s.falhas} bugs.
      </p>
    );
  }
  return null;
}
