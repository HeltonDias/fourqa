# Motor QA

Plataforma web para centralização, planejamento, acompanhamento e auditoria de processos de QA, integrada a ferramentas.

Ambiente web que espelha a planilha **Status Report QA Fase 3** (abas Home PORT., Planejamento, Status por frente, Controle de Execuções e Controle de falhas), com a mesma lógica de agregação (`COUNTIFS` / `SUMIF`) aplicada no backend sobre dados importados da planilha.

Documentação do domínio: [fonte/ENTENDIMENTO_ECOSISTEMA_PLANILHA.md](fonte/ENTENDIMENTO_ECOSISTEMA_PLANILHA.md).

## Pré-requisitos

- Node.js 22+ (usa `node:sqlite`)
- Python 3 + `openpyxl` (`pip install openpyxl`)

## Primeira execução

```bash
cd motor_Qa
npm install
npm run import:planilha
npm run dev
```

- API: http://localhost:3001  
- UI: http://localhost:5173 (proxy `/api` → backend)

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run import:planilha` | Lê o xlsx em `fonte/` e grava `data/motor_qa.db` |
| `npm run dev` | Backend + frontend em paralelo |
| `npm run build` | Build produção (API serve `frontend/dist`) |
| `npm start` | Só API (após build) |

Variáveis opcionais:

- `MOTOR_QA_XLSX` — caminho da planilha
- `MOTOR_QA_DB` — caminho do SQLite
- `PORT` — porta da API (padrão 3001)

## Estrutura

```
backend/     API Express + motor de fórmulas (TypeScript)
frontend/    React + Vite (5 abas)
tools/       import_planilha.py
data/        motor_qa.db (gerado, gitignored)
fonte/       planilha e scripts Office originais
```

## Próximos passos (fora deste MVP)

- Sincronização Azure (substituir import xlsx)
- Calendário diário do Planejamento (colunas W+)
- KPI C14:E14 idêntico ao Office Script (bugs por Run/Result)
- Autenticação e config sem PAT na planilha
