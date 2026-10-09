from __future__ import annotations

import io
import posixpath
import zipfile
from dataclasses import dataclass
from xml.etree import ElementTree


CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
MAX_PACKAGE_BYTES = 20 * 1024 * 1024
MAX_EXPANDED_BYTES = 100 * 1024 * 1024
MAX_ENTRIES = 10_000

SOURCE_FORMATS = {
    "dotx": ("docx", True, False),
    "xltx": ("xlsx", True, False),
    "potx": ("pptx", True, False),
    "docm": ("docx", False, True),
    "dotm": ("docx", True, True),
    "xlsm": ("xlsx", False, True),
    "xltm": ("xlsx", True, True),
    "pptm": ("pptx", False, True),
    "ppsm": ("pptx", False, True),
    "potm": ("pptx", True, True),
}

MAIN_PARTS = {
    "docx": "word/document.xml",
    "xlsx": "xl/workbook.xml",
    "pptx": "ppt/presentation.xml",
}

MODERN_CONTENT_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
}


class OfficePackageSanitizationError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class OfficePackageSanitizationResult:
    document: bytes
    output_format: str
    macros_removed: bool
    template_materialized: bool
    removed_parts: tuple[str, ...]


class OfficePackageSanitizer:
    def sanitize(
        self,
        *,
        format_: str,
        document: bytes,
    ) -> OfficePackageSanitizationResult:
        policy = SOURCE_FORMATS.get(format_)
        if policy is None:
            raise OfficePackageSanitizationError(
                "office_safe_copy_format_unsupported",
                "Office template or macro format is unsupported",
            )
        if not document or len(document) > MAX_PACKAGE_BYTES:
            raise OfficePackageSanitizationError(
                "office_safe_copy_package_invalid",
                "Office package is empty or exceeds the size limit",
            )

        output_format, template_materialized, macro_source = policy
        try:
            with zipfile.ZipFile(io.BytesIO(document)) as archive:
                entries = archive.infolist()
                self._validate_entries(entries)
                names = {entry.filename for entry in entries}
                main_part = MAIN_PARTS[output_format]
                if "[Content_Types].xml" not in names or main_part not in names:
                    raise self._invalid("Office package structure is invalid")
                content_types = self._rewrite_content_types(
                    archive.read("[Content_Types].xml"),
                    output_format,
                )
                removed_parts = tuple(
                    sorted(
                        name
                        for name in names
                        if _is_executable_part(name)
                    )
                )
                output = io.BytesIO()
                with zipfile.ZipFile(
                    output,
                    "w",
                    compression=zipfile.ZIP_DEFLATED,
                ) as destination:
                    for entry in entries:
                        name = entry.filename
                        if name in removed_parts:
                            continue
                        payload = archive.read(entry)
                        if name == "[Content_Types].xml":
                            payload = content_types
                        elif name.endswith(".rels"):
                            payload = self._rewrite_relationships(
                                name,
                                payload,
                                set(removed_parts),
                            )
                        destination.writestr(_safe_zip_info(entry), payload)
        except OfficePackageSanitizationError:
            raise
        except (
            ElementTree.ParseError,
            KeyError,
            OSError,
            RuntimeError,
            zipfile.BadZipFile,
        ) as error:
            raise self._invalid("Office package is invalid") from error

        candidate = output.getvalue()
        self._validate_output(candidate, output_format)
        return OfficePackageSanitizationResult(
            document=candidate,
            output_format=output_format,
            macros_removed=macro_source,
            template_materialized=template_materialized,
            removed_parts=removed_parts,
        )

    def _validate_entries(self, entries: list[zipfile.ZipInfo]) -> None:
        if len(entries) > MAX_ENTRIES:
            raise self._invalid("Office package has too many entries")
        if sum(entry.file_size for entry in entries) > MAX_EXPANDED_BYTES:
            raise self._invalid("Office package expands beyond the size limit")
        seen: set[str] = set()
        for entry in entries:
            normalized = posixpath.normpath(entry.filename)
            if (
                not entry.filename
                or entry.filename.startswith("/")
                or normalized == ".."
                or normalized.startswith("../")
                or normalized in seen
                or entry.flag_bits & 0x1
            ):
                raise self._invalid("Office package contains an unsafe entry")
            seen.add(normalized)

    def _rewrite_content_types(
        self,
        payload: bytes,
        output_format: str,
    ) -> bytes:
        root = ElementTree.fromstring(payload)
        main_part = f"/{MAIN_PARTS[output_format]}"
        found_main = False
        for child in list(root):
            if child.attrib.get("PartName") == main_part:
                child.set(
                    "ContentType",
                    MODERN_CONTENT_TYPES[output_format],
                )
                found_main = True
            elif _is_executable_content_type(
                child.attrib.get("ContentType", "")
            ):
                root.remove(child)
        if not found_main:
            raise self._invalid("Office package main content type is missing")
        return ElementTree.tostring(
            root,
            encoding="utf-8",
            xml_declaration=True,
        )

    def _rewrite_relationships(
        self,
        relationship_path: str,
        payload: bytes,
        removed_parts: set[str],
    ) -> bytes:
        root = ElementTree.fromstring(payload)
        for child in list(root):
            relationship_type = child.attrib.get("Type", "")
            target = child.attrib.get("Target", "")
            resolved_target = _resolve_relationship_target(
                relationship_path,
                target,
            )
            if (
                _is_executable_relationship(relationship_type)
                or resolved_target in removed_parts
            ):
                root.remove(child)
        return ElementTree.tostring(
            root,
            encoding="utf-8",
            xml_declaration=True,
        )

    def _validate_output(
        self,
        document: bytes,
        output_format: str,
    ) -> None:
        try:
            with zipfile.ZipFile(io.BytesIO(document)) as archive:
                names = set(archive.namelist())
                if any(_is_executable_part(name) for name in names):
                    raise self._output_invalid(
                        "Safe Office copy still contains executable parts"
                    )
                root = ElementTree.fromstring(
                    archive.read("[Content_Types].xml")
                )
                expected_part = f"/{MAIN_PARTS[output_format]}"
                matching = [
                    child.attrib.get("ContentType")
                    for child in root
                    if child.attrib.get("PartName") == expected_part
                ]
                if matching != [MODERN_CONTENT_TYPES[output_format]]:
                    raise self._output_invalid(
                        "Safe Office copy has an invalid main content type"
                    )
                archive.testzip()
        except OfficePackageSanitizationError:
            raise
        except (
            ElementTree.ParseError,
            KeyError,
            OSError,
            RuntimeError,
            zipfile.BadZipFile,
        ) as error:
            raise self._output_invalid("Safe Office copy is invalid") from error

    @staticmethod
    def _invalid(message: str) -> OfficePackageSanitizationError:
        return OfficePackageSanitizationError(
            "office_safe_copy_package_invalid",
            message,
        )

    @staticmethod
    def _output_invalid(message: str) -> OfficePackageSanitizationError:
        return OfficePackageSanitizationError(
            "office_safe_copy_output_invalid",
            message,
        )


