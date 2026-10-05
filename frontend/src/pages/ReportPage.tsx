import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, fmtDateTime, fmtPctBr, type HomeDto } from "../api";
import { LoadState } from "../components/LoadState";
import { ImpactResponsaveisPanel } from "../components/ImpactResponsaveisPanel";
import { ReportCharts } from "../components/ReportCharts";
import { ReportKpiRow } from "../components/ReportKpiRow";
import { ScenarioStatusPanel } from "../components/ScenarioStatusPanel";
import { StatusFace } from "../components/StatusFace";
import type { ReportSuiteRow } from "../types";

/** Linha "Valores Totais >>>>>>>" da planilha: não é suíte, vira rodapé fixo. */
function isTotalsRow(s: ReportSuiteRow): boolean {
  return /valores\s+totais/i.test(s.processo ?? "");
}

const TOTAL_KEYS = [
  "ttlCts",
  "qtd_cts_plan",
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
  const [data, setData] = useState<HomeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .home()
      .then((d) => {
        setData(d);
        setNow(new Date());
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const suites = data ? data.suites.filter((s) => !isTotalsRow(s)) : [];
  const totals = sumSuites(suites);

  return (
    <LoadState loading={loading} error={error}>
      {data && (
        <div className="report-page">
          <header className="report-header">
            <div className="report-titles">
              <h1>{data.title}</h1>
              <p className="report-subtitle">{data.subtitle}</p>
            </div>

            <div className="report-dates-row">
              <div className="report-dates-block card-soft">
                <div>
                  <span className="muted">Data Início:</span> {fmtDate(data.periodo.inicio)}
                </div>
                <div>
                  <span className="muted">Data Fim:</span> {fmtDate(data.periodo.fim)}
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
            <button type="button" className="btn-primary" onClick={load}>
              Atualizar
            </button>
            <p className="last-update">
              Última Atualização:{" "}
              {fmtDateTime(data.ultimaImportacao ?? data.atualizadoEm)}
            </p>
          </div>

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
              plan={data.totais.ctsPlan}
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
                    <th>Frente</th>
                    <th>Suites</th>
                    <th>Status</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th title="Total de CTs">TTL CTs</th>
                    <th title="CTs planejados">Plan</th>
                    <th title="Finalizados">Fin.</th>
                    <th>GAP</th>
                    <th title="CTs Passeds">Passed</th>
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
                      <td>{s.frente}</td>
                      <td className="col-suite" title={s.processo ?? ""}>
                        {s.suiteLabel}
                      </td>
                      <td className="col-status">
                        <StatusFace status={s.status} />
                      </td>
                      <td>{fmtDate(s.data_inicio ?? "")}</td>
                      <td>{fmtDate(s.data_fim ?? "")}</td>
                      <td>{s.ttlCts}</td>
                      <td>{s.qtd_cts_plan ?? 0}</td>
                      <td>{s.total_realizado}</td>
                      <td>{s.gap}</td>
                      <td>{s.cts_passeds}</td>
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
                    <td />
                    <td className="col-suite">Valores Totais</td>
                    <td className="col-status">
                      <StatusFace status={data.statusGeral} />
                    </td>
                    <td>–</td>
                    <td>–</td>
                    <td>{totals.ttlCts}</td>
                    <td>{totals.qtd_cts_plan}</td>
                    <td>{totals.total_realizado}</td>
                    <td>{totals.gap}</td>
                    <td>{totals.cts_passeds}</td>
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
        </div>
      )}
    </LoadState>
  );
}
