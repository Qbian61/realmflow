import base64
import binascii
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.services.knowledge_chunking import CHUNKER_VERSION
from app.services.local_embeddings import (
    EMBEDDING_DIMENSIONS as LOCAL_EMBEDDING_DIMENSIONS,
    MAX_DOCUMENTS as MAX_EMBEDDING_DOCUMENTS,
    MAX_QUERY_CHARACTERS,
    MODEL_NAME as LOCAL_EMBEDDING_MODEL,
    MODEL_REVISION as LOCAL_EMBEDDING_REVISION,
    LocalEmbeddingError,
    LocalEmbeddingService,
)
from app.services.legacy_office_converter import (
    LegacyOfficeConversionError,
    LegacyOfficeConverter,
)
from app.services.document_engine import DocumentEngine, DocumentEngineError
from app.services.office_package_sanitizer import (
    OfficePackageSanitizationError,
    OfficePackageSanitizer,
)
from app.services.presentation_compute import (
    PresentationComputeError,
    PresentationComputeService,
)
from app.services.runs import (
    ReplayCursorExpiredError,
    ResumeTokenConflictError,
    RunService,
    ToolResultConflictError,
)
from app.services.spreadsheet_compute import (
    SpreadsheetComputeError,
    SpreadsheetComputeService,
)
from app.services.spreadsheet_recalculation import (
    SpreadsheetRecalculationError,
    SpreadsheetRecalculationService,
)
from app.services.skill_runtime import (
    SkillNetworkGrant,
    SkillRuntime,
    SkillRuntimeError,
    SkillRuntimeRequest,
)
from app.services.tool_runtime import (
    ToolRuntime,
    ToolRuntimeError,
    ToolRuntimeRequest,
    ToolSandboxManifest,
    ToolSandboxNetworkTarget,
)
from app.services.word_compute import WordComputeError, WordComputeService

router = APIRouter()
run_service = RunService()
skill_runtime = SkillRuntime()
tool_runtime = ToolRuntime()
legacy_office_converter = LegacyOfficeConverter()
office_package_sanitizer = OfficePackageSanitizer()
spreadsheet_compute_service = SpreadsheetComputeService()
spreadsheet_recalculation_service = SpreadsheetRecalculationService()
word_compute_service = WordComputeService()
presentation_compute_service = PresentationComputeService()
document_engine = DocumentEngine()
_local_embedding_service = LocalEmbeddingService(
    Path(__file__).parents[2]
    / "model-assets"
    / "gte-multilingual-base"
)


def get_local_embedding_service() -> LocalEmbeddingService:
    return _local_embedding_service


class ExistingArtifact(BaseModel):
    path: str = Field(min_length=1)
    content: str


class NetworkGatewayGrant(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1)
    token: str = Field(min_length=1)


class GatewayModelExecutionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    providerType: Literal[
        "local",
        "openai_completions",
        "openai_responses",
        "anthropic_messages",
    ]
    modelId: str = Field(min_length=1)
    gateway: NetworkGatewayGrant


ModelExecutionConfig = GatewayModelExecutionConfig


class CreateRunRequest(BaseModel):
    turnGate: bool = False
    requirementId: str = Field(min_length=1)
    requirementTitle: str = Field(min_length=1)
    stageId: Literal[
        "analysis",
        "design",
        "implementation",
        "testing",
        "release",
        "retrospective",
    ] | None = None
    nodeId: str | None = Field(default=None, min_length=1)
    prompt: str | None = Field(default=None, min_length=1)
    reasoning: Literal["off", "low", "medium", "high"] | None = None
    maxOutputTokens: int | None = Field(default=None, ge=1, le=65536)
    artifactPath: str | None = Field(default=None, min_length=1)
    workspaceName: str = Field(min_length=1)
    existingArtifacts: list[ExistingArtifact]
    model: ModelExecutionConfig | None = None
    tools: list[dict[str, object]] = Field(
        default_factory=list,
        max_length=256,
    )
    maxAgentTurns: int = Field(default=180, ge=1, le=180)
    maxParallelToolsPerTurn: int = Field(default=16, ge=1, le=16)
    maxToolCalls: int | None = Field(default=None, ge=1, le=256)


class ConversationToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    arguments: str


class ConversationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant", "tool"]
    content: (
        str
        | list[
            dict[
                Literal[
                    "type",
                    "text",
                    "attachmentId",
                    "mimeType",
                    "dataBase64",
                ],
                str,
            ]
        ]
    )
    toolCalls: list[ConversationToolCall] | None = None
    toolCallId: str | None = Field(default=None, min_length=1)
    name: str | None = Field(default=None, min_length=1)


class PendingToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid")

    callId: str = Field(min_length=1)
    index: int = Field(ge=0)
    name: str = Field(min_length=1)
    arguments: str
    requestId: str = Field(min_length=1)
    toolExecutionId: str = Field(min_length=1)


class CreateConversationRunRequest(BaseModel):
    turnGate: bool = False
    conversationId: str = Field(min_length=1)
    messages: list[ConversationMessage] = Field(min_length=1)
    workspaceId: str | None = Field(default=None, min_length=1)
    folderPath: str | None = Field(default=None, min_length=1)
    context: str | None = Field(default=None, min_length=1)
    reasoning: Literal["off", "low", "medium", "high"] | None = None
    maxOutputTokens: int | None = Field(default=None, ge=1, le=65536)
    model: ModelExecutionConfig | None = None
    tools: list[dict[str, object]] = Field(
        default_factory=list,
        max_length=256,
    )
    maxAgentTurns: int = Field(default=180, ge=1, le=180)
    maxParallelToolsPerTurn: int = Field(default=16, ge=1, le=16)
    maxToolCalls: int | None = Field(default=None, ge=1, le=256)


class ResumeConversationRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    turnGate: bool = False
    resumeToken: str = Field(pattern=r"^[0-9a-f]{64}$")
    conversationId: str = Field(min_length=1)
    messages: list[ConversationMessage] = Field(min_length=1)
    workspaceId: str | None = Field(default=None, min_length=1)
    folderPath: str | None = Field(default=None, min_length=1)
    context: str | None = Field(default=None, min_length=1)
    reasoning: Literal["off", "low", "medium", "high"] | None = None
    maxOutputTokens: int | None = Field(default=None, ge=1, le=65536)
    model: ModelExecutionConfig | None = None
    tools: list[dict[str, object]] = Field(
        default_factory=list,
        max_length=256,
    )
    pendingToolCalls: list[PendingToolCall] = Field(
        default_factory=list,
        max_length=16,
    )
    remainingToolCalls: int | None = Field(default=None, ge=0, le=256)
    maxAgentTurns: int = Field(default=180, ge=1, le=180)
    maxParallelToolsPerTurn: int = Field(default=16, ge=1, le=16)


class SubmitToolResultRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    callId: str = Field(min_length=1)
    status: Literal["completed", "failed"]
    output: dict[str, object] | None = None
    errorCode: str | None = Field(default=None, min_length=1)
    message: str | None = Field(default=None, min_length=1)
    toolExecutionId: str | None = Field(default=None, min_length=1)
    resultSummary: str | None = Field(default=None, min_length=1, max_length=500)
    artifactIds: list[str] | None = None

    @model_validator(mode="after")
    def require_status_payload(self) -> "SubmitToolResultRequest":
        if self.status == "completed" and self.output is None:
            raise ValueError("Completed tool result output is required")
        if self.status == "failed" and (
            self.errorCode is None or self.message is None
        ):
            raise ValueError("Failed tool result error is required")
        return self


class SuspendToolCallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: str = Field(min_length=1)
    toolExecutionId: str = Field(min_length=1)


class KnowledgeDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    documentKey: str = Field(min_length=1)
    content: str


class ChunkKnowledgeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chunkerVersion: Literal[CHUNKER_VERSION]
    documents: list[KnowledgeDocument] = Field(
        min_length=1,
        max_length=MAX_EMBEDDING_DOCUMENTS,
    )


class EmbedQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=MAX_QUERY_CHARACTERS)


class EmbedDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    text: str = Field(min_length=1)


class EmbedDocumentsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    documents: list[EmbedDocument] = Field(
        min_length=1,
        max_length=MAX_EMBEDDING_DOCUMENTS,
    )


class SpreadsheetComputeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["csv", "tsv", "xlsx", "xls"]
    operation: Literal[
        "inspect",
        "read_range",
        "insert_rows",
        "delete_rows",
        "write_range",
        "set_style",
        "set_formula",
        "sort",
        "filter",
        "chart",
    ]
    documentBase64: str = Field(min_length=1, max_length=40_000_000)
    parameters: dict[str, object] = Field(default_factory=dict)


class LegacyOfficeConversionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceFormat: Literal[
        "doc",
        "dot",
        "wps",
        "wpt",
        "xls",
        "xlt",
        "ppt",
        "pps",
        "pot",
    ]
    documentBase64: str = Field(min_length=1, max_length=40_000_000)


class OfficeSafeCopyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceFormat: Literal[
        "dotx",
        "xltx",
        "potx",
        "docm",
        "dotm",
        "xlsm",
        "xltm",
        "pptm",
        "ppsm",
        "potm",
    ]
    documentBase64: str = Field(min_length=1, max_length=40_000_000)


class CreateDocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document: dict[str, object]


class DocumentBytesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    documentBase64: str = Field(min_length=1, max_length=40_000_000)


class VerifyDocumentArtifactRequest(DocumentBytesRequest):
    format: Literal["docx", "pdf"]


class SpreadsheetRecalculationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["xlsx"]
    documentBase64: str = Field(min_length=1, max_length=40_000_000)


class WordComputeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["docx"]
    operation: Literal[
        "inspect",
        "find",
        "insert_blocks",
        "replace_text",
        "update_style",
        "update_layout",
        "table_insert",
        "table_write",
        "comment_add",
        "comment_delete",
    ]
    documentBase64: str = Field(min_length=1, max_length=40_000_000)
    parameters: dict[str, object] = Field(default_factory=dict)


class PresentationComputeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["pptx"]
    operation: Literal[
        "inspect",
        "update_text",
        "replace_image",
        "table_write",
        "chart_write",
        "add_slide",
        "copy_slide",
        "delete_slide",
        "reorder_slide",
        "add_text",
        "add_image",
        "add_table",
        "add_chart",
        "reorder_shape",
        "update_size",
    ]
    documentBase64: str = Field(min_length=1, max_length=40_000_000)
    parameters: dict[str, object] = Field(default_factory=dict)


