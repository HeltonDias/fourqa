"""Azure DevOps REST client (mirrors client.ts)."""

from __future__ import annotations

import asyncio
import base64
import json
from typing import Any
from urllib.parse import quote, urlencode, urlparse

import httpx

MAX_RETRIES = 5
RETRYABLE = {429, 502, 503, 504}


class AzureHttpError(Exception):
    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.name = "AzureHttpError"
        self.status = status


class AzureClient:
    def __init__(self, cfg: dict[str, str]) -> None:
        self._cfg = cfg
        token = cfg["pat"]
        self._authorization = "Basic " + base64.b64encode(f":{token}".encode()).decode()
        org = quote(cfg["organization"])
        project = quote(cfg["project"])
        self.base_url = f"https://dev.azure.com/{org}/{project}"

    def work_item_link(self, item_id: int) -> str:
        return f"{self.base_url}/_workitems/edit/{item_id}"

    def url(self, api_path: str, query: dict[str, Any] | None = None) -> str:
        parts = dict(query or {})
        parts["api-version"] = self._cfg.get("apiVersion") or self._cfg.get("api_version") or "7.1"
        qs = urlencode({k: str(v) for k, v in parts.items()})
        return f"{self.base_url}{api_path}?{qs}"

    async def get(self, url: str) -> Any:
        return await self._request("GET", url)

    async def post(self, url: str, body: Any) -> Any:
        return await self._request("POST", url, body)

    async def _request(self, method: str, url: str, body: Any | None = None) -> Any:
        where = urlparse(url).path
        for attempt in range(MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
                    res = await client.request(
                        method,
                        url,
                        headers={
                            "Authorization": self._authorization,
                            "Accept": "application/json",
                            **({"Content-Type": "application/json"} if body is not None else {}),
                        },
                        content=json.dumps(body) if body is not None else None,
                    )
            except httpx.HTTPError:
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(min(30, 2**attempt))
                    continue
                raise AzureHttpError(f"Falha de rede ao acessar o Azure DevOps ({where}).", 0) from None
            if res.status_code in (203, 401, 403) or 300 <= res.status_code < 400:
                raise AzureHttpError(
                    "O Azure DevOps recusou a autenticação. Verifique se o PAT está correto, não expirou e tem permissão de leitura em Test Management e Work Items.",
                    401 if res.status_code == 203 else res.status_code,
                )
            if res.status_code in RETRYABLE and attempt < MAX_RETRIES:
                retry_after = int(res.headers.get("retry-after", "0") or 0)
                wait = retry_after * 1000 if retry_after > 0 else 1000 * 2**attempt
                await asyncio.sleep(min(60, wait / 1000))
                continue
            if res.status_code >= 400:
                snippet = res.text.replace("\n", " ")[:200]
                raise AzureHttpError(f"Azure DevOps respondeu HTTP {res.status_code} em {where}. {snippet}".strip(), res.status_code)
            return res.json()
