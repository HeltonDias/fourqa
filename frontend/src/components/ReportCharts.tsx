import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HomeGraficos } from "../types";

/** Cores alinhadas aos cards de "Status dos Cenários". */
const SLICE_COLORS: Record<string, string> = {
  passeds: "#16a34a",
  na: "#94a3b8",
  cancelados: "#a16207",
  falhados: "#dc2626",
  bloqueados: "#ea580c",
  liberados: "#0284c7",
  design: "#7c3aed",
  naoLiberados: "#334155",
};

const PLAN_COLOR = "#2563eb";
const REAL_COLOR = "#dc2626";

function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtDataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function PlanejadoVsRealizado({ data }: { data: HomeGraficos["planejadoVsRealizado"] }) {
  const ultimo = data[data.length - 1];
  const realizadoAtual = [...data].reverse().find((p) => p.realizado != null)?.realizado ?? 0;

  return (
    <section className="card chart-panel chart-panel-line">
      <div className="chart-head">
        <h2>Planejado Vs Realizado</h2>
        <div className="chart-summary">
          <span className="chart-chip" style={{ color: PLAN_COLOR }}>
            Planejado: <strong>{ultimo ? Math.round(ultimo.planejado) : 0}</strong>
          </span>
          <span className="chart-chip" style={{ color: REAL_COLOR }}>
            Realizado: <strong>{realizadoAtual}</strong>
          </span>
        </div>
      </div>
      {data.length === 0 ? (
        <p className="chart-empty">Sem período planejado para exibir.</p>
      ) : (
        <div className="chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="data"
                tickFormatter={fmtDiaMes}
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                labelFormatter={(v) => fmtDataBr(String(v))}
                formatter={(value, name) => [
                  typeof value === "number" ? Math.round(value) : "–",
                  name === "planejado" ? "Planejado" : "Realizado",
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0", background: "#fff" }}
                labelStyle={{ color: "#22233d" }}
              />
              <Legend
                verticalAlign="bottom"
                iconType="plainline"
                formatter={(v) => (v === "planejado" ? "Planejado" : "Realizado")}
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              />
              <Line
                type="monotone"
                dataKey="planejado"
                stroke={PLAN_COLOR}
                strokeWidth={2}
                dot={{ r: 2, strokeWidth: 0, fill: PLAN_COLOR }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="realizado"
                stroke={REAL_COLOR}
                strokeWidth={2}
                dot={{ r: 2, strokeWidth: 0, fill: REAL_COLOR }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function StatusExecucoes({ data }: { data: HomeGraficos["statusExecucoes"] }) {
  const total = data.reduce((a, f) => a + f.value, 0);
  const comValor = data.filter((f) => f.value > 0);

  return (
    <section className="card chart-panel chart-panel-pie">
      <div className="chart-head">
        <h2>Status das Execuções</h2>
        <span className="chart-chip">
          Total: <strong>{total}</strong>
        </span>
      </div>
      <div className="chart-pie-layout">
        <div className="chart-body chart-pie-body">
          {total === 0 ? (
            <p className="chart-empty">Sem execuções classificadas.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={comValor}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius="48%"
                  outerRadius="85%"
                  paddingAngle={comValor.length > 1 ? 2 : 0}
                  stroke={comValor.length > 1 ? "#fff" : "none"}
                  isAnimationActive={false}
                >
                  {comValor.map((f) => (
                    <Cell key={f.key} fill={SLICE_COLORS[f.key] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    `${value} (${total ? Math.round((Number(value) / total) * 100) : 0}%)`,
                    String(name),
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0", background: "#fff" }}
                  labelStyle={{ color: "#22233d" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {total > 0 && (
            <div className="chart-pie-center" aria-hidden>
              <strong>{total}</strong>
              <span>CTs</span>
            </div>
          )}
        </div>
        <ul className="chart-legend">
          {data.map((f) => (
            <li key={f.key} className={f.value === 0 ? "is-zero" : undefined}>
              <span
                className="chart-legend-dot"
                style={{ background: SLICE_COLORS[f.key] ?? "#64748b" }}
              />
              <span className="chart-legend-label">{f.label}</span>
              <span className="chart-legend-value">{f.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ReportCharts({ graficos }: { graficos: HomeGraficos }) {
  return (
    <div className="charts-row">
      <PlanejadoVsRealizado data={graficos.planejadoVsRealizado} />
      <StatusExecucoes data={graficos.statusExecucoes} />
    </div>
  );
}
