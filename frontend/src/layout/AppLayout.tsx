import { useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { readActiveConnection } from "../auth/connectionStore";
import { useSession } from "../auth/session";
import { ReportChrome } from "../components/ReportChrome";
import { ReportChromeProvider } from "../context/ReportChromeContext";
import { TopAppBar } from "./TopAppBar";
import {
  IconBug,
  IconCalendar,
  IconChevron,
  IconCode,
  IconConfig,
  IconEvolucao,
  IconHome,
  IconPie,
} from "../components/Icons";

const nav = [
  { to: "/visao-geral", label: "Visão Geral", icon: IconHome },
  { to: "/planejamento", label: "Planejamento", icon: IconCalendar },
  { to: "/status-frente", label: "Status", icon: IconPie },
  { to: "/execucoes", label: "Execuções", icon: IconCode },
  { to: "/falhas", label: "Falhas", icon: IconBug },
  { to: "/evolucao-qa", label: "Evolução QA", icon: IconEvolucao },
];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { state } = useSession();
  const location = useLocation();
  const connection = readActiveConnection();
  const visitor = connection?.role === "visitante";

  if (state?.authenticated && !connection) return <Navigate to="/" replace />;
  if (visitor && location.pathname !== "/visao-geral") return <Navigate to="/visao-geral" replace />;
  const items = visitor ? nav.slice(0, 1) : nav;

  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
      <TopAppBar />
      <div className="app-body">
        <aside className="sidebar">
          <Link to="/" className="sidebar-back" title="Voltar para a Página inicial">
            <IconChevron flipped />
            {!collapsed && <span>Página inicial</span>}
          </Link>
          <div className="sidebar-top-rule" aria-hidden />
          <nav className="sidebar-nav">
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
                title={label}
              >
                <Icon />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-foot">
            {!visitor ? (
              <NavLink
                to="/configuracoes"
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                title="Configurações"
              >
                <IconConfig />
                {!collapsed && <span>Configurações</span>}
              </NavLink>
            ) : null}
            <div className="sidebar-foot-rule" aria-hidden />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              <IconChevron flipped={collapsed} />
            </button>
          </div>
        </aside>

        <ReportChromeProvider>
          <div className="main-area">
            <ReportChrome />
            <div className="main-content">
              <Outlet />
            </div>
          </div>
        </ReportChromeProvider>
      </div>
    </div>
  );
}
