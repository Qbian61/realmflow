from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.services.runs import RunService

router = APIRouter()
run_service = RunService()


class ExistingArtifact(BaseModel):
    path: str = Field(min_length=1)
    content: str


class NetworkGatewayGrant(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1)
    token: str = Field(min_length=1)


class LocalModelExecutionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    providerType: Literal["local"]
    modelId: str = Field(min_length=1)


class GatewayModelExecutionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    providerType: Literal["openai_compatible"]
    modelId: str = Field(min_length=1)
    gateway: NetworkGatewayGrant


ModelExecutionConfig = Annotated[
    LocalModelExecutionConfig | GatewayModelExecutionConfig,
    Field(discriminator="providerType"),
]


class CreateRunRequest(BaseModel):
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
    artifactPath: str | None = Field(default=None, min_length=1)
    workspaceName: str = Field(min_length=1)
    existingArtifacts: list[ExistingArtifact]
    model: ModelExecutionConfig | None = None


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant", "tool"]
    content: str


class CreateConversationRunRequest(BaseModel):
    conversationId: str = Field(min_length=1)
    messages: list[ConversationMessage] = Field(min_length=1)
    workspaceId: str | None = Field(default=None, min_length=1)
    folderPath: str | None = Field(default=None, min_length=1)
    model: ModelExecutionConfig | None = None


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


@router.post("/api/v1/runs", tags=["runs"], status_code=201)
async def create_run(
    request: CreateRunRequest | CreateConversationRunRequest,
) -> dict[str, str]:
    run_id = await run_service.create(request.model_dump())
    return {"runId": run_id}


@router.get("/api/v1/runs/{run_id}/events", tags=["runs"])
async def run_events(
    run_id: str,
    last_event_id: Annotated[
        str | None, Header(alias="Last-Event-ID")
    ] = None,
) -> StreamingResponse:
    try:
        run_service.require(run_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
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
