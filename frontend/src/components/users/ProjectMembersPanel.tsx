import { useState } from "react";
import { ApiError, api, type ConnectionInvite, type MembersView } from "../../api";
import { readActiveConnection, type Role } from "../../auth/connectionStore";
import { useSession } from "../../auth/session";
import { useFetch } from "../../hooks/useFetch";

export const ROLE_LABEL: Record<Role, string> = {
  head: "Head",
  lider: "Líder",
  qa: "QA",
  visitante: "Visitante",
};

function formatInviteDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Configurações > Usuários: papel de cada membro neste projeto (DEC-036) e convites por e-mail. */
export function ProjectMembersPanel() {
  const connection = readActiveConnection();
  const { state } = useSession();
  const [view, setView] = useState<MembersView | null>(null);
  const [invites, setInvites] = useState<ConnectionInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("qa");
  const loaded = useFetch(
    () => (connection ? api.members(connection.id).then((v) => (setView(v), v)) : Promise.resolve(null)),
    [connection?.id],
  );
  const invitesLoaded = useFetch(
    () =>
      connection
        ? api
            .invites(connection.id)
            .then((v) => {
              setInvites(v.invites);
              return v;
            })
            .catch((err: unknown) => {
              // QA/Visitante não listam convites (403) — painel continua só com membros.
              if (err instanceof ApiError && err.status === 403) {
                setInvites([]);
                return null;
              }
              throw err;
            })
        : Promise.resolve(null),
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
  const canManage = Boolean(data?.canManage);
  const pending = invites ?? invitesLoaded.data?.invites ?? [];

  async function change(userId: number, role: Role | null) {
    if (!connection) return;
    setBusy(userId);
    setError(null);
    setNotice(null);
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
    setNotice(null);
    try {
      setView(await api.removeMember(connection.id, userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o membro.");
    } finally {
      setBusy(null);
    }
  }

  async function invite() {
    if (!connection) return;
    setInviteBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.invite(connection.id, { email: email.trim(), role: inviteRole });
      if (result.addedMember) {
        setView(await api.members(connection.id));
        setNotice(`${result.user.name} já tinha conta e foi adicionado ao projeto.`);
      } else {
        const refreshed = await api.invites(connection.id);
        setInvites(refreshed.invites);
        setNotice(`Convite enviado para ${result.invite.email}. O projeto aparece quando a pessoa entrar.`);
      }
      setEmail("");
      setInviteRole("qa");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível convidar.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function cancelInvite(inviteEmail: string) {
    if (!connection) return;
    setInviteBusy(true);
    setError(null);
    setNotice(null);
    try {
      const refreshed = await api.cancelInvite(connection.id, inviteEmail);
      setInvites(refreshed.invites);
      setNotice(`Convite de ${inviteEmail} cancelado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cancelar o convite.");
    } finally {
      setInviteBusy(false);
    }
  }

  const roleOptions = (data?.roles ?? (["head", "lider", "qa", "visitante"] as Role[])).filter(
    (r) => r !== "head" || actorIsHead,
  );

  return (
    <section className="cfg-panel">
      <h2>Usuários deste projeto</h2>
      <p>
        O papel do projeto sobrepõe o papel global. “Padrão” usa o papel global da pessoa. Head global sempre é Head.
        Novos membros entram com o papel global; quem conecta o projeto primeiro vira Líder. Convites por e-mail
        vinculam o projeto quando a pessoa entrar com o mesmo e-mail.
      </p>
      {loaded.loading && !data ? <p className="cfg-note">Carregando membros…</p> : null}
      {loaded.error ? <p className="cfg-note">{loaded.error}</p> : null}
      {error ? (
        <p className="cfg-note plan-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="cfg-note">{notice}</p> : null}

      {canManage ? (
        <form
          className="cfg-form"
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
        >
          <div className="cfg-grid">
            <label className="cfg-field cfg-field-wide">
              <span>Adicionar por e-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com"
                required
                disabled={inviteBusy}
                autoComplete="off"
              />
            </label>
            <label className="cfg-field">
              <span>Cargo neste projeto</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                disabled={inviteBusy}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <div className="cfg-field" style={{ alignSelf: "end" }}>
              <button type="submit" disabled={inviteBusy || !email.trim()}>
                {inviteBusy ? "Adicionando…" : "Adicionar"}
              </button>
            </div>
          </div>
        </form>
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

      {canManage ? (
        <>
          <h3 style={{ marginTop: "1.25rem" }}>Convites pendentes</h3>
          {invitesLoaded.loading && invites === null ? <p className="cfg-note">Carregando convites…</p> : null}
          {pending.length === 0 ? (
            <p className="cfg-note">Nenhum convite pendente.</p>
          ) : (
            <div className="cfg-table-wrap">
              <table className="cfg-table">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Cargo</th>
                    <th>Criado</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.email}</td>
                      <td>{inv.roleLabel}</td>
                      <td>{formatInviteDate(inv.createdAt)}</td>
                      <td>
                        <button type="button" disabled={inviteBusy} onClick={() => void cancelInvite(inv.email)}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
