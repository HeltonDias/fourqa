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
  IconHome,
  IconPie,
  IconSettings,
} from "../components/Icons";

const nav = [
  { to: "/", label: "Report", icon: IconHome, end: true },
  { to: "/planejamento", label: "Planejamento", icon: IconCalendar },
  { to: "/status-frente", label: "Status", icon: IconPie },
  { to: "/execucoes", label: "Execuções", icon: IconCode },
  { to: "/falhas", label: "Falhas", icon: IconBug },
];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
      <TopAppBar />
      <div className="app-body">
        <aside className="sidebar">
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
            <button
              type="button"
              className="icon-btn"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              <IconChevron flipped={collapsed} />
            </button>
            <button type="button" className="icon-btn" aria-label="Configurações">
              <IconSettings />
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
