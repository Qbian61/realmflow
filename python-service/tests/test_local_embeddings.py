import hashlib
import importlib
import importlib.util
import json
import math
import os
from pathlib import Path
from typing import Any

import numpy
import pytest
from fastapi.testclient import TestClient

from app import create_app
from app.api import routes


def local_embeddings():
    spec = importlib.util.find_spec("app.services.local_embeddings")
    assert spec is not None, "local embedding service is not implemented"
    return importlib.import_module("app.services.local_embeddings")


def write_asset_manifest(root: Path) -> None:
    files = {
        "model.onnx": b"offline-onnx-model",
        "tokenizer.json": b'{"version":"1.0"}',
        "tokenizer_config.json": b'{"model_max_length":512}',
        "special_tokens_map.json": b'{"cls_token":"<s>"}',
        "config.json": b'{"hidden_size":768}',
        "pooling.json": b'{"pooling_mode_cls_token":true}',
        "configuration.py": b"class NewConfig: pass\n",
        "modeling.py": b"class NewModel: pass\n",
        "LICENSE": b"Apache License 2.0\n",
    }
    entries = []
    for relative_path, content in files.items():
        path = root / relative_path
        path.write_bytes(content)
        entries.append(
            {
                "path": relative_path,
                "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )
    (root / "manifest.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "model": "Alibaba-NLP/gte-multilingual-base",
                "revision": "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
                "dimensions": 768,
                "runtime": "onnxruntime-cpu",
                "files": entries,
            }
        ),
        encoding="utf-8",
    )


class FakeBackend:
    def __init__(self, token_counts: dict[str, int] | None = None) -> None:
        self.token_counts = token_counts or {}
        self.calls: list[list[str]] = []

    def count_tokens(self, text: str) -> int:
        return self.token_counts.get(text, 2)

    def infer(self, texts: list[str], max_tokens: int) -> tuple[Any, Any]:
        self.calls.append(texts)
        assert max_tokens == 512
        hidden_states = []
        attention_masks = []
        for index, _text in enumerate(texts, start=1):
            first = [float(index)] * 768
            second = [float(index * 3)] * 768
            hidden_states.append([first, second])
            attention_masks.append([1, 1])
        return hidden_states, attention_masks


class FakeEmbeddingService:
    def model_health(self) -> dict[str, object]:
        return {
            "status": "ready",
            "model": "Alibaba-NLP/gte-multilingual-base",
            "revision": "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
            "dimensions": 768,
            "normalize": "L2",
            "runtime": "onnxruntime-cpu",
        }

    def embed_query(self, text: str) -> list[float]:
        assert text == "checkout retry"
        return [1.0] + [0.0] * 767

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        assert texts == ["alpha", "beta"]
        return [[1.0] + [0.0] * 767, [0.0, 1.0] + [0.0] * 766]


@pytest.fixture
def embedding_client() -> TestClient:
    app = create_app(auth_token="session-secret")
    app.dependency_overrides[routes.get_local_embedding_service] = (
        FakeEmbeddingService
    )
    return TestClient(
        app,
        headers={"Authorization": "Bearer session-secret"},
    )


