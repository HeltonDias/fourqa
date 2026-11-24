const nodeBase = process.env.PARITY_NODE ?? "http://127.0.0.1:3011";
const javaBase = process.env.PARITY_JAVA ?? "http://127.0.0.1:8081";

const calls = [
  ["GET", "/api/health"],
  ["GET", "/api/meta"],
  ["GET", "/api/home?planKey=PlanoA"],
  ["GET", "/api/home?planKey=PlanoB"],
  ["GET", "/api/status-frente?planKey=PlanoA"],
  ["GET", "/api/execucoes?planKey=PlanoA&q=SuiteA&limit=2&offset=0"],
  ["GET", "/api/execucoes?planKey=PlanoB"],
  ["GET", "/api/execucoes?planKey=PlanoA&q=" + encodeURIComponent("' OR 1=1 --")],
  ["GET", "/api/falhas?planKey=PlanoA"],
  ["GET", "/api/falhas?planKey=PlanoB"],
  ["GET", "/api/planejamento?planKey=PlanoA"],
  ["GET", "/api/planejamento/alteracoes?planKey=PlanoA"],
  ["GET", "/api/sync/status"],
];

const writes = [
  ["POST", "/api/planejamento/revisao?planKey=PlanoA", { reason: "paridade", adoptSource: true }],
  ["PUT", "/api/planejamento/celula?planKey=PlanoA", { suiteId: 1, field: "start", date: "2026-10-03" }],
  ["PUT", "/api/planejamento/lote?planKey=PlanoA", { changes: [{ suiteId: 1, field: "end", date: "2026-10-21" }] }],
  ["GET", "/api/planejamento?planKey=PlanoA"],
  ["GET", "/api/planejamento/alteracoes?planKey=PlanoA"],
  ["PUT", "/api/planejamento/lote?planKey=PlanoA", { changes: [] }],
  ["PUT", "/api/planejamento/celula?planKey=PlanoA", { suiteId: 1, field: "start", date: "2026-10-04", baseDate: "2026-01-01" }],
  ["PUT", "/api/cabecalho", { title: "Paridade", subtitle: "Marco 4", baseTitle: "STATUS REPORT QA", baseSubtitle: "FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3" }],
  ["PUT", "/api/periodo", { inicio: "2026-10-01", fim: "2026-10-30", baseInicio: "2026-10-01", baseFim: "2026-10-31" }],
];

const VOLATILE = new Set(["atualizadoEm", "createdAt"]);

function sort(value, key) {
  if (VOLATILE.has(key)) return null;
  if (Array.isArray(value)) return value.map((item) => sort(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((name) => [name, sort(value[name], name)]));
  }
  return value;
}

async function call(base, method, path, body) {
  const headers = { authorization: "Bearer parity-local" };
  if (body) headers["content-type"] = "application/json";
  const response = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, json };
}

const diffs = [];
async function compare(method, path, body) {
  const left = await call(nodeBase, method, path, body);
  const right = await call(javaBase, method, path, body);
  const a = JSON.stringify(sort(left.json));
  const b = JSON.stringify(sort(right.json));
  if (left.status !== right.status || a !== b) {
    diffs.push({ method, path, node: left.status, java: right.status, nodeBody: left.json, javaBody: right.json });
  }
}

for (const [method, path] of calls) await compare(method, path);
for (const [method, path, body] of writes) await compare(method, path, body);

console.log(JSON.stringify({ compared: calls.length + writes.length, diffs: diffs.length, items: diffs }, null, 2));
if (diffs.length) process.exit(1);
