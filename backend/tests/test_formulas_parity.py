import json
import subprocess
import sys
from pathlib import Path


def test_formulas_parity_script():
    root = Path(__file__).resolve().parents[2]
    script = root / "scripts" / "check-formulas-parity.py"
    proc = subprocess.run(
        [sys.executable, str(script)],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
