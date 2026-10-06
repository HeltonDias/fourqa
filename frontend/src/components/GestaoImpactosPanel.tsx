import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { GraficoFatia, HomeGestaoImpactos } from "../types";

/** Cores da planilha (Frentes) por frente. */
const FRENTE_COLORS: Record<string, string> = {
  GEATE: "#3b82f6",
  GEDEV: "#ef4444",
  GEFEA: "#facc15",
  GEFIS: "#94a3b8",
  GEMCO: "#f97316",
  GERORJ: "#22b8cf",
  GERSA: "#1d4ed8",
  GESIN: "#991b1b",
};

const STATUS_COLORS: Record<string, string> = {
  Active: "#3b82f6",
  New: "#ef4444",
  Resolved: "#f5b800",
  Closed: "#16a34a",
};

const PALETTE = ["#3b82f6", "#ef4444", "#f5b800", "#16a34a", "#7c3aed", "#f97316", "#0891b2", "#64748b"];

function colorFor(f: GraficoFatia, i: number, map?: Record<string, string>): string {
  return map?.[f.key] ?? PALETTE[i % PALETTE.length];
}

function PieCard({
  title,
  data,
  colors,
  singleColumnLegend = false,
}: {
  title: string;
  data: GraficoFatia[];
  colors?: Record<string, string>;
  singleColumnLegend?: boolean;
}) {
  const total = data.reduce((a, f) => a + f.value, 0);
  const comValor = data
    .map((f, i) => ({ ...f, color: colorFor(f, i, colors) }))
    .filter((f) => f.value > 0);

  return (
    <section className="card chart-panel chart-panel-pie">
      <div className="chart-head">
        <h2>{title}</h2>
        <span className="chart-chip">
          Total: <strong>{total}</strong>
        </span>
      </div>
      <div className="chart-body chart-pie-body">
        {total === 0 ? (
          <p className="chart-empty">Sem bugs abertos.</p>
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
                  <Cell key={f.key} fill={f.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  `${value} (${total ? Math.round((Number(value) / total) * 100) : 0}%)`,
                  String(name),
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
        {total > 0 && (
          <div className="chart-pie-center" aria-hidden>
            <strong>{total}</strong>
            <span>Bugs</span>
          </div>
        )}
      </div>
      <ul className={`chart-legend chart-legend-grid${singleColumnLegend ? " is-single" : ""}`}>
        {data.map((f, i) => (
          <li key={f.key} className={f.value === 0 ? "is-zero" : undefined}>
            <span className="chart-legend-dot" style={{ background: colorFor(f, i, colors) }} />
            <span className="chart-legend-label" title={f.label}>
              {f.label}
            </span>
            <span className="chart-legend-value">{f.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GestaoImpactosPanel({ data }: { data: HomeGestaoImpactos }) {
  const c = data.cards;
  const cards: { label: string; value: number; tone?: string }[] = [
    { label: "Total de Bugs", value: c.total },
    { label: "Fechados", value: c.fechados, tone: "ok" },
    { label: "Pendentes", value: c.pendentes, tone: "warn" },
    { label: "Em ReTestes", value: c.emRetestes },
    { label: "Bugs Abertos DEV", value: c.abertosDev, tone: "risk" },
    { label: "Bugs Abertos Cliente", value: c.abertosCliente, tone: "risk" },
    { label: "Bugs Abertos Outros", value: c.abertosOutros },
  ];

  return (
    <section className="gestao-impactos">
      <h2 className="gestao-impactos-title">Gestão de Impactos</h2>
      <div className="gestao-impactos-grid">
        <div className="gestao-cards">
          {cards.map((k) => (
            <div key={k.label} className={`card gestao-card${k.tone ? ` is-${k.tone}` : ""}`}>
              <span>{k.label}</span>
              <strong>{k.value}</strong>
            </div>
          ))}
        </div>
        {data.frentes.some((f) => f.value > 0) ? (
          <PieCard title="Frentes" data={data.frentes.filter((f) => f.value > 0)} colors={FRENTE_COLORS} />
        ) : null}
        <PieCard title="Status dos Defeitos" data={data.status} colors={STATUS_COLORS} />
        <PieCard title="Categoria" data={data.categoria} singleColumnLegend />
      </div>
    </section>
  );
}
