import { PageHeader } from "../PageHeader";
import { PlanPeriodSyncMeta } from "./PlanPeriodSyncMeta";

export function PlanningPageHeader({
  periodoInicio,
  periodoFim,
  onSavePeriodo,
  onClearPeriodoError,
  periodoSaving,
  periodoError,
  onPeriodDirtyChange,
}: {
  periodoInicio: string;
  periodoFim: string;
  onSavePeriodo: (inicio: string, fim: string) => void | Promise<void>;
  onClearPeriodoError?: () => void;
  periodoSaving?: boolean;
  periodoError?: string | null;
  onPeriodDirtyChange?: (dirty: boolean) => void;
}) {
  return (
    <PageHeader
      title="Planejamento"
      description="Período, acompanhamento e distribuição do plano."
      actions={
        <PlanPeriodSyncMeta
          periodoInicio={periodoInicio}
          periodoFim={periodoFim}
          onSavePeriodo={onSavePeriodo}
          onClearPeriodoError={onClearPeriodoError}
          periodoSaving={periodoSaving}
          periodoError={periodoError}
          onPeriodDirtyChange={onPeriodDirtyChange}
        />
      }
    />
  );
}
