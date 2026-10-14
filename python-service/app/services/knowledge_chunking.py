from __future__ import annotations

import hashlib
import re
from bisect import bisect_left, bisect_right
from typing import Protocol

from app.services.local_embeddings import MODEL_NAME, MODEL_REVISION

CHUNKER_VERSION = "realmflow-token-aware-v1"
TARGET_TOKENS = 384
MAX_TOKENS = 512
OVERLAP_TOKENS = 64
_SENSITIVE_DIRECTORIES = {
    ".git",
    ".realmflow",
    "node_modules",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    "target",
    "vendor",
}
_SENSITIVE_FILES = {".env", "credentials.json", ".npmrc", ".pypirc"}


class KnowledgeTokenizer(Protocol):
    def count_tokens(self, text: str) -> int: ...

    def tokenize_with_offsets(
        self,
        text: str,
    ) -> tuple[int, list[tuple[int, int]]]: ...

    def token_offsets(self, text: str) -> list[tuple[int, int]]: ...


def chunk_documents(
    documents: list[dict[str, str]],
    tokenizer: KnowledgeTokenizer,
) -> dict[str, object]:
    from app.services.code_chunking import (
        detect_code_language,
        get_parser_adapter,
    )

    seen: set[str] = set()
    chunked_documents: list[dict[str, object]] = []
    for document in documents:
        document_key = document.get("documentKey")
        content = document.get("content")
        if (
            not isinstance(document_key, str)
            or not document_key
            or "\0" in document_key
            or document_key in seen
            or not isinstance(content, str)
            or "\0" in content
        ):
            raise ValueError("Knowledge document is invalid")
        if _is_sensitive_document_path(document_key):
            raise ValueError("Knowledge document path is sensitive")
        seen.add(document_key)
        language = detect_code_language(document_key, content)
        chunks: list[dict[str, object]]
        if language is None:
            chunks = chunk_text(content, tokenizer)
        else:
            try:
                symbols = get_parser_adapter().parse(language, content)
                chunks = (
                    _chunk_code_symbols(
                        content,
                        language,
                        symbols,
                        tokenizer,
                    )
                    if symbols
                    else chunk_text(content, tokenizer)
                )
            except Exception:
                chunks = chunk_text(content, tokenizer)
        chunked_documents.append(
            {
                "documentKey": document_key,
                "chunks": chunks,
            }
        )
    return {
        "chunkerVersion": CHUNKER_VERSION,
        "embeddingModel": MODEL_NAME,
        "embeddingRevision": MODEL_REVISION,
        "documents": chunked_documents,
    }


def _is_sensitive_document_path(value: str) -> bool:
    segments = value.lower().replace("\\", "/").split("/")
    if any(segment in _SENSITIVE_DIRECTORIES for segment in segments):
        return True
    name = segments[-1]
    return (
        name in _SENSITIVE_FILES
        or name.startswith(".env.")
        or name.endswith(".pem")
        or name.endswith(".key")
    )


