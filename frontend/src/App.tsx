import { Navigate, Route, Routes } from "react-router-dom";
import { RequireSession } from "./auth/RequireSession";
import { AppLayout } from "./layout/AppLayout";
import { HubLayout } from "./layout/HubLayout";
import { ConfiguracoesPage } from "./pages/ConfiguracoesPage";
import { EvolucaoQaPage } from "./pages/EvolucaoQaPage";
import { ExecucoesPage } from "./pages/ExecucoesPage";
import { FalhasPage } from "./pages/FalhasPage";
import { AdminUsuariosPage } from "./pages/hub/AdminUsuariosPage";
import { ConectarProjetoPage } from "./pages/hub/ConectarProjetoPage";
import { HomePage } from "./pages/hub/HomePage";
import { LoginPage } from "./pages/login/LoginPage";
import { PlanejamentoPage } from "./pages/PlanejamentoPage";
import { ReportPage } from "./pages/ReportPage";
import { StatusPage } from "./pages/StatusPage";

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <RequireSession>
            <HubLayout />
          </RequireSession>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="conectar" element={<ConectarProjetoPage />} />
        <Route path="admin/usuarios" element={<AdminUsuariosPage />} />
      </Route>
      <Route
        element={
          <RequireSession>
            <AppLayout />
          </RequireSession>
        }
      >
        <Route path="visao-geral" element={<ReportPage />} />
        <Route path="planejamento" element={<PlanejamentoPage />} />
        <Route path="status-frente" element={<StatusPage />} />
        <Route path="execucoes" element={<ExecucoesPage />} />
        <Route path="falhas" element={<FalhasPage />} />
        <Route path="evolucao-qa" element={<EvolucaoQaPage />} />
        <Route path="configuracoes" element={<ConfiguracoesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
