import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { ExecucoesPage } from "./pages/ExecucoesPage";
import { FalhasPage } from "./pages/FalhasPage";
import { PlanejamentoPage } from "./pages/PlanejamentoPage";
import { ReportPage } from "./pages/ReportPage";
import { StatusPage } from "./pages/StatusPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<ReportPage />} />
        <Route path="planejamento" element={<PlanejamentoPage />} />
        <Route path="status-frente" element={<StatusPage />} />
        <Route path="execucoes" element={<ExecucoesPage />} />
        <Route path="falhas" element={<FalhasPage />} />
      </Route>
    </Routes>
  );
}
