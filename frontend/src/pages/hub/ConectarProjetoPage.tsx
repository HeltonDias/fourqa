import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { markInitialSync, writeActiveConnection } from "../../auth/connectionStore";
import { PageHeader } from "../../components/PageHeader";
import { PROVIDER_LABEL, type ProjectProvider } from "./projects";
import { ProviderLogo } from "./ProviderLogo";
import "./hub.css";

type Options<T> = { loading: boolean; error: string | null; items: T[] };

const IDLE = { loading: false, error: null, items: [] };

function useOptions<T>(loader: (() => Promise<T[]>) | null, deps: unknown[]): Options<T> {
  const [state, setState] = useState<Options<T>>(IDLE);
  useEffect(() => {
    if (!loader) {
      setState(IDLE);
      return;
    }
    let alive = true;
    setState({ loading: true, error: null, items: [] });
    loader()
      .then((items) => alive && setState({ loading: false, error: null, items }))
      .catch((e: Error) => alive && setState({ loading: false, error: e.message, items: [] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function ConectarProjetoPage() {
  const navigate = useNavigate();
  const [provider] = useState<ProjectProvider>("azure-devops");
  const [organization, setOrganization] = useState("");
  const [project, setProject] = useState("");
  const [planId, setPlanId] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgs = useOptions(() => api.azureOrgs().then((r) => r.organizations), []);
  const projects = useOptions(
    organization ? () => api.azureProjects(organization).then((r) => r.projects.map((p) => p.name)) : null,
    [organization],
  );
  const plans = useOptions(
    organization && project ? () => api.azureTestPlans(organization, project).then((r) => r.testPlans) : null,
    [organization, project],
  );

  useEffect(() => {
    if (!organization && orgs.items.length === 1) setOrganization(orgs.items[0]);
  }, [orgs.items, organization]);

  const valid = organization !== "" && project !== "" && /^\d+$/.test(planId);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const { connection } = await api.connect({
        organization,
        project,
        testPlanId: Number(planId),
        title: title.trim() || undefined,
      });
      writeActiveConnection(connection);
      markInitialSync(connection.id);
      navigate("/visao-geral");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível conectar o projeto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hub-page hub-page--narrow">
      <nav className="hub-breadcrumb" aria-label="Navegação">
        <Link to="/">Página inicial</Link>
        <span aria-hidden>/</span>
        <span>Conectar novo projeto</span>
      </nav>

      <PageHeader
        title="Conectar novo projeto"
        description="Escolha o Test Plan com o seu acesso no Azure DevOps. Se o plano já estiver conectado, você entra nele."
      />

      <form className="card hub-form" onSubmit={onSubmit}>
        <fieldset className="hub-fieldset">
          <legend>Origem</legend>
          <div className="hub-providers" role="radiogroup" aria-label="Origem dos dados">
            <label className="hub-provider-option is-selected">
              <input type="radio" name="provider" value={provider} checked readOnly />
              <ProviderLogo provider={provider} />
              <span>{PROVIDER_LABEL[provider]}</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="hub-fieldset">
          <legend>Azure DevOps</legend>
          <div className="hub-fields">
            <Select
              label="Organização"
              value={organization}
              options={orgs.items.map((o) => ({ value: o, label: o }))}
              state={orgs}
              onChange={(v) => {
                setOrganization(v);
                setProject("");
                setPlanId("");
              }}
            />
            <Select
              label="Projeto"
              value={project}
              options={projects.items.map((p) => ({ value: p, label: p }))}
              state={projects}
              disabled={!organization}
              onChange={(v) => {
                setProject(v);
                setPlanId("");
              }}
            />
            <Select
              label="Test Plan"
              value={planId}
              options={plans.items.map((p) => ({ value: String(p.id), label: `${p.name} (#${p.id})` }))}
              state={plans}
              disabled={!project}
              onChange={setPlanId}
            />
            <label className="hub-field">
              <span>Nome de exibição</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opcional" maxLength={200} />
            </label>
          </div>
        </fieldset>

        {error ? (
          <p className="hub-notice" role="alert">
            {error}
          </p>
        ) : null}

        <div className="hub-form-actions">
          <Link to="/" className="hub-btn-ghost">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary" disabled={!valid || saving}>
            {saving ? "Conectando…" : "Conectar projeto"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  state,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  state: Options<unknown>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const placeholder = state.loading ? "Carregando…" : disabled ? "—" : options.length ? "Selecione" : "Nenhum item";
  return (
    <label className="hub-field">
      <span>
        {label}
        <em aria-hidden> *</em>
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || state.loading || options.length === 0}
        required
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {state.error ? <small className="hub-field-error">{state.error}</small> : null}
    </label>
  );
}
