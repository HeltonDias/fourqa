"""Local dev entry: python -m fourqa"""

from __future__ import annotations

import os
import sys

import uvicorn


def main() -> None:
    port = int(os.environ.get("PORT", "3001"))
    kwargs: dict[str, object] = {
        "factory": True,
        "host": "0.0.0.0",
        "port": port,
        "reload": os.environ.get("FOURQA_DEV_RELOAD") == "1",
    }
    if sys.platform == "win32":
        kwargs["loop"] = "fourqa.win_loop:selector_loop"
    uvicorn.run("fourqa.app:create_app", **kwargs)  # type: ignore[arg-type]


if __name__ == "__main__":
    main()
