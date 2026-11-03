import { useEffect, useState } from "react";
import { api, type AuthState, type AuthUser } from "../api";
import { writeActiveConnection } from "./connectionStore";

export type SessionUser = AuthUser;

let cached: AuthState | null = null;
let pending: Promise<AuthState> | null = null;
const listeners = new Set<(state: AuthState) => void>();

function publish(state: AuthState): AuthState {
  cached = state;
  listeners.forEach((fn) => fn(state));
  return state;
}

export function cachedSession(): AuthState | null {
  return cached;
}

export function loadSession(force = false): Promise<AuthState> {
  if (cached && !force) return Promise.resolve(cached);
  if (!pending) {
    pending = api
      .me()
      .then(publish)
      .catch(() => {
        // Falha de rede/API não vira estado permanente: a próxima tela consulta de novo.
        const offline: AuthState = { authenticated: false, user: null, loginEnabled: false };
        listeners.forEach((fn) => fn(offline));
        cached = null;
        return offline;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function useSession(): { state: AuthState | null; refresh: () => Promise<AuthState> } {
  const [state, setState] = useState<AuthState | null>(cached);
  useEffect(() => {
    listeners.add(setState);
    if (!cached) void loadSession();
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return { state, refresh: () => loadSession(true) };
}

export async function signIn(pat: string, organization: string): Promise<AuthUser> {
  const { user } = await api.login(pat, organization);
  writeActiveConnection(null);
  publish({ authenticated: true, user, loginEnabled: true });
  return user;
}

export async function signOut(): Promise<void> {
  try {
    await api.logout();
  } finally {
    writeActiveConnection(null);
    publish({ authenticated: false, user: null, loginEnabled: cached?.loginEnabled ?? true });
  }
}
