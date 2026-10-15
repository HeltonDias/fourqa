export type WriteAuthDecision = "allow" | "unauthorized" | "unconfigured";

/** Token do servidor vazio só libera escrita com opt-in explícito. O header não é registrado. */
export function decideWriteAuth(input: {
  configuredToken: string;
  allowOpenWrites: boolean;
  authorizationHeader: string | undefined;
}): WriteAuthDecision {
  const token = input.configuredToken.trim();
  if (!token) return input.allowOpenWrites ? "allow" : "unconfigured";
  if ((input.authorizationHeader ?? "") === `Bearer ${token}`) return "allow";
  return "unauthorized";
}
