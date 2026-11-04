import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { CircleMinusIcon } from "../components/ScenarioStatusPanel";
import { statusCenarioIcons } from "../components/statusCenarioAssets";
import { useReportChrome } from "../context/ReportChromeContext";
import { useFetch } from "../hooks/useFetch";
import type { DetectedDimension, EvolucaoQaBucket, EvolucaoQaDto, EvolucaoQaStatus } from "../types";
import { iconMaskStyle } from "../utils/iconMask";
import "./evolucao-qa.css";

const STATUS_LABEL: Record<EvolucaoQaStatus, string> = {
  done: "Concluído",
  ok: "No prazo",
  warn: "Atenção",
  risk: "Em risco",
  na: "N/A",
};

const QA_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4f46e5", "#0d9488"];

type QaPref = { nickname: string; color: string; email: string };
type PrefMap = Record<string, QaPref>;

type Filters = { qa: string; frente: string; from: string; to: string };

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function colorFor(key: string, prefs: PrefMap): string {
  const custom = prefs[key]?.color?.trim();
  if (custom) return custom;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return QA_COLORS[hash % QA_COLORS.length];
}

function displayName(bucket: EvolucaoQaBucket, prefs: PrefMap): string {
  return prefs[bucket.key]?.nickname?.trim() || bucket.name;
}

function frontKey(dimensions: DetectedDimension[] | undefined): string | null {
  const front = dimensions?.find((d) => d.role === "front" && d.visible !== false);
  return front?.key ?? null;
}

function frontValues(dimensions: DetectedDimension[] | undefined): string[] {
  const front = dimensions?.find((d) => d.role === "front" && d.visible !== false);
  if (!front) return [];
  const values = [...(front.values ?? [])];
  if (!values.some((v) => v.toLowerCase() === "corporativo")) values.push("Corporativo");
  return values;
}

function bucketMatchesFrente(bucket: EvolucaoQaBucket, frenteKey: string | null, frente: string): boolean {
  if (!frente || !frenteKey) return true;
  return bucket.suites.some((s) => (s.dimensions?.[frenteKey] || "").trim() === frente);
}

function emptyFilters(): Filters {
  return { qa: "", frente: "", from: "", to: "" };
}

function sumBuckets(rows: EvolucaoQaBucket[]): {
  passed: number;
  na: number;
  failed: number;
  blocked: number;
  released: number;
  design: number;
  notReleased: number;
  suiteCount: number;
  plannedToDate: number;
  finalizedInRange: number;
  gap: number;
} {
  return rows.reduce(
    (acc, row) => ({
      passed: acc.passed + row.passed,
      na: acc.na + row.na,
      failed: acc.failed + row.failed,
      blocked: acc.blocked + row.blocked,
      released: acc.released + (row.released || 0),
      design: acc.design + (row.design || 0),
      notReleased: acc.notReleased + (row.notReleased || 0),
      suiteCount: acc.suiteCount + row.suiteCount,
      plannedToDate: acc.plannedToDate + row.plannedToDate,
      finalizedInRange: acc.finalizedInRange + row.finalizedInRange,
      gap: acc.gap + row.gap,
    }),
    {
      passed: 0,
      na: 0,
      failed: 0,
      blocked: 0,
      released: 0,
      design: 0,
      notReleased: 0,
      suiteCount: 0,
      plannedToDate: 0,
      finalizedInRange: 0,
      gap: 0,
    },
  );
}

