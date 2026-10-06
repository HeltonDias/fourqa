import { ReportTitles } from "../ReportTitles";
import { useReportChrome } from "../../context/ReportChromeContext";
import { PlanPeriodSyncMeta } from "./PlanPeriodSyncMeta";

export function PlanningPageHeader({
  periodoInicio,
  periodoFim,
  ultimaAtualizacao,
  onSavePeriodo,
  onClearPeriodoError,
  periodoSaving,
  periodoError,
  onAtualizar,
  atualizando,
  onPeriodDirtyChange,
}: {
  periodoInicio: string;
  periodoFim: string;
  ultimaAtualizacao: string | null;
  onSavePeriodo: (inicio: string, fim: string) => void | Promise<void>;
  onClearPeriodoError?: () => void;
  periodoSaving?: boolean;
  periodoError?: string | null;
  onAtualizar: () => void;
  atualizando: boolean;
  onPeriodDirtyChange?: (dirty: boolean) => void;
}) {
  const { home, homeLoading, patchCabecalho } = useReportChrome();

  return (
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
        <h2 className="module-tab-title">Planejamento</h2>
      </div>
      <PlanPeriodSyncMeta
        periodoInicio={periodoInicio}
        periodoFim={periodoFim}
        ultimaAtualizacao={ultimaAtualizacao}
        onSavePeriodo={onSavePeriodo}
        onClearPeriodoError={onClearPeriodoError}
        periodoSaving={periodoSaving}
        periodoError={periodoError}
        onAtualizar={onAtualizar}
        atualizando={atualizando}
        onPeriodDirtyChange={onPeriodDirtyChange}
      />
    </header>
  );
}
