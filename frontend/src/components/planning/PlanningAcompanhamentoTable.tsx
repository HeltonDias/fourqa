import type { CSSProperties } from "react";
import type { PlanningItem } from "../../types";
import {
  EXEC_COLS,
  PERIOD_COL_W,
  PLAN_TRACK_COLS,
  QUAL_COLS,
  atalhoDe,
  diaCheio,
  isPriority,
  num,
  soma,
  stickyStyle,
  type IdCol,
  type MetricCol,
} from "./planningUtils";

function idText(item: PlanningItem, col: IdCol): string {
  if (col.kind === "atalho") return atalhoDe(item.suiteName) || "—";
  if (col.kind === "suite") return item.suiteName;
  return item.dimensions[col.dimKey ?? ""] || "—";
}

function metricCell(baseClass: string, col: MetricCol, item: PlanningItem, variant: "plan" | "exec" | "qual") {
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
}: {
  idCols: IdCol[];
  pageRows: PlanningItem[];
  allRows: PlanningItem[];
}) {
  const stickyWidth = idCols.reduce((sum, col) => sum + col.width, 0);
  const periodStartLeft = stickyWidth;
  const periodEndLeft = stickyWidth + PERIOD_COL_W;
  const stickyBlock = stickyWidth + PERIOD_COL_W * 2;

  const periodSticky = (left: number): CSSProperties => ({
    left,
    width: PERIOD_COL_W,
    minWidth: PERIOD_COL_W,
    maxWidth: PERIOD_COL_W,
  });

  return (
    <div className="plan-table-wrap plan-table-wrap--acc">
      <table className="plan-table plan-table--acompanhamento">
        <thead>
          <tr className="plan-groups">
            {idCols.map((col) => (
              <th
                key={col.key}
                className={`plan-g-id plan-sticky${col.kind === "suite" ? " plan-suite" : ""}`}
                style={stickyStyle(col)}
              >
                {col.kind === "suite" && (
                  <span className="plan-g-cover" style={{ left: -col.left, width: stickyBlock }}>
                    Identificação
                  </span>
                )}
              </th>
            ))}
            <th className="plan-g-period plan-sticky plan-g-period-start" style={periodSticky(periodStartLeft)}>
              <span className="plan-g-pin plan-g-pin-sticky" style={{ left: periodStartLeft + 8 }}>Período</span>
            </th>
            <th className="plan-g-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} />
            <th className="plan-g-plan" colSpan={PLAN_TRACK_COLS.length}>
              <span className="plan-g-pin" style={{ left: stickyBlock + 8 }}>Planejamento</span>
            </th>
            <th className="plan-g-exec" colSpan={EXEC_COLS.length}>
              <span className="plan-g-pin" style={{ left: stickyBlock + 8 }}>Status / Execução</span>
            </th>
            <th className="plan-g-qual" colSpan={QUAL_COLS.length}>
              <span className="plan-g-pin" style={{ left: stickyBlock + 8 }}>Qualidade dos dados</span>
            </th>
            <th className="plan-g-filler" aria-hidden />
          </tr>
          <tr className="plan-cols">
            {idCols.map((col) => (
              <th
                key={col.key}
                className={`plan-sticky plan-c-id${col.kind === "suite" ? " plan-suite" : ""}`}
                style={stickyStyle(col)}
                title={col.label}
              >
                <span className="plan-ellipsis">{col.short}</span>
              </th>
            ))}
            <th className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)} title="Data início">
              Início
            </th>
            <th className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} title="Data fim">
              Fim
            </th>
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
            {QUAL_COLS.map((col, index) => (
              <th key={col.key} className={`plan-c-qual${index === 0 ? " plan-split" : ""}`} title={col.title}>
                {col.label}
              </th>
            ))}
            <th className="plan-table-filler" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((item) => {
            const key = `${item.suiteId ?? "s"}-${item.suiteName}`;
            return (
              <tr key={key}>
                {idCols.map((col) => {
                  const text = idText(item, col);
                  const pill = isPriority(col) && text !== "—";
                  return (
                    <td
                      key={col.key}
                      className={`plan-sticky plan-c-id${col.kind === "suite" ? " plan-suite" : ""}`}
                      style={stickyStyle(col)}
                      title={text === "—" ? undefined : text}
                    >
                      {pill ? (
                        <span className={/^\d+$/.test(text) ? "plan-pill plan-pill-hot" : "plan-pill plan-pill-cool"}>{text}</span>
                      ) : (
                        <span className="plan-ellipsis">{text}</span>
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
                {PLAN_TRACK_COLS.map((col, index) =>
                  metricCell(`plan-c-plan${index === 0 ? " plan-split" : ""}`, col, item, "plan"),
                )}
                {EXEC_COLS.map((col, index) =>
                  metricCell(`plan-x${index === 0 ? " plan-split" : ""}`, col, item, "exec"),
                )}
                {QUAL_COLS.map((col, index) =>
                  metricCell(`plan-c-qual${index === 0 ? " plan-split" : ""}`, col, item, "qual"),
                )}
                <td className="plan-table-filler" aria-hidden />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            {idCols.map((col) => (
              <td
                key={col.key}
                className={`plan-sticky plan-c-id${col.kind === "suite" ? " plan-suite" : ""}`}
                style={stickyStyle(col)}
              >
                {col.kind === "suite" ? "Totais" : ""}
              </td>
            ))}
            <td className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)} />
            <td className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} />
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
            {QUAL_COLS.map((col, index) => (
              <td key={col.key} className={`plan-num plan-c-qual${index === 0 ? " plan-split" : ""}`}>
                {soma(allRows, col.pick)}
              </td>
            ))}
            <td className="plan-table-filler" aria-hidden />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
