import base64
import io
import zipfile

from fastapi.testclient import TestClient

from app import create_app


def client() -> TestClient:
    return TestClient(
        create_app(auth_token="session-secret"),
        headers={"Authorization": "Bearer session-secret"},
    )


def compute(
    operation: str,
    parameters: dict[str, object] | None = None,
    document: bytes | None = None,
) -> dict[str, object]:
    response = client().post(
        "/api/v1/office/documents/compute",
        json={
            "format": "docx",
            "operation": operation,
            "documentBase64": base64.b64encode(
                document or docx_fixture()
            ).decode("ascii"),
            "parameters": parameters or {},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def decoded(payload: dict[str, object]) -> bytes:
    return base64.b64decode(str(payload["documentBase64"]))


def test_inspects_blocks_sections_and_structural_features_in_order() -> None:
    payload = compute("inspect")

    assert payload["modified"] is False
    assert payload["preservationRisk"] == []
    assert payload["result"] == {
        "format": "docx",
        "blocks": [
            {
                "id": "paragraph-1",
                "type": "heading",
                "level": 1,
                "text": "Profile",
                "style": "Heading 1",
            },
            {
                "id": "paragraph-2",
                "type": "paragraph",
                "text": "Backend engineer",
                "style": "Normal",
            },
            {
                "id": "paragraph-3",
                "type": "list_item",
                "level": 0,
                "text": "TypeScript",
                "style": "List Bullet",
            },
            {
                "id": "table-1",
                "type": "table",
                "rows": [["Skill", "Years"], ["TypeScript", "8"]],
            },
        ],
        "sections": [
            {
                "id": "section-1",
                "widthPt": 612.0,
                "heightPt": 792.0,
                "orientation": "portrait",
                "header": "RealmFlow",
                "footer": "Confidential",
            }
        ],
        "images": [],
        "comments": [],
        "bookmarks": [],
    }


def test_finds_and_replaces_text_across_runs_without_restyling_other_paragraphs() -> None:
    found = compute("find", {"query": "Backend engineer"})
    assert found["result"]["matches"] == [
        {
            "blockId": "paragraph-2",
            "start": 0,
            "end": 16,
            "text": "Backend engineer",
        }
    ]

    replaced = compute(
        "replace_text",
        {"query": "Backend engineer", "replacement": "Platform architect"},
    )
    inspection = compute("inspect", document=decoded(replaced))
    assert inspection["result"]["blocks"][1] == {
        "id": "paragraph-2",
        "type": "paragraph",
        "text": "Platform architect",
        "style": "Normal",
    }


def test_inserts_markdown_as_headings_lists_links_and_tables() -> None:
    inserted = compute(
        "insert_blocks",
        {
            "afterBlockId": "paragraph-3",
            "markdown": (
                "## Delivery\n"
                "- Local first\n"
                "[RealmFlow](https://realmflow.local)\n\n"
                "| Item | State |\n"
                "| --- | --- |\n"
                "| DOCX | Ready |"
            ),
        },
    )
    inspection = compute("inspect", document=decoded(inserted))
    blocks = inspection["result"]["blocks"]

    assert [block["type"] for block in blocks] == [
        "heading",
        "paragraph",
        "list_item",
        "heading",
        "list_item",
        "paragraph",
        "table",
        "table",
    ]
    assert blocks[3]["text"] == "Delivery"
    assert blocks[5]["text"] == "RealmFlow"
    assert blocks[6]["rows"] == [["Item", "State"], ["DOCX", "Ready"]]


def test_updates_paragraph_style_table_content_and_page_layout() -> None:
    styled = compute(
        "update_style",
        {
            "blockId": "paragraph-2",
            "style": {"styleName": "Quote", "bold": True, "italic": True},
        },
    )
    tabled = compute(
        "table_write",
        {
            "tableId": "table-1",
            "startRow": 2,
            "startColumn": 2,
            "values": [["10"]],
        },
        decoded(styled),
    )
    laid_out = compute(
        "update_layout",
        {
            "sectionId": "section-1",
            "widthPt": 792,
            "heightPt": 612,
            "header": "Updated header",
            "footer": "Updated footer",
        },
        decoded(tabled),
    )
    inspection = compute("inspect", document=decoded(laid_out))

    assert inspection["result"]["blocks"][1]["style"] == "Quote"
    assert inspection["result"]["blocks"][-1]["rows"][1][1] == "10"
    assert inspection["result"]["sections"][0] == {
        "id": "section-1",
        "widthPt": 792.0,
        "heightPt": 612.0,
        "orientation": "landscape",
        "header": "Updated header",
        "footer": "Updated footer",
    }


def test_inserts_a_table_and_adds_then_deletes_a_comment() -> None:
    inserted = compute(
        "table_insert",
        {
            "afterBlockId": "paragraph-2",
            "rows": [["Owner", "State"], ["RealmFlow", "Ready"]],
        },
    )
    commented = compute(
        "comment_add",
        {
            "blockId": "paragraph-2",
            "text": "Verify wording",
            "author": "RealmFlow",
        },
        decoded(inserted),
    )
    inspection = compute("inspect", document=decoded(commented))

    assert inspection["result"]["comments"] == [
        {
            "id": "0",
            "author": "RealmFlow",
            "text": "Verify wording",
            "blockId": "paragraph-2",
        }
    ]
    deleted = compute(
        "comment_delete",
        {"commentId": "0"},
        decoded(commented),
    )
    assert compute("inspect", document=decoded(deleted))["result"]["comments"] == []


def test_reports_unsupported_ooxml_as_preservation_risk() -> None:
    inspected = compute("inspect", document=docx_fixture(include_text_box=True))

    assert inspected["preservationRisk"] == [
        {
            "code": "word_text_box_unsupported",
            "message": "Text boxes may not be preserved",
            "part": "word/document.xml",
        }
    ]


def test_rejects_invalid_document_encoding_with_stable_error() -> None:
    response = client().post(
        "/api/v1/office/documents/compute",
        json={
            "format": "docx",
            "operation": "inspect",
            "documentBase64": "***",
            "parameters": {},
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "word_input_invalid"


def docx_fixture(*, include_text_box: bool = False) -> bytes:
    output = io.BytesIO()
    text_box = (
        "<w:txbxContent><w:p><w:r><w:t>Risk</w:t></w:r></w:p></w:txbxContent>"
        if include_text_box
        else ""
    )
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>""",
        )
        archive.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "word/_rels/document.xml.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "word/styles.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
</w:styles>""",
        )
        archive.writestr(
            "word/numbering.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>""",
        )
        archive.writestr(
            "word/header1.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>RealmFlow</w:t></w:r></w:p></w:hdr>""",
        )
        archive.writestr(
            "word/footer1.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Confidential</w:t></w:r></w:p></w:ftr>""",
        )
        archive.writestr(
            "word/document.xml",
            f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Profile</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Backend </w:t></w:r><w:r><w:t>engineer</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>TypeScript</w:t></w:r></w:p>
    <w:tbl>
      <w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="2000"/></w:tblGrid>
      <w:tr><w:tc><w:p><w:r><w:t>Skill</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Years</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>TypeScript</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>8</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    {text_box}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      <w:footerReference w:type="default" r:id="rId4" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      <w:pgSz w:w="12240" w:h="15840"/>
    </w:sectPr>
  </w:body>
</w:document>""",
        )
    return output.getvalue()
