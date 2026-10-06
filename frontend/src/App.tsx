import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { ExecucoesPage } from "./pages/ExecucoesPage";
import { FalhasPage } from "./pages/FalhasPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { PlanejamentoPage } from "./pages/PlanejamentoPage";
import { ReportPage } from "./pages/ReportPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<ReportPage />} />
        <Route path="planejamento" element={<PlanejamentoPage />} />
        <Route path="status-frente" element={<MaintenancePage title="Status" />} />
        <Route path="execucoes" element={<ExecucoesPage />} />
        <Route path="falhas" element={<FalhasPage />} />
      </Route>
    </Routes>
  );
}
