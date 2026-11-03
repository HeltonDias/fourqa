import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { writeActiveConnection } from "../../auth/connectionStore";
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
              <ProjectCard key={project.id} project={project} />
            ))}
            {authenticated ? <ConnectCard /> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ProjectCard({ project }: { project: ConnectedProject }) {
  const navigate = useNavigate();
  const open = () => {
    writeActiveConnection(project.connection);
    navigate("/visao-geral");
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
        <button type="button" className="btn-primary" onClick={open}>
          Abrir relatório
        </button>
      </footer>
    </article>
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
