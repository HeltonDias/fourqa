"""Azure util (mirrors azure/util.ts)."""

from __future__ import annotations

import asyncio
import re
import unicodedata
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")
R = TypeVar("R")


def normalize(value: object) -> str:
    text = str(value or "")
    text = unicodedata.normalize("NFD", text)
    text = re.sub(r"[\u0300-\u036f]", "", text)
    return text.strip().lower()


def empty_to_null(value: str) -> str | None:
    return None if value == "" else value


async def map_in_batches(
    items: list[T],
    limit: int,
    worker: Callable[[T], Awaitable[R]],
    on_batch_done: Callable[[int, int], None] | None = None,
) -> list[R]:
    out: list[R] = []
    for start in range(0, len(items), limit):
        batch = items[start : start + limit]
        out.extend(await asyncio.gather(*(worker(item) for item in batch)))
        if on_batch_done:
            on_batch_done(min(start + limit, len(items)), len(items))
    return out
