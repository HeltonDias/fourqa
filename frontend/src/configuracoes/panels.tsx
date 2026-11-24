import { useEffect, useState } from "react";
import { PADROES } from "./defaults";
import { INTEGRACAO_PENDENTE } from "./integracao";
import { includesQuery, moveById, nid } from "./ops";
import type {
  CampoConfiguracao,
  CampoPadrao,
  CategoriaResponsabilidade,
  ConfigIssue,
  ExportacaoConfiguracao,
  NivelHierarquia,
  PlanoConfiguracao,
} from "./types";
import { Block, Drawer, EmptyState, IssueList, SelectField, TextField, Toggle } from "./widgets";

function broad(query: string, titulo: string, subtitulo: string): boolean {
  return includesQuery(query, [titulo, subtitulo]);
}

export function AzurePanel({
  organization,
  project,
  apiVersion,
  query,
  issues,
  onChange,
}: {
  organization: string;
  project: string;
  apiVersion: string;
  query: string;
  issues: ConfigIssue[];
  onChange: (next: { organization: string; project: string; apiVersion: string }) => void;
}) {
  const [pat, setPat] = useState("");
  const showAll = broad(query, "Integração Azure DevOps", "Define de onde o FourQA busca planos, execuções e defeitos.");
  const conexao = showAll || includesQuery(query, ["Conexão", "organização", "projeto", organization, project]);
  const versao = showAll || includesQuery(query, ["Versão da API", "consulta", apiVersion]);
  const credencial = showAll || includesQuery(query, ["Credencial", "PAT", "token"]);

  return (
    <div className="cfg-stack">
      <IssueList issues={issues} />
      {conexao ? (
        <Block
          title="Conexão"
          subtitle="Organização e projeto consultados nas coletas. Estes nomes identificam o Azure DevOps, não o banco do FourQA."
        >
          <div className="cfg-form">
            <TextField
              label="Organização"
              value={organization}
              placeholder="sua-organizacao"
              autoComplete="off"
              help="Nome da organização na URL do Azure DevOps, antes do projeto."
              onChange={(value) => onChange({ organization: value, project, apiVersion })}
            />
            <TextField
              label="Projeto"
              value={project}
              placeholder="Seu projeto"
              autoComplete="off"
              help="Projeto que contém os planos de teste, os casos e os bugs."
              onChange={(value) => onChange({ organization, project: value, apiVersion })}
            />
          </div>
        </Block>
      ) : null}
      {versao ? (
        <Block
          title="Versão da API"
          subtitle="Versão das consultas REST usada para ler planos, suítes, resultados e work items."
        >
          <TextField
            label="ApiVersion"
            value={apiVersion}
            placeholder="7.1"
            help="Use 7.1 ou uma prévia no formato 7.1-preview.1. A coleta atual ainda lê este valor do ambiente."
            onChange={(value) => onChange({ organization, project, apiVersion: value })}
          />
        </Block>
      ) : null}
      {credencial ? (
        <Block
          title="Credencial"
          subtitle="Token de acesso pessoal. Ele não é salvo nesta central e some ao sair da seção."
        >
          <TextField
            label="PAT"
            type="password"
            value={pat}
            autoComplete="new-password"
            placeholder="Não armazenado"
            help="Escopos necessários: Test Management (leitura) e Work Items (leitura). O servidor continua usando a credencial do ambiente."
            onChange={setPat}
          />
          <p className="cfg-note">
            {pat ? "Token presente só nesta tela. Ele não será gravado." : "Nenhum token digitado. A coleta segue a credencial do ambiente."}
          </p>
          <button type="button" className="cfg-btn" disabled>
            Testar conexão
          </button>
          <p className="cfg-note">O teste de conexão fica pendente. Esta tela não fala com o Azure.</p>
        </Block>
      ) : null}
    </div>
  );
}

