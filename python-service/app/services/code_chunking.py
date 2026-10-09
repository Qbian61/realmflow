from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePath
from typing import Callable, Literal, Protocol

from tree_sitter import Node, Parser
from tree_sitter_language_pack import get_parser

CodeLanguage = Literal[
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
]
CodeSymbolKind = Literal["class", "function", "method", "struct"]


@dataclass(frozen=True)
class CodeSymbol:
    name: str
    kind: CodeSymbolKind
    start: int
    end: int
    depth: int = 0


class ParserAdapter(Protocol):
    def parse(self, language: CodeLanguage, content: str) -> list[CodeSymbol]:
        """Return source-ordered symbol spans using Python string offsets."""


_EXTENSION_LANGUAGES: dict[str, CodeLanguage] = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".pyw": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
}


def detect_code_language(
    document_key: str,
    content: str,
) -> CodeLanguage | None:
    extension = PurePath(document_key).suffix.lower()
    if extension in _EXTENSION_LANGUAGES:
        return _EXTENSION_LANGUAGES[extension]

    first_line = content.splitlines()[0] if content else ""
    if re.match(r"^#!.*\bpython(?:3(?:\.\d+)?)?\b", first_line):
        return "python"
    if re.match(r"^#!.*\b(?:node|deno|bun)\b", first_line):
        return "javascript"
    if re.search(r"(?m)^\s*package\s+\w+\s*$", content) and re.search(
        r"(?m)^\s*func\s+(?:\([^)]*\)\s*)?\w+\s*\(",
        content,
    ):
        return "go"
    if re.search(r"(?m)^\s*(?:pub\s+)?(?:fn|impl|struct)\s+\w+", content):
        return "rust"
    if re.search(
        r"(?m)^\s*(?:public\s+)?(?:class|interface|enum|record)\s+\w+",
        content,
    ):
        return "java"
    return None


class DefaultParserAdapter:
    def __init__(
        self,
        parser_factory: Callable[[str], Parser] = get_parser,
    ) -> None:
        self._parser_factory = parser_factory

    def parse(
        self,
        language: CodeLanguage,
        content: str,
    ) -> list[CodeSymbol]:
        source = content.encode("utf-8")
        parser_names = (
            ("typescript", "tsx")
            if language == "typescript"
            else (language,)
        )
        root: Node | None = None
        for parser_name in parser_names:
            candidate = self._parser_factory(parser_name).parse(source).root_node
            if not candidate.has_error:
                root = candidate
                break
        if root is None:
            raise ValueError("Code parser could not produce a valid tree")

        symbols = _extract_symbols(language, root, source, content)
        return sorted(
            symbols,
            key=lambda symbol: (
                symbol.start,
                symbol.depth,
                symbol.end,
                symbol.name,
            ),
        )


_DEFAULT_ADAPTER = DefaultParserAdapter()


def get_parser_adapter() -> ParserAdapter:
    return _DEFAULT_ADAPTER