class SkillConnectorGrant(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$")
    url: str = Field(min_length=1)
    token: str = Field(min_length=1, max_length=1024)

    @field_validator("url")
    @classmethod
    def require_loopback_proxy(cls, value: str) -> str:
        parsed = urlsplit(value)
        if (
            parsed.scheme != "http"
            or parsed.hostname != "127.0.0.1"
            or parsed.port is None
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or not parsed.path.startswith("/v1/skills/connectors/")
        ):
            raise ValueError("Skill Connector grant URL is invalid")
        return value


class ExecuteSkillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    executionId: str = Field(min_length=1)
    entryType: Literal["prompt", "python"]
    packageRoot: Path
    entryPath: Path
    input: dict[str, object]
    capabilities: list[
        Literal[
            "filesystem.read",
            "filesystem.write",
            "process.execute",
            "repository.modify",
        ]
    ]
    scopeRoots: list[Path]
    network: list[SkillConnectorGrant]
    timeoutMs: int = Field(ge=1, le=3_600_000)
    maxMemoryMb: int = Field(ge=16, le=16_384)
    maxOutputBytes: int = Field(ge=1, le=16_777_216)

class SandboxResourcesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timeoutMs: int = Field(ge=1, le=3_600_000)
    maxMemoryMb: int = Field(ge=16, le=16_384)
    maxOutputBytes: int = Field(ge=1, le=16_777_216)


class SandboxNetworkTargetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service: str = Field(min_length=1, max_length=200)
    origin: str = Field(min_length=1)
    pathPrefix: str = Field(min_length=1)


class SandboxManifestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1]
    executionId: str = Field(min_length=1)
    executionLevel: Literal[
        "pure_function",
        "controlled_file",
        "controlled_process",
        "controlled_network",
        "external_side_effect",
    ]
    enforcement: Literal["enforced"]
    platformIsolation: Literal["sandbox-exec", "bwrap"]
    packageRoot: Path
    readOnlyRoots: list[Path]
    readWriteRoots: list[Path]
    environmentVariables: list[
        Literal[
            "LANG",
            "LC_ALL",
            "PYTHONHASHSEED",
            "REALMFLOW_SKILL_CONNECTORS",
            "REALMFLOW_TOOL_CONNECTORS",
        ]
    ]
    networkTargets: list[SandboxNetworkTargetRequest]
    resources: SandboxResourcesRequest
    policyDigest: str = Field(pattern=r"^[a-f0-9]{64}$")


class ExecuteToolRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    executionId: str = Field(min_length=1)
    manifest: SandboxManifestRequest
    runtime: Literal["python", "process"]
    packageRoot: Path
    entryPath: Path
    arguments: list[str] = Field(max_length=1_000)
    input: dict[str, object]
    capabilities: list[
        Literal[
            "filesystem.read",
            "filesystem.write",
            "filesystem.delete",
            "process.discover",
            "process.execute",
            "process.manage",
            "repository.read",
            "repository.modify",
            "realmflow.read",
            "realmflow.write",
            "knowledge.read",
            "knowledge.write",
            "network.connect",
            "connector.use",
            "credential.use",
            "computer.observe",
            "computer.control",
            "clipboard.read",
            "clipboard.write",
        ]
    ]
    scopeRoots: list[Path]
    network: list[SkillConnectorGrant]
    timeoutMs: int = Field(ge=1, le=3_600_000)
    maxMemoryMb: int = Field(ge=16, le=16_384)
    maxOutputBytes: int = Field(ge=1, le=16_777_216)


@router.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "realmflow-agent"}


@router.get("/api/v1/info", tags=["system"])
def info() -> dict[str, str]:
    return {
        "name": "RealmFlow Agent",
        "version": "0.1.0",
        "transport": "HTTP/SSE",
    }


@router.get("/api/v1/sandbox/capabilities", tags=["tools"])
def sandbox_capabilities() -> dict[str, str]:
    return tool_runtime.capabilities()


@router.get("/api/v1/knowledge/model-health", tags=["knowledge"])
def embedding_model_health(
    service: Annotated[
        LocalEmbeddingService,
        Depends(get_local_embedding_service),
    ],
) -> dict[str, object]:
    try:
        return service.model_health()
    except LocalEmbeddingError as error:
        return {
            "status": "unavailable",
            "model": LOCAL_EMBEDDING_MODEL,
            "revision": LOCAL_EMBEDDING_REVISION,
            "dimensions": LOCAL_EMBEDDING_DIMENSIONS,
            "normalize": "L2",
            "runtime": "onnxruntime-cpu",
            "errorCode": error.code,
        }


@router.post("/api/v1/knowledge/embed-query", tags=["knowledge"])
def embed_query(
    request: EmbedQueryRequest,
    service: Annotated[
        LocalEmbeddingService,
        Depends(get_local_embedding_service),
    ],
) -> dict[str, object]:
    try:
        embedding = service.embed_query(request.text)
    except LocalEmbeddingError as error:
        raise _embedding_http_error(error) from error
    return {
        "embeddingModel": LOCAL_EMBEDDING_MODEL,
        "embeddingRevision": LOCAL_EMBEDDING_REVISION,
        "dimensions": LOCAL_EMBEDDING_DIMENSIONS,
        "embedding": embedding,
    }


