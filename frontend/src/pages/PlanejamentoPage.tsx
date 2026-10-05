import { api, fmtDate } from "../api";
import { LoadState } from "../components/LoadState";
import { useFetch } from "../hooks/useFetch";

export function PlanejamentoPage() {
  const { data, loading, error } = useFetch(() => api.planejamento(), []);

  return (
    <LoadState loading={loading} error={error}>
      {data && (
        <div className="page">
          <header className="page-head">
            <h1>2) Planejamento</h1>
            <p>
              Métricas L–S calculadas como na planilha (<code>COUNTIFS</code> em execuções). Período{" "}
              {fmtDate(data.periodo.inicio)} – {fmtDate(data.periodo.fim)}.
            </p>
          </header>
          <div className="table-wrap wide">
            <table>
              <thead>
                <tr>
                  <th>Prior.</th>
                  <th>Frente</th>
                  <th>Processo</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Repl.</th>
                  <th>Plan H</th>
                  <th>Real K</th>
                  <th>L Pass</th>
                  <th>M N/A</th>
                  <th>N Canc.</th>
                  <th>O Falha</th>
                  <th>P Bloq.</th>
                  <th>Q Liber.</th>
                  <th>R Design</th>
                  <th>S Não lib.</th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((r) => (
                  <tr key={r.row_num}>
                    <td>{r.prioridades}</td>
                    <td>{r.frente}</td>
                    <td className="truncate" title={r.processo ?? ""}>
                      {r.processo}
                    </td>
                    <td>{fmtDate(r.data_inicio ?? "")}</td>
                    <td>{fmtDate(r.data_fim ?? "")}</td>
                    <td>{r.replanejamento}</td>
                    <td>{r.qtd_cts_plan ?? 0}</td>
                    <td>{r.total_realizado}</td>
                    <td>{r.cts_passeds}</td>
                    <td>{r.cts_na}</td>
                    <td>{r.cts_cancelados}</td>
                    <td>{r.cts_falhados}</td>
                    <td>{r.cts_bloqueados}</td>
                    <td>{r.cts_liberados}</td>
                    <td>{r.cts_design}</td>
                    <td>{r.cts_nao_liberados}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="totals">
                  <td colSpan={6}>Totais (linha 44)</td>
                  <td>{data.totais.ctsPlan}</td>
                  <td>{data.totais.totalRealizado}</td>
                  <td>{data.totais.passeds}</td>
                  <td>{data.totais.na}</td>
                  <td>{data.totais.cancelados}</td>
                  <td>{data.totais.falhados}</td>
                  <td>{data.totais.bloqueados}</td>
                  <td>{data.totais.liberados}</td>
                  <td>{data.totais.design}</td>
                  <td>{data.totais.naoLiberados}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </LoadState>
  );
}
