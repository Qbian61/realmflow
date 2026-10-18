from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from app.services.local_embeddings import (
    EMBEDDING_DIMENSIONS,
    MODEL_NAME,
    MODEL_REVISION,
    NORMALIZATION,
    RUNTIME,
    LocalEmbeddingError,
    LocalEmbeddingService,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-root", required=True)
    args = parser.parse_args()
    service = LocalEmbeddingService(Path(args.asset_root))

    for line in sys.stdin:
        if not line.strip():
            continue
        response = handle_line(service, line)
        sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
        sys.stdout.flush()
    return 0


def handle_line(
    service: LocalEmbeddingService,
    line: str,
) -> dict[str, Any]:
    try:
        request = json.loads(line)
        request_id = request["id"]
        method = request["method"]
        params = request.get("params", {})
        if method == "health":
            return ok(request_id, service.model_health())
        if method == "embed":
            texts = require_string_list(params.get("texts"))
            return ok(
                request_id,
                {
                    "embeddingModel": MODEL_NAME,
                    "embeddingRevision": MODEL_REVISION,
                    "dimensions": EMBEDDING_DIMENSIONS,
                    "embeddings": service.embed_documents(texts),
                },
            )
        if method == "chunk":
            documents = require_documents(params.get("documents"))
            return ok(request_id, service.chunk_documents(documents))
        raise LocalEmbeddingError(
            "embedding_method_unknown",
            "Local embedding worker method is unknown",
        )
    except LocalEmbeddingError as error:
        return failed(
            safe_request_id(locals().get("request")),
            error.code,
            str(error),
        )
    except Exception:
        return failed(
            safe_request_id(locals().get("request")),
            "embedding_worker_error",
            "Local embedding worker failed",
        )


def require_string_list(value: object) -> list[str]:
    if (
        not isinstance(value, list)
        or not value
        or any(not isinstance(item, str) for item in value)
    ):
        raise LocalEmbeddingError(
            "embedding_input_invalid",
            "Embedding input is invalid",
        )
    return value


def require_documents(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list) or not value:
        raise LocalEmbeddingError(
            "embedding_input_invalid",
            "Embedding input is invalid",
        )
    documents: list[dict[str, str]] = []
    for item in value:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("documentKey"), str)
            or not isinstance(item.get("content"), str)
        ):
            raise LocalEmbeddingError(
                "embedding_input_invalid",
                "Embedding input is invalid",
            )
        documents.append(
            {
                "documentKey": item["documentKey"],
                "content": item["content"],
            }
        )
    return documents


def ok(request_id: object, result: object) -> dict[str, Any]:
    return {"id": request_id, "ok": True, "result": result}


def failed(request_id: object, code: str, message: str) -> dict[str, Any]:
    return {
        "id": request_id,
        "ok": False,
        "error": {
            "code": code,
            "message": safe_error_message(message),
        },
    }


def safe_request_id(request: object) -> object:
    if isinstance(request, dict) and isinstance(request.get("id"), int):
        return request["id"]
    return 0


def safe_error_message(message: str) -> str:
    if message in {
        "Local embedding model assets are missing",
        "Local embedding model assets are invalid",
        "Embedding input is invalid",
        "Embedding request limit exceeded",
        "Local embedding model is unavailable",
        "Local embedding model output is invalid",
        "Knowledge document is invalid",
        "Knowledge document path is sensitive",
    }:
        return message
    return "Local embedding worker failed"


if __name__ == "__main__":
    raise SystemExit(main())