def test_model_asset_manifest_validates_identity_size_and_sha256(
    tmp_path: Path,
) -> None:
    module = local_embeddings()
    write_asset_manifest(tmp_path)

    manifest = module.verify_model_assets(tmp_path)

    assert manifest.model == "Alibaba-NLP/gte-multilingual-base"
    assert manifest.revision == (
        "9bbca17d9273fd0d03d5725c7a4b0f6b45142062"
    )
    assert manifest.dimensions == 768
    assert {entry.path for entry in manifest.files} == {
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


def test_model_asset_manifest_rejects_tampered_assets(tmp_path: Path) -> None:
    module = local_embeddings()
    write_asset_manifest(tmp_path)
    (tmp_path / "model.onnx").write_bytes(b"tampered")

    with pytest.raises(module.LocalEmbeddingError) as error:
        module.verify_model_assets(tmp_path)

    assert error.value.code == "model_assets_invalid"
    assert str(error.value) == "Local embedding model assets are invalid"


def test_bundled_manifest_pins_all_required_offline_assets() -> None:
    module = local_embeddings()
    asset_root = (
        Path(__file__).parents[1]
        / "model-assets"
        / "gte-multilingual-base"
    )

    manifest = module.read_model_asset_manifest(asset_root)

    assert manifest.model == "Alibaba-NLP/gte-multilingual-base"
    assert manifest.revision == (
        "9bbca17d9273fd0d03d5725c7a4b0f6b45142062"
    )
    assert manifest.dimensions == 768
    assert {entry.path for entry in manifest.files} >= {
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
    assert all(entry.size > 0 for entry in manifest.files)
    assert all(len(entry.sha256) == 64 for entry in manifest.files)


def test_cls_pooling_returns_finite_768_dimension_l2_vectors() -> None:
    module = local_embeddings()
    cls_token = [1.0, 3.0] + [0.0] * 766
    ignored_token = [math.nan] * 768
    padding = [math.nan] * 768

    vectors = module.cls_pool_and_normalize(
        [[cls_token, ignored_token, padding]],
        [[1, 1, 0]],
    )

    assert len(vectors) == 1
    assert len(vectors[0]) == 768
    assert all(math.isfinite(value) for value in vectors[0])
    assert math.sqrt(sum(value * value for value in vectors[0])) == pytest.approx(
        1.0
    )
    assert vectors[0][0] == pytest.approx(1 / math.sqrt(10))
    assert vectors[0][1] == pytest.approx(3 / math.sqrt(10))


def test_cls_pooling_accepts_onnx_numpy_outputs() -> None:
    module = local_embeddings()
    hidden_states = numpy.ones((1, 2, 768), dtype=numpy.float32)
    attention_masks = numpy.ones((1, 2), dtype=numpy.int64)

    vectors = module.cls_pool_and_normalize(
        hidden_states,
        attention_masks,
    )

    assert len(vectors[0]) == 768
    assert sum(value * value for value in vectors[0]) == pytest.approx(1.0)


def test_embedding_is_deterministic_for_fixed_query_and_document_fixtures(
    tmp_path: Path,
) -> None:
    module = local_embeddings()
    write_asset_manifest(tmp_path)
    backend = FakeBackend()
    service = module.LocalEmbeddingService(tmp_path, backend=backend)

    first = service.embed_query("checkout retry")
    second = service.embed_query("checkout retry")
    documents = service.embed_documents(["支付重试", "release notes"])

    assert first == second
    assert first[:2] == pytest.approx([1 / math.sqrt(768)] * 2)
    assert documents[0] == first
    assert documents[1][:2] == pytest.approx([1 / math.sqrt(768)] * 2)
    assert backend.calls == [
        ["checkout retry"],
        ["checkout retry"],
        ["支付重试", "release notes"],
    ]


def test_embedding_batch_is_bounded_by_total_tokens(tmp_path: Path) -> None:
    module = local_embeddings()
    write_asset_manifest(tmp_path)
    documents = [f"document-{index}" for index in range(17)]
    backend = FakeBackend({document: 512 for document in documents})
    service = module.LocalEmbeddingService(tmp_path, backend=backend)

    with pytest.raises(module.LocalEmbeddingError) as error:
        service.embed_documents(documents)

    assert error.value.code == "embedding_limit_exceeded"
    assert backend.calls == []


def test_document_embedding_rejects_more_than_512_tokens(
    tmp_path: Path,
) -> None:
    module = local_embeddings()
    write_asset_manifest(tmp_path)
    backend = FakeBackend({"oversized": 513})
    service = module.LocalEmbeddingService(tmp_path, backend=backend)

    with pytest.raises(module.LocalEmbeddingError) as error:
        service.embed_documents(["oversized"])

    assert error.value.code == "embedding_limit_exceeded"
    assert backend.calls == []


@pytest.mark.parametrize(
    "cls_vector",
    [
        [1.0] * 767,
        [math.nan] + [0.0] * 767,
        [math.inf] + [0.0] * 767,
    ],
)
def test_embedding_rejects_wrong_dimension_and_non_finite_output(
    tmp_path: Path,
    cls_vector: list[float],
) -> None:
    module = local_embeddings()
    write_asset_manifest(tmp_path)

    class InvalidBackend(FakeBackend):
        def infer(
            self, texts: list[str], max_tokens: int
        ) -> tuple[Any, Any]:
            return [[cls_vector]], [[1]]

    service = module.LocalEmbeddingService(
        tmp_path,
        backend=InvalidBackend(),
    )

    with pytest.raises(module.LocalEmbeddingError) as error:
        service.embed_query("query")

    assert error.value.code == "embedding_output_invalid"


def test_query_rejects_blank_null_and_oversized_text(tmp_path: Path) -> None:
    module = local_embeddings()
    write_asset_manifest(tmp_path)
    service = module.LocalEmbeddingService(tmp_path, backend=FakeBackend())

    for query in ("", "   ", "bad\0query", "x" * 2_001):
        with pytest.raises(module.LocalEmbeddingError) as error:
            service.embed_query(query)
        assert error.value.code == "embedding_input_invalid"


def test_offline_loader_does_not_use_network(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = local_embeddings()
    write_asset_manifest(tmp_path)

    def reject_network(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("network access is forbidden")

    monkeypatch.setattr("socket.socket.connect", reject_network)
    backend = FakeBackend()

    service = module.LocalEmbeddingService(tmp_path, backend=backend)

    assert service.model_health() == {
        "status": "ready",
        "model": "Alibaba-NLP/gte-multilingual-base",
        "revision": "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
        "dimensions": 768,
        "normalize": "L2",
        "runtime": "onnxruntime-cpu",
    }


@pytest.mark.skipif(
    os.environ.get("REALMFLOW_RUN_GTE_INTEGRATION") != "1",
    reason="requires bundled GTE model assets",
)
def test_real_gte_fixture_is_deterministic_and_offline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = local_embeddings()
    asset_root = (
        Path(__file__).parents[1]
        / "model-assets"
        / "gte-multilingual-base"
    )

    def reject_network(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("network access is forbidden")

    monkeypatch.setattr("socket.socket.connect", reject_network)
    vector = module.LocalEmbeddingService(asset_root).embed_query(
        "checkout retry"
    )

    assert len(vector) == 768
    assert sum(value * value for value in vector) == pytest.approx(1.0)
    assert vector[:5] == pytest.approx(
        [
            -0.09625722,
            0.07528492,
            -0.02675553,
            0.03150185,
            -0.01883193,
        ],
        abs=1e-6,
    )


def test_model_health_route_reports_fixed_offline_runtime(
    embedding_client: TestClient,
) -> None:
    response = embedding_client.get("/api/v1/knowledge/model-health")

    assert response.status_code == 200
    assert response.json() == FakeEmbeddingService().model_health()


def test_model_health_route_reports_a_stable_unavailable_state() -> None:
    module = local_embeddings()

    class UnavailableService(FakeEmbeddingService):
        def model_health(self) -> dict[str, object]:
            raise module.LocalEmbeddingError(
                "model_assets_invalid",
                "absolute/path/must/not/leak",
            )

    app = create_app(auth_token="session-secret")
    app.dependency_overrides[routes.get_local_embedding_service] = (
        UnavailableService
    )
    response = TestClient(
        app,
        headers={"Authorization": "Bearer session-secret"},
    ).get("/api/v1/knowledge/model-health")

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"
    assert response.json()["errorCode"] == "model_assets_invalid"
    assert "absolute/path" not in response.text


def test_query_embedding_route_has_a_strict_contract(
    embedding_client: TestClient,
) -> None:
    response = embedding_client.post(
        "/api/v1/knowledge/embed-query",
        json={"text": "checkout retry"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "embeddingModel": "Alibaba-NLP/gte-multilingual-base",
        "embeddingRevision": (
            "9bbca17d9273fd0d03d5725c7a4b0f6b45142062"
        ),
        "dimensions": 768,
        "embedding": [1.0] + [0.0] * 767,
    }
    assert embedding_client.post(
        "/api/v1/knowledge/embed-query",
        json={"text": "checkout retry", "unknown": True},
    ).status_code == 422


def test_document_embedding_route_preserves_ids_and_order(
    embedding_client: TestClient,
) -> None:
    response = embedding_client.post(
        "/api/v1/knowledge/embed-documents",
        json={
            "documents": [
                {"id": "one", "text": "alpha"},
                {"id": "two", "text": "beta"},
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["embeddingModel"] == (
        "Alibaba-NLP/gte-multilingual-base"
    )
    assert payload["embeddingRevision"] == (
        "9bbca17d9273fd0d03d5725c7a4b0f6b45142062"
    )
    assert payload["dimensions"] == 768
    assert [item["id"] for item in payload["embeddings"]] == ["one", "two"]
    assert all(len(item["embedding"]) == 768 for item in payload["embeddings"])
