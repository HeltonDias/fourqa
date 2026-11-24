import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { HierCellText } from "../HierCellText";
import type { PlanningItem } from "../../types";
import {
  ACCOMPANHAMENTO_PERIOD_COL_W,
  ACCOMPANHAMENTO_PLAN_COL_W,
  ACCOMPANHAMENTO_EXEC_COL_W,
  EXEC_COLS,
  PLAN_TRACK_COLS,
  acompanhamentoTableBaseHeight,
  acompanhamentoTableBaseWidth,
  atalhoDe,
  diaCheio,
  isPriority,
  num,
  soma,
  planRem,
  hierColClass,
  isIdentificacaoAnchorCol,
  stickyStyleRemScaled,
  type IdCol,
  type MetricCol,
} from "./planningUtils";

function idText(item: PlanningItem, col: IdCol): string {
  if (col.kind === "planKey") return col.planKeyValue?.trim() || "—";
  if (col.kind === "atalho") return atalhoDe(item.suiteName) || "—";
  if (col.kind === "suite") return item.suiteName;
  return item.dimensions[col.dimKey ?? ""] || "—";
}

function metricCell(baseClass: string, col: MetricCol, item: PlanningItem, variant: "plan" | "exec") {
  const value = col.pick(item);
  const has = value != null && value > 0;
  const zero = value === 0;
  const toneClass = variant === "plan" ? "" : ` plan-x plan-x-${col.tone}`;
  return (
    <td
      key={col.key}
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseWidth = useMemo(() => acompanhamentoTableBaseWidth(idCols), [idCols]);
  const baseHeight = useMemo(() => acompanhamentoTableBaseHeight(pageRows.length), [pageRows.length]);
  const [colScale, setColScale] = useState(1);
  const [rowScale, setRowScale] = useState(1);
  const colScaleRef = useRef(1);
  const rowScaleRef = useRef(1);

  const stickyWidth = idCols.reduce((sum, col) => sum + col.width, 0);
  const periodStartLeft = stickyWidth;
  const periodEndLeft = stickyWidth + ACCOMPANHAMENTO_PERIOD_COL_W;
  const stickyBlock = stickyWidth + ACCOMPANHAMENTO_PERIOD_COL_W * 2;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || baseWidth <= 0 || baseHeight <= 0) return;

    const SCALE_EPS = 0.012;

    const commitScales = (nextCol: number, nextRow: number) => {
      const col = Math.round(nextCol * 1000) / 1000;
      const row = Math.round(nextRow * 1000) / 1000;
      if (
        Math.abs(col - colScaleRef.current) < SCALE_EPS &&
        Math.abs(row - rowScaleRef.current) < SCALE_EPS
      ) {
        return;
      }
      colScaleRef.current = col;
      rowScaleRef.current = row;
      setColScale(col);
      setRowScale(row);
    };

    let frame = 0;
    const measure = () => {
      // Largura estável: evita loop scrollbar aparece/some no zoom (~67%).
      const w = el.getBoundingClientRect().width;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const nextCol = Math.max(1, w / baseWidth);
      const nextRow = h > baseHeight ? h / baseHeight : 1;
      commitScales(nextCol, nextRow);
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [baseWidth, baseHeight]);

  const periodSticky = (left: number): CSSProperties => {
    const width = planRem(ACCOMPANHAMENTO_PERIOD_COL_W * colScale);
    const leftRem = planRem(left * colScale);
    return { left: leftRem, width, minWidth: width, maxWidth: width };
  };

  const wrapStyle = { "--plan-acc-scale": colScale, "--plan-acc-row-scale": rowScale } as CSSProperties;
  const tableStyle: CSSProperties = { width: planRem(baseWidth * colScale) };

  return (
    <div ref={wrapRef} className="plan-table-wrap plan-table-wrap--acc" style={wrapStyle}>
      <table className="plan-table plan-table--acompanhamento" style={tableStyle}>
        <colgroup>
          {idCols.map((col) => (
            <col key={col.key} style={{ width: planRem(col.width * colScale) }} />
          ))}
          <col style={{ width: planRem(ACCOMPANHAMENTO_PERIOD_COL_W * colScale) }} />
          <col style={{ width: planRem(ACCOMPANHAMENTO_PERIOD_COL_W * colScale) }} />
          <col style={{ width: planRem(ACCOMPANHAMENTO_PLAN_COL_W * colScale) }} />
          {PLAN_TRACK_COLS.map((col) => (
            <col key={col.key} style={{ width: planRem(ACCOMPANHAMENTO_PLAN_COL_W * colScale) }} />
          ))}
          {EXEC_COLS.map((col) => (
            <col key={col.key} style={{ width: planRem(ACCOMPANHAMENTO_EXEC_COL_W * colScale) }} />
          ))}
        </colgroup>
        <thead>
          <tr className="plan-groups">
            <th className="plan-g-id plan-sticky plan-suite" colSpan={idCols.length} style={{ left: 0 }}>
              Identificação
            </th>
            <th className="plan-g-period plan-sticky" colSpan={2} style={{ left: planRem(periodStartLeft * colScale) }}>
              Período
            </th>
            <th className="plan-g-plan" colSpan={1}>
              <span className="plan-g-pin" style={{ left: planRem((stickyBlock + 8) * colScale) }}>Suíte</span>
            </th>
            <th className="plan-g-plan" colSpan={PLAN_TRACK_COLS.length}>
              <span className="plan-g-pin" style={{ left: planRem((stickyBlock + 8) * colScale) }}>Planejamento</span>
            </th>
            <th className="plan-g-exec" colSpan={EXEC_COLS.length}>
              <span className="plan-g-pin" style={{ left: planRem((stickyBlock + 8) * colScale) }}>Status / Execução</span>
            </th>
          </tr>
          <tr className="plan-cols">
            {idCols.map((col) => (
              <th
                key={col.key}
                className={`plan-sticky plan-c-id ${hierColClass(col)}${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
                style={stickyStyleRemScaled(col, colScale)}
                title={col.kind === "planKey" ? "Responsavel" : col.label}
              >
                <HierCellText value={col.kind === "planKey" ? "Responsavel" : col.short} className="plan-ellipsis" />
              </th>
            ))}
            <th className="plan-c-period plan-sticky plan-split plan-g-period-start" style={periodSticky(periodStartLeft)} title="Data início">
              Início
            </th>
            <th className="plan-c-period plan-sticky plan-g-period-end" style={periodSticky(periodEndLeft)} title="Data fim">
              Fim
            </th>
            <th className="plan-c-plan plan-split" title="Prioridade própria da suíte, somente leitura nesta visão">Prioridade</th>
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
          </tr>
        </thead>
        <tbody>
          {pageRows.map((item) => {
            const key = `${item.suiteId ?? "s"}-${item.testPointId ?? "p"}-${item.suiteName}`;
            return (
              <tr key={key}>
                {idCols.map((col) => {
                  const text = col.kind === "planKey" ? "" : idText(item, col);
                  const pill = isPriority(col) && text !== "—";
                  return (
                    <td
                      key={col.key}
                      className={`plan-sticky plan-c-id ${hierColClass(col)}${isIdentificacaoAnchorCol(col, idCols) ? " plan-suite" : ""}`}
                      style={stickyStyleRemScaled(col, colScale)}
                    >
                      {col.kind === "planKey" ? null : pill ? (
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
                <td className="plan-c-plan plan-split">{item.suiteId == null ? "—" : item.prioridade || "—"}</td>
                {PLAN_TRACK_COLS.map((col, index) =>
                  metricCell(`plan-c-plan${index === 0 ? " plan-split" : ""}`, col, item, "plan"),
                )}
                {EXEC_COLS.map((col, index) =>
                  metricCell(`plan-x${index === 0 ? " plan-split" : ""}`, col, item, "exec"),
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="plan-sticky plan-c-id" colSpan={idCols.length + 2} style={{ left: 0 }}>
              Totais
            </td>
            <td className="plan-c-plan plan-split" />
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
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