@router.post("/api/v1/knowledge/chunk-documents", tags=["knowledge"])
def chunk_documents(
    request: ChunkKnowledgeRequest,
    service: Annotated[
        LocalEmbeddingService,
        Depends(get_local_embedding_service),
    ],
) -> dict[str, object]:
    try:
        return service.chunk_documents(
            [document.model_dump() for document in request.documents]
        )
    except LocalEmbeddingError as error:
        raise _embedding_http_error(error) from error
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "chunking_input_invalid",
                "message": "Knowledge chunking input is invalid",
            },
        ) from error


@router.post("/api/v1/knowledge/embed-documents", tags=["knowledge"])
def embed_documents(
    request: EmbedDocumentsRequest,
    service: Annotated[
        LocalEmbeddingService,
        Depends(get_local_embedding_service),
    ],
) -> dict[str, object]:
    ids = [document.id for document in request.documents]
    if len(set(ids)) != len(ids):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "embedding_input_invalid",
                "message": "Embedding input is invalid",
            },
        )
    try:
        embeddings = service.embed_documents(
            [document.text for document in request.documents]
        )
    except LocalEmbeddingError as error:
        raise _embedding_http_error(error) from error
    return {
        "embeddingModel": LOCAL_EMBEDDING_MODEL,
        "embeddingRevision": LOCAL_EMBEDDING_REVISION,
        "dimensions": LOCAL_EMBEDDING_DIMENSIONS,
        "embeddings": [
            {"id": document_id, "embedding": embedding}
            for document_id, embedding in zip(ids, embeddings, strict=True)
        ],
    }


@router.post("/api/v1/office/legacy/convert", tags=["office"])
async def convert_legacy_office(
    request: LegacyOfficeConversionRequest,
) -> dict[str, str]:
    try:
        document = base64.b64decode(request.documentBase64, validate=True)
        result = await legacy_office_converter.convert(
            format_=request.sourceFormat,
            document=document,
        )
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "legacy_office_input_invalid",
                "message": "Legacy Office document encoding is invalid",
            },
        ) from error
    except LegacyOfficeConversionError as error:
        status = 503 if error.code == "converter_unavailable" else 422
        raise HTTPException(
            status_code=status,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "documentBase64": base64.b64encode(result.document).decode("ascii"),
        "outputFormat": result.target_format,
        "converter": result.converter,
    }


@router.post("/api/v1/office/safe-copy", tags=["office"])
def create_safe_office_copy(
    request: OfficeSafeCopyRequest,
) -> dict[str, object]:
    try:
        document = base64.b64decode(request.documentBase64, validate=True)
        result = office_package_sanitizer.sanitize(
            format_=request.sourceFormat,
            document=document,
        )
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "office_safe_copy_input_invalid",
                "message": "Office package encoding is invalid",
            },
        ) from error
    except OfficePackageSanitizationError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "documentBase64": base64.b64encode(result.document).decode("ascii"),
        "outputFormat": result.output_format,
        "macrosRemoved": result.macros_removed,
        "templateMaterialized": result.template_materialized,
        "removedParts": list(result.removed_parts),
    }


@router.post("/api/v1/documents/create", tags=["documents"])
def create_document(request: CreateDocumentRequest) -> dict[str, object]:
    try:
        document = document_engine.create_docx(request.document)
        verification = document_engine.verify(
            document=document,
            format_="docx",
        )
    except DocumentEngineError as error:
        raise _document_http_error(error) from error
    return _document_payload(document, verification)


