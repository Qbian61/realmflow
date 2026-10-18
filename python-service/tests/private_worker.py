from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_SERVICE_ROOT = REPO_ROOT / "python-service"
PRIVATE_WORKER_ROOT = (
    REPO_ROOT / "dsh-plugins" / "realmflow-runtime" / "python"
)

for path in (PYTHON_SERVICE_ROOT, PRIVATE_WORKER_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

import realmflow_private_worker  # noqa: E402
from realmflow_private_worker import dispatch  # noqa: E402


def run_worker(
    operation: str,
    input_value: dict[str, Any],
) -> dict[str, Any]:
    return asyncio.run(dispatch(operation, input_value))

