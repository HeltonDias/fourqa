import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, fmtDateTime, isConflict, type SyncSettingsView } from "../api";
import { PageHeader } from "../components/PageHeader";
import { SyncMessage } from "../components/SyncMessage";
import { useReportChrome } from "../context/ReportChromeContext";
import "./configuracoes.css";

type SectionId = "ambiente" | "integracoes" | "usuarios" | "seguranca" | "parametros" | "dados";

const configIcons = import.meta.glob<string>("../../../fonte/util/config/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function configIconUrl(fileName: string): string | undefined {
  const target = `/${fileName}`.toLowerCase();
  return Object.entries(configIcons).find(([path]) => decodeURIComponent(path).toLowerCase().endsWith(target))?.[1];
}

function CfgIcon({ file }: { file: string }) {
  const src = configIconUrl(file);
  if (!src) return null;
  const style: CSSProperties = {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
  };
  return <span className="cfg-icon" style={style} aria-hidden />;
}

const SECTIONS: { id: SectionId; title: string; text: string; icon: ReactNode }[] = [
  { id: "ambiente", title: "Ambiente", text: "Plano e período", icon: <CfgIcon file="Ambiente.png" /> },
  { id: "integracoes", title: "Integrações", text: "Azure DevOps", icon: <CfgIcon file="Integrações.png" /> },
  { id: "usuarios", title: "Usuários", text: "Acessos e perfis", icon: <CfgIcon file="Usuários.png" /> },
  { id: "seguranca", title: "Segurança", text: "Políticas e sessões", icon: <CfgIcon file="Segurança.png" /> },
  { id: "parametros", title: "Parâmetros", text: "Regras e preferências", icon: <CfgIcon file="Parametros.png" /> },
  { id: "dados", title: "Dados", text: "Sincronização e histórico", icon: <CfgIcon file="Dados.png" /> },
];

function toInputDate(value: string | undefined): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso?.[1]) return iso[1];
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function useServerSettings() {
  const [data, setData] = useState<SyncSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .syncSettings()
      .then((value) => {
        if (live) setData(value);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Não foi possível ler a configuração.");
      });
    return () => {
      live = false;
    };
  }, [version]);

  return { data, error, reload: () => setVersion((current) => current + 1) };
}

export function ConfiguracoesPage() {
  const [section, setSection] = useState<SectionId>("ambiente");
  const settings = useServerSettings();

  return (
    <div className="module-page cfg-page">
      <PageHeader
        title="Configurações"
        description="Gerencie o ambiente, as integrações e as preferências do FourQA."
      />

      <div className="cfg-sections" role="group" aria-label="Seções de configuração">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="cfg-card"
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.icon}
            <strong>{item.title}</strong>
            <small>{item.text}</small>
          </button>
        ))}
      </div>

      <div key={section} className="cfg-stage" id="cfg-panel">
        {section === "ambiente" ? <Ambiente /> : null}
        {section === "integracoes" ? <Integracoes settings={settings} /> : null}
        {section === "usuarios" ? (
          <Unavailable title="Usuários" text="Acessos e perfis ainda não estão nesta central." />
        ) : null}
        {section === "seguranca" ? <Seguranca /> : null}
        {section === "parametros" ? <Parametros settings={settings} onSaved={settings.reload} /> : null}
        {section === "dados" ? <Dados settings={settings} /> : null}
      </div>
    </div>
  );
}

