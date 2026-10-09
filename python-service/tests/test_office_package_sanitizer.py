import base64
import io
import zipfile
from xml.etree import ElementTree

import pytest
from fastapi.testclient import TestClient

from app import create_app
from app.services.office_package_sanitizer import (
    OfficePackageSanitizationError,
    OfficePackageSanitizer,
)


CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

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


@pytest.mark.parametrize(
    ("source_format", "output_format"),
    [
        ("dotx", "docx"),
        ("xltx", "xlsx"),
        ("potx", "pptx"),
    ],
)
def test_materializes_template_as_a_modern_document(
    source_format: str,
    output_format: str,
) -> None:
    result = OfficePackageSanitizer().sanitize(
        format_=source_format,
        document=package(source_format),
    )

    assert result.output_format == output_format
    assert result.macros_removed is False
    assert result.template_materialized is True
    assert result.removed_parts == ()
    assert main_content_type(result.document, output_format) == (
        MODERN_CONTENT_TYPES[output_format]
    )


@pytest.mark.parametrize(
    ("source_format", "output_format"),
    [
        ("docm", "docx"),
        ("dotm", "docx"),
        ("xlsm", "xlsx"),
        ("xltm", "xlsx"),
        ("pptm", "pptx"),
        ("ppsm", "pptx"),
        ("potm", "pptx"),
    ],
)
def test_removes_macro_activex_and_signature_parts(
    source_format: str,
    output_format: str,
) -> None:
    result = OfficePackageSanitizer().sanitize(
        format_=source_format,
        document=package(source_format, executable_parts=True),
    )

    assert result.output_format == output_format
    assert result.macros_removed is True
    assert result.template_materialized is (source_format in {
        "dotm",
        "xltm",
        "potm",
    })
    assert set(result.removed_parts) == {
        "customUI/customUI.xml",
        "word/activeX/activeX1.bin",
        "word/vbaData.xml",
        "word/vbaProject.bin",
        "word/vbaProjectSignature.bin",
    }
    with zipfile.ZipFile(io.BytesIO(result.document)) as archive:
        names = set(archive.namelist())
        assert not set(result.removed_parts) & names
        content_types = archive.read("[Content_Types].xml")
        relationships = archive.read("word/_rels/document.xml.rels")
    assert b"vbaProject" not in content_types
    assert b"activeX" not in content_types
    assert b"vbaProject" not in relationships
    assert b"activeX" not in relationships
    assert main_content_type(result.document, output_format) == (
        MODERN_CONTENT_TYPES[output_format]
    )


@pytest.mark.parametrize("document", [b"", b"not-a-zip"])
def test_rejects_invalid_packages(document: bytes) -> None:
    with pytest.raises(OfficePackageSanitizationError) as raised:
        OfficePackageSanitizer().sanitize(format_="docm", document=document)

    assert raised.value.code == "office_safe_copy_package_invalid"


def test_rejects_a_package_missing_its_required_main_part() -> None:
    with pytest.raises(OfficePackageSanitizationError) as raised:
        OfficePackageSanitizer().sanitize(
            format_="docm",
            document=package("docm", include_main_part=False),
        )

    assert raised.value.code == "office_safe_copy_package_invalid"


