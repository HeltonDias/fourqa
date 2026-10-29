import { fmtDate, fmtDateShort, fmtPctBr } from "../api";
import { LoadState } from "../components/LoadState";
import { ImpactResponsaveisPanel } from "../components/ImpactResponsaveisPanel";
import { GestaoImpactosPanel } from "../components/GestaoImpactosPanel";
import { ReportCharts } from "../components/ReportCharts";
import { ReportKpiRow } from "../components/ReportKpiRow";
import { ScenarioStatusPanel } from "../components/ScenarioStatusPanel";
import { StatusFace } from "../components/StatusFace";
import { ReportPageHeader } from "../components/ReportPageHeader";
import { useReportChrome } from "../context/ReportChromeContext";
import { HierCellText } from "../components/HierCellText";
import {
  hierarchyColumnLabel,
  hierarchyDimTier,
  suiteMatchesProcessValue,
} from "../components/planning/planningUtils";
import type { DetectedDimension, ReportSuiteRow } from "../types";

/** Linha "Valores Totais >>>>>>>" da planilha: não é suíte, vira rodapé fixo. */
function isTotalsRow(s: ReportSuiteRow): boolean {
  return /valores\s+totais/i.test(s.processo ?? "");
}

const TOTAL_KEYS = [
  "ttlCts",
  "cts_plan_dia",
  "total_realizado",
  "gap",
  "cts_passeds",
  "cts_na",
  "cts_cancelados",
  "cts_falhados",
  "cts_bloqueados",
  "cts_liberados",
  "cts_design",
  "cts_nao_liberados",
] as const;

type TotalKey = (typeof TOTAL_KEYS)[number];

function sumSuites(rows: ReportSuiteRow[]): Record<TotalKey, number> {
  const acc = Object.fromEntries(TOTAL_KEYS.map((k) => [k, 0])) as Record<TotalKey, number>;
  for (const r of rows) {
    for (const k of TOTAL_KEYS) acc[k] += Number(r[k]) || 0;
  }
  return acc;
}

