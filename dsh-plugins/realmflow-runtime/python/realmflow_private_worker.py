from __future__ import annotations

import asyncio
import base64
import binascii
import json
import sys
from typing import Any

from app.services.document_engine import DocumentEngine, DocumentEngineError
from app.services.legacy_office_converter import (
    LegacyOfficeConversionError,
    LegacyOfficeConverter,
)
from app.services.office_package_sanitizer import (
    OfficePackageSanitizationError,
    OfficePackageSanitizer,
)
from app.services.presentation_compute import (
    PresentationComputeError,
    PresentationComputeService,
)
from app.services.spreadsheet_compute import (
    SpreadsheetComputeError,
    SpreadsheetComputeService,
)
from app.services.spreadsheet_recalculation import (
    SpreadsheetRecalculationError,
    SpreadsheetRecalculationService,
)
from app.services.word_compute import WordComputeError, WordComputeService


legacy_office_converter = LegacyOfficeConverter()
office_package_sanitizer = OfficePackageSanitizer()
spreadsheet_compute_service = SpreadsheetComputeService()
spreadsheet_recalculation_service = SpreadsheetRecalculationService()
word_compute_service = WordComputeService()
presentation_compute_service = PresentationComputeService()
document_engine = DocumentEngine()


class WorkerInputError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def main() -> int:
    try:
        request = json.loads(sys.stdin.readline())
        operation = request["operation"]
        input_value = request.get("input", {})
        if not isinstance(operation, str) or not isinstance(input_value, dict):
            raise WorkerInputError(
                "worker_input_invalid",
                "Private Python worker input is invalid",
            )
        result = asyncio.run(dispatch(operation, input_value))
        write({"ok": True, "result": result})
        return 0
    except (
        WorkerInputError,
        LegacyOfficeConversionError,
        OfficePackageSanitizationError,
        SpreadsheetComputeError,
        SpreadsheetRecalculationError,
        WordComputeError,
        PresentationComputeError,
        DocumentEngineError,
    ) as error:
        write(
            {
                "ok": False,
                "error": {
                    "code": getattr(error, "code", "worker_operation_failed"),
                    "message": str(error),
                },
            }
        )
        return 0
    except Exception:
        write(
            {
                "ok": False,
                "error": {
                    "code": "worker_operation_failed",
                    "message": "Private Python worker failed",
                },
            }
        )
        return 0


