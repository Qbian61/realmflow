import importlib.util
import json
import sys
import tracemalloc
from collections.abc import Callable
from types import ModuleType
from typing import Any


MEMORY_EXIT_CODE = 72
OUTPUT_EXIT_CODE = 73
PROTOCOL_EXIT_CODE = 74
EXECUTION_EXIT_CODE = 75


def load_entry(path: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location("realmflow_skill_entry", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("entry cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if len(sys.argv) < 4:
        return PROTOCOL_EXIT_CODE
    entry_path = sys.argv[1]
    try:
        max_memory_mb = int(sys.argv[2])
        max_output_bytes = int(sys.argv[3])
        entry_arguments = sys.argv[4:]
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            return PROTOCOL_EXIT_CODE
        sys.argv = [entry_path, *entry_arguments]
        module = load_entry(entry_path)
        entry = getattr(module, "main", None)
        if not isinstance(entry, Callable):
            return PROTOCOL_EXIT_CODE
        tracemalloc.start()
        output: Any = entry(payload)
        _, peak_memory_bytes = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        if peak_memory_bytes > max_memory_mb * 1024 * 1024:
            return MEMORY_EXIT_CODE
        if not isinstance(output, dict):
            return PROTOCOL_EXIT_CODE
        encoded = json.dumps(
            output,
            ensure_ascii=True,
            separators=(",", ":"),
        ).encode("utf-8")
        if len(encoded) > max_output_bytes:
            return OUTPUT_EXIT_CODE
        envelope = json.dumps(
            {
                "output": output,
                "peakMemoryBytes": peak_memory_bytes,
            },
            ensure_ascii=True,
            separators=(",", ":"),
        ).encode("utf-8")
        sys.stdout.buffer.write(envelope)
        sys.stdout.buffer.flush()
        return 0
    except MemoryError:
        return MEMORY_EXIT_CODE
    except Exception:
        return EXECUTION_EXIT_CODE


if __name__ == "__main__":
    raise SystemExit(main())