def _extract_symbols(
    language: CodeLanguage,
    root: Node,
    source: bytes,
    content: str,
) -> list[CodeSymbol]:
    symbols: list[CodeSymbol] = []

    def add(
        node: Node,
        name: str,
        kind: CodeSymbolKind,
        depth: int,
    ) -> None:
        start = _character_offset(source, node.start_byte)
        end = _line_end(
            content,
            _character_offset(source, node.end_byte),
        )
        symbols.append(CodeSymbol(name, kind, start, end, depth))

    def walk(
        node: Node,
        parent_symbol: str | None = None,
        depth: int = 0,
    ) -> None:
        if language == "python" and node.type == "decorated_definition":
            definition = next(
                (
                    child
                    for child in node.named_children
                    if child.type
                    in {"class_definition", "function_definition"}
                ),
                None,
            )
            if definition is None:
                return
            name = _field_text(definition, "name", source)
            is_class = definition.type == "class_definition"
            qualified = (
                f"{parent_symbol}.{name}" if parent_symbol else name
            )
            add(
                node,
                qualified,
                "class" if is_class else "method" if parent_symbol else "function",
                depth,
            )
            if is_class:
                walk(definition, qualified, depth + 1)
            return

        if language == "python" and node.type in {
            "class_definition",
            "function_definition",
        }:
            name = _field_text(node, "name", source)
            is_class = node.type == "class_definition"
            qualified = (
                f"{parent_symbol}.{name}" if parent_symbol else name
            )
            add(
                node,
                qualified,
                "class" if is_class else "method" if parent_symbol else "function",
                depth,
            )
            if not is_class:
                return
            parent_symbol = qualified
            depth += 1

        elif language in {"typescript", "javascript"}:
            if node.type in {"class_declaration", "class"}:
                name = _field_text(node, "name", source)
                add(node, name, "class", depth)
                parent_symbol = name
                depth += 1
            elif node.type == "method_definition" and parent_symbol:
                name = _field_text(node, "name", source)
                add(node, f"{parent_symbol}.{name}", "method", depth)
                return
            elif node.type in {
                "function_declaration",
                "generator_function_declaration",
            }:
                name = _field_text(node, "name", source)
                add(node, name, "function", depth)
                return
            elif node.type == "variable_declarator":
                value = node.child_by_field_name("value")
                if value and value.type in {
                    "arrow_function",
                    "function_expression",
                    "generator_function",
                }:
                    add(node, _field_text(node, "name", source), "function", depth)
                    return

        elif language == "go":
            if node.type == "type_spec":
                value = node.child_by_field_name("type")
                if value and value.type in {"struct_type", "interface_type"}:
                    add(node, _field_text(node, "name", source), "struct", depth)
                    return
            elif node.type == "function_declaration":
                add(node, _field_text(node, "name", source), "function", depth)
                return
            elif node.type == "method_declaration":
                receiver = node.child_by_field_name("receiver")
                receiver_names = (
                    re.findall(r"[A-Za-z_]\w*", _node_text(receiver, source))
                    if receiver
                    else []
                )
                if not receiver_names:
                    raise ValueError("Go method receiver is invalid")
                name = _field_text(node, "name", source)
                add(node, f"{receiver_names[-1]}.{name}", "method", depth + 1)
                return

        elif language == "rust":
            if node.type in {"struct_item", "enum_item", "trait_item"}:
                add(node, _field_text(node, "name", source), "struct", depth)
                parent_symbol = _field_text(node, "name", source)
                depth += 1
            elif node.type == "impl_item":
                type_node = node.child_by_field_name("type")
                parent_symbol = _node_text(type_node, source)
                depth += 1
            elif node.type == "function_item":
                name = _field_text(node, "name", source)
                add(
                    node,
                    f"{parent_symbol}.{name}" if parent_symbol else name,
                    "method" if parent_symbol else "function",
                    depth,
                )
                return

        elif language == "java":
            if node.type in {
                "class_declaration",
                "interface_declaration",
                "enum_declaration",
                "record_declaration",
            }:
                name = _field_text(node, "name", source)
                add(node, name, "class", depth)
                parent_symbol = name
                depth += 1
            elif node.type in {"method_declaration", "constructor_declaration"}:
                if parent_symbol:
                    name = _field_text(node, "name", source)
                    add(node, f"{parent_symbol}.{name}", "method", depth)
                return

        for child in node.named_children:
            walk(child, parent_symbol, depth)

    walk(root)
    return symbols


def _field_text(node: Node, field: str, source: bytes) -> str:
    child = node.child_by_field_name(field)
    value = _node_text(child, source)
    if not value:
        raise ValueError(f"Code symbol has no {field}")
    return value


def _node_text(node: Node | None, source: bytes) -> str:
    if node is None:
        return ""
    return source[node.start_byte : node.end_byte].decode("utf-8")


def _character_offset(source: bytes, byte_offset: int) -> int:
    return len(source[:byte_offset].decode("utf-8"))


def _line_end(content: str, offset: int) -> int:
    newline = content.find("\n", offset)
    return len(content) if newline < 0 else newline + 1
