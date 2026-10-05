import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { GraficoFatia } from "../types";

const FALLBACK_PALETTE = [
  "#2563eb",
  "#dc2626",
  "#f59e0b",
  "#16a34a",
  "#7c3aed",
  "#0891b2",
  "#a16207",
  "#db2777",
  "#475569",
  "#84cc16",
];

type Props = {
  data: GraficoFatia[];
  /** Cores por `key`; fatias sem cor usam a paleta padrão na ordem. */
  colors?: Record<string, string>;
  /** Texto pequeno abaixo do total no centro. */
  centerLabel?: string;
  /** Legenda ao lado (padrão) ou abaixo da rosca. */
  legend?: "side" | "bottom";
  emptyText?: string;
};

export function DonutChart({
  data,
  colors = {},
  centerLabel = "CTs",
  legend = "side",
  emptyText = "Sem dados para exibir.",
}: Props) {
  const total = data.reduce((a, f) => a + f.value, 0);
  const comValor = data.filter((f) => f.value > 0);
  const colorOf = (f: GraficoFatia, i: number) =>
    colors[f.key] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];

  return (
    <div className={`chart-pie-layout chart-pie-layout--${legend}`}>
      <div className="chart-body chart-pie-body">
        {total === 0 ? (
          <p className="chart-empty">{emptyText}</p>
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
                  <Cell key={f.key} fill={colorOf(f, data.indexOf(f))} />
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
            <span>{centerLabel}</span>
          </div>
        )}
      </div>
      <ul className="chart-legend">
        {data.map((f, i) => (
          <li key={f.key} className={f.value === 0 ? "is-zero" : undefined}>
            <span className="chart-legend-dot" style={{ background: colorOf(f, i) }} />
            <span className="chart-legend-label" title={f.label}>
              {f.label}
            </span>
            <span className="chart-legend-value">{f.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
