import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, fmtDateTime, isConflict, type HomeDto } from "../api";
import { useReportChrome } from "../context/ReportChromeContext";
import { ReportTitles } from "./ReportTitles";
import { SyncMessage } from "./SyncMessage";

function toInputDate(value: string | undefined): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function formatPeriodDate(value: string | undefined): string {
  const iso = toInputDate(value);
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function ChromePlanDates({
  inicio,
  fim,
  onSaved,
  onRefresh,
}: {
  inicio: string;
  fim: string;
  onSaved: (periodo: HomeDto["periodo"]) => void;
  onRefresh: () => void;
}) {
  const [draftStart, setDraftStart] = useState(() => toInputDate(inicio));
  const [draftEnd, setDraftEnd] = useState(() => toInputDate(fim));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commitLock = useRef(false);
  const yearMin = new Date().getFullYear();
  const dateMin = `${yearMin}-01-01`;
  const dateMax = "2100-12-31";

  useEffect(() => {
    setDraftStart(toInputDate(inicio));
    setDraftEnd(toInputDate(fim));
  }, [inicio, fim]);

  function commit() {
    if (saving || commitLock.current) return;
    if (!draftStart || !draftEnd) return;
    const baseInicio = toInputDate(inicio);
    const baseFim = toInputDate(fim);
    if (draftStart === baseInicio && draftEnd === baseFim) return;
    if (draftStart > draftEnd) {
      setError("Data Início não pode ser posterior à Data Fim.");
      return;
    }
    commitLock.current = true;
    setSaving(true);
    setError(null);
    api
      .salvarPeriodoPlano(draftStart, draftEnd, { inicio: baseInicio, fim: baseFim })
      .then((periodo) => {
        onSaved(periodo);
        onRefresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível gravar o período.");
        if (isConflict(err)) onRefresh();
      })
      .finally(() => {
        commitLock.current = false;
        setSaving(false);
      });
  }

  return (
    <>
      <div className="report-date-line">
        <span className="muted">Data Início:</span>
        <input
          className="report-date-input"
          type="date"
          value={draftStart}
          min={dateMin}
          max={dateMax}
          disabled={saving}
          aria-label="Data Início"
          onChange={(event) => {
            setError(null);
            setDraftStart(event.target.value);
          }}
          onBlur={commit}
        />
      </div>
      <div className="report-date-line">
        <span className="muted">Data Fim:</span>
        <input
          className="report-date-input"
          type="date"
          value={draftEnd}
          min={dateMin}
          max={dateMax}
          disabled={saving}
          aria-label="Data Fim"
          onChange={(event) => {
            setError(null);
            setDraftEnd(event.target.value);
          }}
          onBlur={commit}
        />
      </div>
      {error ? <span className="report-date-error">{error}</span> : null}
    </>
  );
}

export function ReportChrome() {
  const {
    home,
    homeLoading,
    homeError,
    patchPeriodo,
    sync,
    syncError,
    handleAtualizar,
    syncing,
    now,
    refreshHome,
  } = useReportChrome();
  const [accessToken, setAccessToken] = useState("");
  const needsAccessToken = homeError === "Não autorizado." || homeError === "Unauthorized";
  const { pathname } = useLocation();
  const onPlanning = pathname === "/planejamento" || pathname.startsWith("/planejamento/");

  const title = home?.title ?? (homeLoading ? "Carregando…" : "STATUS REPORT QA");
  const subtitle =
    home?.subtitle ??
    (homeLoading ? "" : "FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3");

  return (
    <div className="report-chrome">
      <header className="report-header">
        {home ? (
          <ReportTitles title={home.title} subtitle={home.subtitle} />
        ) : (
          <div className="report-titles">
            <h1>{title}</h1>
            {subtitle ? <p className="report-subtitle">{subtitle}</p> : null}
          </div>
        )}

        <div className="report-dates-row">
          <div className="report-dates-block card-soft">
            {onPlanning && home ? (
              <ChromePlanDates
                inicio={home.periodo.inicio}
                fim={home.periodo.fim}
                onSaved={patchPeriodo}
                onRefresh={() => refreshHome(true)}
              />
            ) : (
              <>
                <div>
                  <span className="muted">Data Início:</span>{" "}
                  {home ? formatPeriodDate(home.periodo.inicio) : "—"}
                </div>
                <div>
                  <span className="muted">Data Fim:</span>{" "}
                  {home ? formatPeriodDate(home.periodo.fim) : "—"}
                </div>
              </>
            )}
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
