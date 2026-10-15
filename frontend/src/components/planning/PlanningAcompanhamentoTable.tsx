import { useEffect, useState, type CSSProperties } from "react";
import { HierCellText } from "../HierCellText";
import type { PlanningItem } from "../../types";
import {
  EXEC_COLS,
  PERIOD_COL_W,
  PLAN_TRACK_COLS,
  atalhoDe,
  diaCheio,
  isPriority,
  num,
  soma,
  planRem,
  hierColClass,
  isIdentificacaoAnchorCol,
  stickyStyleRem,
  type IdCol,
  type MetricCol,
} from "./planningUtils";

function idText(item: PlanningItem, col: IdCol): string {
  if (col.kind === "planKey") return col.planKeyValue?.trim() || "—";
  if (col.kind === "atalho") return atalhoDe(item.suiteName) || "—";
  if (col.kind === "suite") return item.suiteName;
  return item.dimensions[col.dimKey ?? ""] || "—";
}

function SuiteText({
  value,
  editable,
  label,
  onCommit,
}: {
  value: string;
  editable: boolean;
  label: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  if (!editable) return <span>{value || "—"}</span>;
  return (
    <input
      className="plan-edit"
      type="text"
      maxLength={80}
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

function metricCell(baseClass: string, col: MetricCol, item: PlanningItem, variant: "plan" | "exec") {
  const value = col.pick(item);
  const has = value != null && value > 0;
  const zero = value === 0;
  const toneClass = variant === "plan" ? "" : ` plan-x plan-x-${col.tone}`;
  return (
    <td
      className={`plan-num ${baseClass}${toneClass}${has ? " plan-has" : ""}${zero ? " plan-zero" : ""}`}
      title={col.title}
    >
      {num(value)}
    </td>
  );
}

export function PlanningAcompanhamentoTable({
  idCols,
  pageRows,
  allRows,
  canEdit,
  onSave,
}: {
  idCols: IdCol[];
  pageRows: PlanningItem[];
  allRows: PlanningItem[];
  canEdit: boolean;
  onSave: (item: PlanningItem, field: "responsavel", value: string) => void;
}) {
  const stickyWidth = idCols.reduce((sum, col) => sum + col.width, 0);
  const periodStartLeft = stickyWidth;
  const periodEndLeft = stickyWidth + PERIOD_COL_W;
  const stickyBlock = stickyWidth + PERIOD_COL_W * 2;

  const periodSticky = (left: number): CSSProperties => {
    const width = planRem(PERIOD_COL_W);
    return { left: planRem(left), width, minWidth: width, maxWidth: width };
  };

  return (
    <div className="plan-table-wrap plan-table-wrap--acc">
      <table className="plan-table plan-table--acompanhamento">
        <thead>
          <tr className="plan-groups">
            {idCols.map((col) => (
              <th
                key={col.key}
                className={`plan-g-id plan-sticky${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
                style={stickyStyleRem(col)}
              >
                {isIdentificacaoAnchorCol(col, idCols) && (
                  <span className="plan-g-cover" style={{ left: planRem(-col.left), width: planRem(stickyBlock) }}>
                    Identificação
                  </span>
                )}
              </th>
            ))}
            <th className="plan-g-period plan-sticky plan-g-period-start" style={periodSticky(periodStartLeft)}>
              <span className="plan-g-pin plan-g-pin-sticky" style={{ left: planRem(periodStartLeft + 8) }}>Período</span>
            </th>
            <th className="plan-g-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} />
            <th className="plan-g-plan" colSpan={2}>
              <span className="plan-g-pin" style={{ left: planRem(stickyBlock + 8) }}>Suíte</span>
            </th>
            <th className="plan-g-plan" colSpan={PLAN_TRACK_COLS.length}>
              <span className="plan-g-pin" style={{ left: planRem(stickyBlock + 8) }}>Planejamento</span>
            </th>
            <th className="plan-g-exec" colSpan={EXEC_COLS.length}>
              <span className="plan-g-pin" style={{ left: planRem(stickyBlock + 8) }}>Status / Execução</span>
            </th>
            <th className="plan-g-obs">Observação</th>
          </tr>
          <tr className="plan-cols">
            {idCols.map((col) => (
              <th
                key={col.key}
                className={`plan-sticky plan-c-id ${hierColClass(col)}${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
                style={stickyStyleRem(col)}
                title={col.label}
              >
                <HierCellText value={col.short} className="plan-ellipsis" />
              </th>
            ))}
            <th className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)} title="Data início">
              Início
            </th>
            <th className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} title="Data fim">
              Fim
            </th>
            <th className="plan-c-plan plan-split" title="Responsável próprio da suíte">Responsável</th>
            <th className="plan-c-plan" title="Prioridade própria da suíte, somente leitura nesta visão">Prioridade</th>
            {PLAN_TRACK_COLS.map((col, index) => (
              <th key={col.key} className={`plan-c-plan${index === 0 ? " plan-split" : ""}`} title={col.title}>
                {col.label}
              </th>
            ))}
            {EXEC_COLS.map((col, index) => (
              <th key={col.key} className={`plan-x plan-x-${col.tone}${index === 0 ? " plan-split" : ""}`} title={col.title}>
                {col.label}
              </th>
            ))}
            <th className="plan-c-obs plan-split" title="Observação" />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((item) => {
            const key = `${item.suiteId ?? "s"}-${item.testPointId ?? "p"}-${item.suiteName}`;
            return (
              <tr key={key}>
                {idCols.map((col) => {
                  const text = idText(item, col);
                  const pill = isPriority(col) && text !== "—";
                  return (
                    <td
                      key={col.key}
                      className={`plan-sticky plan-c-id ${hierColClass(col)}${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
                      style={stickyStyleRem(col)}
                    >
                      {pill ? (
                        <span className={/^\d+$/.test(text) ? "plan-pill plan-pill-hot" : "plan-pill plan-pill-cool"}>{text}</span>
                      ) : (
                        <HierCellText value={text === "—" ? "" : text} className="plan-ellipsis" />
                      )}
                    </td>
                  );
                })}
                <td className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)}>
                  {item.plannedStart ? diaCheio(item.plannedStart) : "—"}
                </td>
                <td className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)}>
                  {item.plannedEnd ? diaCheio(item.plannedEnd) : "—"}
                </td>
                <td className="plan-c-plan plan-split">
                  {item.suiteId == null ? (
                    "—"
                  ) : (
                    <SuiteText
                      value={item.responsavel ?? ""}
                      editable={canEdit}
                      label={`Responsável de ${item.suiteName}`}
                      onCommit={(value) => onSave(item, "responsavel", value)}
                    />
                  )}
                </td>
                <td className="plan-c-plan">{item.suiteId == null ? "—" : item.prioridade || "—"}</td>
                {PLAN_TRACK_COLS.map((col, index) =>
                  metricCell(`plan-c-plan${index === 0 ? " plan-split" : ""}`, col, item, "plan"),
                )}
                {EXEC_COLS.map((col, index) =>
                  metricCell(`plan-x${index === 0 ? " plan-split" : ""}`, col, item, "exec"),
                )}
                <td className="plan-c-obs plan-split" />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            {idCols.map((col) => (
              <td
                key={col.key}
                className={`plan-sticky plan-c-id${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
                style={stickyStyleRem(col)}
              >
                {isIdentificacaoAnchorCol(col, idCols) ? "Totais" : ""}
              </td>
            ))}
            <td className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)} />
            <td className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} />
            <td className="plan-c-plan plan-split" />
            <td className="plan-c-plan" />
            {PLAN_TRACK_COLS.map((col, index) => (
              <td key={col.key} className={`plan-num plan-c-plan${index === 0 ? " plan-split" : ""}`}>
                {soma(allRows, col.pick)}
              </td>
            ))}
            {EXEC_COLS.map((col, index) => (
              <td key={col.key} className={`plan-num plan-x plan-x-${col.tone}${index === 0 ? " plan-split" : ""}`}>
                {soma(allRows, col.pick)}
              </td>
            ))}
            <td className="plan-c-obs plan-split" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