function Seguranca() {
  const { refreshHome } = useReportChrome();
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState("");
  const [hasToken, setHasToken] = useState(() => Boolean(localStorage.getItem("fourqa_token")?.trim()));

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = token.trim();
    if (!value) return;
    localStorage.setItem("fourqa_token", value);
    setToken("");
    setHasToken(true);
    setSaved("Token salvo neste navegador.");
    refreshHome();
  }

  function clear() {
    localStorage.removeItem("fourqa_token");
    setHasToken(false);
    setSaved("Token removido deste navegador.");
    refreshHome();
  }

  return (
    <section className="cfg-panel">
      <h2>Segurança</h2>
      <p>Token de acesso da API. O valor fica só neste navegador.</p>
      <form className="cfg-form" onSubmit={submit}>
        <label className="cfg-field cfg-field-wide">
          <span>Token de acesso</span>
          <input
            type="password"
            name="fourqa-access-token"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={hasToken ? "Token já salvo. Digite outro para substituir." : "Cole o token"}
          />
        </label>
        <div className="cfg-section-actions">
          {hasToken ? (
            <button type="button" onClick={clear}>
              Remover
            </button>
          ) : null}
          <button type="submit" className="btn-primary" disabled={!token.trim()}>
            Salvar
          </button>
        </div>
        {saved ? <p className="cfg-note">{saved}</p> : null}
      </form>
    </section>
  );
}

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <section className="cfg-panel">
      <h2>{title}</h2>
      <p className="cfg-unavailable">{text}</p>
    </section>
  );
}