@router.post("/api/v1/documents/export-pdf", tags=["documents"])
async def export_document_pdf(
    request: DocumentBytesRequest,
) -> dict[str, object]:
    try:
        document = _decode_document(request.documentBase64)
        exported = await document_engine.export_pdf(document)
        verification = document_engine.verify(
            document=exported.document,
            format_="pdf",
        )
    except DocumentEngineError as error:
        raise _document_http_error(error) from error
    return {
        **_document_payload(exported.document, verification),
        "converter": exported.backend,
        "quality": exported.quality,
        "warnings": list(exported.warnings),
    }


@router.post("/api/v1/artifacts/verify", tags=["documents"])
def verify_document_artifact(
    request: VerifyDocumentArtifactRequest,
) -> dict[str, object]:
    try:
        document = _decode_document(request.documentBase64)
        verification = document_engine.verify(
            document=document,
            format_=request.format,
        )
    except DocumentEngineError as error:
        raise _document_http_error(error) from error
    return {
        "valid": verification.valid,
        "format": verification.format,
        "byteSize": verification.byte_size,
        "checksum": verification.checksum,
        "pageCount": verification.page_count,
    }


def _decode_document(value: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise DocumentEngineError(
            "document_input_invalid",
            "Document encoding is invalid",
        ) from error


def _document_payload(document: bytes, verification: object) -> dict[str, object]:
    return {
        "documentBase64": base64.b64encode(document).decode("ascii"),
        "format": verification.format,
        "byteSize": verification.byte_size,
        "checksum": verification.checksum,
        "pageCount": verification.page_count,
    }


def _document_http_error(error: DocumentEngineError) -> HTTPException:
    return HTTPException(
        status_code=(
            503
            if error.code == "document_export_unavailable"
            else 422
        ),
        detail={"code": error.code, "message": str(error)},
    )


@router.post("/api/v1/office/spreadsheets/compute", tags=["office"])
def compute_spreadsheet(
    request: SpreadsheetComputeRequest,
) -> dict[str, object]:
    try:
        document = base64.b64decode(request.documentBase64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "spreadsheet_input_invalid",
                "message": "Spreadsheet document encoding is invalid",
            },
        ) from error
    try:
        result = spreadsheet_compute_service.compute(
            format_=request.format,
            operation=request.operation,
            document=document,
            parameters=request.parameters,
        )
    except SpreadsheetComputeError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "documentBase64": base64.b64encode(result.document).decode("ascii"),
        "result": result.result,
        "modified": result.modified,
        "requiresRecalculation": result.requires_recalculation,
    }


@router.post("/api/v1/office/spreadsheets/recalculate", tags=["office"])
async def recalculate_spreadsheet(
    request: SpreadsheetRecalculationRequest,
) -> dict[str, str]:
    try:
        document = base64.b64decode(request.documentBase64, validate=True)
        recalculated = await spreadsheet_recalculation_service.recalculate(
            document
        )
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "spreadsheet_input_invalid",
                "message": "Spreadsheet document encoding is invalid",
            },
        ) from error
    except SpreadsheetRecalculationError as error:
        raise HTTPException(
            status_code=503,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "documentBase64": base64.b64encode(recalculated).decode("ascii"),
    }


@router.post("/api/v1/office/documents/compute", tags=["office"])
def compute_word_document(
    request: WordComputeRequest,
) -> dict[str, object]:
    try:
        document = base64.b64decode(request.documentBase64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "word_input_invalid",
                "message": "Word document encoding is invalid",
            },
        ) from error
    try:
        result = word_compute_service.compute(
            format_=request.format,
            operation=request.operation,
            document=document,
            parameters=request.parameters,
        )
    except WordComputeError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "documentBase64": base64.b64encode(result.document).decode("ascii"),
        "result": result.result,
        "modified": result.modified,
        "preservationRisk": result.preservation_risk,
    }


