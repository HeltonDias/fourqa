import { useState } from "react";
import { api, isConflict } from "../api";
import { useReportChrome } from "../context/ReportChromeContext";
import { PageHeader } from "./PageHeader";
import { PlanPeriodSyncMeta } from "./planning/PlanPeriodSyncMeta";

export function ReportPageHeader() {
  const { home, patchPeriodo, refreshHome } = useReportChrome();
  const [periodoSaving, setPeriodoSaving] = useState(false);
  const [periodoError, setPeriodoError] = useState<string | null>(null);

  async function salvarPeriodo(inicio: string, fim: string, baseInicio: string, baseFim: string) {
    setPeriodoSaving(true);
    setPeriodoError(null);
    try {
      const periodo = await api.salvarPeriodoPlano(inicio, fim, { inicio: baseInicio, fim: baseFim });
      patchPeriodo(periodo);
      setPeriodoError(null);
      refreshHome(true);
    } catch (err) {
      setPeriodoError(err instanceof Error ? err.message : "Não foi possível gravar o período.");
      if (isConflict(err)) refreshHome(true);
    } finally {
      setPeriodoSaving(false);
    }
  }

  return (
    <PageHeader
      title="Report"
      description="Indicadores, cenários e impactos do plano."
      actions={
        home ? (
          <PlanPeriodSyncMeta
            periodoInicio={home.periodo.inicio}
            periodoFim={home.periodo.fim}
            onSavePeriodo={salvarPeriodo}
            onClearPeriodoError={() => setPeriodoError(null)}
            periodoSaving={periodoSaving}
            periodoError={periodoError}
          />
        ) : null
      }
    />
  );
}
