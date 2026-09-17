import json

from fastapi.testclient import TestClient

from app import create_app
from app.api.routes import CreateRunRequest


RUN_INPUT = {
    "requirementId": "requirement-1",
    "requirementTitle": "Checkout",
    "stageId": "analysis",
    "workspaceName": "shop",
    "existingArtifacts": [],
}


def authenticated_client() -> TestClient:
    return TestClient(
        create_app(auth_token="session-secret"),
        headers={"Authorization": "Bearer session-secret"},
    )


def read_events(client: TestClient, run_id: str, last_event_id: str | None = None):
    headers = {"Last-Event-ID": last_event_id} if last_event_id else {}
    with client.stream(
        "GET", f"/api/v1/runs/{run_id}/events", headers=headers
    ) as response:
        assert response.status_code == 200
        events = []
        for line in response.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line.removeprefix("data: ")))
        return events


def test_run_stream_has_monotonic_events_and_one_terminal() -> None:
    with authenticated_client() as client:
        created = client.post("/api/v1/runs", json=RUN_INPUT)
        assert created.status_code == 201

        events = read_events(client, created.json()["runId"])

    sequences = [event["sequence"] for event in events]
    assert sequences == sorted(set(sequences))
    assert events[0]["type"] == "run.started"
    assert "run.progress" in [event["type"] for event in events]
    assert "content.delta" in [event["type"] for event in events]
    assert "heartbeat" in [event["type"] for event in events]
    assert [event["type"] for event in events][-2:] == [
        "artifact.ready",
        "run.completed",
    ]
    assert events[-1]["data"] == {
        "usage": {
            "inputTokens": 0,
            "outputTokens": 0,
            "cachedTokens": 0,
            "reasoningTokens": 0,
        },
        "firstTokenLatencyMs": 0,
        "durationMs": 0,
        "retryCount": 0,
    }
    assert sum(
        event["type"] in {"run.completed", "run.failed", "run.cancelled"}
        for event in events
    ) == 1
    assert all(
        {"id", "runId", "sequence", "type", "timestamp", "data"} <= event.keys()
        for event in events
    )


def test_event_stream_replays_only_events_after_last_event_id() -> None:
    with authenticated_client() as client:
        run_id = client.post("/api/v1/runs", json=RUN_INPUT).json()["runId"]
        events = read_events(client, run_id)

        replayed = read_events(client, run_id, events[2]["id"])

    assert replayed
    assert all(event["sequence"] > events[2]["sequence"] for event in replayed)
    assert replayed[-1]["type"] == "run.completed"


def test_cancel_is_idempotent_and_produces_only_cancelled_terminal() -> None:
    with authenticated_client() as client:
        run_id = client.post("/api/v1/runs", json=RUN_INPUT).json()["runId"]

        first = client.post(f"/api/v1/runs/{run_id}/cancel")
        second = client.post(f"/api/v1/runs/{run_id}/cancel")
        events = read_events(client, run_id)

    assert first.status_code == 200
    assert second.status_code == 200
    terminal = [
        event
        for event in events
        if event["type"] in {"run.completed", "run.failed", "run.cancelled"}
    ]
    assert [event["type"] for event in terminal] == ["run.cancelled"]


def test_create_run_request_accepts_only_main_gateway_model_configuration():
    request = CreateRunRequest.model_validate(
        {
            **RUN_INPUT,
            "model": {
                "providerType": "openai_compatible",
                "modelId": "example-model",
                "gateway": {
                    "url": (
                        "http://127.0.0.1:43210"
                        "/v1/model/chat-completions"
                    ),
                    "token": "one-time-grant",
                },
            },
        }
    )

    assert request.model is not None
    assert request.model.modelId == "example-model"
    assert request.model.gateway.token == "one-time-grant"
    assert "apiKey" not in request.model.model_dump()
    assert "baseUrl" not in request.model.model_dump()


def test_custom_node_run_uses_explicit_artifact_path() -> None:
    with authenticated_client() as client:
        created = client.post(
            "/api/v1/runs",
            json={
                "requirementId": "requirement-1",
                "requirementTitle": "Checkout",
                "nodeId": "custom-security",
                "workspaceName": "shop",
                "prompt": "Review predecessor artifacts for security risks.",
                "artifactPath": "artifacts/security-review.md",
                "existingArtifacts": [],
            },
        )
        assert created.status_code == 201

        events = read_events(client, created.json()["runId"])

    artifact = next(event for event in events if event["type"] == "artifact.ready")
    assert artifact["data"]["artifact"]["path"] == "artifacts/security-review.md"


def test_conversation_run_streams_content_without_artifact_event() -> None:
    with authenticated_client() as client:
        created = client.post(
            "/api/v1/runs",
            json={
                "conversationId": "conversation-1",
                "folderPath": "/tmp/task",
                "messages": [{"role": "user", "content": "Hello"}],
            },
        )
        assert created.status_code == 201

        events = read_events(client, created.json()["runId"])

    event_types = [event["type"] for event in events]
    assert "content.delta" in event_types
    assert "artifact.ready" not in event_types
    assert event_types[-1] == "run.completed"