@router.post("/api/v1/office/presentations/compute", tags=["office"])
def compute_presentation(
    request: PresentationComputeRequest,
) -> dict[str, object]:
    try:
        document = base64.b64decode(request.documentBase64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "presentation_input_invalid",
                "message": "Presentation document encoding is invalid",
            },
        ) from error
    try:
        result = presentation_compute_service.compute(
            format_=request.format,
            operation=request.operation,
            document=document,
            parameters=request.parameters,
        )
    except PresentationComputeError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "documentBase64": base64.b64encode(result.document).decode("ascii"),
        "result": result.result,
        "modified": result.modified,
        "preservationRisk": result.preservation_risk,
    }


def _embedding_http_error(error: LocalEmbeddingError) -> HTTPException:
    status = (
        422
        if error.code
        in {"embedding_input_invalid", "embedding_limit_exceeded"}
        else 503
    )
    return HTTPException(
        status_code=status,
        detail={"code": error.code, "message": str(error)},
    )


@router.post("/api/v1/runs", tags=["runs"], status_code=201)
async def create_run(
    request: CreateRunRequest | CreateConversationRunRequest,
) -> dict[str, str]:
    run_id = await run_service.create(request.model_dump())
    return {"runId": run_id}


@router.post("/api/v1/runs/resume", tags=["runs"], status_code=201)
async def resume_run(
    request: ResumeConversationRunRequest,
) -> dict[str, str]:
    try:
        run_id = await run_service.resume(request.model_dump(exclude_none=True))
    except ResumeTokenConflictError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "resume_token_conflict",
                "message": str(error),
            },
        ) from error
    return {"runId": run_id}


