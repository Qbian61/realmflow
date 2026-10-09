from __future__ import annotations

import hashlib
import hmac
import json
import math
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from threading import Lock
from typing import Any, Protocol, Sequence

MODEL_NAME = "Alibaba-NLP/gte-multilingual-base"
MODEL_REVISION = "9bbca17d9273fd0d03d5725c7a4b0f6b45142062"
EMBEDDING_DIMENSIONS = 768
NORMALIZATION = "L2"
RUNTIME = "onnxruntime-cpu"
MAX_QUERY_CHARACTERS = 2_000
MAX_MODEL_TOKENS = 512
MAX_BATCH_TOKENS = 8_192
MAX_DOCUMENTS = 128
MAX_PAYLOAD_BYTES = 1024 * 1024

_MANIFEST_KEYS = {
    "schemaVersion",
    "model",
    "revision",
    "dimensions",
    "runtime",
    "files",
}
_FILE_KEYS = {"path", "size", "sha256"}
_REQUIRED_FILES = {
    "model.onnx",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "config.json",
    "pooling.json",
    "configuration.py",
    "modeling.py",
    "LICENSE",
}


class LocalEmbeddingError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ModelAsset:
    path: str
    size: int
    sha256: str


@dataclass(frozen=True)
class ModelAssetManifest:
    schema_version: int
    model: str
    revision: str
    dimensions: int
    runtime: str
    files: tuple[ModelAsset, ...]


class EmbeddingBackend(Protocol):
    def count_tokens(self, text: str) -> int: ...

    def token_offsets(self, text: str) -> list[tuple[int, int]]: ...

    def infer(
        self,
        texts: list[str],
        max_tokens: int,
    ) -> tuple[Sequence[Sequence[Sequence[float]]], Sequence[Sequence[int]]]:
        ...


def verify_model_assets(root: Path) -> ModelAssetManifest:
    manifest = read_model_asset_manifest(root)
    for asset in manifest.files:
        path = root / asset.path
        try:
            content = path.read_bytes()
        except FileNotFoundError as error:
            raise LocalEmbeddingError(
                "model_assets_missing",
                "Local embedding model assets are missing",
            ) from error
        except OSError as error:
            raise _invalid_assets() from error
        if len(content) != asset.size or not hmac.compare_digest(
            hashlib.sha256(content).hexdigest(),
            asset.sha256,
        ):
            raise _invalid_assets()
    return manifest


def read_model_asset_manifest(root: Path) -> ModelAssetManifest:
    manifest_path = root / "manifest.json"
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise LocalEmbeddingError(
            "model_assets_missing",
            "Local embedding model assets are missing",
        ) from error
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise _invalid_assets() from error

    if (
        not isinstance(raw, dict)
        or set(raw) != _MANIFEST_KEYS
        or raw.get("schemaVersion") != 1
        or raw.get("model") != MODEL_NAME
        or raw.get("revision") != MODEL_REVISION
        or raw.get("dimensions") != EMBEDDING_DIMENSIONS
        or raw.get("runtime") != RUNTIME
        or not isinstance(raw.get("files"), list)
    ):
        raise _invalid_assets()

    assets: list[ModelAsset] = []
    seen: set[str] = set()
    for entry in raw["files"]:
        if not isinstance(entry, dict) or set(entry) != _FILE_KEYS:
            raise _invalid_assets()
        relative_path = entry.get("path")
        size = entry.get("size")
        digest = entry.get("sha256")
        if (
            not isinstance(relative_path, str)
            or not _is_safe_relative_path(relative_path)
            or relative_path in seen
            or not isinstance(size, int)
            or isinstance(size, bool)
            or size < 0
            or not isinstance(digest, str)
            or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
        ):
            raise _invalid_assets()
        seen.add(relative_path)
        assets.append(
            ModelAsset(path=relative_path, size=size, sha256=digest)
        )

    if not _REQUIRED_FILES.issubset(seen):
        raise _invalid_assets()
    return ModelAssetManifest(
        schema_version=1,
        model=MODEL_NAME,
        revision=MODEL_REVISION,
        dimensions=EMBEDDING_DIMENSIONS,
        runtime=RUNTIME,
        files=tuple(assets),
    )


def cls_pool_and_normalize(
    hidden_states: Sequence[Sequence[Sequence[float]]],
    attention_masks: Sequence[Sequence[int]],
) -> list[list[float]]:
    if len(hidden_states) != len(attention_masks):
        raise _invalid_output()
    vectors: list[list[float]] = []
    for tokens, mask in zip(hidden_states, attention_masks, strict=True):
        if (
            len(tokens) == 0
            or len(mask) == 0
            or len(tokens) != len(mask)
            or mask[0] != 1
            or len(tokens[0]) != EMBEDDING_DIMENSIONS
        ):
            raise _invalid_output()
        vector = [float(value) for value in tokens[0]]
        if any(not math.isfinite(value) for value in vector):
            raise _invalid_output()
        magnitude = math.sqrt(sum(value * value for value in vector))
        if not math.isfinite(magnitude) or magnitude <= 0:
            raise _invalid_output()
        vectors.append([float(value / magnitude) for value in vector])
    return vectors


