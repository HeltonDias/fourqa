/** Integração com API, PostgreSQL e Azure fica para depois do Marco 5. */
export const INTEGRACAO_PENDENTE = [
  {
    id: "azure-runtime",
    texto:
      "Organização, projeto e PAT continuam no arquivo de ambiente. A central não envia nem grava a credencial.",
  },
  {
    id: "planos-sync",
    texto: "Os planos salvos aqui ainda não entram na sincronização.",
  },
  {
    id: "hierarquia",
    texto: "A hierarquia desta aba ainda não substitui a hierarquia lida pelo servidor.",
  },
  {
    id: "responsabilidades",
    texto: "Categorias e responsabilidades ainda não classificam as falhas na coleta.",
  },
  {
    id: "campos",
    texto:
      "A escolha de campos organiza a central. O conjunto gravado no banco permanece o atual até a integração.",
  },
  {
    id: "diagnostico-colunas",
    texto:
      "O diagnóstico lê o estado da coleta já existente. Contagem de colunas não mapeadas da planilha ainda não vem do servidor.",
  },
] as const;
