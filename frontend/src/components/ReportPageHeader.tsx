import { useState } from "react";
import { api } from "../api";
import { PlanPeriodSyncMeta } from "./planning/PlanPeriodSyncMeta";
import { ReportTitles } from "./ReportTitles";
import { SyncMessage } from "./SyncMessage";
import { useReportChrome } from "../context/ReportChromeContext";

export function ReportPageHeader() {
  const {
    home,
    homeLoading,
    homeError,
    patchCabecalho,
    patchPeriodo,
    refreshHome,
    handleAtualizar,
    syncing,
    sync,
    syncError,
  } = useReportChrome();
  const [periodoSaving, setPeriodoSaving] = useState(false);
  const [periodoError, setPeriodoError] = useState<string | null>(null);

  const ultimaAtualizacao = home?.ultimaImportacao ?? home?.atualizadoEm ?? null;

  async function salvarPeriodo(inicio: string, fim: string) {
    setPeriodoSaving(true);
    setPeriodoError(null);
    try {
      const periodo = await api.salvarPeriodoPlano(inicio, fim);
      patchPeriodo(periodo);
      setPeriodoError(null);
      refreshHome(true);
    } catch (err) {
      setPeriodoError(err instanceof Error ? err.message : "Não foi possível gravar o período.");
    } finally {
      setPeriodoSaving(false);
    }
  }

  return (
    <div className="module-page-head">
      <header className="plan-module-head">
        <div className="plan-module-titles report-module-titles">
          {home ? (
            <ReportTitles title={home.title} subtitle={home.subtitle} onSaved={patchCabecalho} />
          ) : (
            <>
              <h1>{homeLoading ? "Carregando…" : "STATUS REPORT QA"}</h1>
              {!homeLoading && (
                <p className="report-subtitle">FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3</p>
              )}
            </>
          )}
          <h2 className="module-tab-title">Report</h2>
        </div>
        {home && (
          <PlanPeriodSyncMeta
            periodoInicio={home.periodo.inicio}
            periodoFim={home.periodo.fim}
            ultimaAtualizacao={ultimaAtualizacao}
            onSavePeriodo={salvarPeriodo}
            onClearPeriodoError={() => setPeriodoError(null)}
            periodoSaving={periodoSaving}
            periodoError={periodoError}
            onAtualizar={handleAtualizar}
            atualizando={syncing || homeLoading}
          />
        )}
      </header>
      <SyncMessage sync={sync} error={syncError ?? homeError} />
    </div>
  );
}
