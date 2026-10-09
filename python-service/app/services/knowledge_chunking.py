from __future__ import annotations

import hashlib
import re
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

    chunks: list[dict[str, object]] = []
    start = 0
    while start < len(content):
        remaining = content[start:]
        if tokenizer.count_tokens(remaining) <= MAX_TOKENS:
            end = len(content)
        else:
            max_end = _token_budget_end(
                content,
                start,
                MAX_TOKENS,
                tokenizer,
            )
            target_end = _token_budget_end(
                content,
                start,
                TARGET_TOKENS,
                tokenizer,
            )
            end = _preferred_end(content, start, target_end, max_end)
        if end <= start:
            raise ValueError("Tokenizer did not produce a valid chunk boundary")

        text = content[start:end]
        token_count = tokenizer.count_tokens(text)
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
        next_start = _overlap_start(content, start, end, tokenizer)
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
    start: int,
    budget: int,
    tokenizer: KnowledgeTokenizer,
) -> int:
    relative_offsets = [
        (token_start, token_end)
        for token_start, token_end in tokenizer.token_offsets(content[start:])
        if token_end > token_start
    ]
    if not relative_offsets:
        raise ValueError("Tokenizer did not produce content tokens")

    valid_end = start + relative_offsets[0][1]
    for index, (_token_start, token_end) in enumerate(relative_offsets):
        candidate_end = start + token_end
        next_start = (
            start + relative_offsets[index + 1][0]
            if index + 1 < len(relative_offsets)
            else len(content)
        )
        candidate_end = max(candidate_end, next_start)
        if tokenizer.count_tokens(content[start:candidate_end]) > budget:
            break
        valid_end = candidate_end
    return valid_end


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
    tokenizer: KnowledgeTokenizer,
) -> int:
    chunk = content[chunk_start:chunk_end]
    offsets = tokenizer.token_offsets(chunk)
    candidate = chunk_end
    for token_start, _token_end in offsets:
        absolute_start = chunk_start + token_start
        if tokenizer.count_tokens(content[absolute_start:chunk_end]) <= (
            OVERLAP_TOKENS
        ):
            candidate = absolute_start
            break

    structural_starts = [
        position
        for position, _priority in _structural_boundaries(
            content,
            candidate,
            chunk_end,
        )
        if position >= candidate
        and tokenizer.count_tokens(content[position:chunk_end])
        <= OVERLAP_TOKENS
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
