import { api } from "../api";
import { LoadState } from "../components/LoadState";
import { useFetch } from "../hooks/useFetch";

export function ExecucoesPage() {
  const { data, loading, error } = useFetch(() => api.execucoes(2000), []);

  return (
    <LoadState loading={loading} error={error}>
      {data && (
        <div className="page">
          <header className="page-head">
            <h1>Controle de Execuções</h1>
            <p>
              Base <code>tbControle_ExecucoesScript</code> — {data.total} linhas (limite de exibição
              2000).
            </p>
          </header>
          <div className="table-wrap wide">
            <table>
              <thead>
                <tr>
                  <th>Frente</th>
                  <th>Processo</th>
                  <th>Suite</th>
                  <th>Caso</th>
                  <th>TC State</th>
                  <th>TP State</th>
                  <th>Outcome</th>
                  <th>Resp.</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.frente}</td>
                    <td className="truncate" title={r.processo ?? ""}>
                      {r.processo}
                    </td>
                    <td className="truncate" title={r.suite_name ?? ""}>
                      {r.suite_name}
                    </td>
                    <td className="truncate" title={r.test_case_title ?? ""}>
                      {r.test_case_title}
                    </td>
                    <td>{r.test_case_state}</td>
                    <td>{r.test_point_state}</td>
                    <td>{r.outcome}</td>
                    <td>{r.responsabilidade || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </LoadState>
  );
}
