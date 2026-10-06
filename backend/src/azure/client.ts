import type { AzureConfig } from "./config.js";

export class AzureHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AzureHttpError";
  }
}

const MAX_RETRIES = 5;
const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Cliente mínimo da REST API do Azure DevOps (Basic auth com PAT). Não registra o PAT em lugar nenhum. */
export class AzureClient {
  private readonly authorization: string;
  readonly baseUrl: string;

  constructor(private readonly cfg: AzureConfig) {
    this.authorization = `Basic ${Buffer.from(`:${cfg.pat}`).toString("base64")}`;
    this.baseUrl = `https://dev.azure.com/${encodeURIComponent(cfg.organization)}/${encodeURIComponent(cfg.project)}`;
  }

  workItemLink(id: number): string {
    return `${this.baseUrl}/_workitems/edit/${id}`;
  }

  /** Monta a URL anexando api-version. Chaves como `$top` ficam sem encode, como nos scripts. */
  url(apiPath: string, query: Record<string, string | number | boolean> = {}): string {
    const parts = Object.entries({ ...query, "api-version": this.cfg.apiVersion }).map(
      ([k, v]) => `${k}=${encodeURIComponent(String(v))}`,
    );
    return `${this.baseUrl}${apiPath}?${parts.join("&")}`;
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>("GET", url);
  }

  post<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>("POST", url, body);
  }

  private async request<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
    const where = new URL(url).pathname;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: {
            Authorization: this.authorization,
            Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        if (attempt < MAX_RETRIES) {
          await sleep(Math.min(30_000, 1000 * 2 ** attempt));
          continue;
        }
        throw new AzureHttpError(`Falha de rede ao acessar o Azure DevOps (${where}).`, 0);
      }

      // Com PAT inválido/expirado o Azure responde 203 ou redireciona para a tela de login.
      if (res.status === 203 || (res.status >= 300 && res.status < 400) || res.status === 401 || res.status === 403) {
        throw new AzureHttpError(
          "O Azure DevOps recusou a autenticação. Verifique se o PAT está correto, não expirou e tem permissão de leitura em Test Management e Work Items.",
          res.status === 203 ? 401 : res.status,
        );
      }

      if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        await sleep(Math.min(60_000, wait));
        continue;
      }

      if (!res.ok) {
        const snippet = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
        throw new AzureHttpError(`Azure DevOps respondeu HTTP ${res.status} em ${where}. ${snippet}`.trim(), res.status);
      }

      return (await res.json()) as T;
    }
  }
}
