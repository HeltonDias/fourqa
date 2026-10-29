import { useEffect, useState } from "react";
import { api } from "../../api";
import type { PlanningChangeLogEntry } from "../../types";
import { diaCheio } from "./planningUtils";

const FIELD_LABEL: Record<string, string> = {
  start: "Data início",
  end: "Data fim",
  day: "Distribuição diária",
  prioridade: "Prioridade",
  responsavel: "Responsável",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatValue(field: string, value: string | null, allocDate: string | null): string {
  if (value == null || value === "") return "—";
  if (field === "day" && allocDate) return `${diaCheio(allocDate)}: ${value}`;
  if (field === "start" || field === "end") return diaCheio(value);
  return value;
}

export function PlanningChangeHistoryPanel({
  planKey,
  onBack,
}: {
  planKey: string;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<PlanningChangeLogEntry[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    void api
      .planejamentoAlteracoes(planKey)
      .then((payload) => {
        if (!cancel) {
          setSupported(payload.supported);
          setRows(payload.entries);
        }
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [planKey]);

  return (
    <div className="plan-history-panel">
      <header className="plan-history-head">
        <button type="button" className="plan-history-back" onClick={onBack}>
          ‹ Voltar ao Planejar
        </button>
        <h2 className="plan-history-title">Registro de alterações</h2>
        <p className="plan-history-sub muted">Trilha das células gravadas depois da migração de histórico. Em breve: usuário que fez cada mudança.</p>
      </header>

      {loading && <p className="muted">Carregando histórico…</p>}
      {error && <p className="plan-error">{error}</p>}

      {!loading && !error && !supported && (
        <p className="plan-error">
          Histórico indisponível neste banco. A edição de uma célula grava sem trilha. A alteração em lote é recusada e nada é salvo.
        </p>
      )}

      {!loading && !error && supported && rows.length === 0 && (
        <p className="muted">Nenhuma alteração registrada ainda.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="plan-history-table-wrap">
          <table className="plan-history-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Processo / suíte</th>
                <th>Campo</th>
                <th>De</th>
                <th>Para</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatWhen(row.createdAt)}</td>
                  <td>{row.suiteName?.trim() || "—"}</td>
                  <td>{FIELD_LABEL[row.field] ?? row.field}</td>
                  <td>{formatValue(row.field, row.oldValue, row.allocDate)}</td>
                  <td>{formatValue(row.field, row.newValue, row.allocDate)}</td>
                  <td className="plan-history-user">{row.actor?.trim() || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
