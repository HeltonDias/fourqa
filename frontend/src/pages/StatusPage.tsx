import { useMemo, useState } from "react";
import { api } from "../api";
import { LoadState } from "../components/LoadState";
import { PageHeader } from "../components/PageHeader";
import { FrenteCard } from "../components/status/FrenteCard";
import { StatusSummary } from "../components/status/StatusSummary";
import { ordenarFrentes } from "../components/status/statusModel";
import { useReportChrome } from "../context/ReportChromeContext";
import { useFetch } from "../hooks/useFetch";

export function StatusPage() {
  const { dataVersion } = useReportChrome();
  const { data, loading, error } = useFetch(() => api.statusFrente(), [dataVersion]);
  const [busca, setBusca] = useState("");
  const frentes = useMemo(() => (data ? ordenarFrentes(data.blocos, busca) : []), [data, busca]);

  return (
    <LoadState loading={loading && !data} error={error}>
      {data && (
        <div className="status-page">
          <PageHeader
            title="Status"
            description="Visão operacional por frente, a partir dos dados do projeto atual."
            actions={
              <input
                type="search"
                className="exec-search"
                placeholder="Filtrar frente…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Filtrar frente"
              />
            }
          />

          {data.blocos.length === 0 ? (
            <div className="state-box">
              <p>Nenhuma frente detectada neste projeto.</p>
              <p className="hint">A dimensão de frente precisa estar visível no catálogo do plano para montar os painéis.</p>
            </div>
          ) : (
            <>
              <StatusSummary dto={data} />
              {data.sobreposicao && (
                <p className="status-note">
                  Há frentes cujo nome contém o de outra. O resumo do conjunto pode contar o mesmo item mais de uma vez.
                </p>
              )}
              {frentes.length === 0 ? (
                <div className="state-box">Nenhuma frente corresponde a “{busca.trim()}”.</div>
              ) : (
                <div className="status-grid">
                  {frentes.map((bloco) => (
                    <FrenteCard key={bloco.frente} bloco={bloco} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </LoadState>
  );
}
