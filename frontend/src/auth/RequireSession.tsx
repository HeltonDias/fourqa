import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "./session";

/** Sem login configurado no ambiente, o app segue no modo legado (sem usuário). */
export function RequireSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { state } = useSession();
  if (!state) return <div className="state-box">Carregando sessão…</div>;
  if (!state.authenticated && state.loginEnabled) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