@router.get("/api/v1/runs/{run_id}/events", tags=["runs"])
async def run_events(
    run_id: str,
    last_event_id: Annotated[
        str | None, Header(alias="Last-Event-ID")
    ] = None,
) -> StreamingResponse:
    try:
        run_service.validate_replay_cursor(run_id, last_event_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ReplayCursorExpiredError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return StreamingResponse(
        run_service.stream(run_id, last_event_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/v1/runs/{run_id}/cancel", tags=["runs"])
async def cancel_run(run_id: str) -> dict[str, str]:
    try:
        status = await run_service.cancel(run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"runId": run_id, "status": status}


class TurnInstruction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user"]
    content: str = Field(min_length=1, max_length=12000)


class AcknowledgeTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    turn: int = Field(ge=1, le=180)
    messages: list[TurnInstruction] = Field(max_length=100)


@router.post("/api/v1/runs/{run_id}/turn", tags=["runs"])
async def acknowledge_turn(run_id: str, request: AcknowledgeTurnRequest) -> dict[str, object]:
    try:
        await run_service.acknowledge_turn(run_id, request.model_dump())
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"runId": run_id, "turn": request.turn, "status": "accepted"}


@router.post("/api/v1/runs/{run_id}/tool-results", tags=["runs"])
async def submit_tool_result(
    run_id: str,
    request: SubmitToolResultRequest,
) -> dict[str, str]:
    try:
        await run_service.submit_tool_result(
            run_id,
            request.model_dump(exclude_none=True),
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ToolResultConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {
        "runId": run_id,
        "callId": request.callId,
        "status": "accepted",
    }


@router.post(
    "/api/v1/runs/{run_id}/tool-calls/{call_id}/suspend",
    tags=["runs"],
)
async def suspend_tool_call(
    run_id: str,
    call_id: str,
    request: SuspendToolCallRequest,
) -> dict[str, str]:
    try:
        await run_service.suspend_tool_call(
            run_id,
            {
                "callId": call_id,
                "requestId": request.requestId,
                "toolExecutionId": request.toolExecutionId,
            },
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ToolResultConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {
        "runId": run_id,
        "callId": call_id,
        "requestId": request.requestId,
        "status": "suspended",
    }


@router.post("/api/v1/skills/execute", tags=["skills"])
async def execute_skill(
    request: ExecuteSkillRequest,
) -> dict[str, object]:
    try:
        result = await skill_runtime.execute(
            SkillRuntimeRequest(
                execution_id=request.executionId,
                entry_type=request.entryType,
                package_root=request.packageRoot,
                entry_path=request.entryPath,
                input=request.input,
                capabilities=tuple(request.capabilities),
                scope_roots=tuple(request.scopeRoots),
                network=tuple(
                    SkillNetworkGrant(
                        service=grant.service,
                        url=grant.url,
                        token=grant.token,
                    )
                    for grant in request.network
                ),
                timeout_ms=request.timeoutMs,
                max_memory_mb=request.maxMemoryMb,
                max_output_bytes=request.maxOutputBytes,
            )
        )
    except SkillRuntimeError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "output": result.output,
        "metrics": {
            "durationMs": result.metrics.duration_ms,
            "outputBytes": result.metrics.output_bytes,
            **(
                {"peakMemoryBytes": result.metrics.peak_memory_bytes}
                if result.metrics.peak_memory_bytes is not None
                else {}
            ),
        },
    }


@router.post(
    "/api/v1/skills/{execution_id}/cancel",
    tags=["skills"],
)
async def cancel_skill(execution_id: str) -> dict[str, object]:
    return {
        "executionId": execution_id,
        "cancelled": await skill_runtime.cancel(execution_id),
    }


@router.post("/api/v1/tools/execute", tags=["tools"])
async def execute_tool(
    request: ExecuteToolRequest,
) -> dict[str, object]:
    try:
        result = await tool_runtime.execute(
            ToolRuntimeRequest(
                execution_id=request.executionId,
                manifest=ToolSandboxManifest(
                    schema_version=request.manifest.schemaVersion,
                    execution_id=request.manifest.executionId,
                    execution_level=request.manifest.executionLevel,
                    enforcement=request.manifest.enforcement,
                    platform_isolation=(
                        request.manifest.platformIsolation
                    ),
                    package_root=request.manifest.packageRoot,
                    read_only_roots=tuple(
                        request.manifest.readOnlyRoots
                    ),
                    read_write_roots=tuple(
                        request.manifest.readWriteRoots
                    ),
                    environment_variables=tuple(
                        request.manifest.environmentVariables
                    ),
                    network_targets=tuple(
                        ToolSandboxNetworkTarget(
                            service=target.service,
                            origin=target.origin,
                            path_prefix=target.pathPrefix,
                        )
                        for target in request.manifest.networkTargets
                    ),
                    timeout_ms=request.manifest.resources.timeoutMs,
                    max_memory_mb=(
                        request.manifest.resources.maxMemoryMb
                    ),
                    max_output_bytes=(
                        request.manifest.resources.maxOutputBytes
                    ),
                    policy_digest=request.manifest.policyDigest,
                ),
                runtime=request.runtime,
                package_root=request.packageRoot,
                entry_path=request.entryPath,
                arguments=tuple(request.arguments),
                input=request.input,
                capabilities=tuple(request.capabilities),
                scope_roots=tuple(request.scopeRoots),
                network=tuple(
                    SkillNetworkGrant(
                        service=grant.service,
                        url=grant.url,
                        token=grant.token,
                    )
                    for grant in request.network
                ),
                timeout_ms=request.timeoutMs,
                max_memory_mb=request.maxMemoryMb,
                max_output_bytes=request.maxOutputBytes,
            )
        )
    except ToolRuntimeError as error:
        raise HTTPException(
            status_code=422,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "output": result.output,
        "metrics": {
            "durationMs": result.metrics.duration_ms,
            "outputBytes": result.metrics.output_bytes,
            **(
                {"peakMemoryBytes": result.metrics.peak_memory_bytes}
                if result.metrics.peak_memory_bytes is not None
                else {}
            ),
        },
    }


@router.post(
    "/api/v1/tools/{execution_id}/cancel",
    tags=["tools"],
)
async def cancel_tool(execution_id: str) -> dict[str, object]:
    return {
        "executionId": execution_id,
        "cancelled": await tool_runtime.cancel(execution_id),
    }
