import asyncio
import base64
import io
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app
from app.services.spreadsheet_recalculation import (
    SpreadsheetRecalculationError,
    SpreadsheetRecalculationService,
)


def minimal_xlsx() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            """<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""",
        )
        archive.writestr(
            "_rels/.rels",
            """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/workbook.xml",
            """<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            """<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>1+1</f><v></v></c></row></sheetData></worksheet>""",
        )
    return output.getvalue()


def test_recalculation_reports_a_stable_error_without_libreoffice() -> None:
    service = SpreadsheetRecalculationService(resolve_executable=lambda: None)

    with pytest.raises(SpreadsheetRecalculationError) as raised:
        asyncio.run(service.recalculate(minimal_xlsx()))

    assert raised.value.code == "spreadsheet_recalculation_unavailable"


def test_recalculation_validates_and_returns_the_converted_workbook() -> None:
    source = minimal_xlsx()

    async def run(_executable: str, input_path: Path, output_path: Path) -> None:
        output_path.write_bytes(input_path.read_bytes())

    service = SpreadsheetRecalculationService(
        resolve_executable=lambda: "/usr/bin/soffice",
        run=run,
    )

    assert asyncio.run(service.recalculate(source)) == source


def test_recalculation_endpoint_returns_a_stable_unavailable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unavailable(_document: bytes) -> bytes:
        raise SpreadsheetRecalculationError(
            "spreadsheet_recalculation_unavailable",
            "LibreOffice recalculation is unavailable",
        )

    from app.api import routes

    monkeypatch.setattr(
        routes.spreadsheet_recalculation_service,
        "recalculate",
        unavailable,
    )
    response = TestClient(
        create_app(auth_token="session-secret"),
        headers={"Authorization": "Bearer session-secret"},
    ).post(
        "/api/v1/office/spreadsheets/recalculate",
        json={
            "format": "xlsx",
            "documentBase64": base64.b64encode(minimal_xlsx()).decode("ascii"),
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == (
        "spreadsheet_recalculation_unavailable"
    )
