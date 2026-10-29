"""Loop do Uvicorn no Windows. O ProactorEventLoop não serve para o psycopg assíncrono."""

from __future__ import annotations

import asyncio
import selectors


def selector_loop() -> asyncio.AbstractEventLoop:
    return asyncio.SelectorEventLoop(selectors.SelectSelector())
