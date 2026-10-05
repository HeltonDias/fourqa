import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { GraficoFatia, HomeGestaoImpactos } from "../types";

/** Paleta das frentes (mesma ordem da legenda da planilha). */
const FRENTE_COLORS: Record<string, string> = {
  geate: "#3b82f6",
  gedev: "#ef4444",
  gefea: "#f59e0b",
  gefis: "#84cc16",
  gemco: "#f97316",
  gerorj: "#1d4ed8",
  gersa: "#991b1b",
  gesin: "#a16207",
  outros: "#94a3b8",
};

/** Status dos defeitos (Azure DevOps). */
const STATUS_COLORS: Record<string, string> = {
  active: "#2563eb",
  new: "#dc2626",
  resolved: "#f59e0b",
  closed: "#16a34a",
  removed: "#64748b",
};

/** Categorias: paleta sequencial estável. */
const CATEGORIA_PALETTE = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#0891b2",
  "#a16207",
  "#64748b",
];

function colorFor(
  fatia: GraficoFatia,
  index: number,
  fixed?: Record<string, string>,
): string {
  if (fixed && fixed[fatia.key]) return fixed[fatia.key];
  return CATEGORIA_PALETTE[index % CATEGORIA_PALETTE.length];
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="impact-counter">
      <span className="impact-counter-label">{label}</span>
      <strong className="impact-counter-value">{value}</strong>
    </div>
  );
}

function PieCard({
  title,
  data,
  fixedColors,
  emptyText,
}: {
  title: string;
  data: GraficoFatia[];
  fixedColors?: Record<string, string>;
  emptyText: string;
}) {
  const total = data.reduce((a, f) => a + f.value, 0);
  const comValor = data.filter((f) => f.value > 0);
  const colorOf = (f: GraficoFatia) => colorFor(f, data.indexOf(f), fixedColors);

  return (
    <section className="card chart-panel impact-pie-card">
      <div className="chart-head">
        <h2>{title}</h2>
        <span className="chart-chip">
          Total: <strong>{total}</strong>
        </span>
      </div>
      <div className="chart-body impact-pie-body">
        {total === 0 ? (
          <p className="chart-empty">{emptyText}</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={comValor}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="82%"
                  paddingAngle={comValor.length > 1 ? 2 : 0}
                  stroke={comValor.length > 1 ? "#fff" : "none"}
                  isAnimationActive={false}
                >
                  {comValor.map((f) => (
                    <Cell key={f.key} fill={colorOf(f)} />
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
            <div className="chart-pie-center" aria-hidden>
              <strong>{total}</strong>
              <span>bugs</span>
            </div>
          </>
        )}
      </div>
      <ul className="chart-legend chart-legend-wrap">
        {data.map((f) => (
          <li key={f.key} className={f.value === 0 ? "is-zero" : undefined}>
            <span className="chart-legend-dot" style={{ background: colorOf(f) }} />
            <span className="chart-legend-label">{f.label}</span>
            <span className="chart-legend-value">{f.value}</span>
          </li>
        ))}
        {data.length === 0 && <li className="is-zero">Sem registros</li>}
      </ul>
    </section>
  );
}

export function GestaoImpactosPanel({ dados }: { dados: HomeGestaoImpactos }) {
  const c = dados.contadores;
  return (
    <section className="impact-mgmt" aria-label="Gestão de Impactos">
      <h2 className="impact-mgmt-title">Gestão de Impactos</h2>
      <div className="impact-mgmt-grid">
        <div className="impact-counters card">
          <Counter label="Total de Bugs" value={c.total} />
          <Counter label="Fechados" value={c.fechados} />
          <Counter label="Pendentes" value={c.pendentes} />
          <Counter label="Em ReTestes" value={c.emRetestes} />
          <Counter label="Bugs Abertos DEV" value={c.abertosDev} />
          <Counter label="Bugs Abertos Cliente" value={c.abertosCliente} />
          <Counter label="Bugs Abertos Outros" value={c.abertosOutros} />
        </div>
        <PieCard
          title="Frentes"
          data={dados.porFrente}
          fixedColors={FRENTE_COLORS}
          emptyText="Nenhum bug aberto por frente."
        />
        <PieCard
          title="Status dos Defeitos"
          data={dados.porStatus}
          fixedColors={STATUS_COLORS}
          emptyText="Nenhum defeito em aberto."
        />
        <PieCard
          title="Categoria"
          data={dados.porCategoria}
          emptyText="Nenhum bug aberto por categoria."
        />
      </div>
    </section>
  );
}
