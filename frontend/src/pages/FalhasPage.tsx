import { useEffect, useState, type ReactNode } from "react";
import { api, fmtDateTime } from "../api";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { useReportChrome } from "../context/ReportChromeContext";
import type { FalhaRow } from "../types";

/** Colunas na ordem de tbScriptFalhasCampos (Config_Teste). */
const COLUNAS: { campo: string; render: (r: FalhaRow) => ReactNode; texto: (r: FalhaRow) => string }[] = [
  col("PlanKey", (r) => r.plan_key),
  col("Responsavel", (r) => r.responsavel),
  col("Ambiente", (r) => r.ambiente),
  col("Categoria", (r) => r.categoria),
  col("ID", (r) => r.bug_id),
  col("Impacto", (r) => r.impacto),
  col("Frente", (r) => r.frente),
  col("Título", (r) => r.titulo),
  col("Status", (r) => r.status),
  col("Criação", (r) => (r.criacao ? fmtDateTime(r.criacao) : "")),
  col("Fechamento", (r) => (r.fechamento ? fmtDateTime(r.fechamento) : "")),
  {
    campo: "Links",
    texto: (r) => r.links ?? "",
    render: (r) =>
      r.links ? (
        <a href={r.links} target="_blank" rel="noreferrer">
          Abrir
        </a>
      ) : null,
  },
  col("Tags", (r) => r.tags),
];

function col(campo: string, get: (r: FalhaRow) => string | number | null) {
  const texto = (r: FalhaRow) => {
    const v = get(r);
    return v === null || v === undefined ? "" : String(v);
  };
  return { campo, texto, render: texto };
}

const PAGE = 50;

export function FalhasPage() {
  const { dataVersion, planKey } = useReportChrome();
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; rows: FalhaRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(busca.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    api
      .falhas({ limit: PAGE, offset, q, planKey: planKey || undefined })
      .then((d) => {
        if (!cancel) setData(d);
      })
      .catch((e: Error) => {
        if (!cancel) setError(e.message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [offset, q, dataVersion, planKey]);

  const linhas = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <LoadState loading={loading && !data} error={error}>
      {data && (
        <div className="exec-page">
          <PageHeader
            title="Falhas"
            description={
              <>
                Bugs associados aos resultados do Test Plan no Azure DevOps na última atualização ·{" "}
                <strong>{total}</strong> registros
              </>
            }
            actions={
              <input
                type="search"
                className="exec-search"
                placeholder="Filtrar no servidor…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Filtrar falhas"
              />
            }
          />

          <div className="card exec-table-wrap">
            <table className="exec-table">
              <thead>
                <tr>
                  {COLUNAS.map((c) => (
                    <th key={c.campo}>{c.campo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => (
                  <tr key={r.id}>
                    {COLUNAS.map((c) => (
                      <td key={c.campo} title={c.texto(r)}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={COLUNAS.length} className="exec-empty">
                      Nenhum registro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-pager">
            <button type="button" className="title-edit-cancel" disabled={offset === 0} onClick={() => setOffset((n) => Math.max(0, n - PAGE))}>
              Anterior
            </button>
            <span className="muted">
              {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + linhas.length, total)}`} de {total}
            </span>
            <button type="button" className="title-edit-cancel" disabled={offset + PAGE >= total} onClick={() => setOffset((n) => n + PAGE)}>
              Próxima
            </button>
          </div>
        </div>
      )}
    </LoadState>
  );
}