function Ambiente() {
  const { home, homeLoading, homeError, planKey, patchCabecalho, patchPeriodo, refreshHome, sync } = useReportChrome();
  const [title, setTitle] = useState(home?.title ?? "");
  const [subtitle, setSubtitle] = useState(home?.subtitle ?? "");
  const [inicio, setInicio] = useState(toInputDate(home?.periodo.inicio));
  const [fim, setFim] = useState(toInputDate(home?.periodo.fim));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const yearMin = new Date().getFullYear();

  useEffect(() => {
    if (!home) return;
    setTitle(home.title);
    setSubtitle(home.subtitle);
    setInicio(toInputDate(home.periodo.inicio));
    setFim(toInputDate(home.periodo.fim));
  }, [home]);

  const baseInicio = toInputDate(home?.periodo.inicio);
  const baseFim = toInputDate(home?.periodo.fim);
  const dirty =
    !!home &&
    (title !== home.title || subtitle !== home.subtitle || inicio !== baseInicio || fim !== baseFim);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!home || saving) return;
    if (!title.trim()) {
      setError("O título não pode ficar vazio.");
      return;
    }
    if (!inicio || !fim) {
      setError("Informe a data de início e a data de fim.");
      return;
    }
    if (inicio > fim) {
      setError("Data Início não pode ser posterior à Data Fim.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved("");
    try {
      if (title !== home.title || subtitle !== home.subtitle) {
        const header = await api.salvarCabecalho(title, subtitle, { title: home.title, subtitle: home.subtitle });
        patchCabecalho(header);
      }
      if (inicio !== baseInicio || fim !== baseFim) {
        const periodo = await api.salvarPeriodoPlano(inicio, fim, { inicio: baseInicio, fim: baseFim });
        patchPeriodo(periodo);
      }
      setSaved("Plano atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gravar o plano.");
      if (isConflict(err)) refreshHome(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cfg-panels">
      <section className="cfg-panel">
        <h2>Plano e período</h2>
        <p>Título, subtítulo e intervalo usados nos relatórios deste plano.</p>
        {homeLoading ? <p className="cfg-note">Carregando o plano.</p> : null}
        {homeError ? <p className="cfg-error">{homeError}</p> : null}
        <form className="cfg-form" onSubmit={submit}>
          <div className="cfg-grid">
            <label className="cfg-field cfg-field-wide">
              <span>Título</span>
              <input value={title} maxLength={200} disabled={!home || saving} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="cfg-field cfg-field-wide">
              <span>Subtítulo</span>
              <input value={subtitle} maxLength={300} disabled={!home || saving} onChange={(event) => setSubtitle(event.target.value)} />
            </label>
            <label className="cfg-field">
              <span>Data início</span>
              <input
                type="date"
                value={inicio}
                min={`${yearMin}-01-01`}
                max="2100-12-31"
                disabled={!home || saving}
                onChange={(event) => setInicio(event.target.value)}
              />
            </label>
            <label className="cfg-field">
              <span>Data fim</span>
              <input
                type="date"
                value={fim}
                min={`${yearMin}-01-01`}
                max="2100-12-31"
                disabled={!home || saving}
                onChange={(event) => setFim(event.target.value)}
              />
            </label>
          </div>
          {error ? <p className="cfg-error">{error}</p> : null}
          {saved ? <p className="cfg-note">{saved}</p> : null}
          <footer className="cfg-footer">
            <button type="submit" className="btn-primary" disabled={!home || saving || !dirty}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </footer>
        </form>
      </section>

      {home ? (
        <section className="cfg-panel">
          <h2>Coleta deste plano</h2>
          <p>Identificador e última atualização já registrados. A conexão com o Azure não se edita aqui.</p>
          <dl className="cfg-facts">
            <div>
              <dt>PlanKey</dt>
              <dd>{planKey || "—"}</dd>
            </div>
            <div>
              <dt>Última atualização</dt>
              <dd>{fmtDateTime(home.ultimaImportacao ?? home.atualizadoEm)}</dd>
            </div>
          </dl>
          {sync?.summary ? (
            <p className="cfg-note">
              Última coleta: {sync.summary.execucoes} execuções e {sync.summary.falhas} falhas.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

type SettingsState = { data: SyncSettingsView | null; error: string | null };

function flag(value: boolean): string {
  return value ? "SIM" : "NÃO";
}

function shown(value: string): string {
  return value || "—";
}

function SettingsStatus({ settings }: { settings: SettingsState }) {
  if (settings.error) return <p className="cfg-error">{settings.error}</p>;
  if (!settings.data) return <p className="cfg-note">Carregando a configuração do servidor.</p>;
  return settings.data.warning ? <p className="cfg-error">{settings.data.warning}</p> : null;
}

function Integracoes({ settings }: { settings: SettingsState }) {
  const data = settings.data;
  return (
    <div className="cfg-panels">
      <section className="cfg-panel">
        <h2>Azure DevOps</h2>
        <p>Organização e projeto lidos do ambiente que a sincronização já usa.</p>
        <SettingsStatus settings={settings} />
        {data ? (
          <dl className="cfg-facts">
            <div>
              <dt>Organização</dt>
              <dd>{shown(data.organization)}</dd>
            </div>
            <div>
              <dt>Projeto</dt>
              <dd>{shown(data.project)}</dd>
            </div>
            <div>
              <dt>API</dt>
              <dd>{shown(data.apiVersion)}</dd>
            </div>
            <div>
              <dt>Credencial</dt>
              <dd>{data.credentialConfigured ? "Configurada no servidor" : "Ausente"}</dd>
            </div>
          </dl>
        ) : null}
        <p className="cfg-note">Leitura do ambiente do servidor. Esta tela ainda não grava alterações.</p>
      </section>
      <section className="cfg-panel">
        <h2>Planos de teste</h2>
        <p>Planos marcados para carga na sincronização.</p>
        {data && data.plans.length > 0 ? (
          <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th>PlanKey</th>
                <th>PlanId</th>
                <th>Nome</th>
                <th>Filtro</th>
                <th>Máx. suítes</th>
                <th>Carregar</th>
              </tr>
            </thead>
            <tbody>
              {data.plans.map((plan) => (
                <tr key={`${plan.planKey}-${plan.planId}`}>
                  <td>{shown(plan.planKey)}</td>
                  <td>{plan.planId || "—"}</td>
                  <td>{shown(plan.planName)}</td>
                  <td>{shown(plan.suiteNameFilter)}</td>
                  <td>{plan.maxSuites}</td>
                  <td>{flag(plan.load)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : data ? (
          <p className="cfg-note">Nenhum plano no ambiente.</p>
        ) : null}
      </section>
    </div>
  );
}

type ParameterDraft = {
  kpiPlanKey: string;
  hierarchy: SyncSettingsView["hierarchy"];
  responsibilities: SyncSettingsView["responsibilities"];
  executionFields: string[];
  failureFields: string[];
};

function copyParameters(data: SyncSettingsView): ParameterDraft {
  return {
    kpiPlanKey: data.kpiPlanKey,
    hierarchy: data.hierarchy.map((row) => ({ ...row })),
    responsibilities: data.responsibilities.map((row) => ({ ...row })),
    executionFields: [...data.executionFields],
    failureFields: [...data.failureFields],
  };
}

function Parametros({ settings, onSaved }: { settings: SettingsState & { reload: () => void }; onSaved: () => void }) {
  const data = settings.data;
  const [draft, setDraft] = useState<ParameterDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const preserve = useRef<"rules" | "fields" | null>(null);
  const signature = data
    ? JSON.stringify([data.source, data.kpiPlanKey, data.hierarchy, data.responsibilities, data.executionFields, data.failureFields])
    : "";

  useEffect(() => {
    if (!data) return;
    setDraft((current) => {
      const next = copyParameters(data);
      const hold = preserve.current;
      preserve.current = null;
      if (!current || !hold) return next;
      if (hold === "fields") {
        return { ...next, executionFields: current.executionFields, failureFields: current.failureFields };
      }
      return {
        ...next,
        kpiPlanKey: current.kpiPlanKey,
        hierarchy: current.hierarchy.map((row) => ({ ...row })),
        responsibilities: current.responsibilities.map((row) => ({ ...row })),
      };
    });
  }, [data, signature]);

  const loaded = data ? copyParameters(data) : null;
  const rulesDirty =
    !!draft &&
    !!loaded &&
    JSON.stringify({
      kpiPlanKey: draft.kpiPlanKey,
      hierarchy: draft.hierarchy,
      responsibilities: draft.responsibilities,
    }) !==
      JSON.stringify({
        kpiPlanKey: loaded.kpiPlanKey,
        hierarchy: loaded.hierarchy,
        responsibilities: loaded.responsibilities,
      });
  const fieldsDirty =
    !!draft &&
    !!loaded &&
    JSON.stringify({ executionFields: draft.executionFields, failureFields: draft.failureFields }) !==
      JSON.stringify({ executionFields: loaded.executionFields, failureFields: loaded.failureFields });

  async function save(section: "rules" | "fields") {
    if (!draft || !loaded || saving) return;
    const body =
      section === "rules"
        ? { ...loaded, kpiPlanKey: draft.kpiPlanKey, hierarchy: draft.hierarchy, responsibilities: draft.responsibilities }
        : { ...loaded, executionFields: draft.executionFields, failureFields: draft.failureFields };
    setSaving(true);
    setError(null);
    setSaved("");
    preserve.current = section === "rules" ? "fields" : "rules";
    try {
      await api.salvarParametros(body);
      setSaved(section === "rules" ? "Regras gravadas. Elas entram na próxima sincronização." : "Campos gravados.");
      onSaved();
    } catch (err) {
      preserve.current = null;
      setError(err instanceof Error ? err.message : "Não foi possível gravar os parâmetros.");
    } finally {
      setSaving(false);
    }
  }

  function restore(section: "rules" | "fields") {
    if (!loaded) return;
    setDraft((current) => {
      if (!current) return current;
      if (section === "rules") {
        return {
          ...current,
          kpiPlanKey: loaded.kpiPlanKey,
          hierarchy: loaded.hierarchy.map((row) => ({ ...row })),
          responsibilities: loaded.responsibilities.map((row) => ({ ...row })),
        };
      }
      return {
        ...current,
        executionFields: [...loaded.executionFields],
        failureFields: [...loaded.failureFields],
      };
    });
    setError(null);
    setSaved("");
  }

  function toggle(list: "executionFields" | "failureFields", field: string) {
    setDraft((current) => {
      if (!current) return current;
      const selected = current[list];
      return {
        ...current,
        [list]: selected.includes(field) ? selected.filter((item) => item !== field) : [...selected, field],
      };
    });
  }

  const executionOptions = data?.executionCatalog?.length ? data.executionCatalog : data?.executionFields ?? [];
  const failureOptions = data?.failureCatalog?.length ? data.failureCatalog : data?.failureFields ?? [];

  return (
    <div className="cfg-panels">
      <section className="cfg-panel">
        <h2>Regras do plano</h2>
        <p>Estas regras substituem o ambiente quando são gravadas. A próxima sincronização passa a usá-las.</p>
        <SettingsStatus settings={settings} />
        {draft ? (
          <div className="cfg-form">
            <label className="cfg-field">
              <span>Plano dos KPIs</span>
              <input value={draft.kpiPlanKey} maxLength={80} onChange={(event) => setDraft({ ...draft, kpiPlanKey: event.target.value })} />
            </label>
            <div className="cfg-table-wrap">
              <table className="cfg-table">
                <thead>
                  <tr>
                    <th>PlanKey</th>
                    <th>Ordem</th>
                    <th>Coluna</th>
                    <th>Nível</th>
                    <th>Fonte</th>
                    <th>Ativo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draft.hierarchy.map((row, index) => (
                    <tr key={`${index}-${row.columnName}`}>
                      <td><input aria-label="PlanKey da hierarquia" value={row.planKey} onChange={(event) => setDraft({ ...draft, hierarchy: draft.hierarchy.map((item, i) => i === index ? { ...item, planKey: event.target.value } : item) })} /></td>
                      <td><input aria-label="Ordem" type="number" min={1} max={99} value={row.order} onChange={(event) => setDraft({ ...draft, hierarchy: draft.hierarchy.map((item, i) => i === index ? { ...item, order: Number(event.target.value) } : item) })} /></td>
                      <td><input aria-label="Coluna" value={row.columnName} onChange={(event) => setDraft({ ...draft, hierarchy: draft.hierarchy.map((item, i) => i === index ? { ...item, columnName: event.target.value } : item) })} /></td>
                      <td><input aria-label="Nível" value={row.sourceLevel} onChange={(event) => setDraft({ ...draft, hierarchy: draft.hierarchy.map((item, i) => i === index ? { ...item, sourceLevel: event.target.value } : item) })} /></td>
                      <td>
                        <select aria-label="Fonte" value={row.source} onChange={(event) => setDraft({ ...draft, hierarchy: draft.hierarchy.map((item, i) => i === index ? { ...item, source: event.target.value } : item) })}>
                          <option value="hierarchy_level">Nível</option>
                          <option value="current_suite">Suíte atual</option>
                        </select>
                      </td>
                      <td><input aria-label="Ativo" type="checkbox" checked={row.active} onChange={(event) => setDraft({ ...draft, hierarchy: draft.hierarchy.map((item, i) => i === index ? { ...item, active: event.target.checked } : item) })} /></td>
                      <td><button type="button" className="cfg-mini" onClick={() => setDraft({ ...draft, hierarchy: draft.hierarchy.filter((_, i) => i !== index) })}>Remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="cfg-mini"
              onClick={() =>
                setDraft({
                  ...draft,
                  hierarchy: [...draft.hierarchy, { planKey: draft.kpiPlanKey, order: draft.hierarchy.length + 1, columnName: "", sourceLevel: "1", source: "hierarchy_level", active: true }],
                })
              }
            >
              Adicionar nível
            </button>
            <div className="cfg-table-wrap">
              <table className="cfg-table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Responsabilidade</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draft.responsibilities.map((row, index) => (
                    <tr key={`${index}-${row.category}`}>
                      <td><input aria-label="Categoria" value={row.category} onChange={(event) => setDraft({ ...draft, responsibilities: draft.responsibilities.map((item, i) => i === index ? { ...item, category: event.target.value } : item) })} /></td>
                      <td><input aria-label="Responsabilidade" value={row.responsibility} onChange={(event) => setDraft({ ...draft, responsibilities: draft.responsibilities.map((item, i) => i === index ? { ...item, responsibility: event.target.value } : item) })} /></td>
                      <td><button type="button" className="cfg-mini" onClick={() => setDraft({ ...draft, responsibilities: draft.responsibilities.filter((_, i) => i !== index) })}>Remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="cfg-mini"
              onClick={() => setDraft({ ...draft, responsibilities: [...draft.responsibilities, { category: "", responsibility: "" }] })}
            >
              Adicionar categoria
            </button>
            {error && rulesDirty ? <p className="cfg-error">{error}</p> : null}
            {saved && rulesDirty === false && saved.startsWith("Regras") ? <p className="cfg-note">{saved}</p> : null}
            <footer className="cfg-section-actions">
              <button type="button" className="cfg-mini" onClick={() => restore("rules")} disabled={saving || !rulesDirty}>
                Usar o ambiente
              </button>
              <button type="button" className="btn-primary" onClick={() => save("rules")} disabled={saving || !rulesDirty}>
                {saving && rulesDirty ? "Salvando…" : "Salvar"}
              </button>
            </footer>
          </div>
        ) : null}
      </section>
      <section className="cfg-panel">
        <h2>Campos da coleta</h2>
        <p>A escolha define as colunas de Execuções e Falhas. A gravação no banco continua com o conjunto fixo.</p>
        {draft ? (
          <>
            <p className="cfg-note">Execuções</p>
            <div className="cfg-checks">
              {executionOptions.map((field) => (
                <label key={field}>
                  <input type="checkbox" checked={draft.executionFields.includes(field)} onChange={() => toggle("executionFields", field)} />
                  {field}
                </label>
              ))}
            </div>
            <p className="cfg-note">Falhas</p>
            <div className="cfg-checks">
              {failureOptions.map((field) => (
                <label key={field}>
                  <input type="checkbox" checked={draft.failureFields.includes(field)} onChange={() => toggle("failureFields", field)} />
                  {field}
                </label>
              ))}
            </div>
          </>
        ) : null}
        {error && fieldsDirty ? <p className="cfg-error">{error}</p> : null}
        {saved && !fieldsDirty && saved.startsWith("Campos") ? <p className="cfg-note">{saved}</p> : null}
        <footer className="cfg-section-actions">
          <button type="button" className="cfg-mini" onClick={() => restore("fields")} disabled={saving || !fieldsDirty}>
            Usar o ambiente
          </button>
          <button type="button" className="btn-primary" onClick={() => save("fields")} disabled={saving || !fieldsDirty}>
            {saving && fieldsDirty ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Dados({ settings }: { settings: SettingsState }) {
  const { home, homeLoading, sync, syncError, homeError, handleAtualizar, syncing } = useReportChrome();
  const data = settings.data;

  return (
    <div className="cfg-panels">
      <section className="cfg-panel">
        <h2>Ferramenta conectada</h2>
        <div className="cfg-tool">
          <span className="cfg-tool-mark">
            <IconAzureDevOps />
          </span>
          <div>
            <strong>Azure DevOps</strong>
            <p className="cfg-note">Origem da coleta deste ambiente.</p>
          </div>
        </div>
      </section>
      <section className="cfg-panel">
        <h2>Substituição da coleta</h2>
        <p>O aplicativo só sincroniza quando estes dois parâmetros estão em SIM.</p>
        <SettingsStatus settings={settings} />
        {data ? (
          <dl className="cfg-facts">
            <div>
              <dt>Limpar antes</dt>
              <dd>{shown(data.clearBefore)}</dd>
            </div>
            <div>
              <dt>Criar cabeçalho</dt>
              <dd>{shown(data.createHeader)}</dd>
            </div>
          </dl>
        ) : null}
      </section>
      <section className="cfg-panel">
        <h2>Sincronização</h2>
        <p>A mesma atualização já usada na barra do projeto.</p>
        <div className="cfg-form">
          <div className="cfg-sync-row">
            <p className="cfg-note cfg-sync-meta">
              Última atualização:{" "}
              {home ? fmtDateTime(home.ultimaImportacao ?? home.atualizadoEm) : homeLoading ? "…" : "—"}
            </p>
            <button type="button" className="btn-primary" onClick={handleAtualizar} disabled={syncing || homeLoading}>
              {syncing ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
          <SyncMessage sync={sync} error={syncError ?? homeError} />
        </div>
      </section>
      <section className="cfg-panel">
        <h2>Histórico</h2>
        <p>
          O histórico de alterações do planejamento continua na aba{" "}
          <Link className="cfg-link" to="/planejamento">
            Planejamento
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function IconAzureDevOps() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#0078D4"
        d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z"
      />
    </svg>
  );
}

