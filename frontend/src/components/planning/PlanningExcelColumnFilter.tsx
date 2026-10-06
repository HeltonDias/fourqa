import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { idColFilterLabel } from "./planningUtils";

type MenuAlign = "start" | "end";

export function PlanningExcelColumnFilter({
  columnLabel,
  values,
  selected,
  sortDirection,
  onApply,
  onSort,
  onClear,
}: {
  columnLabel: string;
  values: string[];
  selected: Set<string> | null;
  sortDirection: "asc" | "desc" | null;
  onApply: (next: Set<string> | null) => void;
  onSort: (direction: "asc" | "desc") => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [menuAlign, setMenuAlign] = useState<MenuAlign>("end");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const active = selected != null && selected.size < values.length;

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    setSearch("");
    setDraft(selected ? new Set(selected) : new Set(values));
  }, [open, selected, values]);

  useLayoutEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const menu = menuRef.current;
    if (!root || !menu) return;

    const shell = root.closest(".main-content") ?? root.closest(".plan-table-wrap");
    const shellRect = shell?.getBoundingClientRect();
    const minLeft = shellRect?.left ?? 0;
    const maxRight = shellRect?.right ?? window.innerWidth;
    const trigger = root.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;

    const overflowLeft = trigger.right - menuWidth < minLeft + 8;
    const overflowRight = trigger.left + menuWidth > maxRight - 8;

    if (overflowLeft && !overflowRight) setMenuAlign("start");
    else if (overflowRight && !overflowLeft) setMenuAlign("end");
    else if (overflowLeft) setMenuAlign("start");
    else setMenuAlign("end");
  }, [open, values.length, search]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filteredValues = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return values;
    return values.filter((value) => idColFilterLabel(value).toLowerCase().includes(needle));
  }, [search, values]);

  const allDraftSelected = filteredValues.length > 0 && filteredValues.every((value) => draft.has(value));
  const someDraftSelected = filteredValues.some((value) => draft.has(value));

  function toggleAll() {
    setDraft((current) => {
      const next = new Set(current);
      if (allDraftSelected) filteredValues.forEach((value) => next.delete(value));
      else filteredValues.forEach((value) => next.add(value));
      return next;
    });
  }

  function toggleValue(value: string) {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function apply() {
    if (draft.size === 0) {
      onApply(new Set());
    } else if (draft.size >= values.length) {
      onApply(null);
    } else {
      onApply(new Set(draft));
    }
    setOpen(false);
  }

  return (
    <div className="plan-col-filter" ref={rootRef}>
      <button
        type="button"
        className={`plan-col-filter-btn${active ? " plan-col-filter-btn--active" : ""}`}
        aria-label={`Filtrar coluna ${columnLabel}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="plan-col-filter-chevron" aria-hidden />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`plan-col-filter-menu plan-col-filter-menu--${menuAlign}`}
          role="dialog"
          aria-label={`Filtro: ${columnLabel}`}
        >
          <button type="button" className="plan-col-filter-item" onClick={() => onSort("asc")}>
            <span className="plan-col-filter-ico plan-col-filter-ico--az" aria-hidden />
            Classificar de A a Z
            {sortDirection === "asc" && <span className="plan-col-filter-check">✓</span>}
          </button>
          <button type="button" className="plan-col-filter-item" onClick={() => onSort("desc")}>
            <span className="plan-col-filter-ico plan-col-filter-ico--za" aria-hidden />
            Classificar de Z a A
            {sortDirection === "desc" && <span className="plan-col-filter-check">✓</span>}
          </button>
          <div className="plan-col-filter-sep" />
          <button
            type="button"
            className="plan-col-filter-item"
            disabled={!active}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            Limpar filtro
          </button>
          <div className="plan-col-filter-sep" />
          <div className="plan-col-filter-search-wrap">
            <span className="plan-col-filter-search-ico" aria-hidden />
            <input
              className="plan-col-filter-search"
              type="search"
              placeholder="Pesquisar"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={`Pesquisar em ${columnLabel}`}
            />
          </div>
          <div className="plan-col-filter-values">
            <label className="plan-col-filter-value">
              <input
                type="checkbox"
                checked={allDraftSelected}
                ref={(node) => {
                  if (node) node.indeterminate = !allDraftSelected && someDraftSelected;
                }}
                onChange={toggleAll}
              />
              <span>Selecionar tudo</span>
            </label>
            {filteredValues.map((value) => (
              <label key={value} className="plan-col-filter-value">
                <input type="checkbox" checked={draft.has(value)} onChange={() => toggleValue(value)} />
                <span className="plan-col-filter-value-text" title={idColFilterLabel(value)}>
                  {idColFilterLabel(value)}
                </span>
              </label>
            ))}
            {filteredValues.length === 0 && <p className="plan-col-filter-empty">Nenhum valor encontrado.</p>}
          </div>
          <div className="plan-col-filter-foot">
            <button type="button" className="plan-col-filter-apply" onClick={apply}>
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
