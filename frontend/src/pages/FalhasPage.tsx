import { api } from "../api";
import { LoadState } from "../components/LoadState";
import { useFetch } from "../hooks/useFetch";

export function FalhasPage() {
  const { data, loading, error } = useFetch(() => api.falhas(2000), []);

  return (
    <LoadState loading={loading} error={error}>
      {data && (
        <div className="page">
          <header className="page-head">
            <h1>Controle de falhas</h1>
            <p>
              Base <code>tbControle_FalhasScript</code> — {data.total} linhas. Se vazio, reimporte
              após sincronizar Azure na planilha.
            </p>
          </header>
          {data.total === 0 ? (
            <div className="state-box">Nenhuma falha importada nesta cópia da planilha.</div>
          ) : (
            <div className="table-wrap wide">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Responsável</th>
                    <th>Frente</th>
                    <th>Status</th>
                    <th>Impacto</th>
                    <th>Título</th>
                    <th>Criação</th>
                    <th>Fechamento</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.bug_id}</td>
                      <td>{r.responsavel}</td>
                      <td>{r.frente}</td>
                      <td>{r.status}</td>
                      <td>{r.impacto ?? "—"}</td>
                      <td className="truncate" title={r.titulo ?? ""}>
                        {r.titulo}
                      </td>
                      <td>{r.criacao}</td>
                      <td>{r.fechamento || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </LoadState>
  );
}
