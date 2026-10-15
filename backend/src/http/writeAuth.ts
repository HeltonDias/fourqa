import { timingSafeEqual } from "node:crypto";

export type WriteAuthDecision = "allow" | "unauthorized" | "unconfigured";

/** Na Vercel o opt-in de escrita aberta não existe. */
export function openWritesAllowed(input: { vercel: boolean; allowOpenWritesFlag: string }): boolean {
  if (input.vercel) return false;
  return input.allowOpenWritesFlag === "1";
}

function bearerMatches(token: string, authorizationHeader: string | undefined): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(authorizationHeader ?? "");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/** Token do servidor vazio só libera escrita com opt-in explícito. O header não é registrado. */
export function decideWriteAuth(input: {
  configuredToken: string;
  allowOpenWrites: boolean;
  authorizationHeader: string | undefined;
}): WriteAuthDecision {
  const token = input.configuredToken.trim();
  if (!token) return input.allowOpenWrites ? "allow" : "unconfigured";
  if (bearerMatches(token, input.authorizationHeader)) return "allow";
  return "unauthorized";
}

/** Leitura protegida não aceita escrita aberta. Health fica de fora, no roteador. */
export function decideReadAuth(input: {
  protectReads: boolean;
  configuredToken: string;
  authorizationHeader: string | undefined;
}): WriteAuthDecision {
  if (!input.protectReads) return "allow";
  return decideWriteAuth({
    configuredToken: input.configuredToken,
    allowOpenWrites: false,
    authorizationHeader: input.authorizationHeader,
  });
}