export function ReportPage() {
  const { home: data, homeLoading, homeError } = useReportChrome();

  const suites = data ? data.suites.filter((s) => !isTotalsRow(s)) : [];
  const totals = sumSuites(suites);
  const dimensoes = data?.dimensoes ?? [];
  const processDim = dimensoes.find((dim) => dim.role === "process");
  const showSuiteColumn =
    !processDim ||
    suites.some((row) => {
      const processValue = row.classificacao?.[processDim.key] ?? row.processo ?? "";
      const suiteValue = row.suiteLabel ?? row.processo ?? "";
      return !suiteMatchesProcessValue(processValue, suiteValue);
    });

  function dimensionCell(row: ReportSuiteRow, dim: DetectedDimension): string {
    const value = row.classificacao?.[dim.key]?.trim();
    if (value) return value;
    if (dim.role === "front") return row.frente?.trim() ?? "";
    if (dim.role === "process") return row.processo?.trim() ?? row.suiteLabel?.trim() ?? "";
    return "";
  }

  const lastDimKey = dimensoes[dimensoes.length - 1]?.key;

  return (
    <div className="report-page module-page">
      <ReportPageHeader />
      <LoadState loading={homeLoading && !data} error={homeError}>
        {data && (
          <>
          <ReportKpiRow
            statusGeral={data.statusGeral}
            percentBugsDev={fmtPctBr(data.percentBugsDev)}
            percentBugsCliente={fmtPctBr(data.percentBugsCliente)}
            percentTotalImpactados={fmtPctBr(data.percentTotalImpactados)}
            replanejados={data.replanejamentoTotal}
            percentPlan={fmtPctBr(data.percentuais.plan, 0)}
            percentReal={fmtPctBr(data.percentuais.real, 0)}
            gap={data.gap}
          />

          <section className="mid-panels">
            <ScenarioStatusPanel
              total={data.ttlCts}
              planejados={data.totais.ctsPlanAteHoje}
              finalizados={data.totais.totalRealizado}
              pendentes={data.ttlCts - data.totais.totalRealizado}
              passed={data.totais.passeds}
              na={data.totais.na}
              falha={data.totais.falhados}
              bloq={data.totais.bloqueados}
              lib={data.totais.liberados}
              naoLib={data.totais.naoLiberados}
              design={data.totais.design}
            />

            <ImpactResponsaveisPanel
              total={data.impactos.totalTestPointFailedBlocked}
              foursys={data.impactos.foursys}
              cliente={data.impactos.cliente}
              reteste={data.impactos.reteste}
            />
          </section>

          <section className="card table-panel">
            <h2>Evoluções</h2>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th className="hier-col hier-col--plan">Test Plan</th>
                    {dimensoes.map((d) => {
                      const tier = hierarchyDimTier(d);
                      return (
                        <th key={d.key} className={tier ? `hier-col hier-col--${tier}` : undefined}>
                          {hierarchyColumnLabel(d)}
                        </th>
                      );
                    })}
                    {showSuiteColumn ? <th className="hier-col hier-col--process">Suites</th> : null}
                    <th className="col-status">Status</th>
                    <th className="col-date">Início</th>
                    <th className="col-date">Fim</th>
                    <th className="col-metric" title="Total de CTs">TTL CTs</th>
                    <th className="col-metric" title="CTs planejados">Plan</th>
                    <th className="col-metric" title="Finalizados">Fin.</th>
                    <th className="col-metric">GAP</th>
                    <th className="col-metric col-divider" title="CTs Passeds">Passed</th>
                    <th className="col-metric" title="CTs N/A">N/A</th>
                    <th className="col-metric" title="CTs falhados">Falh.</th>
                    <th className="col-metric" title="CTs bloqueados">Bloq.</th>
                    <th className="col-metric" title="Liberados">Lib.</th>
                    <th className="col-metric" title="Não liberado">Não Lib.</th>
                    <th className="col-metric">Design</th>
                    <th className="col-metric" title="CTs com ressalvas">Ress.</th>
                  </tr>
                </thead>
                <tbody>
                  {suites.map((s) => (
                    <tr key={s.row_num}>
                      <td className="hier-col hier-col--plan">
                        <HierCellText value={data.planKey} />
                      </td>
                      {dimensoes.map((d) => {
                        const tier = hierarchyDimTier(d);
                        const cell = dimensionCell(s, d);
                        return (
                          <td key={d.key} className={tier ? `hier-col hier-col--${tier}` : undefined}>
                            <HierCellText value={cell} />
                          </td>
                        );
                      })}
                      {showSuiteColumn ? (
                        <td className="hier-col hier-col--process col-suite">
                          <HierCellText value={s.suiteLabel ?? s.processo ?? ""} />
                        </td>
                      ) : null}
                      <td className="col-status">
                        <StatusFace status={s.status} />
                      </td>
                      <td className="col-date">
                        <HierCellText
                          value={fmtDateShort(s.data_inicio ?? "")}
                          tooltip={fmtDate(s.data_inicio ?? "")}
                        />
                      </td>
                      <td className="col-date">
                        <HierCellText
                          value={fmtDateShort(s.data_fim ?? "")}
                          tooltip={fmtDate(s.data_fim ?? "")}
                        />
                      </td>
                      <td className="col-metric">{s.ttlCts}</td>
                      <td className="col-metric">{s.cts_plan_dia ?? 0}</td>
                      <td className="col-metric">{s.total_realizado}</td>
                      <td className="col-metric">{s.gap}</td>
                      <td className="col-metric col-divider">{s.cts_passeds}</td>
                      <td className="col-metric">{s.cts_na}</td>
                      <td className="col-metric">{s.cts_falhados}</td>
                      <td className="col-metric">{s.cts_bloqueados}</td>
                      <td className="col-metric">{s.cts_liberados}</td>
                      <td className="col-metric">{s.cts_nao_liberados}</td>
                      <td className="col-metric">{s.cts_design}</td>
                      <td className="col-metric">{s.cts_cancelados}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="totals-row">
                    <td />
                    {dimensoes.map((d) => (
                      <td key={d.key} className={!showSuiteColumn && d.key === lastDimKey ? "col-suite" : undefined}>
                        {!showSuiteColumn && d.key === lastDimKey ? "Valores Totais" : null}
                      </td>
                    ))}
                    {showSuiteColumn ? <td className="col-suite">Valores Totais</td> : null}
                    <td className="col-status">
                      <StatusFace status={data.statusTotais} />
                    </td>
                    <td>–</td>
                    <td>–</td>
                    <td>{totals.ttlCts}</td>
                    <td>{totals.cts_plan_dia}</td>
                    <td>{totals.total_realizado}</td>
                    <td>{totals.gap}</td>
                    <td className="col-divider">{totals.cts_passeds}</td>
                    <td>{totals.cts_na}</td>
                    <td>{totals.cts_falhados}</td>
                    <td>{totals.cts_bloqueados}</td>
                    <td>{totals.cts_liberados}</td>
                    <td>{totals.cts_nao_liberados}</td>
                    <td>{totals.cts_design}</td>
                    <td>{totals.cts_cancelados}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <ReportCharts graficos={data.graficos} />

          <GestaoImpactosPanel data={data.gestaoImpactos} />
          </>
        )}
      </LoadState>
    </div>
  );
}
