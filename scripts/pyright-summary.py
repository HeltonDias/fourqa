#!/usr/bin/env python3
"""Resumo do Pyright do backend por arquivo ou por padrão de mensagem."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "files"
    target = sys.argv[2] if len(sys.argv) > 2 else ""
    proc = subprocess.run(
        [sys.executable, "-m", "pyright", "-p", "backend", "--outputjson"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    data = json.loads(proc.stdout[proc.stdout.find("{") :])
    errors = [d for d in data["generalDiagnostics"] if d.get("severity") == "error"]
    if mode == "files":
        for name, count in Counter(Path(d["file"]).name for d in errors).most_common():
            print(f"{count:4} {name}")
    elif mode == "patterns":
        patterns = Counter(
            (d.get("rule"), re.sub(r'"[^"]*"', "X", d["message"].splitlines()[0])) for d in errors
        )
        for (rule, message), count in patterns.most_common(40):
            print(f"{count:4} {rule} {message[:150]}")
    else:
        for d in errors:
            if target and Path(d["file"]).name != target:
                continue
            line = d["range"]["start"]["line"] + 1
            message = " | ".join(part.strip() for part in d["message"].splitlines()[:2])
            print(f"{Path(d['file']).name}:{line} {d.get('rule')} {message[:220]}")
    print("TOTAL", len(errors))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