class LocalEmbeddingService:
    def __init__(
        self,
        asset_root: Path,
        *,
        backend: EmbeddingBackend | None = None,
    ) -> None:
        self.asset_root = asset_root
        self.manifest: ModelAssetManifest | None = None
        self._backend = backend
        self._backend_lock = Lock()

    def model_health(self) -> dict[str, object]:
        self._get_backend()
        return {
            "status": "ready",
            "model": MODEL_NAME,
            "revision": MODEL_REVISION,
            "dimensions": EMBEDDING_DIMENSIONS,
            "normalize": NORMALIZATION,
            "runtime": RUNTIME,
        }

    def embed_query(self, text: str) -> list[float]:
        if (
            not isinstance(text, str)
            or not text.strip()
            or "\0" in text
            or len(text) > MAX_QUERY_CHARACTERS
            or len(text.encode("utf-8")) > MAX_PAYLOAD_BYTES
        ):
            raise LocalEmbeddingError(
                "embedding_input_invalid",
                "Embedding input is invalid",
            )
        return self._embed([text])[0]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts or len(texts) > MAX_DOCUMENTS:
            raise LocalEmbeddingError(
                "embedding_limit_exceeded",
                "Embedding request limit exceeded",
            )
        total_bytes = 0
        for text in texts:
            if not isinstance(text, str) or not text.strip() or "\0" in text:
                raise LocalEmbeddingError(
                    "embedding_input_invalid",
                    "Embedding input is invalid",
                )
            total_bytes += len(text.encode("utf-8"))
        if total_bytes > MAX_PAYLOAD_BYTES:
            raise LocalEmbeddingError(
                "embedding_limit_exceeded",
                "Embedding request limit exceeded",
            )
        return self._embed(texts)

    def chunk_documents(
        self,
        documents: list[dict[str, str]],
    ) -> dict[str, object]:
        from app.services.knowledge_chunking import chunk_documents

        return chunk_documents(documents, self._get_backend())

    def _embed(self, texts: list[str]) -> list[list[float]]:
        backend = self._get_backend()
        token_counts = [backend.count_tokens(text) for text in texts]
        if (
            any(
                count < 1 or count > MAX_MODEL_TOKENS
                for count in token_counts
            )
            or sum(token_counts) > MAX_BATCH_TOKENS
        ):
            raise LocalEmbeddingError(
                "embedding_limit_exceeded",
                "Embedding request limit exceeded",
            )
        try:
            hidden_states, attention_masks = backend.infer(
                texts,
                MAX_MODEL_TOKENS,
            )
        except LocalEmbeddingError:
            raise
        except Exception as error:
            raise LocalEmbeddingError(
                "embedding_model_unavailable",
                "Local embedding model is unavailable",
            ) from error
        return cls_pool_and_normalize(hidden_states, attention_masks)

    def _get_backend(self) -> EmbeddingBackend:
        if self._backend is not None:
            return self._backend
        with self._backend_lock:
            if self._backend is None:
                try:
                    self.manifest = verify_model_assets(self.asset_root)
                    self._backend = OnnxEmbeddingBackend(self.asset_root)
                except Exception as error:
                    raise LocalEmbeddingError(
                        "embedding_model_unavailable",
                        "Local embedding model is unavailable",
                    ) from error
        return self._backend


class OnnxEmbeddingBackend:
    def __init__(self, asset_root: Path) -> None:
        import numpy
        import onnxruntime
        from tokenizers import Tokenizer

        self._numpy = numpy
        self._tokenizer = Tokenizer.from_file(
            str(asset_root / "tokenizer.json")
        )
        self._tokenizer.enable_padding()
        self._session = onnxruntime.InferenceSession(
            str(asset_root / "model.onnx"),
            providers=["CPUExecutionProvider"],
        )
        self._input_names = {
            item.name for item in self._session.get_inputs()
        }

    def count_tokens(self, text: str) -> int:
        return len(self._tokenizer.encode(text).ids)

    def token_offsets(self, text: str) -> list[tuple[int, int]]:
        return [
            (start, end)
            for start, end in self._tokenizer.encode(text).offsets
            if end > start
        ]

    def infer(
        self,
        texts: list[str],
        max_tokens: int,
    ) -> tuple[Any, Any]:
        encodings = self._tokenizer.encode_batch(texts)
        if any(len(encoding.ids) > max_tokens for encoding in encodings):
            raise LocalEmbeddingError(
                "embedding_limit_exceeded",
                "Embedding request limit exceeded",
            )
        input_ids = self._numpy.asarray(
            [encoding.ids for encoding in encodings],
            dtype=self._numpy.int64,
        )
        attention_mask = self._numpy.asarray(
            [encoding.attention_mask for encoding in encodings],
            dtype=self._numpy.int64,
        )
        inputs: dict[str, Any] = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
        }
        if "token_type_ids" in self._input_names:
            inputs["token_type_ids"] = self._numpy.asarray(
                [encoding.type_ids for encoding in encodings],
                dtype=self._numpy.int64,
            )
        outputs = self._session.run(None, inputs)
        if not outputs:
            raise _invalid_output()
        return outputs[0], attention_mask


def _is_safe_relative_path(value: str) -> bool:
    path = PurePosixPath(value)
    return (
        bool(value)
        and not path.is_absolute()
        and "\\" not in value
        and all(part not in {"", ".", ".."} for part in path.parts)
    )


def _invalid_assets() -> LocalEmbeddingError:
    return LocalEmbeddingError(
        "model_assets_invalid",
        "Local embedding model assets are invalid",
    )


def _invalid_output() -> LocalEmbeddingError:
    return LocalEmbeddingError(
        "embedding_output_invalid",
        "Local embedding model output is invalid",
    )
