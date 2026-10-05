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
        <p className="hint">
          Execute <code>npm run import:planilha</code> e <code>npm run dev</code> na raiz do projeto.
        </p>
      </div>
    );
  return <>{children}</>;
}
