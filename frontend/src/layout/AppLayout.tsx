import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
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
  { to: "/", label: "Visão Geral", icon: IconHome, end: true },
  { to: "/planejamento", label: "Planejamento", icon: IconCalendar },
  { to: "/status-frente", label: "Status", icon: IconPie },
  { to: "/execucoes", label: "Execuções", icon: IconCode },
  { to: "/falhas", label: "Falhas", icon: IconBug },
  { to: "/evolucao-qa", label: "Evolução QA", icon: IconEvolucao },
];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
      <TopAppBar />
      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-top-rule" aria-hidden />
          <nav className="sidebar-nav">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
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
            <NavLink
              to="/configuracoes"
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
              title="Configurações"
            >
              <IconConfig />
              {!collapsed && <span>Configurações</span>}
            </NavLink>
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