def test_endpoint_returns_safety_facts_without_external_execution() -> None:
    response = TestClient(
        create_app(auth_token="session-secret"),
        headers={"Authorization": "Bearer session-secret"},
    ).post(
        "/api/v1/office/safe-copy",
        json={
            "sourceFormat": "docm",
            "documentBase64": base64.b64encode(
                package("docm", executable_parts=True)
            ).decode("ascii"),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["outputFormat"] == "docx"
    assert payload["macrosRemoved"] is True
    assert payload["templateMaterialized"] is False
    assert "word/vbaProject.bin" in payload["removedParts"]


def package(
    source_format: str,
    *,
    executable_parts: bool = False,
    include_main_part: bool = True,
) -> bytes:
    output_format = {
        "dotx": "docx",
        "docm": "docx",
        "dotm": "docx",
        "xltx": "xlsx",
        "xlsm": "xlsx",
        "xltm": "xlsx",
        "potx": "pptx",
        "pptm": "pptx",
        "ppsm": "pptx",
        "potm": "pptx",
    }[source_format]
    main_part = MAIN_PARTS[output_format]
    main_content_type = {
        "dotx": "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml",
        "docm": "application/vnd.ms-word.document.macroEnabled.main+xml",
        "dotm": "application/vnd.ms-word.template.macroEnabledTemplate.main+xml",
        "xltx": "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml",
        "xlsm": "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
        "xltm": "application/vnd.ms-excel.template.macroEnabled.main+xml",
        "potx": "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml",
        "pptm": "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml",
        "ppsm": "application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml",
        "potm": "application/vnd.ms-powerpoint.template.macroEnabled.main+xml",
    }[source_format]
    types = ElementTree.Element(f"{{{CONTENT_TYPES_NS}}}Types")
    ElementTree.SubElement(
        types,
        f"{{{CONTENT_TYPES_NS}}}Override",
        PartName=f"/{main_part}",
        ContentType=main_content_type,
    )
    if executable_parts:
        for part_name, content_type in [
            (
                "/word/vbaProject.bin",
                "application/vnd.ms-office.vbaProject",
            ),
            (
                "/word/vbaData.xml",
                "application/vnd.ms-word.vbaData+xml",
            ),
            (
                "/word/vbaProjectSignature.bin",
                "application/vnd.ms-office.vbaProjectSignature",
            ),
            (
                "/word/activeX/activeX1.bin",
                "application/vnd.ms-office.activeX",
            ),
            (
                "/customUI/customUI.xml",
                "application/vnd.ms-office.customUI+xml",
            ),
        ]:
            ElementTree.SubElement(
                types,
                f"{{{CONTENT_TYPES_NS}}}Override",
                PartName=part_name,
                ContentType=content_type,
            )

    relationships = ElementTree.Element(
        f"{{{RELATIONSHIPS_NS}}}Relationships"
    )
    if executable_parts:
        for index, target in enumerate(
            [
                "vbaProject.bin",
                "vbaData.xml",
                "vbaProjectSignature.bin",
                "activeX/activeX1.bin",
                "../../customUI/customUI.xml",
            ],
            start=1,
        ):
            ElementTree.SubElement(
                relationships,
                f"{{{RELATIONSHIPS_NS}}}Relationship",
                Id=f"rId{index}",
                Type=(
                    "http://schemas.microsoft.com/office/2006/relationships/"
                    + ("activeXControl" if "activeX" in target else "vbaProject")
                ),
                Target=target,
            )

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            ElementTree.tostring(types, encoding="utf-8", xml_declaration=True),
        )
        if include_main_part:
            archive.writestr(main_part, "<root/>")
        archive.writestr(
            "word/_rels/document.xml.rels",
            ElementTree.tostring(
                relationships,
                encoding="utf-8",
                xml_declaration=True,
            ),
        )
        if executable_parts:
            for name in [
                "word/vbaProject.bin",
                "word/vbaData.xml",
                "word/vbaProjectSignature.bin",
                "word/activeX/activeX1.bin",
                "customUI/customUI.xml",
            ]:
                archive.writestr(name, b"executable")
    return output.getvalue()


def main_content_type(document: bytes, output_format: str) -> str:
    with zipfile.ZipFile(io.BytesIO(document)) as archive:
        root = ElementTree.fromstring(archive.read("[Content_Types].xml"))
    part_name = f"/{MAIN_PARTS[output_format]}"
    for child in root:
        if child.attrib.get("PartName") == part_name:
            return child.attrib["ContentType"]
    raise AssertionError("main content type is missing")
