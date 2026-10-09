from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PYTHON_SERVICE = ROOT / "python-service"
MODEL_ROOT = PYTHON_SERVICE / "model-assets" / "gte-multilingual-base"
sys.path.insert(0, str(PYTHON_SERVICE))

from app.services.local_embeddings import (  # noqa: E402
    EMBEDDING_DIMENSIONS,
    MODEL_NAME,
    MODEL_REVISION,
    LocalEmbeddingService,
    read_model_asset_manifest,
)

_service: LocalEmbeddingService | None = None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    if args.probe:
        print(json.dumps(probe_runtime(), sort_keys=True))
        return 0

    for line in sys.stdin:
        if not line.strip():
            continue
        request_id: Any = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            result = handle_request(request)
            response = {"id": request_id, "ok": True, "result": result}
        except Exception as error:
            response = {
                "id": request_id,
                "ok": False,
                "error": {
                    "code": error.__class__.__name__,
                    "message": str(error),
                },
            }
        print(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
        sys.stdout.flush()
    return 0


def probe_runtime() -> dict[str, object]:
    import onnxruntime

    manifest = read_model_asset_manifest(MODEL_ROOT)
    int8_path = MODEL_ROOT / "model.int8.onnx"
    return {
        "status": "ready",
        "pythonVersion": platform.python_version(),
        "onnxRuntimeVersion": onnxruntime.__version__,
        "model": manifest.model,
        "revision": manifest.revision,
        "dimensions": manifest.dimensions,
        "precision": "float32",
        "int8AssetAvailable": int8_path.is_file(),
    }


def handle_request(request: object) -> dict[str, object]:
    if not isinstance(request, dict):
        raise ValueError("Worker request must be an object")
    operation = request.get("op")
    started_wall = time.perf_counter()
    started_cpu = time.process_time()

    if operation == "health":
        result = service().model_health()
    elif operation == "embed":
        texts = request.get("texts")
        if not isinstance(texts, list):
            raise ValueError("Embedding texts are required")
        vectors = service().embed_documents(texts)
        result = {
            "model": MODEL_NAME,
            "revision": MODEL_REVISION,
            "dimensions": EMBEDDING_DIMENSIONS,
            "vectors": vectors,
        }
    elif operation == "chunk":
        result = chunk(request)
    else:
        raise ValueError("Worker operation is invalid")

    result["timing"] = {
        "wallMs": round((time.perf_counter() - started_wall) * 1000, 3),
        "cpuMs": round((time.process_time() - started_cpu) * 1000, 3),
    }
    if operation == "chunk" and request.get("strategy") == "fixed":
        result.pop("timing")
    return result


def chunk(request: dict[str, object]) -> dict[str, object]:
    documents = request.get("documents")
    if not isinstance(documents, list) or not documents:
        raise ValueError("Chunk documents are required")
    strategy = request.get("strategy")
    if strategy == "structured":
        result = service().chunk_documents(documents)
        return {
            "strategy": "structured",
            "chunkerVersion": result["chunkerVersion"],
            "documents": result["documents"],
        }
    if strategy != "fixed":
        raise ValueError("Chunk strategy is invalid")

    fixed_characters = request.get("fixedCharacters", 1200)
    overlap_characters = request.get("overlapCharacters", 200)
    if (
        not isinstance(fixed_characters, int)
        or not isinstance(overlap_characters, int)
        or fixed_characters < 1
        or overlap_characters < 0
        or overlap_characters >= fixed_characters
    ):
        raise ValueError("Fixed chunk configuration is invalid")
    return {
        "strategy": "fixed-characters",
        "documents": [
            {
                "documentKey": document["documentKey"],
                "chunks": fixed_chunks(
                    document["content"],
                    fixed_characters,
                    overlap_characters,
                ),
            }
            for document in documents
            if isinstance(document, dict)
            and isinstance(document.get("documentKey"), str)
            and isinstance(document.get("content"), str)
        ],
    }


def fixed_chunks(
    content: str,
    size: int,
    overlap: int,
) -> list[dict[str, object]]:
    chunks: list[dict[str, object]] = []
    start = 0
    while start < len(content):
        end = min(len(content), start + size)
        chunks.append(
            {
                "ordinal": len(chunks),
                "content": content[start:end],
                "startOffset": start,
                "endOffset": end,
            }
        )
        if end == len(content):
            break
        start = end - overlap
    return chunks


def service() -> LocalEmbeddingService:
    global _service
    if _service is None:
        _service = LocalEmbeddingService(MODEL_ROOT)
    return _service


if __name__ == "__main__":
    raise SystemExit(main())
