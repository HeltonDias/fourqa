import { fmtDate, fmtDateTime } from "../api";
import { useReportChrome } from "../context/ReportChromeContext";
import { useState } from "react";
import { ReportTitles } from "./ReportTitles";
import { SyncMessage } from "./SyncMessage";

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
    refreshHome,
  } = useReportChrome();
  const [accessToken, setAccessToken] = useState("");
  const needsAccessToken = homeError === "Não autorizado.";

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
        {needsAccessToken ? (
          <form
            className="access-gate"
            onSubmit={(event) => {
              event.preventDefault();
              const value = accessToken.trim();
              if (!value) return;
              localStorage.setItem("fourqa_token", value);
              setAccessToken("");
              refreshHome();
            }}
          >
            <p>Informe o token de acesso. Ele fica só neste navegador.</p>
            <input
              type="password"
              name="fourqa-access-token"
              autoComplete="off"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
            />
            <button type="submit" className="btn-primary">
              Entrar
            </button>
          </form>
        ) : null}
      </div>

      <hr className="report-chrome-divider" />
    </div>
  );
}
