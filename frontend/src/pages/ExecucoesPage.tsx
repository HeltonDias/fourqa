import { useEffect, useState, type ReactNode } from "react";
import { api, fmtDateTime } from "../api";
import { chosenColumns } from "../fieldColumns";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { useReportChrome } from "../context/ReportChromeContext";
import type { ExecucaoRow } from "../types";

/** Colunas na ordem de tbScriptExecucoesCampos (Config_Teste). */
const COLUNAS: { campo: string; render: (r: ExecucaoRow) => ReactNode; texto: (r: ExecucaoRow) => string }[] = [
  col("PlanKey", (r) => r.plan_key),
  col("PlanId", (r) => r.plan_id),
  col("PlanName", (r) => r.plan_name),
  col("Frente", (r) => r.frente),
  col("Atalho", (r) => r.atalho),
  col("SuiteId", (r) => r.suite_id),
  col("SuiteName", (r) => r.suite_name),
  col("TestPointId", (r) => r.test_point_id),
  col("TestCaseId", (r) => r.test_case_id),
  col("TestCaseTitle", (r) => r.test_case_title),
  col("Prioridade", (r) => r.case_priority),
  col("Responsabilidade", (r) => r.responsabilidade),
  col("TestCaseState", (r) => r.test_case_state),
  col("TestPointState", (r) => r.test_point_state),
  col("Outcome", (r) => r.outcome),
  col("DateCompleted", (r) => (r.date_completed ? fmtDateTime(r.date_completed) : "")),
  col("RunBy", (r) => r.run_by),
  col("LastUpdatedDate", (r) => (r.last_updated_date ? fmtDateTime(r.last_updated_date) : "")),
  col("LastTestRunId", (r) => r.last_test_run_id),
  col("LastResultId", (r) => r.last_result_id),
  {
    campo: "TestCaseLink",
    texto: (r) => r.test_case_link ?? "",
    render: (r) =>
      r.test_case_link ? (
        <a href={r.test_case_link} target="_blank" rel="noreferrer">
          Abrir
        </a>
      ) : null,
  },
  col("TestCaseTags", (r) => r.test_case_tags),
];

function col(campo: string, get: (r: ExecucaoRow) => string | number | null) {
  const texto = (r: ExecucaoRow) => {
    const v = get(r);
    return v === null || v === undefined ? "" : String(v);
  };
  return { campo, texto, render: texto };
}

const PAGE = 50;

export function ExecucoesPage() {
  const { dataVersion, planKey } = useReportChrome();
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; rows: ExecucaoRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[] | null>(null);
  const colunas = chosenColumns(COLUNAS, selectedFields);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(busca.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    let cancel = false;
    api
      .syncSettings()
      .then((settings) => {
        if (!cancel) setSelectedFields(settings.source === "saved" ? settings.executionFields : null);
      })
      .catch(() => {
        if (!cancel) setSelectedFields(null);
      });
    return () => {
      cancel = true;
    };
  }, [dataVersion]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    api
      .execucoes({ limit: PAGE, offset, q, planKey: planKey || undefined })
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
    <div className="exec-page module-page">
      <PageHeader
        title="Execuções"
        description={
          <>
            Test Points retornados pelo Azure DevOps na última atualização
            {data ? <> · <strong>{total}</strong> registros</> : null}
          </>
        }
        actions={
          <input
            type="search"
            className="exec-search"
            placeholder="Filtrar no servidor…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Filtrar execuções"
          />
        }
      />
      <LoadState loading={loading && !data} error={error}>
        {data && (
          <>
          <div className="card exec-table-wrap">
            <table className="exec-table">
              <thead>
                <tr>
                  {colunas.map((c) => (
                    <th key={c.campo}>{c.campo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => (
                  <tr key={r.id}>
                    {colunas.map((c) => (
                      <td key={c.campo} title={c.texto(r)}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={colunas.length} className="exec-empty">
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
          </>
        )}
      </LoadState>
    </div>
  );
}