export function PlanosPanel({
  planos,
  query,
  issues,
  onChange,
}: {
  planos: PlanoConfiguracao[];
  query: string;
  issues: ConfigIssue[];
  onChange: (planos: PlanoConfiguracao[]) => void;
}) {
  const [edit, setEdit] = useState<PlanoConfiguracao | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [rowError, setRowError] = useState("");
  const [armRemove, setArmRemove] = useState(false);
  const titulo = "Planos de testes";
  const subtitulo = "Escolhe quais planos entram na coleta e como cada fase fica separada.";
  const visible = broad(query, titulo, subtitulo)
    ? planos
    : planos.filter((plano) => includesQuery(query, [plano.planKey, plano.planName, plano.planId, plano.suiteNameFilter]));

  function apply() {
    if (!edit) return;
    const key = edit.planKey.trim();
    if (!key) {
      setRowError("Informe o PlanKey.");
      return;
    }
    if (planos.some((plano) => plano.id !== edit.id && plano.planKey.trim() === key)) {
      setRowError("Já existe um plano com este PlanKey.");
      return;
    }
    if (edit.carregar && !/^\d+$/.test(edit.planId.trim())) {
      setRowError("Informe o identificador numérico do plano no Azure.");
      return;
    }
    const next = { ...edit, planKey: key };
    onChange(isNew ? [...planos, next] : planos.map((plano) => (plano.id === next.id ? next : plano)));
    setEdit(null);
  }

  return (
    <div className="cfg-stack">
      <IssueList issues={issues} />
      <Block
        title={titulo}
        subtitle="Cada PlanKey isola uma fase. O identificador numérico é o plano no Azure. Filtro e máximo de suítes ficam na edição individual."
        actions={
          <button
            type="button"
            className="cfg-btn cfg-btn-primary"
            onClick={() => {
              setIsNew(true);
              setRowError("");
              setArmRemove(false);
              setEdit({
                id: nid("plan"),
                planKey: "",
                planId: "",
                planName: "",
                suiteNameFilter: "",
                maxSuites: "0",
                carregar: true,
              });
            }}
          >
            Novo plano
          </button>
        }
      >
        {visible.length === 0 ? (
          <EmptyState title="Nenhum plano encontrado" text="Ajuste a busca ou cadastre um plano para a coleta passar a considerá-lo." />
        ) : (
          <div className="cfg-table-wrap">
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>PlanKey</th>
                  <th>Nome</th>
                  <th>Coleta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((plano) => (
                  <tr key={plano.id}>
                    <td>
                      <strong>{plano.planKey || "Sem chave"}</strong>
                      <span className="cfg-help">Id {plano.planId || "não informado"}</span>
                    </td>
                    <td>{plano.planName || "Sem nome"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={plano.carregar}
                        aria-label={`Coletar ${plano.planKey}`}
                        onChange={() =>
                          onChange(planos.map((item) => (item.id === plano.id ? { ...item, carregar: !item.carregar } : item)))
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="cfg-btn"
                        onClick={() => {
                          setIsNew(false);
                          setRowError("");
                          setArmRemove(false);
                          setEdit({ ...plano });
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>
      {edit ? (
        <Drawer
          title={isNew ? "Novo plano" : `Plano ${edit.planKey || ""}`}
          subtitle="A chave separa os dados da fase. O identificador numérico localiza o plano no Azure."
          onClose={() => setEdit(null)}
        >
          <form
            className="cfg-form"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <TextField label="PlanKey" value={edit.planKey} help="Nome curto da fase, como EndToEnd. Não repita entre planos." onChange={(planKey) => setEdit({ ...edit, planKey })} />
            <TextField label="Nome do plano" value={edit.planName} help="Rótulo exibido nos relatórios. Pode ser o nome completo do Azure." onChange={(planName) => setEdit({ ...edit, planName })} />
            <TextField label="Identificador" value={edit.planId} inputMode="numeric" help="PlanId numérico do Test Plan. Obrigatório quando a coleta está ativa." onChange={(planId) => setEdit({ ...edit, planId })} />
            <TextField label="Filtro de suíte" value={edit.suiteNameFilter} help="Se preenchido, a leitura de falhas considera suítes cujo nome contém este texto." onChange={(suiteNameFilter) => setEdit({ ...edit, suiteNameFilter })} />
            <TextField label="Máximo de suítes" value={edit.maxSuites} inputMode="numeric" help="0 não limita a quantidade de suítes lidas." onChange={(maxSuites) => setEdit({ ...edit, maxSuites })} />
            <Toggle label="Incluir na coleta" checked={edit.carregar} help="Plano desmarcado permanece cadastrado, mas não entra na sincronização quando a integração estiver ativa." onChange={(carregar) => setEdit({ ...edit, carregar })} />
            {rowError ? <p className="cfg-note cfg-note-error">{rowError}</p> : null}
            <div className="cfg-actions">
              <button type="submit" className="cfg-btn cfg-btn-primary">Aplicar</button>
              {isNew ? null : (
                <button
                  type="button"
                  className="cfg-btn cfg-btn-danger"
                  onClick={() => {
                    if (!armRemove) {
                      setArmRemove(true);
                      return;
                    }
                    onChange(planos.filter((plano) => plano.id !== edit.id));
                    setEdit(null);
                  }}
                >
                  {armRemove ? "Confirmar remoção" : "Remover"}
                </button>
              )}
            </div>
          </form>
        </Drawer>
      ) : null}
    </div>
  );
}

export function HierarquiaPanel({
  niveis,
  query,
  issues,
  onChange,
}: {
  niveis: NivelHierarquia[];
  query: string;
  issues: ConfigIssue[];
  onChange: (niveis: NivelHierarquia[]) => void;
}) {
  const [edit, setEdit] = useState<NivelHierarquia | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [rowError, setRowError] = useState("");
  const [armRemove, setArmRemove] = useState(false);
  const titulo = "Hierarquia das suítes";
  const subtitulo = "Traduz os níveis da árvore do Azure nos agrupamentos dos relatórios.";
  const ordered = [...niveis].sort((a, b) => a.ordem - b.ordem);
  const visible = broad(query, titulo, subtitulo)
    ? ordered
    : ordered.filter((nivel) => includesQuery(query, [nivel.coluna, nivel.nivelOrigem, nivel.planKey, nivel.fonte]));

  function apply() {
    if (!edit) return;
    if (!edit.coluna.trim()) {
      setRowError("Informe o nome da coluna.");
      return;
    }
    if (edit.fonte === "hierarchy_level" && !edit.nivelOrigem.trim()) {
      setRowError("Informe o nível de origem ou escolha a suíte atual.");
      return;
    }
    const next = { ...edit, coluna: edit.coluna.trim() };
    onChange(isNew ? [...niveis, next] : niveis.map((nivel) => (nivel.id === next.id ? next : nivel)));
    setEdit(null);
  }

  return (
    <div className="cfg-stack">
      <IssueList issues={issues} />
      <Block
        title={titulo}
        subtitle="Um nível ativo vira coluna de agrupamento, como Frente ou Onda. ULTIMO usa a suíte em que o cenário está. Nível inativo não entra no relatório."
        actions={
          <button
            type="button"
            className="cfg-btn cfg-btn-primary"
            onClick={() => {
              setIsNew(true);
              setRowError("");
              setArmRemove(false);
              setEdit({
                id: nid("nivel"),
                ordem: niveis.length + 1,
                coluna: "",
                nivelOrigem: "",
                fonte: "hierarchy_level",
                planKey: "",
                ativo: true,
              });
            }}
          >
            Novo nível
          </button>
        }
      >
        {query.trim() ? <p className="cfg-note">Limpe a busca para reordenar os níveis.</p> : null}
        {visible.length === 0 ? (
          <EmptyState title="Nenhum nível encontrado" text="Cadastre a profundidade da árvore que deve aparecer como Frente, Onda ou Processo." />
        ) : (
          <div className="cfg-table-wrap">
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Coluna</th>
                  <th>Origem</th>
                  <th>Ativo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((nivel) => (
                  <tr key={nivel.id}>
                    <td>{nivel.ordem}</td>
                    <td>
                      <strong>{nivel.coluna || "Sem nome"}</strong>
                      {nivel.planKey ? <span className="cfg-help">Só no plano {nivel.planKey}</span> : <span className="cfg-help">Todos os planos sem regra própria</span>}
                    </td>
                    <td>{nivel.fonte === "current_suite" ? "Suíte atual" : nivel.nivelOrigem || "Não informado"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={nivel.ativo}
                        aria-label={`${nivel.coluna} ativo`}
                        onChange={() => onChange(niveis.map((item) => (item.id === nivel.id ? { ...item, ativo: !item.ativo } : item)))}
                      />
                    </td>
                    <td className="cfg-row-actions">
                      {query.trim() ? null : (
                        <>
                          <button type="button" className="cfg-btn" onClick={() => onChange(moveById(niveis, nivel.id, -1))}>Subir</button>
                          <button type="button" className="cfg-btn" onClick={() => onChange(moveById(niveis, nivel.id, 1))}>Descer</button>
                        </>
                      )}
                      <button
                        type="button"
                        className="cfg-btn"
                        onClick={() => {
                          setIsNew(false);
                          setRowError("");
                          setArmRemove(false);
                          setEdit({ ...nivel });
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>
      {edit ? (
        <Drawer
          title={isNew ? "Novo nível" : edit.coluna || "Nível"}
          subtitle="A coluna é o nome que o relatório mostra. A origem diz de qual profundidade da árvore esse nome sai."
          onClose={() => setEdit(null)}
        >
          <form
            className="cfg-form"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <TextField label="Nome da coluna" value={edit.coluna} help="Exemplos: Frente, Onda, Processo." onChange={(coluna) => setEdit({ ...edit, coluna })} />
            <SelectField
              label="Fonte"
              value={edit.fonte}
              help="Nível da árvore usa a profundidade. Suíte atual usa a suíte folha do cenário, o equivalente a ULTIMO na planilha."
              options={[
                { value: "hierarchy_level", label: "Nível da árvore" },
                { value: "current_suite", label: "Suíte atual" },
              ]}
              onChange={(value) => setEdit({ ...edit, fonte: value === "current_suite" ? "current_suite" : "hierarchy_level" })}
            />
            <TextField
              label="Nível de origem"
              value={edit.nivelOrigem}
              placeholder="1, 2, 3 ou ULTIMO"
              help="Profundidade na árvore do Azure. ULTIMO acompanha a suíte atual e pode ficar com a fonte Suíte atual."
              onChange={(nivelOrigem) => setEdit({ ...edit, nivelOrigem })}
            />
            <TextField label="PlanKey" value={edit.planKey} help="Vazio aplica a todos os planos que não tiverem hierarquia própria." onChange={(planKey) => setEdit({ ...edit, planKey })} />
            <Toggle label="Nível ativo" checked={edit.ativo} onChange={(ativo) => setEdit({ ...edit, ativo })} />
            {rowError ? <p className="cfg-note cfg-note-error">{rowError}</p> : null}
            <div className="cfg-actions">
              <button type="submit" className="cfg-btn cfg-btn-primary">Aplicar</button>
              {isNew ? null : (
                <button
                  type="button"
                  className="cfg-btn cfg-btn-danger"
                  onClick={() => {
                    if (!armRemove) {
                      setArmRemove(true);
                      return;
                    }
                    onChange(niveis.filter((nivel) => nivel.id !== edit.id));
                    setEdit(null);
                  }}
                >
                  {armRemove ? "Confirmar remoção" : "Remover"}
                </button>
              )}
            </div>
          </form>
        </Drawer>
      ) : null}
    </div>
  );
}

export function CategoriasPanel({
  categorias,
  query,
  issues,
  onChange,
}: {
  categorias: CategoriaResponsabilidade[];
  query: string;
  issues: ConfigIssue[];
  onChange: (categorias: CategoriaResponsabilidade[]) => void;
}) {
  const [edit, setEdit] = useState<CategoriaResponsabilidade | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [rowError, setRowError] = useState("");
  const [armRemove, setArmRemove] = useState(false);
  const titulo = "Categorias e responsabilidades";
  const subtitulo = "Relaciona o tipo da falha à área que responde por ela.";
  const visible = broad(query, titulo, subtitulo)
    ? categorias
    : categorias.filter((item) => includesQuery(query, [item.categoria, item.responsabilidade]));

  function apply() {
    if (!edit) return;
    if (!edit.categoria.trim() || !edit.responsabilidade.trim()) {
      setRowError("Informe a categoria e a responsabilidade.");
      return;
    }
    const next = { ...edit, categoria: edit.categoria.trim(), responsabilidade: edit.responsabilidade.trim() };
    onChange(isNew ? [...categorias, next] : categorias.map((item) => (item.id === next.id ? next : item)));
    setEdit(null);
  }

  return (
    <div className="cfg-stack">
      <IssueList issues={issues} />
      <Block
        title={titulo}
        subtitle="A categoria vem do defeito. A responsabilidade alimenta os indicadores de desenvolvimento, cliente e QA."
        actions={
          <button
            type="button"
            className="cfg-btn cfg-btn-primary"
            onClick={() => {
              setIsNew(true);
              setRowError("");
              setArmRemove(false);
              setEdit({ id: nid("cat"), categoria: "", responsabilidade: "" });
            }}
          >
            Nova categoria
          </button>
        }
      >
        {visible.length === 0 ? (
          <EmptyState title="Nenhuma categoria encontrada" text="Cadastre o vínculo para o FourQA saber qual área responde por cada tipo de falha." />
        ) : (
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
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>{item.categoria}</td>
                    <td>{item.responsabilidade}</td>
                    <td>
                      <button
                        type="button"
                        className="cfg-btn"
                        onClick={() => {
                          setIsNew(false);
                          setRowError("");
                          setArmRemove(false);
                          setEdit({ ...item });
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>
      {edit ? (
        <Drawer
          title={isNew ? "Nova categoria" : edit.categoria}
          subtitle="Use o mesmo texto da categoria no Azure. A responsabilidade é a área que o FourQA mostra nos indicadores."
          onClose={() => setEdit(null)}
        >
          <form
            className="cfg-form"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <TextField label="Categoria" value={edit.categoria} onChange={(categoria) => setEdit({ ...edit, categoria })} />
            <TextField label="Responsabilidade" value={edit.responsabilidade} onChange={(responsabilidade) => setEdit({ ...edit, responsabilidade })} />
            {rowError ? <p className="cfg-note cfg-note-error">{rowError}</p> : null}
            <div className="cfg-actions">
              <button type="submit" className="cfg-btn cfg-btn-primary">Aplicar</button>
              {isNew ? null : (
                <button
                  type="button"
                  className="cfg-btn cfg-btn-danger"
                  onClick={() => {
                    if (!armRemove) {
                      setArmRemove(true);
                      return;
                    }
                    onChange(categorias.filter((item) => item.id !== edit.id));
                    setEdit(null);
                  }}
                >
                  {armRemove ? "Confirmar remoção" : "Remover"}
                </button>
              )}
            </div>
          </form>
        </Drawer>
      ) : null}
    </div>
  );
}

export function CamposPanel({
  titulo,
  subtitulo,
  detalhe,
  campos,
  query,
  issues,
  onChange,
}: {
  titulo: string;
  subtitulo: string;
  detalhe: string;
  campos: CampoConfiguracao[];
  query: string;
  issues: ConfigIssue[];
  onChange: (campos: CampoConfiguracao[]) => void;
}) {
  const [filtro, setFiltro] = useState<"todos" | "ativos" | "inativos">("todos");
  const [edit, setEdit] = useState<CampoConfiguracao | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [rowError, setRowError] = useState("");
  const [armRemove, setArmRemove] = useState(false);
  const ordered = [...campos].sort((a, b) => a.ordem - b.ordem);
  const filtered = ordered.filter((campo) => {
    if (filtro === "ativos" && !campo.ativo) return false;
    if (filtro === "inativos" && campo.ativo) return false;
    if (broad(query, titulo, subtitulo)) return true;
    return includesQuery(query, [campo.campo, campo.ajuda, campo.padrao, campo.valor]);
  });
  const split = !query.trim() && filtro === "todos" && filtered.length > 16;
  const principais = split ? filtered.filter((campo) => campo.principal) : filtered;
  const demais = split ? filtered.filter((campo) => !campo.principal) : [];

  function apply() {
    if (!edit) return;
    const nome = edit.campo.trim();
    if (!nome) {
      setRowError("Informe o nome do campo.");
      return;
    }
    if (campos.some((campo) => campo.id !== edit.id && campo.campo.trim() === nome)) {
      setRowError("Já existe um campo com este nome.");
      return;
    }
    const next = { ...edit, campo: nome };
    const list = isNew ? [...campos, { ...next, ordem: campos.length + 1 }] : campos.map((campo) => (campo.id === next.id ? next : campo));
    onChange(list.map((campo, index) => ({ ...campo, ordem: index + 1 })));
    setEdit(null);
  }

  function table(rows: CampoConfiguracao[]) {
    return (
      <div className="cfg-table-wrap">
        <table className="cfg-table">
          <thead>
            <tr>
              <th>Ordem</th>
              <th>Campo</th>
              <th>Ativo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((campo) => (
              <tr key={campo.id}>
                <td>{campo.ordem}</td>
                <td>
                  <strong>{campo.campo}</strong>
                  <span className="cfg-help">{campo.ajuda}</span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={campo.ativo}
                    aria-label={`${campo.campo} ativo`}
                    onChange={() => onChange(campos.map((item) => (item.id === campo.id ? { ...item, ativo: !item.ativo } : item)))}
                  />
                </td>
                <td className="cfg-row-actions">
                  {query.trim() || filtro !== "todos" ? null : (
                    <>
                      <button type="button" className="cfg-btn" onClick={() => onChange(moveById(campos, campo.id, -1))}>Subir</button>
                      <button type="button" className="cfg-btn" onClick={() => onChange(moveById(campos, campo.id, 1))}>Descer</button>
                    </>
                  )}
                  <button
                    type="button"
                    className="cfg-btn"
                    onClick={() => {
                      setIsNew(false);
                      setRowError("");
                      setArmRemove(false);
                      setEdit({ ...campo });
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="cfg-stack">
      <IssueList issues={issues} />
      <Block
        title={titulo}
        subtitle={detalhe}
        actions={
          <button
            type="button"
            className="cfg-btn cfg-btn-primary"
            onClick={() => {
              setIsNew(true);
              setRowError("");
              setArmRemove(false);
              setEdit({
                id: nid("campo"),
                ordem: campos.length + 1,
                campo: "",
                ativo: true,
                principal: false,
                padrao: "",
                valor: "",
                ajuda: "",
              });
            }}
          >
            Novo campo
          </button>
        }
      >
        <div className="cfg-filters" role="group" aria-label="Filtrar campos">
          {(["todos", "ativos", "inativos"] as const).map((item) => (
            <button key={item} type="button" className={filtro === item ? "cfg-chip active" : "cfg-chip"} onClick={() => setFiltro(item)}>
              {item === "todos" ? "Todos" : item === "ativos" ? "Ativos" : "Inativos"}
            </button>
          ))}
        </div>
        {query.trim() || filtro !== "todos" ? <p className="cfg-note">Limpe a busca e o filtro para reordenar.</p> : null}
        {principais.length === 0 ? (
          <EmptyState title="Nenhum campo encontrado" text="Ajuste a busca ou ative os campos que devem aparecer nos relatórios." />
        ) : (
          table(principais)
        )}
        {demais.length > 0 ? (
          <details className="cfg-more">
            <summary>Demais campos ({demais.length})</summary>
            <p>Parâmetros menos usados na leitura diária. Continuam disponíveis para exportação.</p>
            {table(demais)}
          </details>
        ) : null}
      </Block>
      {edit ? (
        <Drawer
          title={isNew ? "Novo campo" : edit.campo || "Campo"}
          subtitle="O nome é a coluna. Padrão e valor registram o comportamento herdado da planilha, sem entrar na coleta agora."
          onClose={() => setEdit(null)}
        >
          <form
            className="cfg-form"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <TextField label="Campo" value={edit.campo} onChange={(campo) => setEdit({ ...edit, campo })} />
            <TextField label="Para que serve" value={edit.ajuda} help="Texto curto para quem for configurar este campo depois." onChange={(ajuda) => setEdit({ ...edit, ajuda })} />
            <SelectField
              label="Padrão"
              value={edit.padrao}
              help="Comportamento da planilha: atualizar valor, nome da tabela, limpar antes, limpar histórico ou criar cabeçalho."
              options={PADROES.map((item) => ({ value: item, label: item || "Nenhum" }))}
              onChange={(value) => setEdit({ ...edit, padrao: value as CampoPadrao })}
            />
            <TextField label="Valor" value={edit.valor} help="Parâmetro do padrão, como o nome da tabela de destino ou SIM." onChange={(valor) => setEdit({ ...edit, valor })} />
            <Toggle label="Campo ativo" checked={edit.ativo} help="Campo inativo deixa de ser oferecido nos relatórios quando a integração estiver ativa." onChange={(ativo) => setEdit({ ...edit, ativo })} />
            {rowError ? <p className="cfg-note cfg-note-error">{rowError}</p> : null}
            <div className="cfg-actions">
              <button type="submit" className="cfg-btn cfg-btn-primary">Aplicar</button>
              {isNew ? null : (
                <button
                  type="button"
                  className="cfg-btn cfg-btn-danger"
                  onClick={() => {
                    if (!armRemove) {
                      setArmRemove(true);
                      return;
                    }
                    onChange(campos.filter((campo) => campo.id !== edit.id).map((campo, index) => ({ ...campo, ordem: index + 1 })));
                    setEdit(null);
                  }}
                >
                  {armRemove ? "Confirmar remoção" : "Remover"}
                </button>
              )}
            </div>
          </form>
        </Drawer>
      ) : null}
    </div>
  );
}

export function ExportacaoPanel({
  exportacao,
  planKeys,
  query,
  issues,
  onChange,
}: {
  exportacao: ExportacaoConfiguracao;
  planKeys: string[];
  query: string;
  issues: ConfigIssue[];
  onChange: (exportacao: ExportacaoConfiguracao) => void;
}) {
  const [frente, setFrente] = useState("");
  const showAll = broad(query, "Parâmetros de exportação", "Define nomes de destino, cabeçalho e o plano usado nos indicadores.");
  const destino = showAll || includesQuery(query, ["destino", "tabela", exportacao.tabelaExecucoes, exportacao.tabelaFalhas]);
  const lote = showAll || includesQuery(query, ["limpar", "cabeçalho", "cabeçalho", "lote"]);
  const indicadores = showAll || includesQuery(query, ["indicador", "kpi", "frente", exportacao.kpiPlanKey, ...exportacao.frentesValidas]);

  function addFrente() {
    const next = frente.trim();
    if (!next) return;
    if (exportacao.frentesValidas.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setFrente("");
      return;
    }
    onChange({ ...exportacao, frentesValidas: [...exportacao.frentesValidas, next] });
    setFrente("");
  }

  return (
    <div className="cfg-stack">
      <IssueList issues={issues} />
      {destino ? (
        <Block
          title="Destino"
          subtitle="Nomes usados pelo FourQA para guardar execuções e falhas. Na planilha, as tabelas de controle tinham outros nomes."
        >
          <div className="cfg-form">
            <TextField
              label="Tabela de execuções"
              value={exportacao.tabelaExecucoes}
              help="No FourQA o destino é execucoes. Na planilha, o controle era tbControle_ExecucoesScript."
              onChange={(tabelaExecucoes) => onChange({ ...exportacao, tabelaExecucoes })}
            />
            <TextField
              label="Tabela de falhas"
              value={exportacao.tabelaFalhas}
              help="No FourQA o destino é falhas. Na planilha, o controle era tbControle_FalhasScript."
              onChange={(tabelaFalhas) => onChange({ ...exportacao, tabelaFalhas })}
            />
          </div>
        </Block>
      ) : null}
      {lote ? (
        <Block
          title="Lote e cabeçalho"
          subtitle="A coleta substitui o lote anterior e recria o cabeçalho. Outro valor interrompe a sincronização, por isso os dois permanecem SIM."
        >
          <div className="cfg-form">
            <TextField label="Limpar antes" value="SIM" disabled help="O FourQA sempre substitui os registros anteriores do mesmo lote." onChange={() => undefined} />
            <TextField label="Criar cabeçalho" value="SIM" disabled help="O cabeçalho das colunas é recriado a cada coleta." onChange={() => undefined} />
          </div>
        </Block>
      ) : null}
      {indicadores ? (
        <Block
          title="Indicadores e frentes"
          subtitle="O PlanKey escolhe qual plano alimenta os indicadores da visão geral. As frentes válidas reconhecem sistemas nas tags dos defeitos."
        >
          <div className="cfg-form">
            <SelectField
              label="PlanKey dos indicadores"
              value={exportacao.kpiPlanKey}
              help="Se o plano não estiver na lista, cadastre-o em Planos de testes."
              options={[
                { value: "", label: "Selecione" },
                ...planKeys.map((key) => ({ value: key, label: key })),
                exportacao.kpiPlanKey && !planKeys.includes(exportacao.kpiPlanKey)
                  ? { value: exportacao.kpiPlanKey, label: exportacao.kpiPlanKey }
                  : null,
              ].filter((item): item is { value: string; label: string } => item !== null)}
              onChange={(kpiPlanKey) => onChange({ ...exportacao, kpiPlanKey })}
            />
            <div className="cfg-field">
              <div className="cfg-label-row">
                <label htmlFor="cfg-frente">Nova frente</label>
              </div>
              <div className="cfg-inline">
                <input
                  id="cfg-frente"
                  value={frente}
                  spellCheck={false}
                  placeholder="Ex.: GEDEV"
                  onChange={(event) => setFrente(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addFrente();
                    }
                  }}
                />
                <button type="button" className="cfg-btn" onClick={addFrente}>
                  Adicionar
                </button>
              </div>
              <p className="cfg-note">A ordem das frentes é a ordem de exibição. Remova uma frente que não deva ser reconhecida.</p>
            </div>
          </div>
          {exportacao.frentesValidas.length === 0 ? (
            <EmptyState title="Nenhuma frente válida" text="Sem esta lista, os defeitos podem não ser agrupados por sistema." />
          ) : (
            <ul className="cfg-chips">
              {exportacao.frentesValidas.map((item) => (
                <li key={item}>
                  <span>{item}</span>
                  <button
                    type="button"
                    aria-label={`Remover ${item}`}
                    onClick={() =>
                      onChange({ ...exportacao, frentesValidas: exportacao.frentesValidas.filter((frenteItem) => frenteItem !== item) })
                    }
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Block>
      ) : null}
    </div>
  );
}

type SyncView = {
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  step: string;
  progress: { done: number; total: number } | null;
  summary: { execucoes: number; falhas: number; suites: number; runs: number; duracaoMs: number } | null;
  error: string | null;
};

function readSync(data: unknown): SyncView | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.status !== "string") return null;
  const summary = row.summary && typeof row.summary === "object" ? (row.summary as Record<string, unknown>) : null;
  const progress = row.progress && typeof row.progress === "object" ? (row.progress as Record<string, unknown>) : null;
  return {
    status: row.status,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null,
    finishedAt: typeof row.finishedAt === "string" ? row.finishedAt : null,
    step: typeof row.step === "string" ? row.step : "",
    progress:
      progress && typeof progress.done === "number" && typeof progress.total === "number"
        ? { done: progress.done, total: progress.total }
        : null,
    summary:
      summary && typeof summary.execucoes === "number"
        ? {
            execucoes: Number(summary.execucoes),
            falhas: Number(summary.falhas),
            suites: Number(summary.suites),
            runs: Number(summary.runs),
            duracaoMs: Number(summary.duracaoMs),
          }
        : null,
    error: typeof row.error === "string" ? row.error : null,
  };
}

function formatWhen(value: string | null): string {
  if (!value) return "Sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "Sem duração";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}

const SYNC_LABEL: Record<string, string> = {
  idle: "Aguardando",
  running: "Em andamento",
  success: "Concluída",
  error: "Interrompida",
};

export function DiagnosticoPanel({ issues }: { issues: ConfigIssue[] }) {
  const [reload, setReload] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable" | "unexpected">("loading");
  const [sync, setSync] = useState<SyncView | null>(null);
  const locais = issues.filter((issue) => issue.severity === "erro" || issue.severity === "pendente");

  useEffect(() => {
    const controller = new AbortController();
    setPhase("loading");
    fetch("/api/sync/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        const parsed = readSync(data);
        if (!parsed) {
          setPhase("unexpected");
          setSync(null);
          return;
        }
        setSync(parsed);
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPhase("unavailable");
        setSync(null);
      });
    return () => controller.abort();
  }, [reload]);

  return (
    <div className="cfg-stack">
      <Block
        title="Última coleta"
        subtitle="Estado da sincronização que o servidor já conhece. Atualizar só consulta; não dispara uma coleta nova."
        actions={
          <button type="button" className="cfg-btn" onClick={() => setReload((value) => value + 1)}>
            Atualizar
          </button>
        }
      >
        {phase === "loading" ? <p className="cfg-note">Consultando o estado da coleta.</p> : null}
        {phase === "unavailable" ? (
          <EmptyState
            title="Coleta indisponível"
            text="Não foi possível ler o estado no servidor. A central local continua editável."
          />
        ) : null}
        {phase === "unexpected" ? (
          <EmptyState title="Resposta inesperada" text="O servidor respondeu, mas o estado da coleta não veio no formato conhecido." />
        ) : null}
        {phase === "ready" && sync ? (
          <>
            <div className="cfg-metrics">
              <article>
                <span>Situação</span>
                <strong>{SYNC_LABEL[sync.status] ?? sync.status}</strong>
              </article>
              <article>
                <span>Término</span>
                <strong>{formatWhen(sync.finishedAt)}</strong>
              </article>
              <article>
                <span>Execuções</span>
                <strong>{sync.summary ? sync.summary.execucoes : "Sem resumo"}</strong>
              </article>
              <article>
                <span>Falhas</span>
                <strong>{sync.summary ? sync.summary.falhas : "Sem resumo"}</strong>
              </article>
              <article>
                <span>Suítes</span>
                <strong>{sync.summary ? sync.summary.suites : "Sem resumo"}</strong>
              </article>
              <article>
                <span>Duração</span>
                <strong>{sync.summary ? formatDuration(sync.summary.duracaoMs) : "Sem resumo"}</strong>
              </article>
            </div>
            {sync.step ? <p className="cfg-note">Etapa: {sync.step}</p> : null}
            {sync.progress ? (
              <p className="cfg-note">
                Progresso: {sync.progress.done} de {sync.progress.total}
              </p>
            ) : null}
            {sync.error ? <p className="cfg-note cfg-note-error">{sync.error}</p> : null}
            <p className="cfg-note">Início: {formatWhen(sync.startedAt)}</p>
          </>
        ) : null}
      </Block>
      <Block
        title="Consistência desta central"
        subtitle="Pendências e erros do que está em edição neste navegador, antes de salvar."
      >
        {locais.length === 0 ? (
          <EmptyState title="Central consistente" text="Não há pendência local. A coleta do servidor ainda não usa estes valores." />
        ) : (
          <IssueList issues={locais} />
        )}
      </Block>
      <Block
        title="Integração com o servidor"
        subtitle="Itens que esta central já organiza, mas que ainda não substituem o arquivo de ambiente nem o banco."
      >
        <ul className="cfg-pending-list">
          {INTEGRACAO_PENDENTE.map((item) => (
            <li key={item.id}>{item.texto}</li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
