import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { MaintenancePage } from "./pages/MaintenancePage";
import { ReportPage } from "./pages/ReportPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<ReportPage />} />
        <Route path="planejamento" element={<MaintenancePage title="Planejamento" />} />
        <Route path="status-frente" element={<MaintenancePage title="Status" />} />
        <Route path="execucoes" element={<MaintenancePage title="Execuções" />} />
        <Route path="falhas" element={<MaintenancePage title="Falhas" />} />
      </Route>
    </Routes>
  );
}
