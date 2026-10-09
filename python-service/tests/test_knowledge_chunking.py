import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app
from app.api import routes
from app.services.knowledge_chunking import (
    CHUNKER_VERSION,
    MAX_TOKENS,
    OVERLAP_TOKENS,
    TARGET_TOKENS,
    chunk_documents,
)


class WordTokenizer:
    def count_tokens(self, text: str) -> int:
        count = len(self.token_offsets(text))
        return count + 2 if count else 0

    def token_offsets(self, text: str) -> list[tuple[int, int]]:
        return [match.span() for match in re.finditer(r"\S+", text)]


class FakeChunkingService:
    def chunk_documents(
        self,
        documents: list[dict[str, str]],
    ) -> dict[str, object]:
        assert documents == [{"documentKey": "doc", "content": "alpha"}]
        return {
            "chunkerVersion": "realmflow-token-aware-v1",
            "embeddingModel": "Alibaba-NLP/gte-multilingual-base",
            "embeddingRevision":
                "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
            "documents": [
                {
                    "documentKey": "doc",
                    "chunks": [
                        {
                            "ordinal": 0,
                            "content": "alpha",
                            "tokenCount": 3,
                            "startOffset": 0,
                            "endOffset": 5,
                            "startLine": 1,
                            "endLine": 1,
                            "checksum":
                                "sha256:"
                                "8ed3f6ad685b959ead7022518e1af76cd"
                                "816f8e8ec7ccdda1ed4018e8f2223f8",
                        }
                    ],
                }
            ],
        }


def test_chunker_profile_and_blank_document() -> None:
    result = chunk_documents(
        [{"documentKey": "blank", "content": " \n\t"}],
        WordTokenizer(),
    )

    assert CHUNKER_VERSION == "realmflow-token-aware-v1"
    assert TARGET_TOKENS == 384
    assert MAX_TOKENS == 512
    assert OVERLAP_TOKENS == 64
    assert result["documents"] == [{"documentKey": "blank", "chunks": []}]


def test_chunker_rejects_sensitive_repository_paths() -> None:
    for document_key in (
        ".env",
        "config/.env.production",
        "secrets/private.key",
        "auth/credentials.json",
    ):
        with pytest.raises(
            ValueError,
            match="Knowledge document path is sensitive",
        ):
            chunk_documents(
                [
                    {
                        "documentKey": document_key,
                        "content": "body-canary",
                    }
                ],
                WordTokenizer(),
            )


def test_heading_starts_the_next_chunk_with_following_body() -> None:
    introduction = " ".join(f"intro-{index}" for index in range(382))
    body = " ".join(f"body-{index}" for index in range(200))
    content = f"{introduction}\n\n# Deployment\n{body}"

    result = chunk_documents(
        [{"documentKey": "readme.md", "content": content}],
        WordTokenizer(),
    )
    chunks = result["documents"][0]["chunks"]

    assert len(chunks) == 2
    assert "# Deployment" not in chunks[0]["content"]
    assert "# Deployment\nbody-0 body-1" in chunks[1]["content"]
    assert chunks[0]["content"].endswith("\n\n")


def test_paragraph_and_list_boundaries_are_not_split_mid_marker() -> None:
    first = " ".join(f"alpha-{index}" for index in range(380))
    list_items = "\n".join(f"- item {index}" for index in range(100))
    content = f"{first}\n\n{list_items}"

    chunks = chunk_documents(
        [{"documentKey": "notes.md", "content": content}],
        WordTokenizer(),
    )["documents"][0]["chunks"]

    assert len(chunks) >= 2
    assert chunks[0]["content"].endswith("\n\n")
    assert all(
        not chunk["content"].startswith("item ")
        for chunk in chunks[1:]
    )


def test_long_line_respects_token_limit_and_overlap_budget() -> None:
    content = " ".join(f"token-{index}" for index in range(1_100))
    tokenizer = WordTokenizer()

    chunks = chunk_documents(
        [{"documentKey": "long.txt", "content": content}],
        tokenizer,
    )["documents"][0]["chunks"]

    assert len(chunks) >= 3
    assert all(1 <= chunk["tokenCount"] <= MAX_TOKENS for chunk in chunks)
    for previous, current in zip(chunks, chunks[1:], strict=False):
        overlap = content[
            current["startOffset"] : previous["endOffset"]
        ]
        assert tokenizer.count_tokens(overlap) <= OVERLAP_TOKENS


def test_utf16_offsets_lines_and_checksums_preserve_original_text() -> None:
    content = "A😀B\r\nsecond"

    chunk = chunk_documents(
        [{"documentKey": "unicode.txt", "content": content}],
        WordTokenizer(),
    )["documents"][0]["chunks"][0]

    assert chunk["content"] == content
    assert chunk["startOffset"] == 0
    assert chunk["endOffset"] == 12
    assert chunk["startLine"] == 1
    assert chunk["endLine"] == 2
    assert chunk["checksum"].startswith("sha256:")
    assert len(chunk["checksum"]) == len("sha256:") + 64
    assert "pythonStart" not in chunk
    assert "pythonEnd" not in chunk


def test_bundled_gte_tokenizer_never_exceeds_model_limit() -> None:
    from tokenizers import Tokenizer

    asset_root = (
        Path(__file__).parents[1]
        / "model-assets"
        / "gte-multilingual-base"
    )
    tokenizer = Tokenizer.from_file(str(asset_root / "tokenizer.json"))

    class GteTokenizer:
        def count_tokens(self, text: str) -> int:
            return len(tokenizer.encode(text).ids)

        def token_offsets(self, text: str) -> list[tuple[int, int]]:
            return [
                (start, end)
                for start, end in tokenizer.encode(text).offsets
                if end > start
            ]

    content = (
        "# 多语言知识\n\n"
        + "支付 checkout retry 与恢复流程。 " * 1_200
    )
    chunks = chunk_documents(
        [{"documentKey": "gte.md", "content": content}],
        GteTokenizer(),
    )["documents"][0]["chunks"]

    assert len(chunks) > 1
    assert all(chunk["tokenCount"] <= MAX_TOKENS for chunk in chunks)


def test_authenticated_chunk_documents_route_uses_strict_contract() -> None:
    app = create_app(auth_token="session-secret")
    app.dependency_overrides[routes.get_local_embedding_service] = (
        FakeChunkingService
    )
    client = TestClient(
        app,
        headers={"Authorization": "Bearer session-secret"},
    )

    response = client.post(
        "/api/v1/knowledge/chunk-documents",
        json={
            "chunkerVersion": "realmflow-token-aware-v1",
            "documents": [{"documentKey": "doc", "content": "alpha"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["documents"][0]["chunks"][0]["tokenCount"] == 3
    assert client.post(
        "/api/v1/knowledge/chunk-documents",
        json={
            "chunkerVersion": "wrong",
            "documents": [{"documentKey": "doc", "content": "alpha"}],
        },
    ).status_code == 422
    assert client.post(
        "/api/v1/knowledge/chunk-documents",
        json={
            "chunkerVersion": "realmflow-token-aware-v1",
            "documents": [{"documentKey": "doc", "content": "alpha"}],
            "unknown": True,
        },
    ).status_code == 422