def chunk_text(
    content: str,
    tokenizer: KnowledgeTokenizer,
) -> list[dict[str, object]]:
    if not content.strip():
        return []

    content_token_count, token_offsets = tokenizer.tokenize_with_offsets(content)
    token_offsets = [
        (token_start, token_end)
        for token_start, token_end in token_offsets
        if token_end > token_start
    ]
    if content_token_count < 1 or not token_offsets:
        raise ValueError("Tokenizer did not produce content tokens")
    token_overhead = max(0, content_token_count - len(token_offsets))
    token_starts = [token_start for token_start, _token_end in token_offsets]
    token_ends = [token_end for _token_start, token_end in token_offsets]

    chunks: list[dict[str, object]] = []
    start = 0
    while start < len(content):
        first_token = bisect_right(token_ends, start)
        remaining_tokens = len(token_offsets) - first_token
        max_content_tokens = max(1, MAX_TOKENS - token_overhead)
        if remaining_tokens <= max_content_tokens:
            end = len(content)
        else:
            max_end = _token_budget_end(
                content,
                first_token,
                MAX_TOKENS,
                token_offsets,
                token_overhead,
            )
            target_end = _token_budget_end(
                content,
                first_token,
                TARGET_TOKENS,
                token_offsets,
                token_overhead,
            )
            end = _preferred_end(content, start, target_end, max_end)
        if end <= start:
            raise ValueError("Tokenizer did not produce a valid chunk boundary")

        end, token_count = _fit_chunk_to_token_limit(
            content,
            start,
            end,
            first_token,
            token_offsets,
            token_starts,
            tokenizer,
        )
        text = content[start:end]
        if token_count < 1 or token_count > MAX_TOKENS:
            raise ValueError("Knowledge chunk token count is invalid")
        chunks.append(
            {
                "ordinal": len(chunks),
                "content": text,
                "tokenCount": token_count,
                "startOffset": _utf16_length(content[:start]),
                "endOffset": _utf16_length(content[:end]),
                "startLine": content.count("\n", 0, start) + 1,
                "endLine": content.count("\n", 0, max(start, end - 1)) + 1,
                "checksum": _checksum(text),
            }
        )
        if end == len(content):
            break
        next_start = _overlap_start(
            content,
            start,
            end,
            token_starts,
            token_ends,
            token_overhead,
        )
        if next_start <= start or next_start >= end:
            next_start = end
        start = next_start
    return chunks


def _chunk_code_symbols(
    content: str,
    language: str,
    symbols: list[object],
    tokenizer: KnowledgeTokenizer,
) -> list[dict[str, object]]:
    chunks: list[dict[str, object]] = []
    valid_symbols: list[object] = []
    for symbol in symbols:
        start = getattr(symbol, "start")
        end = getattr(symbol, "end")
        name = getattr(symbol, "name")
        kind = getattr(symbol, "kind")
        if (
            not isinstance(start, int)
            or not isinstance(end, int)
            or not isinstance(name, str)
            or not isinstance(kind, str)
            or start < 0
            or end <= start
            or end > len(content)
        ):
            raise ValueError("Parser returned an invalid symbol")
        valid_symbols.append(symbol)

    boundaries = sorted(
        {0, len(content)}
        | {
            boundary
            for symbol in valid_symbols
            for boundary in (getattr(symbol, "start"), getattr(symbol, "end"))
        }
    )
    segments: list[tuple[int, int, object | None]] = []
    for start, end in zip(boundaries, boundaries[1:], strict=False):
        active = [
            symbol
            for symbol in valid_symbols
            if getattr(symbol, "start") <= start
            and getattr(symbol, "end") >= end
        ]
        owner = max(
            active,
            key=lambda symbol: (
                getattr(symbol, "depth", 0),
                -(
                    getattr(symbol, "end")
                    - getattr(symbol, "start")
                ),
            ),
            default=None,
        )
        if (
            segments
            and segments[-1][1] == start
            and segments[-1][2] == owner
        ):
            previous_start, _previous_end, _previous_owner = segments[-1]
            segments[-1] = (previous_start, end, owner)
        else:
            segments.append((start, end, owner))

    covered_segments: list[tuple[int, int, object | None]] = []
    leading_whitespace_start: int | None = None
    for start, end, owner in segments:
        if not content[start:end].strip():
            if covered_segments:
                previous_start, _previous_end, previous_owner = (
                    covered_segments[-1]
                )
                covered_segments[-1] = (
                    previous_start,
                    end,
                    previous_owner,
                )
            elif leading_whitespace_start is None:
                leading_whitespace_start = start
            continue
        if leading_whitespace_start is not None:
            start = leading_whitespace_start
            leading_whitespace_start = None
        covered_segments.append((start, end, owner))

    for start, end, symbol in covered_segments:
        base_offset = _utf16_length(content[:start])
        base_line = content.count("\n", 0, start)
        for chunk in chunk_text(content[start:end], tokenizer):
            chunk["ordinal"] = len(chunks)
            chunk["startOffset"] = base_offset + int(chunk["startOffset"])
            chunk["endOffset"] = base_offset + int(chunk["endOffset"])
            chunk["startLine"] = base_line + int(chunk["startLine"])
            chunk["endLine"] = base_line + int(chunk["endLine"])
            chunk["language"] = language
            if symbol is None:
                chunk["kind"] = "module"
            else:
                chunk["symbol"] = getattr(symbol, "name")
                chunk["kind"] = getattr(symbol, "kind")
            chunks.append(chunk)
    return chunks


