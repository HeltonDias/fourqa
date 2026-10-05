import { api, fmtDate, pct } from "../api";
import { KpiCard } from "../components/KpiCard";
import { LoadState } from "../components/LoadState";
import { useFetch } from "../hooks/useFetch";

export function HomePage() {
  const { data, loading, error } = useFetch(() => api.home(), []);

  return (
    <LoadState loading={loading} error={error}>
      {data && (
        <div className="page home-page">
          <section className="hero">
            <h1>{data.title.trim()}</h1>
            <p className="meta-line">
              Período {fmtDate(data.periodo.inicio)} → {fmtDate(data.periodo.fim)} · PlanKey{" "}
              <code>{data.planKey}</code> · Atualizado {fmtDate(data.atualizadoEm)}
            </p>
          </section>

          <section className="kpi-grid">
            <KpiCard label="% Plan (realizado / plan)" value={pct(data.percentuais.plan)} />
            <KpiCard label="% Real (passeds / plan)" value={pct(data.percentuais.real)} tone="ok" />
            <KpiCard label="Replanejamento (Σ G)" value={data.replanejamentoTotal} tone="warn" />
            <KpiCard label="CTS plan (H)" value={data.totais.ctsPlan} />
            <KpiCard label="Total realizado (K)" value={data.totais.totalRealizado} />
            <KpiCard label="Passeds (L)" value={data.totais.passeds} tone="ok" />
            <KpiCard label="Falhados (O)" value={data.totais.falhados} tone="danger" />
            <KpiCard label="Bloqueados (P)" value={data.totais.bloqueados} tone="warn" />
          </section>

          <section className="panel">
            <h2>Impactos (linha 14)</h2>
            <div className="kpi-grid compact">
              <KpiCard
                label="A14 · Failed+Blocked (TestPointState)"
                value={data.impactos.totalTestPointFailedBlocked}
              />
              <KpiCard label="C14 · Foursys" value={data.impactos.foursys} />
              <KpiCard label="D14 · Cliente" value={data.impactos.cliente} />
              <KpiCard label="E14 · Reteste" value={data.impactos.reteste} />
            </div>
          </section>

          <section className="panel">
            <h2>Bugs (Controle_Falhas)</h2>
            <div className="kpi-grid compact">
              <KpiCard label="Total" value={data.bugs.total} />
              <KpiCard label="Fechados" value={data.bugs.fechados} tone="ok" />
              <KpiCard label="Abertos DEV" value={data.bugs.abertosDev} tone="warn" />
              <KpiCard label="Abertos Cliente" value={data.bugs.abertosCliente} tone="warn" />
              <KpiCard label="Reteste (Resolved)" value={data.bugs.retesteResolved} />
              <KpiCard label="Outros" value={data.bugs.outros} />
            </div>
          </section>

          <section className="panel">
            <h2>Suites (espelho Planejamento)</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Frente</th>
                    <th>Processo</th>
                    <th>Plan</th>
                    <th>Realizado</th>
                    <th>Passed</th>
                    <th>Falha</th>
                    <th>Bloq.</th>
                    <th>Liber.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suites.map((s) => (
                    <tr key={s.row_num}>
                      <td>{s.frente}</td>
                      <td className="truncate" title={s.processo ?? ""}>
                        {s.processo}
                      </td>
                      <td>{s.qtd_cts_plan ?? 0}</td>
                      <td>{s.total_realizado}</td>
                      <td>{s.cts_passeds}</td>
                      <td>{s.cts_falhados}</td>
                      <td>{s.cts_bloqueados}</td>
                      <td>{s.cts_liberados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </LoadState>
  );
}
