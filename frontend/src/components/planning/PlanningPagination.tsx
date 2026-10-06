import { useEffect, useState } from "react";
import { DEFAULT_PAGE_SIZE, pageList } from "./planningUtils";

function clampPageSize(value: number, totalRows: number): number {
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (totalRows > 0) return Math.min(n, totalRows);
  return n;
}

export function PlanningPagination({
  page,
  pageCount,
  pageSize,
  totalRows,
  pageRows,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  totalRows: number;
  pageRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const safePage = Math.min(page, pageCount - 1);
  const [draft, setDraft] = useState(String(pageSize));

  useEffect(() => {
    setDraft(String(pageSize));
  }, [pageSize]);

  function commitSize() {
    const parsed = draft === "" ? pageSize : Number(draft.replace(/[^\d]/g, ""));
    const next = clampPageSize(parsed, totalRows);
    onPageSizeChange(next);
    setDraft(String(next));
  }

  return (
    <div className="plan-pager plan-pager--full">
      <label className="plan-page-size">
        Exibir
        <input
          type="text"
          inputMode="numeric"
          className="plan-page-size-input"
          value={draft}
          aria-label="Registros por página"
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
          onBlur={commitSize}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitSize();
            }
          }}
        />
        registros por página
      </label>

      <span className="plan-pager-count">
        {pageRows} de {totalRows} registros
      </span>

      <div className="plan-pages">
        <button type="button" disabled={safePage <= 0} onClick={() => onPageChange(safePage - 1)}>
          Anterior
        </button>
        {pageList(safePage, pageCount).map((item, index) =>
          item === "…" ? (
            <span key={`gap-${index}`} className="plan-page-gap">…</span>
          ) : (
            <button
              key={item}
              type="button"
              className={item === safePage ? "is-on" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item + 1}
            </button>
          ),
        )}
        <button type="button" disabled={safePage >= pageCount - 1} onClick={() => onPageChange(safePage + 1)}>
          Próximo
        </button>
      </div>
    </div>
  );
}

export { DEFAULT_PAGE_SIZE };
