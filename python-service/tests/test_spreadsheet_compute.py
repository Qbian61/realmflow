import base64
import csv
import io
import zipfile

from fastapi.testclient import TestClient

from app import create_app


def client() -> TestClient:
    return TestClient(
        create_app(auth_token="session-secret"),
        headers={"Authorization": "Bearer session-secret"},
    )


def encoded(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def decoded(response: dict[str, object]) -> str:
    return base64.b64decode(str(response["documentBase64"])).decode("utf-8")


def compute(
    *,
    format_: str = "csv",
    operation: str,
    text: str,
    parameters: dict[str, object] | None = None,
) -> dict[str, object]:
    response = client().post(
        "/api/v1/office/spreadsheets/compute",
        json={
            "format": format_,
            "operation": operation,
            "documentBase64": encoded(text),
            "parameters": parameters or {},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def compute_bytes(
    *,
    operation: str,
    document: bytes,
    parameters: dict[str, object] | None = None,
) -> dict[str, object]:
    response = client().post(
        "/api/v1/office/spreadsheets/compute",
        json={
            "format": "xlsx",
            "operation": operation,
            "documentBase64": base64.b64encode(document).decode("ascii"),
            "parameters": parameters or {},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def xlsx_fixture() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""",
        )
        archive.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Data" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Metric</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Count</t></is></c><c r="B2"><v>12</v></c><c r="C2"><f>B2*2</f><v></v></c></row>
  </sheetData>
  <mergeCells count="1"><mergeCell ref="A3:B3"/></mergeCells>
</worksheet>""",
        )
        archive.writestr(
            "xl/worksheets/sheet2.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Raw</t></is></c></row></sheetData>
</worksheet>""",
        )
    return output.getvalue()


def test_inspects_csv_shape_and_typed_values() -> None:
    result = compute(
        operation="inspect",
        text="name,count,active\nRealmFlow,12,true\n",
    )

    assert result["modified"] is False
    assert result["result"] == {
        "format": "csv",
        "sheets": [
            {
                "name": "Sheet1",
                "maxRow": 2,
                "maxColumn": 3,
                "usedRange": "A1:C2",
                "mergedRanges": [],
                "frozenPane": None,
                "charts": [],
            }
        ],
        "hasFormulas": False,
        "hasExternalLinks": False,
        "hasMacros": False,
    }


def test_reads_a_typed_range_without_losing_dates_or_formulas() -> None:
    result = compute(
        operation="read_range",
        text="name,count,date,formula\nRealmFlow,12,2026-10-07,=B2*2\n",
        parameters={"range": "A1:D2"},
    )

    assert result["result"]["rows"] == [
        [
            {"address": "A1", "value": "name", "valueType": "string"},
            {"address": "B1", "value": "count", "valueType": "string"},
            {"address": "C1", "value": "date", "valueType": "string"},
            {"address": "D1", "value": "formula", "valueType": "string"},
        ],
        [
            {"address": "A2", "value": "RealmFlow", "valueType": "string"},
            {"address": "B2", "value": 12, "valueType": "number"},
            {"address": "C2", "value": "2026-10-07", "valueType": "date"},
            {
                "address": "D2",
                "value": None,
                "valueType": "formula",
                "formula": "=B2*2",
            },
        ],
    ]


def test_batch_writes_and_inserts_rows_in_one_compute_call() -> None:
    written = compute(
        operation="write_range",
        text="name,count\nOld,1\n",
        parameters={
            "range": "A2:B3",
            "values": [["RealmFlow", 12], ["Local", 3]],
        },
    )
    assert written["modified"] is True
    assert written["result"] == {"range": "A2:B3", "cellsWritten": 4}

    inserted = compute(
        operation="insert_rows",
        text=decoded(written),
        parameters={"startRow": 2, "count": 1},
    )
    rows = list(csv.reader(io.StringIO(decoded(inserted))))
    assert rows == [
        ["name", "count"],
        ["", ""],
        ["RealmFlow", "12"],
        ["Local", "3"],
    ]


def test_sorts_rows_and_applies_a_filter_definition() -> None:
    sorted_result = compute(
        operation="sort",
        text="name,count\nB,2\nA,3\nC,1\n",
        parameters={
            "range": "A2:B4",
            "keys": [{"column": 2, "direction": "descending"}],
        },
    )
    assert list(csv.reader(io.StringIO(decoded(sorted_result)))) == [
        ["name", "count"],
        ["A", "3"],
        ["B", "2"],
        ["C", "1"],
    ]

    filtered = compute(
        operation="filter",
        text=decoded(sorted_result),
        parameters={
            "range": "A1:B4",
            "column": 1,
            "operator": "equals",
            "value": "B",
        },
    )
    assert filtered["result"] == {
        "range": "A1:B4",
        "matchedRows": [3],
    }
    assert filtered["modified"] is True


def test_inspects_xlsx_sheets_merges_freeze_panes_and_formulas() -> None:
    result = compute_bytes(operation="inspect", document=xlsx_fixture())

    assert result["result"] == {
        "format": "xlsx",
        "sheets": [
            {
                "name": "Summary",
                "maxRow": 3,
                "maxColumn": 3,
                "usedRange": "A1:C3",
                "mergedRanges": ["A3:B3"],
                "frozenPane": "A2",
                "charts": [],
            },
            {
                "name": "Data",
                "maxRow": 1,
                "maxColumn": 1,
                "usedRange": "A1:A1",
                "mergedRanges": [],
                "frozenPane": None,
                "charts": [],
            },
        ],
        "hasFormulas": True,
        "hasExternalLinks": False,
        "hasMacros": False,
    }


def test_reads_and_mutates_xlsx_with_typed_cells() -> None:
    read = compute_bytes(
        operation="read_range",
        document=xlsx_fixture(),
        parameters={"sheet": "Summary", "range": "A1:C2"},
    )
    assert read["result"]["rows"][1] == [
        {"address": "A2", "value": "Count", "valueType": "string"},
        {
            "address": "B2",
            "value": 12,
            "valueType": "number",
            "numberFormat": "General",
        },
        {
            "address": "C2",
            "value": None,
            "valueType": "formula",
            "formula": "=B2*2",
            "numberFormat": "General",
        },
    ]

    styled = compute_bytes(
        operation="set_style",
        document=xlsx_fixture(),
        parameters={
            "sheet": "Summary",
            "range": "A1:C1",
            "style": {
                "font": {"bold": True, "color": "FFFFFF"},
                "fill": {"color": "1F6F54"},
                "alignment": {"horizontal": "center"},
            },
        },
    )
    formula = compute_bytes(
        operation="set_formula",
        document=base64.b64decode(str(styled["documentBase64"])),
        parameters={
            "sheet": "Summary",
            "range": "C2:C2",
            "formulas": [["=B2*3"]],
        },
    )
    assert formula["requiresRecalculation"] is True
    read_back = compute_bytes(
        operation="read_range",
        document=base64.b64decode(str(formula["documentBase64"])),
        parameters={"sheet": "Summary", "range": "A1:C2"},
    )
    assert read_back["result"]["rows"][0][0]["style"]["font"]["bold"] is True
    assert read_back["result"]["rows"][1][2]["formula"] == "=B2*3"


def test_adds_a_chart_and_preserves_it_when_rows_are_inserted() -> None:
    charted = compute_bytes(
        operation="chart",
        document=xlsx_fixture(),
        parameters={
            "sheet": "Summary",
            "type": "bar",
            "title": "Metrics",
            "dataRange": "B1:B2",
            "categoryRange": "A2:A2",
            "anchor": "E2",
        },
    )
    inserted = compute_bytes(
        operation="insert_rows",
        document=base64.b64decode(str(charted["documentBase64"])),
        parameters={"sheet": "Summary", "startRow": 2, "count": 1},
    )
    inspected = compute_bytes(
        operation="inspect",
        document=base64.b64decode(str(inserted["documentBase64"])),
    )

    assert inspected["result"]["sheets"][0]["charts"] == [
        {"type": "bar", "title": "Metrics", "anchor": "E3"}
    ]