def _is_executable_part(name: str) -> bool:
    normalized = name.lower().lstrip("/")
    return (
        "vbaproject" in normalized
        or "vbadata" in normalized
        or "/activex/" in f"/{normalized}"
        or normalized.startswith("customui/")
        or normalized.startswith("_xmlsignatures/")
    )


def _is_executable_content_type(content_type: str) -> bool:
    normalized = content_type.lower()
    return (
        "vba" in normalized
        or "activex" in normalized
        or "customui" in normalized
        or "digital-signature" in normalized
    )


def _is_executable_relationship(relationship_type: str) -> bool:
    normalized = relationship_type.lower()
    return (
        "vbaproject" in normalized
        or "vbadata" in normalized
        or "activex" in normalized
        or "customui" in normalized
        or "digital-signature" in normalized
    )


def _resolve_relationship_target(
    relationship_path: str,
    target: str,
) -> str:
    if not target or "://" in target:
        return ""
    rel_directory = posixpath.dirname(relationship_path)
    source_directory = posixpath.dirname(rel_directory)
    return posixpath.normpath(posixpath.join(source_directory, target)).lstrip(
        "/"
    )


def _safe_zip_info(entry: zipfile.ZipInfo) -> zipfile.ZipInfo:
    copied = zipfile.ZipInfo(entry.filename, date_time=entry.date_time)
    copied.compress_type = zipfile.ZIP_DEFLATED
    copied.comment = entry.comment
    copied.extra = entry.extra
    copied.internal_attr = entry.internal_attr
    copied.external_attr = entry.external_attr
    copied.create_system = entry.create_system
    return copied
