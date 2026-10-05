import { api } from "../api";
import { LoadState } from "../components/LoadState";
import { useFetch } from "../hooks/useFetch";

export function StatusFrentePage() {
  const { data, loading, error } = useFetch(() => api.statusFrente(), []);

  return (
    <LoadState loading={loading} error={error}>
      {data && (
        <div className="page">
          <header className="page-head">
            <h1>Status por frente</h1>
            <p>Painéis por frente: cenários via <code>SUMIF</code> no planejamento; bugs via falhas.</p>
          </header>
          <div className="frente-grid">
            {data.blocos.map((b) => (
              <article key={b.frente} className="frente-card">
                <h2>{b.frente}</h2>
                <h3>Cenários</h3>
                <dl className="mini-stats">
                  <div>
                    <dt>TTL / Plan</dt>
                    <dd>
                      {b.cenarios.ttl} / {b.cenarios.plan}
                    </dd>
                  </div>
                  <div>
                    <dt>Finalizado</dt>
                    <dd>{b.cenarios.finalizado}</dd>
                  </div>
                  <div>
                    <dt>Falha</dt>
                    <dd>{b.cenarios.falha}</dd>
                  </div>
                  <div>
                    <dt>Bloqueado</dt>
                    <dd>{b.cenarios.bloqueado}</dd>
                  </div>
                  <div>
                    <dt>Liberado</dt>
                    <dd>{b.cenarios.liberado}</dd>
                  </div>
                  <div>
                    <dt>Design</dt>
                    <dd>{b.cenarios.design}</dd>
                  </div>
                  <div>
                    <dt>Não lib.</dt>
                    <dd>{b.cenarios.naoLib}</dd>
                  </div>
                </dl>
                <h3>Bugs</h3>
                <dl className="mini-stats">
                  <div>
                    <dt>Total</dt>
                    <dd>{b.bugs.total}</dd>
                  </div>
                  <div>
                    <dt>Fechados</dt>
                    <dd>{b.bugs.fechados}</dd>
                  </div>
                  <div>
                    <dt>Abertos DEV</dt>
                    <dd>{b.bugs.abertosDev}</dd>
                  </div>
                  <div>
                    <dt>Abertos Cliente</dt>
                    <dd>{b.bugs.abertosCliente}</dd>
                  </div>
                  <div>
                    <dt>Reteste</dt>
                    <dd>{b.bugs.reteste}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <section className="panel total-frente">
            <h2>TOTAL (consolidado)</h2>
            <pre className="json-lite">{JSON.stringify(data.total, null, 2)}</pre>
          </section>
        </div>
      )}
    </LoadState>
  );
}
