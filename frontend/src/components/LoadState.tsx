import type { ReactNode } from "react";

export function LoadState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  if (loading) return <div className="state-box">Carregando dados…</div>;
  if (error)
    return (
      <div className="state-box error">
        <p>{error}</p>
        <p className="hint">Use Atualizar para carregar os dados do Azure.</p>
      </div>
    );
  return <>{children}</>;
}
