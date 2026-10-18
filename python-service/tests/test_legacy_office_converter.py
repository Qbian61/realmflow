import asyncio
import base64
import io
import zipfile
from pathlib import Path

import pytest

from app.services.legacy_office_converter import (
    LegacyOfficeConversionError,
    LegacyOfficeConverter,
    libreoffice_command,
)
from private_worker import realmflow_private_worker, run_worker


def ooxml(format_: str) -> bytes:
    main_part = {
        "docx": "word/document.xml",
        "xlsx": "xl/workbook.xml",
        "pptx": "ppt/presentation.xml",
    }[format_]
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr(main_part, "<root/>")
    return output.getvalue()


@pytest.mark.parametrize(
    ("source_format", "target_format"),
    [
        ("doc", "docx"),
        ("dot", "docx"),
        ("wps", "docx"),
        ("wpt", "docx"),
        ("xls", "xlsx"),
        ("xlt", "xlsx"),
        ("ppt", "pptx"),
        ("pps", "pptx"),
        ("pot", "pptx"),
        ("odt", "docx"),
        ("rtf", "docx"),
        ("ods", "xlsx"),
        ("odp", "pptx"),
    ],
)
def test_converter_maps_legacy_formats_and_uses_isolated_directories(
    source_format: str,
    target_format: str,
) -> None:
    observed: dict[str, Path | str] = {}

    async def run(
        executable: str,
        source_path: Path,
        output_path: Path,
        profile_path: Path,
    ) -> None:
        observed.update(
            executable=executable,
            source_path=source_path,
            output_path=output_path,
            profile_path=profile_path,
        )
        assert source_path.name == f"source.{source_format}"
        assert output_path.name == f"source.{target_format}"
        assert source_path.parent != output_path.parent
        assert profile_path.parent == source_path.parent
        output_path.write_bytes(ooxml(target_format))

    converter = LegacyOfficeConverter(
        resolve_executable=lambda: "/usr/bin/soffice",
        run=run,
    )
    result = asyncio.run(
        converter.convert(format_=source_format, document=b"legacy")
    )

    assert result.target_format == target_format
    assert result.document == ooxml(target_format)
    assert result.converter == "LibreOffice"
    assert observed["executable"] == "/usr/bin/soffice"


def test_converter_reports_a_stable_error_without_libreoffice() -> None:
    converter = LegacyOfficeConverter(resolve_executable=lambda: None)

    with pytest.raises(LegacyOfficeConversionError) as raised:
        asyncio.run(converter.convert(format_="doc", document=b"legacy"))

    assert raised.value.code == "converter_unavailable"
    assert "Install LibreOffice" in str(raised.value)


def test_optional_capabilities_are_empty_without_converter_and_conservative_when_available() -> None:
    assert LegacyOfficeConverter(
        resolve_executable=lambda: None
    ).capabilities() == {}
    assert LegacyOfficeConverter(
        resolve_executable=lambda: "/usr/bin/soffice"
    ).capabilities() == {
        "vsd": "pdf",
        "vsdx": "pdf",
        "pub": "pdf",
    }


def test_converts_a_probed_visio_document_to_pdf() -> None:
    async def run(
        _executable: str,
        _source_path: Path,
        output_path: Path,
        _profile_path: Path,
    ) -> None:
        output_path.write_bytes(b"%PDF-1.7\n%%EOF")

    converter = LegacyOfficeConverter(
        resolve_executable=lambda: "/usr/bin/soffice",
        run=run,
    )
    result = asyncio.run(
        converter.convert(format_="vsdx", document=b"visio")
    )

    assert result.target_format == "pdf"
    assert result.document.startswith(b"%PDF-")


@pytest.mark.parametrize("bad_document", [b"", b"not-a-zip"])
def test_converter_rejects_invalid_ooxml_output(bad_document: bytes) -> None:
    async def run(
        _executable: str,
        _source_path: Path,
        output_path: Path,
        _profile_path: Path,
    ) -> None:
        output_path.write_bytes(bad_document)

    converter = LegacyOfficeConverter(
        resolve_executable=lambda: "/usr/bin/soffice",
        run=run,
    )

    with pytest.raises(LegacyOfficeConversionError) as raised:
        asyncio.run(converter.convert(format_="doc", document=b"legacy"))

    assert raised.value.code == "legacy_office_output_invalid"


def test_libreoffice_command_has_no_user_controlled_arguments() -> None:
    command = libreoffice_command(
        executable="/usr/bin/soffice",
        source_path=Path("/tmp/source.doc"),
        output_path=Path("/tmp/output/source.docx"),
        profile_path=Path("/tmp/profile"),
    )

    assert command == (
        "/usr/bin/soffice",
        "--headless",
        "--nologo",
        "--nodefault",
        "--nofirststartwizard",
        "-env:UserInstallation=file:///tmp/profile",
        "--convert-to",
        "docx",
        "--outdir",
        "/tmp/output",
        "/tmp/source.doc",
    )


def test_private_worker_returns_a_stable_unavailable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unavailable(*, format_: str, document: bytes) -> object:
        raise LegacyOfficeConversionError(
            "converter_unavailable",
            "LibreOffice is unavailable. Install LibreOffice and retry.",
        )

    monkeypatch.setattr(
        realmflow_private_worker.legacy_office_converter,
        "convert",
        unavailable,
    )
    try:
        run_worker(
            "office.legacy.convert",
            {
                "sourceFormat": "doc",
                "documentBase64": base64.b64encode(b"legacy").decode("ascii"),
            },
        )
    except LegacyOfficeConversionError as error:
        assert error.code == "converter_unavailable"
        assert str(error) == (
            "LibreOffice is unavailable. Install LibreOffice and retry."
        )
    else:
        raise AssertionError("unavailable converter was accepted")
