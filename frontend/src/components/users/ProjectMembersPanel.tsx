import { useState } from "react";
import { api, type MembersView } from "../../api";
import { readActiveConnection, type Role } from "../../auth/connectionStore";
import { useSession } from "../../auth/session";
import { useFetch } from "../../hooks/useFetch";

export const ROLE_LABEL: Record<Role, string> = {
  head: "Head",
  lider: "Líder",
  qa: "QA",
  visitante: "Visitante",
};

/** Configurações > Usuários: papel de cada membro neste projeto (DEC-036). */
export function ProjectMembersPanel() {
  const connection = readActiveConnection();
  const { state } = useSession();
  const [view, setView] = useState<MembersView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const loaded = useFetch(
    () => (connection ? api.members(connection.id).then((v) => (setView(v), v)) : Promise.resolve(null)),
    [connection?.id],
  );

  if (!connection) {
    return (
      <section className="cfg-panel">
        <h2>Usuários</h2>
        <p className="cfg-unavailable">Entre com seu PAT e abra um projeto conectado para gerenciar os membros.</p>
      </section>
    );
  }

  const data = view ?? loaded.data;
  const actorIsHead = data?.connection.role === "head";

  async function change(userId: number, role: Role | null) {
    if (!connection) return;
    setBusy(userId);
    setError(null);
    try {
      setView(await api.setMemberRole(connection.id, userId, role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o papel.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(userId: number) {
    if (!connection) return;
    setBusy(userId);
    setError(null);
    try {
      setView(await api.removeMember(connection.id, userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o membro.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="cfg-panel">
      <h2>Usuários deste projeto</h2>
      <p>
        O papel do projeto sobrepõe o papel global. “Padrão” usa o papel global da pessoa. Head global sempre é Head.
        Novos membros entram com o papel global; quem conecta o projeto primeiro vira Líder.
      </p>
      {loaded.loading && !data ? <p className="cfg-note">Carregando membros…</p> : null}
      {loaded.error ? <p className="cfg-note">{loaded.error}</p> : null}
      {error ? (
        <p className="cfg-note" role="alert">
          {error}
        </p>
      ) : null}
      {data ? (
        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Global</th>
                <th>Neste projeto</th>
                <th>Efetivo</th>
                {data.canManage ? <th aria-label="Ações" /> : null}
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const locked =
                  !data.canManage || (m.effectiveRole === "head" && !actorIsHead) || m.globalRole === "head";
                return (
                  <tr key={m.id}>
                    <td>
                      {m.name}
                      {state?.user?.id === m.id ? <small> (você)</small> : null}
                    </td>
                    <td>{m.email ?? "—"}</td>
                    <td>{m.globalRoleLabel}</td>
                    <td>
                      {data.canManage ? (
                        <select
                          value={m.memberRole ?? ""}
                          disabled={locked || busy === m.id}
                          onChange={(e) => void change(m.id, (e.target.value || null) as Role | null)}
                        >
                          <option value="">Padrão</option>
                          {data.roles
                            .filter((r) => r !== "head" || actorIsHead)
                            .map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                        </select>
                      ) : (
                        (m.memberRole && ROLE_LABEL[m.memberRole]) ?? "Padrão"
                      )}
                    </td>
                    <td>{m.effectiveRoleLabel ?? "—"}</td>
                    {data.canManage ? (
                      <td>
                        <button type="button" disabled={locked || busy === m.id} onClick={() => void remove(m.id)}>
                          Remover
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