export function EvolucaoQaPage() {
  const { planKey, dataVersion } = useReportChrome();
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [prefs, setPrefs] = useState<PrefMap>({});
  const [panelOpen, setPanelOpen] = useState(false);

  const { data, loading, error, reload } = useFetch(
    () =>
      planKey
        ? api.evolucaoQa(planKey, { from: applied.from || undefined, to: applied.to || undefined })
        : Promise.resolve(null),
    [planKey, applied.from, applied.to, dataVersion],
  );

  const frenteDimKey = frontKey(data?.dimensions);
  const frentes = frontValues(data?.dimensions);

  const rows = useMemo(() => {
    if (!data) return [] as EvolucaoQaBucket[];
    const list = [...data.qas];
    if (data.unattributed) list.push(data.unattributed);
    return list.filter((row) => {
      if (applied.qa && row.key !== applied.qa) return false;
      return bucketMatchesFrente(row, frenteDimKey, applied.frente);
    });
  }, [data, applied.qa, applied.frente, frenteDimKey]);

  const totals = useMemo(() => sumBuckets(rows), [rows]);

  const applyFilters = () => setApplied({ ...draft });
  const goToday = () => {
    const day = todayIso();
    const next = { qa: "", frente: "", from: day, to: day };
    setDraft(next);
    setApplied(next);
  };

  return (
    <div className="module-page evolucao-qa">
      <PageHeader
        title="Evolução QA"
        description="Planejado por responsável e realizado por data de conclusão, no período escolhido."
        actions={
          <button type="button" className="evolucao-btn-ghost" onClick={() => setPanelOpen(true)}>
            Responsáveis
          </button>
        }
      />

      <p className="evolucao-notice" role="note">
        MVP: o realizado só é atribuído a suítes com um único responsável. Suítes sem responsável ou com
        vários nomes ficam em “Não atribuível”. Produtividade por executor real aguarda OPEN-001/OPEN-007.
      </p>

      <div className="evolucao-filters card-soft">
        <label>
          QA
          <select
            value={draft.qa}
            onChange={(e) => setDraft((f) => ({ ...f, qa: e.target.value }))}
            disabled={!data}
          >
            <option value="">Todos</option>
            {(data?.qas ?? []).map((q) => (
              <option key={q.key} value={q.key}>
                {displayName(q, prefs)}
              </option>
            ))}
            {data?.unattributed ? <option value="__nao_atribuivel__">Não atribuível</option> : null}
          </select>
        </label>
        <label>
          Frente
          <select
            value={draft.frente}
            onChange={(e) => setDraft((f) => ({ ...f, frente: e.target.value }))}
            disabled={!data || frentes.length === 0}
          >
            <option value="">Todas</option>
            {frentes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={draft.from || data?.range.from || ""}
            onChange={(e) => setDraft((f) => ({ ...f, from: e.target.value }))}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={draft.to || data?.range.to || ""}
            onChange={(e) => setDraft((f) => ({ ...f, to: e.target.value }))}
          />
        </label>
        <button type="button" className="evolucao-btn-ghost" onClick={goToday}>
          Hoje
        </button>
        <button type="button" className="btn-primary evolucao-btn-apply" onClick={applyFilters}>
          Aplicar filtros
        </button>
      </div>

      {loading ? <div className="state-box">Carregando evolução…</div> : null}
      {error ? (
        <div className="state-box error">
          <p>{error}</p>
          <button type="button" className="evolucao-btn-ghost" onClick={reload}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!loading && !error && data && rows.length === 0 ? (
        <div className="state-box">Nenhuma suíte planejada neste período. Defina responsáveis na aba Planejar.</div>
      ) : null}

      {!loading && !error && data && rows.length > 0 ? (
        <>
          <section className="evolucao-kpi-strip" aria-label="Responsáveis">
            {rows
              .filter((r) => r.attributable)
              .map((row) => (
                <div key={row.key} className="evolucao-chip">
                  <span className="evolucao-dot" style={{ background: colorFor(row.key, prefs) }} />
                  <span className="evolucao-chip-name">{displayName(row, prefs)}</span>
                  <strong>{fmt(row.suiteCount)}</strong>
                </div>
              ))}
          </section>

          <section className="evolucao-kpi-strip evolucao-kpi-strip--status" aria-label="Status dos CTS">
            <StatusKpi tone="passed" icon={statusCenarioIcons.finalizado} label="Passed" value={totals.passed} />
            <StatusKpi tone="na" label="N/A" value={totals.na} />
            <StatusKpi tone="falha" icon={statusCenarioIcons.falha} label="Falha" value={totals.failed} />
            <StatusKpi tone="bloq" icon={statusCenarioIcons.bloq} label="Bloqueado" value={totals.blocked} />
            <StatusKpi tone="lib" icon={statusCenarioIcons.liberado} label="Liberado" value={totals.released} />
            <StatusKpi tone="naolib" icon={statusCenarioIcons.naoLiberado} label="Não lib." value={totals.notReleased} />
            <StatusKpi tone="design" icon={statusCenarioIcons.design} label="Design" value={totals.design} />
          </section>

          <section className="card evolucao-table-wrap">
            <div className="evolucao-table-head">
              <h2>Resultados por responsável</h2>
              {data.range ? (
                <span className="muted">
                  {data.range.from} → {data.range.to} · atualizado em {data.range.asOf}
                </span>
              ) : null}
            </div>
            <div className="evolucao-table-scroll">
              <table className="evolucao-table">
                <thead>
                  <tr>
                    <th>Distribuição</th>
                    <th>Evolução</th>
                    <th>CTS Liberados</th>
                    <th>Design</th>
                    <th>Passed</th>
                    <th>Falhados</th>
                    <th>Bloqueados</th>
                    <th>Não Liberados</th>
                    <th>N/A</th>
                    <th title="Cancelados não entram no escopo atribuível da Evolução QA">Cancelados</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <span className="evolucao-dist">
                          <span className="evolucao-dot" style={{ background: colorFor(row.key, prefs) }} />
                          {displayName(row, prefs)}
                        </span>
                      </td>
                      <td>
                        {row.status ? (
                          <span className={`evolucao-status evolucao-status--${row.status}`}>
                            {STATUS_LABEL[row.status]}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{fmt(row.released || 0)}</td>
                      <td>{fmt(row.design || 0)}</td>
                      <td>{fmt(row.passed)}</td>
                      <td>{fmt(row.failed)}</td>
                      <td>{fmt(row.blocked)}</td>
                      <td>{fmt(row.notReleased || 0)}</td>
                      <td>{fmt(row.na)}</td>
                      <td title="Não disponível neste contrato">—</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Totais</td>
                    <td>—</td>
                    <td>{fmt(totals.released)}</td>
                    <td>{fmt(totals.design)}</td>
                    <td>{fmt(totals.passed)}</td>
                    <td>{fmt(totals.failed)}</td>
                    <td>{fmt(totals.blocked)}</td>
                    <td>{fmt(totals.notReleased)}</td>
                    <td>{fmt(totals.na)}</td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {panelOpen ? (
        <ResponsaveisPanel
          data={data}
          prefs={prefs}
          onClose={() => setPanelOpen(false)}
          onSave={(next) => {
            setPrefs(next);
            setPanelOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function StatusKpi({
  tone,
  icon,
  label,
  value,
}: {
  tone: "passed" | "na" | "falha" | "bloq" | "lib" | "naolib" | "design";
  icon?: string;
  label: string;
  value: number;
}) {
  const maskStyle: CSSProperties | undefined = icon ? iconMaskStyle(icon) : undefined;
  return (
    <div className={`evolucao-status-kpi evolucao-status-kpi--${tone}`}>
      <span className="evolucao-status-kpi-icon" aria-hidden>
        {maskStyle ? <span className="evolucao-status-kpi-mask" style={maskStyle} /> : <CircleMinusIcon />}
      </span>
      <span>{label}</span>
      <strong>{fmt(value)}</strong>
    </div>
  );
}

function ResponsaveisPanel({
  data,
  prefs,
  onClose,
  onSave,
}: {
  data: EvolucaoQaDto | null;
  prefs: PrefMap;
  onClose: () => void;
  onSave: (next: PrefMap) => void;
}) {
  const base = useMemo(() => {
    const next: PrefMap = {};
    for (const q of data?.qas ?? []) {
      next[q.key] = {
        nickname: prefs[q.key]?.nickname ?? q.name,
        color: prefs[q.key]?.color ?? colorFor(q.key, {}),
        email: prefs[q.key]?.email ?? "",
      };
    }
    return next;
  }, [data, prefs]);
  const [draft, setDraft] = useState<PrefMap>(base);

  useEffect(() => setDraft(base), [base]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const keys = Object.keys(draft);

  return (
    <div className="evolucao-drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="evolucao-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evolucao-resp-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="evolucao-drawer-head">
          <h2 id="evolucao-resp-title">Responsáveis</h2>
          <button type="button" className="evolucao-drawer-close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="evolucao-drawer-note">
          Apelido, cor e e-mail valem só nesta sessão para a tabela. Cadastro persistente e autenticação
          ficam fora deste painel — ainda sem endpoint aprovado.
        </p>
        <div className="evolucao-drawer-list">
          {keys.length === 0 ? <p className="muted">Nenhum responsável atribuível no período.</p> : null}
          {keys.map((key) => {
            const row = draft[key];
            return (
              <div key={key} className="evolucao-drawer-card">
                <label>
                  Apelido
                  <input
                    value={row.nickname}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...d[key], nickname: e.target.value } }))}
                  />
                </label>
                <label>
                  Cor
                  <input
                    type="color"
                    value={row.color || "#2563eb"}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...d[key], color: e.target.value } }))}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    value={row.email}
                    placeholder="opcional"
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...d[key], email: e.target.value } }))}
                  />
                </label>
              </div>
            );
          })}
        </div>
        <footer className="evolucao-drawer-actions">
          <button type="button" className="evolucao-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={() => onSave(draft)} disabled={keys.length === 0}>
            Salvar
          </button>
        </footer>
      </aside>
    </div>
  );
}
