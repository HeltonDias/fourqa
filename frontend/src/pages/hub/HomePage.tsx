import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { roleAtLeast, writeActiveConnection } from "../../auth/connectionStore";
import { useSession } from "../../auth/session";
import { PageHeader } from "../../components/PageHeader";
import { useFetch } from "../../hooks/useFetch";
import { PROVIDER_LABEL, projectsFromConnections, projectsFromSettings, type ConnectedProject } from "./projects";
import "./hub.css";

export function HomePage() {
  useState(() => writeActiveConnection(null));
  const { state } = useSession();
  const authenticated = state?.authenticated === true;
  const { data, loading, error, reload } = useFetch<ConnectedProject[]>(
    () =>
      authenticated
        ? api.connections().then((r) => projectsFromConnections(r.connections))
        : api.syncSettings().then(projectsFromSettings),
    [authenticated],
  );
  const projects = data ?? [];

  return (
    <div className="hub-page">
      <PageHeader
        title="Página inicial"
        description="Projetos conectados ao FourQA. Selecione um projeto para abrir o relatório."
        actions={
          authenticated ? (
            <Link className="btn-primary hub-btn-link" to="/conectar">
              + Conectar novo projeto
            </Link>
          ) : null
        }
      />

      {!authenticated && state ? (
        <p className="hub-notice" role="status">
          Login desativado neste ambiente: exibindo o projeto configurado no servidor. Configure
          FOURQA_SESSION_SECRET e FOURQA_PAT_ENCRYPTION_KEY para habilitar o acesso por usuário. Para testar
          localmente: <code>npm run dev:auth -- --head=seu.email@empresa.com</code>.
        </p>
      ) : null}

      <section aria-labelledby="hub-projects-title">
        <h2 id="hub-projects-title" className="hub-section-title">
          Projetos conectados
          {!loading && !error ? <span className="hub-count">{projects.length}</span> : null}
        </h2>

        {loading ? <div className="state-box">Carregando projetos…</div> : null}

        {error ? (
          <div className="state-box error">
            <p>Não foi possível carregar os projetos conectados.</p>
            <p className="hint">{error}</p>
            <button type="button" className="hub-btn-ghost" onClick={reload}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="hub-grid">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onDisconnected={reload} />
            ))}
            {authenticated ? <ConnectCard /> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ProjectCard({ project, onDisconnected }: { project: ConnectedProject; onDisconnected: () => void }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const open = () => {
    writeActiveConnection(project.connection);
    navigate("/visao-geral");
  };
  const closeConfirm = () => {
    if (disconnecting) return;
    setConfirming(false);
    setDisconnectError(null);
  };
  const confirmDisconnect = () => {
    if (!project.connection || disconnecting) return;
    setDisconnecting(true);
    setDisconnectError(null);
    api
      .disconnect(project.connection.id)
      .then(onDisconnected)
      .catch((err: Error) => {
        setDisconnecting(false);
        setDisconnectError(err.message);
      });
  };

  return (
    <article className="card hub-card">
      <header className="hub-card-head">
        <span className="hub-provider">{PROVIDER_LABEL[project.provider]}</span>
        <span className={`hub-status ${project.active ? "is-on" : "is-off"}`}>
          {project.roleLabel ?? (project.active ? "Conectado" : "Inativo")}
        </span>
      </header>

      <h3 className="hub-card-title" title={project.name}>
        {project.name}
      </h3>

      <dl className="hub-meta">
        <div>
          <dt>Test Plan</dt>
          <dd>{project.planId}</dd>
        </div>
        <div>
          <dt>PlanKey</dt>
          <dd title={project.planKey || undefined}>{project.planKey || "—"}</dd>
        </div>
        <div>
          <dt>Organização</dt>
          <dd title={project.organization || undefined}>{project.organization || "—"}</dd>
        </div>
        <div>
          <dt>Projeto</dt>
          <dd title={project.project || undefined}>{project.project || "—"}</dd>
        </div>
      </dl>

      <footer className="hub-card-foot">
        {project.connection && roleAtLeast(project.connection.role, "lider") ? (
          <button type="button" className="hub-btn-disconnect" onClick={() => setConfirming(true)} disabled={disconnecting}>
            Desconectar
          </button>
        ) : null}
        <button type="button" className="btn-primary" onClick={open}>
          Abrir relatório
        </button>
      </footer>
      {confirming ? <DisconnectModal projectName={project.name} busy={disconnecting} error={disconnectError} onCancel={closeConfirm} onConfirm={confirmDisconnect} /> : null}
    </article>
  );
}

function DisconnectModal({
  projectName,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  projectName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="plan-modal-backdrop" onMouseDown={() => { if (!busy) onCancel(); }}>
      <div
        className="plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-disconnect-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="hub-disconnect-title">Desconectar projeto</h2>
        <p className="plan-modal-lead">Desconectar “{projectName}”? O projeto sai da Página inicial.</p>
        {error ? <p className="plan-error">{error}</p> : null}
        <div className="plan-modal-actions">
          <button type="button" className="plan-modal-cancel" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="plan-filter-primary" onClick={onConfirm} disabled={busy}>
            {busy ? "Desconectando…" : "Desconectar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectCard() {
  return (
    <Link to="/conectar" className="hub-card hub-card--add">
      <span className="hub-add-plus" aria-hidden>
        +
      </span>
      <strong>Conectar novo projeto</strong>
      <span className="muted">Vincule outro Test Plan do Azure DevOps.</span>
    </Link>
  );
}
