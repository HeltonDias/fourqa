import { Outlet } from "react-router-dom";
import { TopAppBar } from "./TopAppBar";

export function HubLayout() {
  return (
    <div className="app">
      <TopAppBar toolLabel="Projetos" />
      <div className="app-body">
        <main className="main-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
