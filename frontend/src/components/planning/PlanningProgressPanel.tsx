import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlanningProgressSnapshot } from "../../types";

const PLAN_COLOR = "#2563eb";
const REAL_COLOR = "#16a34a";

function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtDataBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

function situacaoLabel(s: PlanningProgressSnapshot["situacao"]): string {
  if (s === "adiantado") return "Adiantado";
  if (s === "atrasado") return "Atrasado";
  return "Dentro do planejado";
}

function situacaoClass(s: PlanningProgressSnapshot["situacao"]): string {
  if (s === "adiantado") return "plan-progress-situacao--ahead";
  if (s === "atrasado") return "plan-progress-situacao--behind";
  return "plan-progress-situacao--ok";
}

type TooltipPayload = {
  data: string;
  planejado: number;
  realizado: number | null;
  planejadoDia: number;
  realizadoDia: number;
};

function ProgressTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TooltipPayload }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const diff = (row.realizado ?? 0) - row.planejado;
  return (
    <div className="plan-progress-tooltip">
      <strong>{fmtDataBr(row.data)}</strong>
      <dl>
        <div>
          <dt>Planejado no dia</dt>
          <dd>{fmtNum(Math.round(row.planejadoDia))}</dd>
        </div>
        <div>
          <dt>Realizado no dia</dt>
          <dd>{row.realizado == null ? "—" : fmtNum(row.realizadoDia)}</dd>
        </div>
        <div>
          <dt>Planejado acumulado</dt>
          <dd>{fmtNum(Math.round(row.planejado))}</dd>
        </div>
        <div>
          <dt>Realizado acumulado</dt>
          <dd>{row.realizado == null ? "—" : fmtNum(row.realizado)}</dd>
        </div>
        <div>
          <dt>Diferença acumulada</dt>
          <dd className={diff >= 0 ? "plan-progress-diff-pos" : "plan-progress-diff-neg"}>
            {row.realizado == null ? "—" : `${diff >= 0 ? "+" : ""}${fmtNum(diff)}`}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function PlanningProgressPanel({
  progresso,
  executionNote,
}: {
  progresso: PlanningProgressSnapshot | null;
  executionNote?: string;
}) {
  const data = progresso?.serie ?? [];

  return (
    <section className="card chart-panel chart-panel-line plan-progress-panel">
      <div className="chart-head">
        <h2>Progresso do Planejamento</h2>
      </div>

      {!progresso || data.length === 0 ? (
        <p className="chart-empty">
          {executionNote ??
            "Distribua os cenários na aba Planejar e confirme o período para exibir o progresso ao longo do tempo."}
        </p>
      ) : (
        <>
          <div className="plan-progress-kpis">
            <div className="plan-progress-kpi">
              <span className="plan-progress-kpi-label">Planejado até hoje</span>
              <strong>{fmtNum(progresso.planejadoAteHoje)}</strong>
            </div>
            <div className="plan-progress-kpi">
              <span className="plan-progress-kpi-label">Realizado até hoje</span>
              <strong>{fmtNum(progresso.realizadoAteHoje)}</strong>
            </div>
            <div className="plan-progress-kpi">
              <span className="plan-progress-kpi-label">Diferença</span>
              <strong
                className={
                  progresso.diferenca > 0
                    ? "plan-progress-diff-pos"
                    : progresso.diferenca < 0
                      ? "plan-progress-diff-neg"
                      : undefined
                }
              >
                {progresso.diferenca > 0 ? "+" : ""}
                {fmtNum(progresso.diferenca)}
              </strong>
            </div>
            <div className="plan-progress-kpi">
              <span className="plan-progress-kpi-label">Situação</span>
              <strong className={`plan-progress-situacao ${situacaoClass(progresso.situacao)}`}>
                {situacaoLabel(progresso.situacao)}
              </strong>
            </div>
          </div>

          <div className="chart-body plan-progress-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
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
                <Tooltip content={<ProgressTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  iconType="plainline"
                  formatter={(v) =>
                    v === "planejado" ? "Planejado acumulado" : "Realizado acumulado"
                  }
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="planejado"
                  name="planejado"
                  stroke={PLAN_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="realizado"
                  name="realizado"
                  stroke={REAL_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
