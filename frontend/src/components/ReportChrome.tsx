import { fmtDate, fmtDateTime, type SyncState } from "../api";
import { useReportChrome } from "../context/ReportChromeContext";
import { ReportTitles } from "./ReportTitles";

function SyncMessage({ sync, error }: { sync: SyncState | null; error: string | null }) {
  const message = error ?? (sync?.status === "error" ? sync.error : null);
  if (message) {
    return (
      <p className="sync-msg sync-msg--error" role="alert">
        {message}
      </p>
    );
  }
  if (sync?.status === "running") {
    const p = sync.progress;
    return (
      <p className="sync-msg" role="status">
        <span className="sync-spinner" aria-hidden="true" />
        {sync.step}
        {p ? ` — ${p.done}/${p.total}` : "…"}
      </p>
    );
  }
  if (sync?.status === "success" && sync.summary) {
    const s = sync.summary;
    return (
      <p className="sync-msg sync-msg--ok" role="status">
        Atualizado em {Math.round(s.duracaoMs / 1000)}s: {s.execucoes} execuções, {s.falhas} bugs.
      </p>
    );
  }
  return null;
}

export function ReportChrome() {
  const {
    home,
    homeLoading,
    homeError,
    patchCabecalho,
    sync,
    syncError,
    handleAtualizar,
    syncing,
    now,
  } = useReportChrome();

  const title = home?.title ?? (homeLoading ? "Carregando…" : "STATUS REPORT QA");
  const subtitle =
    home?.subtitle ??
    (homeLoading ? "" : "FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3");

  return (
    <div className="report-chrome">
      <header className="report-header">
        {home ? (
          <ReportTitles title={home.title} subtitle={home.subtitle} onSaved={patchCabecalho} />
        ) : (
          <div className="report-titles">
            <h1>{title}</h1>
            {subtitle ? <p className="report-subtitle">{subtitle}</p> : null}
          </div>
        )}

        <div className="report-dates-row">
          <div className="report-dates-block card-soft">
            <div>
              <span className="muted">Data Início:</span>{" "}
              {home ? fmtDate(home.periodo.inicio) : "—"}
            </div>
            <div>
              <span className="muted">Data Fim:</span> {home ? fmtDate(home.periodo.fim) : "—"}
            </div>
          </div>
          <div className="report-dates-block card-soft">
            <div>
              <span className="muted">Data atual:</span> {now.toLocaleDateString("pt-BR")}
            </div>
            <div>
              <span className="muted">Hora atual:</span>{" "}
              {now.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          </div>
        </div>
      </header>

      <div className="report-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleAtualizar}
          disabled={syncing || homeLoading}
        >
          {syncing ? "Atualizando…" : "Atualizar"}
        </button>
        <p className="last-update">
          Última Atualização:{" "}
          {home
            ? fmtDateTime(home.ultimaImportacao ?? home.atualizadoEm)
            : homeLoading
              ? "…"
              : "—"}
        </p>
        <SyncMessage sync={sync} error={syncError ?? homeError} />
      </div>

      <hr className="report-chrome-divider" />
    </div>
  );
}
