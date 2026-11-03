import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { readActiveConnection } from "../auth/connectionStore";
import { signOut, useSession } from "../auth/session";
import { FoursysMark } from "../components/FoursysMark";
import moonIcon from "../../../fonte/util/estilo/moon (1).png";
import bellIcon from "../../../fonte/util/notification (1).png";
import sunIcon from "../../../fonte/util/estilo/sun (1).png";
import { readTheme, THEME_KEY, toggleTheme, type ThemeName } from "../theme";

export function TopAppBar({ toolLabel = "Relatórios" }: { toolLabel?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() => readTheme());
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { state } = useSession();
  const user = state?.user ?? null;
  const connection = readActiveConnection();
  const roleLabel = connection?.roleLabel ?? user?.globalRoleLabel;

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut().catch(() => undefined);
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      if (localStorage.getItem(THEME_KEY)) return;
      const next: ThemeName = media.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      setTheme(next);
    };
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

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
      <Link to="/" className="topbar-brand" title="Página inicial">
        <FoursysMark className="topbar-logo-mark" />
        <span className="topbar-name">FourQA</span>
      </Link>

      <span className="topbar-tool">{toolLabel}</span>

      <div className="topbar-actions">
        <button
          type="button"
          className="topbar-icon"
          aria-label={theme === "dark" ? "Tema claro" : "Tema escuro"}
          aria-pressed={theme === "dark"}
          onClick={() => setTheme((current) => toggleTheme(current))}
        >
          <span
            className="theme-glyph"
            style={{
              WebkitMaskImage: `url("${theme === "dark" ? moonIcon : sunIcon}")`,
              maskImage: `url("${theme === "dark" ? moonIcon : sunIcon}")`,
            }}
          />
        </button>
        <button type="button" className="topbar-icon" aria-label="Notificações">
          <span
            className="theme-glyph"
            style={{
              WebkitMaskImage: `url("${bellIcon}")`,
              maskImage: `url("${bellIcon}")`,
            }}
          />
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
              <span className="topbar-user-name">{user?.name ?? "Modo local"}</span>
              <span className="topbar-user-role">{roleLabel ?? "Sem login"}</span>
            </span>
            <ChevronIcon open={menuOpen} />
          </button>
          {menuOpen && (
            <div className="topbar-menu" role="menu">
              <div className="topbar-menu-id">
                <strong>{user?.name ?? "Modo local"}</strong>
                <span>{user?.email ?? "—"}</span>
              </div>
              {user?.globalRole === "head" ? (
                <Link className="topbar-menu-item" role="menuitem" to="/admin/usuarios" onClick={() => setMenuOpen(false)}>
                  Papéis globais
                </Link>
              ) : null}
              {user ? (
                <button type="button" className="topbar-menu-item" role="menuitem" onClick={handleSignOut}>
                  Sair
                </button>
              ) : (
                <Link className="topbar-menu-item" role="menuitem" to="/login" onClick={() => setMenuOpen(false)}>
                  Entrar com PAT
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
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
