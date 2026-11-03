export type Role = "head" | "lider" | "qa" | "visitante";

export type ActiveConnection = {
  id: number;
  organization: string;
  project: string;
  testPlanId: number;
  testPlanName: string | null;
  planKey: string;
  title: string;
  legacy: boolean;
  role: Role | null;
  roleLabel: string | null;
};

// Por aba: duas abas podem abrir projetos diferentes sem trocar o escopo uma da outra.
const CONNECTION_KEY = "fourqa_connection";

export function readActiveConnection(): ActiveConnection | null {
  try {
    const raw = sessionStorage.getItem(CONNECTION_KEY);
    return raw ? (JSON.parse(raw) as ActiveConnection) : null;
  } catch {
    return null;
  }
}

export function writeActiveConnection(connection: ActiveConnection | null): void {
  if (connection) sessionStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
  else sessionStorage.removeItem(CONNECTION_KEY);
}

export function connectionHeaders(): Record<string, string> {
  const active = readActiveConnection();
  return active ? { "X-FourQA-Connection": String(active.id) } : {};
}

const RANK: Record<Role, number> = { visitante: 0, qa: 1, lider: 2, head: 3 };

export function roleAtLeast(role: Role | null | undefined, minimum: Role): boolean {
  return role != null && RANK[role] >= RANK[minimum];
}
