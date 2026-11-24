import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, type AuthUser } from "../../api";
import type { Role } from "../../auth/connectionStore";
import { useSession } from "../../auth/session";
import { PageHeader } from "../../components/PageHeader";
import { ROLE_LABEL } from "../../components/users/ProjectMembersPanel";
import { useFetch } from "../../hooks/useFetch";
import "./hub.css";
import "../configuracoes.css";

/** Papel global padrão de cada pessoa. Só Head acessa (DEC-036). */
export function AdminUsuariosPage() {
  const { state } = useSession();
  const isHead = state?.user?.globalRole === "head";
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const loaded = useFetch(() => (isHead ? api.adminUsers() : Promise.resolve(null)), [isHead]);

  if (state && !isHead) return <Navigate to="/" replace />;

  const rows = users ?? loaded.data?.users ?? [];
  const roles: Role[] = loaded.data?.roles ?? ["head", "lider", "qa", "visitante"];

  async function change(userId: number, role: Role) {
    setBusy(userId);
    setError(null);
    try {
      setUsers((await api.setGlobalRole(userId, role)).users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o papel.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="hub-page">
      <nav className="hub-breadcrumb" aria-label="Navegação">
        <Link to="/">Página inicial</Link>
        <span aria-hidden>/</span>
        <span>Papéis globais</span>
      </nav>
      <PageHeader
        title="Papéis globais"
        description="Papel padrão de cada pessoa em todos os projetos. O papel definido em um projeto sobrepõe este padrão."
      />
      <section className="card cfg-panel">
        {loaded.loading ? <p className="cfg-note">Carregando usuários…</p> : null}
        {loaded.error ? <p className="cfg-note">{loaded.error}</p> : null}
        {error ? (
          <p className="cfg-note" role="alert">
            {error}
          </p>
        ) : null}
        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel global</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {state?.user?.id === u.id ? <small> (você)</small> : null}
                  </td>
                  <td>{u.email ?? "—"}</td>
                  <td>
                    <select
                      value={u.globalRole}
                      disabled={busy === u.id}
                      onChange={(e) => void change(u.id, e.target.value as Role)}
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
