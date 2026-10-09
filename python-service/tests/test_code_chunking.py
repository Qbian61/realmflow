import importlib.util
import re

from app.services.knowledge_chunking import MAX_TOKENS, chunk_documents


class WordTokenizer:
    def count_tokens(self, text: str) -> int:
        count = len(self.token_offsets(text))
        return count + 2 if count else 0

    def token_offsets(self, text: str) -> list[tuple[int, int]]:
        return [match.span() for match in re.finditer(r"\S+", text)]


def _chunks(document_key: str, content: str) -> list[dict[str, object]]:
    result = chunk_documents(
        [{"documentKey": document_key, "content": content}],
        WordTokenizer(),
    )
    return result["documents"][0]["chunks"]


def _symbols(chunks: list[dict[str, object]]) -> set[str]:
    return {
        str(chunk["symbol"])
        for chunk in chunks
        if "symbol" in chunk
    }


def test_code_chunking_module_defines_a_parser_adapter_boundary() -> None:
    spec = importlib.util.find_spec("app.services.code_chunking")

    assert spec is not None


def test_detects_typescript_and_javascript_from_extensions() -> None:
    typescript = _chunks(
        "src/greeter.tsx",
        "export function greet(name: string) {\n  return name\n}\n",
    )
    javascript = _chunks(
        "src/greeter.mjs",
        "export function greet(name) {\n  return name\n}\n",
    )

    assert {chunk.get("language") for chunk in typescript} == {"typescript"}
    assert {chunk.get("language") for chunk in javascript} == {"javascript"}


def test_detects_python_from_shebang_when_extension_is_ambiguous() -> None:
    chunks = _chunks(
        "tools/format",
        "#!/usr/bin/env python3\n\ndef format_name(name):\n    return name\n",
    )

    assert {chunk.get("language") for chunk in chunks} == {"python"}
    assert "format_name" in _symbols(chunks)


def test_chunks_typescript_and_javascript_at_symbol_boundaries() -> None:
    typescript = _chunks(
        "src/service.ts",
        "const prefix = 'hi'\n\n"
        "export class Greeter {\n"
        "  greet(name: string) {\n"
        "    return `${prefix} ${name}`\n"
        "  }\n"
        "}\n\n"
        "export const createGreeter = () => new Greeter()\n",
    )
    javascript = _chunks(
        "src/service.js",
        "function load() {\n  return 1\n}\n\n"
        "const save = async () => {\n  return 2\n}\n",
    )

    assert {"Greeter", "Greeter.greet", "createGreeter"} <= _symbols(typescript)
    assert {"load", "save"} <= _symbols(javascript)
    assert all(chunk["tokenCount"] <= MAX_TOKENS for chunk in typescript)


def test_code_chunks_preserve_module_preamble_and_arrow_function_body() -> None:
    content = (
        "import { readFile } from 'node:fs'\n\n"
        "export const load = async () => {\n"
        "  return readFile('data.txt')\n"
        "}\n"
    )

    chunks = _chunks("src/load.ts", content)

    assert any(
        "import { readFile }" in str(chunk["content"])
        and chunk.get("kind") == "module"
        for chunk in chunks
    )
    load = next(chunk for chunk in chunks if chunk.get("symbol") == "load")
    assert "return readFile('data.txt')" in str(load["content"])


def test_nested_symbols_do_not_duplicate_source_ranges() -> None:
    content = (
        "class Greeter {\n"
        "  greet() {\n"
        "    return 'hello'\n"
        "  }\n"
        "}\n"
    )

    chunks = _chunks("greeter.js", content)
    covered_ranges = sorted(
        (int(chunk["startOffset"]), int(chunk["endOffset"]))
        for chunk in chunks
    )

    assert all(
        left_end <= right_start
        for (_left_start, left_end), (right_start, _right_end)
        in zip(covered_ranges, covered_ranges[1:], strict=False)
    )
    assert "".join(str(chunk["content"]) for chunk in chunks) == content


def test_multiple_symbols_keep_whitespace_between_chunks_covered() -> None:
    content = (
        "function first() {\n  return 1\n}\n\n\n"
        "function second() {\n  return 2\n}\n"
    )

    chunks = _chunks("functions.js", content)

    assert chunks[0]["startOffset"] == 0
    assert chunks[-1]["endOffset"] == len(content)
    assert all(
        int(left["endOffset"]) == int(right["startOffset"])
        for left, right in zip(chunks, chunks[1:], strict=False)
    )
    assert "".join(str(chunk["content"]) for chunk in chunks) == content
    first = [
        chunk for chunk in chunks if chunk.get("symbol") == "first"
    ]
    assert "return 1" in "".join(str(chunk["content"]) for chunk in first)


def test_chunks_decorated_python_symbols_and_methods() -> None:
    chunks = _chunks(
        "worker.py",
        "import asyncio\n\n"
        "@decorator\n"
        "async def fetch():\n"
        "    return 1\n\n"
        "class Worker:\n"
        "    value = 1\n\n"
        "    def run(self):\n"
        "        return self.value\n",
    )

    assert {"fetch", "Worker", "Worker.run"} <= _symbols(chunks)
    fetch = next(chunk for chunk in chunks if chunk.get("symbol") == "fetch")
    assert str(fetch["content"]).startswith("@decorator\nasync def fetch")


def test_python_ast_byte_columns_preserve_non_ascii_symbol_content() -> None:
    content = 'def greet(): return "你好"\n'

    chunks = _chunks("greet.py", content)

    assert _symbols(chunks) == {"greet"}
    assert "".join(str(chunk["content"]) for chunk in chunks) == content
    assert chunks[-1]["endOffset"] == len(content)


def test_chunks_go_rust_and_java_symbols() -> None:
    go_chunks = _chunks(
        "main.go",
        "package main\n\n"
        "type Server struct{}\n\n"
        "func (s *Server) Start() error {\n  return nil\n}\n\n"
        "func main() {}\n",
    )
    rust_chunks = _chunks(
        "src/lib.rs",
        "pub struct Store;\n\n"
        "impl Store {\n"
        "    pub fn load(&self) -> i32 { 1 }\n"
        "}\n\n"
        "pub fn create() -> Store { Store }\n",
    )
    java_chunks = _chunks(
        "src/Store.java",
        "package app;\n\n"
        "public class Store {\n"
        "  public int load() {\n    return 1;\n  }\n"
        "}\n",
    )

    assert {"Server", "Server.Start", "main"} <= _symbols(go_chunks)
    assert {"Store", "Store.load", "create"} <= _symbols(rust_chunks)
    assert {"Store", "Store.load"} <= _symbols(java_chunks)


def test_oversized_symbol_uses_token_aware_subchunks() -> None:
    body = "\n".join(f"    value_{index} = {index}" for index in range(700))
    chunks = _chunks(
        "large.py",
        f"def calculate():\n{body}\n    return value_699\n",
    )

    calculate_chunks = [
        chunk for chunk in chunks if chunk.get("symbol") == "calculate"
    ]
    assert len(calculate_chunks) > 1
    assert all(
        1 <= int(chunk["tokenCount"]) <= MAX_TOKENS
        for chunk in calculate_chunks
    )


def test_parser_failure_falls_back_to_generic_chunking() -> None:
    content = "def broken(:\n    still searchable\n"

    chunks = _chunks("broken.py", content)

    assert len(chunks) == 1
    assert chunks[0]["content"] == content
    assert "language" not in chunks[0]
    assert "symbol" not in chunks[0]
