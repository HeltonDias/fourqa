import { useEffect, useRef, useState } from "react";
import { FoursysMark } from "../components/FoursysMark";

export function TopAppBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <FoursysMark className="topbar-logo-mark" />
        <span className="topbar-name">FourQA</span>
      </div>

      <label className="topbar-search">
        <SearchIcon />
        <input type="search" placeholder="Buscar no FourQA..." aria-label="Buscar no FourQA" />
      </label>

      <div className="topbar-actions">
        <button type="button" className="topbar-icon" aria-label="Notificações">
          <BellIcon />
        </button>

        <div className="topbar-profile" ref={menuRef}>
          <button
            type="button"
            className="topbar-user"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="topbar-avatar" aria-hidden />
            <span className="topbar-user-text">
              <span className="topbar-user-name">Usuário</span>
              <span className="topbar-user-role">Cargo</span>
            </span>
            <ChevronIcon open={menuOpen} />
          </button>
          {menuOpen && (
            <div className="topbar-menu" role="menu">
              <div className="topbar-menu-id">
                <strong>Usuário</strong>
                <span>Cargo</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 16.5h12l-1.2-2.1V10a4.8 4.8 0 0 0-9.6 0v4.4L6 16.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ transform: open ? "rotate(180deg)" : undefined }}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
