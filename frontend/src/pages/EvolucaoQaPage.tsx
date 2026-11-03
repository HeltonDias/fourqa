import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { useReportChrome } from "../context/ReportChromeContext";
import { useFetch } from "../hooks/useFetch";
import type { EvolucaoQaBucket, EvolucaoQaStatus } from "../types";
import "./evolucao-qa.css";

const STATUS_LABEL: Record<EvolucaoQaStatus, string> = {
  done: "Concluído",
  ok: "No prazo",
  warn: "Atenção",
  risk: "Em risco",
  na: "N/A",
};

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function EvolucaoQaPage() {
  const { planKey, dataVersion } = useReportChrome();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string>("");
  const { data, loading, error, reload } = useFetch(
    () => (planKey ? api.evolucaoQa(planKey, { from: from || undefined, to: to || undefined }) : Promise.resolve(null)),
    [planKey, from, to, dataVersion],
  );

  const qas = data?.qas ?? [];
  const current: EvolucaoQaBucket | null = useMemo(() => {
    if (!data) return null;
    if (selected === "__nao_atribuivel__") return data.unattributed;
    return qas.find((q) => q.key === selected) ?? qas[0] ?? data.unattributed;
  }, [data, qas, selected]);

  return (
    <div className="module-page evolucao-qa">
      <PageHeader
        title="Evolução QA"
        description="Planejado por responsável e realizado por data de conclusão, no período escolhido."
      />

      <p className="evolucao-notice" role="note">
        MVP: o realizado só é atribuído a suítes com um único responsável. Suítes sem responsável ou com
        vários nomes ficam em “Não atribuível”. Produtividade por executor real aguarda OPEN-001/OPEN-007.
      </p>

      <div className="evolucao-filters card-soft">
        <label>
          QA
          <select value={current?.key ?? ""} onChange={(e) => setSelected(e.target.value)} disabled={!data}>
            {qas.map((q) => (
              <option key={q.key} value={q.key}>
                {q.name}
              </option>
            ))}
            {data?.unattributed ? <option value="__nao_atribuivel__">Não atribuível</option> : null}
          </select>
        </label>
        <label>
          De
          <input type="date" value={from || data?.range.from || ""} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to || data?.range.to || ""} onChange={(e) => setTo(e.target.value)} />
        </label>
        {from || to ? (
          <button
            type="button"
            className="hub-btn-ghost"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Período do plano
          </button>
        ) : null}
      </div>

      {loading ? <div className="state-box">Carregando evolução…</div> : null}
      {error ? (
        <div className="state-box error">
          <p>{error}</p>
          <button type="button" className="hub-btn-ghost" onClick={reload}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!loading && !error && data && !current ? (
        <div className="state-box">Nenhuma suíte planejada neste período. Defina responsáveis na aba Planejar.</div>
      ) : null}

      {!loading && !error && current ? (
        <>
          <div className="evolucao-kpis">
            <Kpi label="Suítes" value={fmt(current.suiteCount)} />
            <Kpi label="Escopo (baseline)" value={fmt(current.baseline)} />
            <Kpi label="Planejado até hoje" value={fmt(current.plannedToDate)} />
            <Kpi label="Finalizado no período" value={fmt(current.finalizedInRange)} />
            <Kpi label="Gap" value={fmt(current.gap)} tone={current.gap > 0 ? "neg" : "pos"} />
            <Kpi label="Falhados" value={fmt(current.failed)} />
            <Kpi label="Bloqueados" value={fmt(current.blocked)} />
            <Kpi
              label="Status"
              value={current.status ? STATUS_LABEL[current.status] : "Não atribuível"}
              className={current.status ? `evolucao-status evolucao-status--${current.status}` : undefined}
            />
          </div>

          {!current.attributable ? (
            <p className="evolucao-notice">
              {current.reasons.sem_responsavel} suíte(s) sem responsável e {current.reasons.compartilhada} com
              responsáveis compartilhados.
            </p>
          ) : null}

          <section className="card chart-panel evolucao-chart">
            <div className="chart-head">
              <h2>Planejado x finalizado por dia</h2>
            </div>
            <div className="chart-body">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={current.daily} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={fmtDiaMes} tick={{ fontSize: 10 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip labelFormatter={(v) => fmtDiaMes(String(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="planned" name="Planejado no dia" fill="#93c5fd" isAnimationActive={false} />
                  <Bar dataKey="finalized" name="Finalizado no dia" fill="#86efac" isAnimationActive={false} />
                  <Line
                    dataKey="plannedCumulative"
                    name="Planejado acumulado"
                    stroke="#2563eb"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="finalizedCumulative"
                    name="Finalizado acumulado"
                    stroke="#16a34a"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card evolucao-table-wrap">
            <h2>Suítes</h2>
            <table className="evolucao-table">
              <thead>
                <tr>
                  <th>Suíte</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {current.suites.map((s) => (
                  <tr key={`${s.suiteId ?? "p"}-${s.testPointId ?? ""}-${s.suiteName}`}>
                    <td>{s.suiteName ?? "—"}</td>
                    <td>{s.responsavel || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {qas.length > 1 ? (
            <section className="card evolucao-table-wrap">
              <h2>Comparativo por QA</h2>
              <table className="evolucao-table">
                <thead>
                  <tr>
                    <th>QA</th>
                    <th>Suítes</th>
                    <th>Planejado até hoje</th>
                    <th>Finalizado no período</th>
                    <th>Gap</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {qas.map((q) => (
                    <tr key={q.key} className={q.key === current.key ? "is-current" : undefined}>
                      <td>
                        <button type="button" className="evolucao-link" onClick={() => setSelected(q.key)}>
                          {q.name}
                        </button>
                      </td>
                      <td>{fmt(q.suiteCount)}</td>
                      <td>{fmt(q.plannedToDate)}</td>
                      <td>{fmt(q.finalizedInRange)}</td>
                      <td>{fmt(q.gap)}</td>
                      <td>{q.status ? STATUS_LABEL[q.status] : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  className?: string;
}) {
  return (
    <div className="evolucao-kpi card-soft">
      <span>{label}</span>
      <strong className={[tone ? `evolucao-${tone}` : "", className ?? ""].join(" ").trim() || undefined}>{value}</strong>
    </div>
  );
}
