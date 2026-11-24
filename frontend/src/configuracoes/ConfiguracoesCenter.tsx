import { useMemo, useState } from "react";
import { defaultConfig } from "./defaults";
import {
  AzurePanel,
  CamposPanel,
  CategoriasPanel,
  DiagnosticoPanel,
  ExportacaoPanel,
  HierarquiaPanel,
  PlanosPanel,
} from "./panels";
import { SECTIONS, sectionMatches } from "./sections";
import { loadConfig, saveConfig } from "./store";
import type { CentralConfiguracoes, SectionId } from "./types";
import { blocking, sectionStatus, validate } from "./validate";
import { EmptyState } from "./widgets";

const PILL = { ok: "Pronta", pendente: "Incompleta", erro: "Revisar" } as const;

export function ConfiguracoesCenter() {
  const [draft, setDraft] = useState(loadConfig);
  const [snap, setSnap] = useState(() => JSON.stringify(draft));
  const [section, setSection] = useState<SectionId>("azure");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [armReset, setArmReset] = useState(false);
  const issues = useMemo(() => validate(draft), [draft]);
  const errors = blocking(issues);
  const dirty = JSON.stringify(draft) !== snap;
  const pendingCount = issues.filter((issue) => issue.severity === "pendente").length;
  const matches = SECTIONS.filter((item) => sectionMatches(item.id, draft, query));
  const sectionVisible = sectionMatches(section, draft, query);
  const planKeys = [...new Set(draft.planos.map((plano) => plano.planKey.trim()).filter(Boolean))];

  function save() {
    if (errors.length > 0) return;
    const stored = saveConfig(draft);
    setDraft(stored);
    setSnap(JSON.stringify(stored));
    setNotice("Configuração salva neste navegador. A coleta do servidor não mudou.");
    setArmReset(false);
  }

  function restore() {
    if (!armReset) {
      setArmReset(true);
      return;
    }
    setDraft(defaultConfig());
    setNotice("Exemplo inicial colocado em edição. Salve para guardar neste navegador.");
    setArmReset(false);
  }

  return (
    <div className="cfg">
      <header className="cfg-top">
        <div>
          <h1>Configurações</h1>
          <p>
            Organize a coleta, os relatórios e as exportações sem abrir o arquivo de ambiente. O que você salva fica neste navegador.
          </p>
        </div>
        <div className="cfg-top-tools">
          <label className="cfg-search">
            <span>Buscar</span>
            <input
              type="search"
              value={query}
              placeholder="Plano, frente, categoria, campo"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="cfg-actions">
            <button type="button" className="cfg-btn cfg-btn-primary" disabled={!dirty || errors.length > 0} onClick={save}>
              Salvar neste navegador
            </button>
            <button
              type="button"
              className="cfg-btn"
              disabled={!dirty}
              onClick={() => {
                setDraft(JSON.parse(snap) as CentralConfiguracoes);
                setNotice("Alterações descartadas.");
                setArmReset(false);
              }}
            >
              Descartar
            </button>
            <button type="button" className="cfg-btn" onClick={restore}>
              {armReset ? "Confirmar exemplo" : "Restaurar exemplo"}
            </button>
          </div>
        </div>
      </header>
      {notice ? <p className="cfg-notice" role="status">{notice}</p> : null}
      {errors.length > 0 ? <p className="cfg-note cfg-note-error">Há campos para revisar antes de salvar.</p> : null}
      {pendingCount > 0 && errors.length === 0 ? (
        <p className="cfg-note">
          {pendingCount === 1 ? "1 item incompleto." : `${pendingCount} itens incompletos.`} Dá para salvar mesmo assim.
        </p>
      ) : null}

      <details className="cfg-pending">
        <summary>A coleta ainda usa o arquivo de ambiente. Salvar aqui não altera o servidor.</summary>
        <p>A integração com Azure, banco e sincronização fica para depois, sem interferir no trabalho em andamento.</p>
      </details>

      <div className="cfg-layout">
        <nav className="cfg-nav" aria-label="Grupos de configuração">
          {SECTIONS.map((item) => {
            const status = sectionStatus(issues, item.id);
            const dim = query.trim() && !sectionMatches(item.id, draft, query);
            return (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? "page" : undefined}
                data-dim={dim ? "true" : "false"}
                onClick={() => setSection(item.id)}
              >
                <span>{item.titulo}</span>
                <small>{item.resumo}</small>
                {status ? <em data-status={status}>{PILL[status]}</em> : null}
              </button>
            );
          })}
        </nav>

        <div className="cfg-main">
          {sectionVisible ? (
            <SectionBody
              section={section}
              draft={draft}
              query={query}
              issues={issues}
              planKeys={planKeys}
              onChange={setDraft}
            />
          ) : (
            <EmptyState title="Nada encontrado" text="Nenhum item deste grupo corresponde à busca.">
              <div className="cfg-jump">
                {matches.map((item) => (
                  <button key={item.id} type="button" className="cfg-btn" onClick={() => setSection(item.id)}>
                    {item.titulo}
                  </button>
                ))}
              </div>
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionBody({
  section,
  draft,
  query,
  issues,
  planKeys,
  onChange,
}: {
  section: SectionId;
  draft: CentralConfiguracoes;
  query: string;
  issues: ReturnType<typeof validate>;
  planKeys: string[];
  onChange: (next: CentralConfiguracoes) => void;
}) {
  const mine = issues.filter((issue) => issue.section === section);
  if (section === "azure") {
    return (
      <AzurePanel
        organization={draft.azure.organization}
        project={draft.azure.project}
        apiVersion={draft.azure.apiVersion}
        query={query}
        issues={mine}
        onChange={(azure) => onChange({ ...draft, azure })}
      />
    );
  }
  if (section === "planos") {
    return <PlanosPanel planos={draft.planos} query={query} issues={mine} onChange={(planos) => onChange({ ...draft, planos })} />;
  }
  if (section === "hierarquia") {
    return (
      <HierarquiaPanel niveis={draft.hierarquia} query={query} issues={mine} onChange={(hierarquia) => onChange({ ...draft, hierarquia })} />
    );
  }
  if (section === "categorias") {
    return (
      <CategoriasPanel
        categorias={draft.categorias}
        query={query}
        issues={mine}
        onChange={(categorias) => onChange({ ...draft, categorias })}
      />
    );
  }
  if (section === "execucoes") {
    return (
      <CamposPanel
        titulo="Campos de execuções"
        subtitulo="Escolhe quais informações de cada cenário aparecem nos relatórios e nas exportações."
        detalhe="Campo ativo entra na leitura do cenário. Nome técnico, padrão e valor da planilha ficam na edição individual."
        campos={draft.execucoes}
        query={query}
        issues={mine}
        onChange={(execucoes) => onChange({ ...draft, execucoes })}
      />
    );
  }
  if (section === "falhas") {
    return (
      <CamposPanel
        titulo="Campos de falhas"
        subtitulo="Escolhe quais informações de cada defeito aparecem nos relatórios e nas exportações."
        detalhe="A responsabilidade do defeito continua vindo da categoria. Impacto é a quantidade de cenários afetados."
        campos={draft.falhas}
        query={query}
        issues={mine}
        onChange={(falhas) => onChange({ ...draft, falhas })}
      />
    );
  }
  if (section === "exportacao") {
    return (
      <ExportacaoPanel
        exportacao={draft.exportacao}
        planKeys={planKeys}
        query={query}
        issues={mine}
        onChange={(exportacao) => onChange({ ...draft, exportacao })}
      />
    );
  }
  return <DiagnosticoPanel issues={issues} />;
}
