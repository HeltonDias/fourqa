import { fmtDate, fmtPctBr } from "../api";
import { LoadState } from "../components/LoadState";
import { ImpactResponsaveisPanel } from "../components/ImpactResponsaveisPanel";
import { GestaoImpactosPanel } from "../components/GestaoImpactosPanel";
import { ReportCharts } from "../components/ReportCharts";
import { ReportKpiRow } from "../components/ReportKpiRow";
import { ScenarioStatusPanel } from "../components/ScenarioStatusPanel";
import { StatusFace } from "../components/StatusFace";
import { useReportChrome } from "../context/ReportChromeContext";
import type { ReportSuiteRow } from "../types";

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

  return (
    <LoadState loading={homeLoading} error={homeError}>
      {data && (
        <div className="report-page">
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
              ttl={data.ttlCts}
              plan={data.totais.ctsPlanAteHoje}
              final={data.totais.totalRealizado}
              falha={data.totais.falhados}
              bloq={data.totais.bloqueados}
              lib={data.totais.liberados}
              design={data.totais.design}
              naoLib={data.totais.naoLiberados}
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
                    {(data.dimensoes ?? []).map((d) => (
                      <th key={d.key}>{d.label}</th>
                    ))}
                    <th>Suites</th>
                    <th>Status</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th title="Total de CTs">TTL CTs</th>
                    <th title="CTs planejados">Plan</th>
                    <th title="Finalizados">Fin.</th>
                    <th>GAP</th>
                    <th title="CTs Passeds" className="col-divider">Passed</th>
                    <th title="CTs N/A">N/A</th>
                    <th title="CTs com ressalvas">Ress.</th>
                    <th title="CTs falhados">Falh.</th>
                    <th title="CTs bloqueados">Bloq.</th>
                    <th title="Liberados">Lib.</th>
                    <th>Design</th>
                    <th title="Não liberado">Não Lib.</th>
                  </tr>
                </thead>
                <tbody>
                  {suites.map((s) => (
                    <tr key={s.row_num}>
                      {(data.dimensoes ?? []).map((d) => (
                        <td key={d.key}>{s.classificacao?.[d.key] ?? (d.key === (data.dimensoes ?? [])[0]?.key ? s.frente : "")}</td>
                      ))}
                      <td className="col-suite" title={s.processo ?? ""}>
                        {s.suiteLabel}
                      </td>
                      <td className="col-status">
                        <StatusFace status={s.status} />
                      </td>
                      <td>{fmtDate(s.data_inicio ?? "")}</td>
                      <td>{fmtDate(s.data_fim ?? "")}</td>
                      <td>{s.ttlCts}</td>
                      <td>{s.cts_plan_dia ?? 0}</td>
                      <td>{s.total_realizado}</td>
                      <td>{s.gap}</td>
                      <td className="col-divider">{s.cts_passeds}</td>
                      <td>{s.cts_na}</td>
                      <td>{s.cts_cancelados}</td>
                      <td>{s.cts_falhados}</td>
                      <td>{s.cts_bloqueados}</td>
                      <td>{s.cts_liberados}</td>
                      <td>{s.cts_design}</td>
                      <td>{s.cts_nao_liberados}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="totals-row">
                    {(data.dimensoes ?? []).map((d) => (
                      <td key={d.key} />
                    ))}
                    <td className="col-suite">Valores Totais</td>
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
                    <td>{totals.cts_cancelados}</td>
                    <td>{totals.cts_falhados}</td>
                    <td>{totals.cts_bloqueados}</td>
                    <td>{totals.cts_liberados}</td>
                    <td>{totals.cts_design}</td>
                    <td>{totals.cts_nao_liberados}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <ReportCharts graficos={data.graficos} />

          <GestaoImpactosPanel data={data.gestaoImpactos} />
        </div>
      )}
    </LoadState>
  );
}