def _token_budget_end(
    content: str,
    first_token: int,
    budget: int,
    token_offsets: list[tuple[int, int]],
    token_overhead: int,
) -> int:
    content_budget = max(1, budget - token_overhead)
    last_token = min(
        first_token + content_budget - 1,
        len(token_offsets) - 1,
    )
    token_end = token_offsets[last_token][1]
    next_start = (
        token_offsets[last_token + 1][0]
        if last_token + 1 < len(token_offsets)
        else len(content)
    )
    return max(token_end, next_start)


def _fit_chunk_to_token_limit(
    content: str,
    start: int,
    end: int,
    first_token: int,
    token_offsets: list[tuple[int, int]],
    token_starts: list[int],
    tokenizer: KnowledgeTokenizer,
) -> tuple[int, int]:
    token_count = tokenizer.count_tokens(content[start:end])
    while token_count > MAX_TOKENS:
        tokens_to_remove = max(1, token_count - MAX_TOKENS)
        last_token = bisect_left(
            token_starts,
            end,
            lo=first_token,
        ) - 1
        reduced_last_token = last_token - tokens_to_remove
        if reduced_last_token < first_token:
            raise ValueError("Knowledge chunk token count is invalid")
        last_token = reduced_last_token
        end = token_offsets[last_token][1]
        token_count = tokenizer.count_tokens(content[start:end])
    return end, token_count


def _preferred_end(
    content: str,
    start: int,
    target_end: int,
    max_end: int,
) -> int:
    minimum_preferred_end = start + ((target_end - start) * 3 // 4)
    preferred = [
        (priority, position)
        for position, priority in _structural_boundaries(
            content,
            start,
            max_end,
        )
        if position >= minimum_preferred_end
    ]
    if preferred:
        highest_priority = max(priority for priority, _position in preferred)
        return min(
            (
                position
                for priority, position in preferred
                if priority == highest_priority
            ),
            key=lambda position: (abs(position - target_end), position),
        )
    return target_end


def _overlap_start(
    content: str,
    chunk_start: int,
    chunk_end: int,
    token_starts: list[int],
    token_ends: list[int],
    token_overhead: int,
) -> int:
    first_token = bisect_right(token_ends, chunk_start)
    after_last_token = bisect_left(token_starts, chunk_end, lo=first_token)
    overlap_content_tokens = max(1, OVERLAP_TOKENS - token_overhead)
    overlap_first_token = max(
        first_token,
        after_last_token - overlap_content_tokens,
    )
    candidate = token_starts[overlap_first_token]

    structural_starts = [
        position
        for position, _priority in _structural_boundaries(
            content,
            candidate,
            chunk_end,
        )
        if position >= candidate
    ]
    return min(structural_starts, default=candidate)


def _structural_boundaries(
    content: str,
    start: int,
    end: int,
) -> list[tuple[int, int]]:
    segment = content[start:end]
    boundaries: dict[int, int] = {}

    def add(position: int, priority: int) -> None:
        if start < position <= end:
            boundaries[position] = max(boundaries.get(position, 0), priority)

    for match in re.finditer(r"(?m)^(?=#{1,6}\s)", segment):
        add(start + match.start(), 4)
    for match in re.finditer(r"\n[ \t]*\n+", segment):
        add(start + match.end(), 3)
    for match in re.finditer(
        r"(?m)^(?=[ \t]*(?:[-*+]|\d+[.)])[ \t]+)",
        segment,
    ):
        add(start + match.start(), 2)
    for match in re.finditer(r"\n", segment):
        add(start + match.end(), 1)
    return sorted(boundaries.items())


def _checksum(content: str) -> str:
    return f"sha256:{hashlib.sha256(content.encode('utf-8')).hexdigest()}"


def _utf16_length(content: str) -> int:
    return len(content.encode("utf-16-le")) // 2