async def dispatch(operation: str, input_value: dict[str, Any]) -> dict[str, Any]:
    if operation == "office.spreadsheet.compute":
        document = decode_document(
            input_value.get("documentBase64"),
            "spreadsheet_input_invalid",
            "Spreadsheet document encoding is invalid",
        )
        result = spreadsheet_compute_service.compute(
            format_=require_string(input_value, "format"),
            operation=require_string(input_value, "operation"),
            document=document,
            parameters=require_mapping(input_value.get("parameters")),
        )
        return {
            "documentBase64": encode_document(result.document),
            "result": result.result,
            "modified": result.modified,
            "requiresRecalculation": result.requires_recalculation,
        }

    if operation == "office.spreadsheet.recalculate":
        document = decode_document(
            input_value.get("documentBase64"),
            "spreadsheet_input_invalid",
            "Spreadsheet document encoding is invalid",
        )
        recalculated = await spreadsheet_recalculation_service.recalculate(
            document
        )
        return {"documentBase64": encode_document(recalculated)}

    if operation == "office.word.compute":
        document = decode_document(
            input_value.get("documentBase64"),
            "word_input_invalid",
            "Word document encoding is invalid",
        )
        result = word_compute_service.compute(
            format_=require_string(input_value, "format"),
            operation=require_string(input_value, "operation"),
            document=document,
            parameters=require_mapping(input_value.get("parameters")),
        )
        return {
            "documentBase64": encode_document(result.document),
            "result": result.result,
            "modified": result.modified,
            "preservationRisk": result.preservation_risk,
        }

    if operation == "office.presentation.compute":
        document = decode_document(
            input_value.get("documentBase64"),
            "presentation_input_invalid",
            "Presentation document encoding is invalid",
        )
        result = presentation_compute_service.compute(
            format_=require_string(input_value, "format"),
            operation=require_string(input_value, "operation"),
            document=document,
            parameters=require_mapping(input_value.get("parameters")),
        )
        return {
            "documentBase64": encode_document(result.document),
            "result": result.result,
            "modified": result.modified,
            "preservationRisk": result.preservation_risk,
        }

    if operation in {"office.legacy.convert", "office.optional.convert"}:
        document = decode_document(
            input_value.get("documentBase64"),
            "legacy_office_input_invalid",
            "Legacy Office document encoding is invalid",
        )
        result = await legacy_office_converter.convert(
            format_=require_string(input_value, "sourceFormat"),
            document=document,
        )
        return {
            "documentBase64": encode_document(result.document),
            "outputFormat": result.target_format,
            "converter": result.converter,
        }

    if operation == "office.conversion.capabilities":
        return {"formats": legacy_office_converter.capabilities()}

    if operation == "office.safe_copy.create":
        document = decode_document(
            input_value.get("documentBase64"),
            "office_safe_copy_input_invalid",
            "Office package encoding is invalid",
        )
        result = office_package_sanitizer.sanitize(
            format_=require_string(input_value, "sourceFormat"),
            document=document,
        )
        return {
            "documentBase64": encode_document(result.document),
            "outputFormat": result.output_format,
            "macrosRemoved": result.macros_removed,
            "templateMaterialized": result.template_materialized,
            "removedParts": list(result.removed_parts),
        }

    if operation == "documents.create":
        document = document_engine.create_docx(
            require_mapping(input_value.get("document"))
        )
        verification = document_engine.verify(document=document, format_="docx")
        return document_payload(document, verification)

    if operation == "documents.export_pdf":
        document = decode_document(
            input_value.get("documentBase64"),
            "document_input_invalid",
            "Document encoding is invalid",
        )
        exported = await document_engine.export_pdf(document)
        verification = document_engine.verify(
            document=exported.document,
            format_="pdf",
        )
        return {
            **document_payload(exported.document, verification),
            "converter": exported.backend,
            "quality": exported.quality,
            "warnings": list(exported.warnings),
        }

    if operation == "documents.verify":
        document = decode_document(
            input_value.get("documentBase64"),
            "document_input_invalid",
            "Document encoding is invalid",
        )
        verification = document_engine.verify(
            document=document,
            format_=require_string(input_value, "format"),
        )
        return {
            "valid": verification.valid,
            "format": verification.format,
            "byteSize": verification.byte_size,
            "checksum": verification.checksum,
            "pageCount": verification.page_count,
        }

    raise WorkerInputError(
        "worker_operation_unknown",
        "Private Python worker operation is unknown",
    )


def decode_document(value: object, code: str, message: str) -> bytes:
    if not isinstance(value, str) or not value:
        raise WorkerInputError(code, message)
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise WorkerInputError(code, message) from error


def encode_document(document: bytes) -> str:
    return base64.b64encode(document).decode("ascii")


def document_payload(document: bytes, verification: object) -> dict[str, Any]:
    return {
        "documentBase64": encode_document(document),
        "format": verification.format,
        "byteSize": verification.byte_size,
        "checksum": verification.checksum,
        "pageCount": verification.page_count,
    }


def require_string(input_value: dict[str, Any], key: str) -> str:
    value = input_value.get(key)
    if not isinstance(value, str) or not value:
        raise WorkerInputError(
            "worker_input_invalid",
            "Private Python worker input is invalid",
        )
    return value


def require_mapping(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WorkerInputError(
            "worker_input_invalid",
            "Private Python worker input is invalid",
        )
    return value


def write(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    raise SystemExit(main())
