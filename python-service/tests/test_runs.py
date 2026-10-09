import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import create_app
from app.api.routes import CreateRunRequest
from app.services import providers
from app.services.providers import (
    ProviderDelta,
    ProviderReference,
    ProviderResult,
    ProviderSummaryDelta,
    ProviderToolCall,
    ProviderUsage,
)
from app.services.runs import (
    DEFAULT_PROVIDER_TIMEOUT_SECONDS,
    ResumeTokenConflictError,
    RunService,
)


RUN_INPUT = {
    "requirementId": "requirement-1",
    "requirementTitle": "Checkout",
    "stageId": "analysis",
    "workspaceName": "shop",
    "existingArtifacts": [],
}


def test_default_provider_timeout_allows_long_running_agent_turns():
    assert DEFAULT_PROVIDER_TIMEOUT_SECONDS == 30 * 60


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
    assert "answer.delta" in [event["type"] for event in events]
    assert "heartbeat" in [event["type"] for event in events]
    assert [event["type"] for event in events][-2:] == [
        "artifact.ready",
        "run.completed",
    ]
    assert events[-1]["data"] == {
        "agentTurn": 1,
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


def test_conversation_run_accepts_plain_assistant_history() -> None:
    request = {
        "conversationId": "conversation-follow-up",
        "messages": [
            {"role": "user", "content": "First question"},
            {"role": "assistant", "content": "First answer"},
            {"role": "user", "content": "Follow-up question"},
        ],
    }
    with authenticated_client() as client:
        created = client.post("/api/v1/runs", json=request)
        assert created.status_code == 201

        events = read_events(client, created.json()["runId"])

    assert events[-1]["type"] == "run.completed"
    assert all(event["type"] != "run.failed" for event in events)


def test_resume_route_is_idempotent_and_rejects_token_conflicts() -> None:
    request = {
        "resumeToken": "c" * 64,
        "conversationId": "conversation-resume",
        "messages": [{"role": "user", "content": "Continue"}],
        "remainingToolCalls": 2,
        "tools": [],
    }
    with authenticated_client() as client:
        first = client.post("/api/v1/runs/resume", json=request)
        repeated = client.post("/api/v1/runs/resume", json=request)
        conflict = client.post(
            "/api/v1/runs/resume",
            json={
                **request,
                "messages": [{"role": "user", "content": "Changed"}],
            },
        )

    assert first.status_code == 201
    assert repeated.status_code == 201
    assert repeated.json() == first.json()
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "resume_token_conflict"


def test_run_service_emits_provider_delta_before_provider_completion():
    async def execute():
        service = RunService()
        release = asyncio.Event()

        async def stream_provider(_request):
            yield ProviderDelta("first")
            await release.wait()
            yield ProviderDelta(" second")
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=2, output_tokens=2),
                first_token_latency_ms=3,
                duration_ms=4,
            )

        async def reject_buffered_generation(_request):
            raise AssertionError("buffered generation must not be used")

        service._stream_provider = stream_provider
        service._generate = reject_buffered_generation
        run_id = await service.create(RUN_INPUT)
        stream = service.stream(run_id, None)
        observed = []
        while True:
            frame = await asyncio.wait_for(anext(stream), timeout=1)
            payload = json.loads(
                next(
                    line.removeprefix("data: ")
                    for line in frame.splitlines()
                    if line.startswith("data: ")
                )
            )
            observed.append(payload)
            if payload["type"] == "answer.delta":
                break
        assert observed[-1]["data"] == {"delta": "first"}
        assert service.require(run_id).terminal_type is None

        release.set()
        async for frame in stream:
            payload = json.loads(
                next(
                    line.removeprefix("data: ")
                    for line in frame.splitlines()
                    if line.startswith("data: ")
                )
            )
            observed.append(payload)
        return observed

    events = asyncio.run(execute())

    assert [
        event["data"]["delta"]
        for event in events
        if event["type"] == "answer.delta"
    ] == ["first", " second"]
    assert events[-1]["type"] == "run.completed"
    assert events[-1]["data"]["usage"]["outputTokens"] == 2


def test_run_service_resumes_from_main_rebuilt_messages_and_turn_budget():
    async def execute():
        service = RunService()
        requests = []

        async def stream_provider(request):
            requests.append(request)
            yield ProviderDelta("Resumed")
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=4, output_tokens=1),
                first_token_latency_ms=1,
                duration_ms=2,
            )

        service._stream_provider = stream_provider
        request = {
            "resumeToken": "a" * 64,
            "conversationId": "conversation-1",
            "messages": [
                {"role": "user", "content": "Read status"},
                {
                    "role": "assistant",
                    "content": "",
                    "toolCalls": [
                        {
                            "id": "call-1",
                            "name": "lookup",
                            "arguments": "{}",
                        }
                    ],
                },
                {
                    "role": "tool",
                    "content": '{"status":"ready"}',
                    "toolCallId": "call-1",
                    "name": "lookup",
                },
            ],
            "maxAgentTurns": 180,
            "maxParallelToolsPerTurn": 16,
        }
        first = await service.resume(request)
        repeated = await service.resume(dict(request))
        events = []
        async for frame in service.stream(first, None):
            events.append(frame)
        return first, repeated, requests, events

    first, repeated, requests, events = asyncio.run(execute())

    assert repeated == first
    assert len(requests) == 1
    assert requests[0]["maxAgentTurns"] == 180
    assert requests[0]["maxParallelToolsPerTurn"] == 16
    assert requests[0]["messages"][1]["toolCalls"][0]["id"] == "call-1"
    assert requests[0]["messages"][2]["toolCallId"] == "call-1"
    assert any('"type":"run.completed"' in frame for frame in events)


def test_run_service_restores_suspended_tool_call_without_reinvoking_model():
    async def execute():
        service = RunService()
        requests = []

        async def stream_provider(request):
            requests.append(request)
            yield ProviderDelta("Finished after approval")
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=2, output_tokens=1),
                first_token_latency_ms=1,
                duration_ms=2,
            )

        service._stream_provider = stream_provider
        run_id = await service.resume(
            {
                "resumeToken": "d" * 64,
                "conversationId": "conversation-pending",
                "messages": [
                    {"role": "user", "content": "Write the result"},
                    {
                        "role": "assistant",
                        "content": "",
                        "toolCalls": [
                            {
                                "id": "call-original",
                                "name": "files.write",
                                "arguments": '{"path":"result.txt"}',
                            }
                        ],
                    },
                ],
                "pendingToolCalls": [
                    {
                        "callId": "call-original",
                        "index": 0,
                        "name": "files.write",
                        "arguments": '{"path":"result.txt"}',
                        "requestId": "permission-original",
                        "toolExecutionId": "execution-original",
                    }
                ],
                "maxAgentTurns": 180,
                "maxParallelToolsPerTurn": 16,
            }
        )
        state = service.require(run_id)
        await asyncio.sleep(0)

        assert requests == []
        assert state.agent_turns == 0
        assert list(state.pending_tool_calls) == ["call-original"]
        assert state.suspended_tool_calls == {
            "permission-original": {
                "callId": "call-original",
                "requestId": "permission-original",
                "toolExecutionId": "execution-original",
            }
        }

        await service.submit_tool_result(
            run_id,
            {
                "callId": "call-original",
                "status": "completed",
                "output": {"path": "result.txt"},
            },
        )
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: state.terminal_type is not None
                ),
                timeout=1,
            )
        return state, requests

    state, requests = asyncio.run(execute())

    assert len(requests) == 1
    assert requests[0]["messages"][-1] == {
        "role": "tool",
        "content": '{"path":"result.txt"}',
        "toolCallId": "call-original",
        "name": "files.write",
    }
    assert state.agent_turns == 1
    assert state.pending_tool_calls == {}
    assert state.suspended_tool_calls == {}


def test_run_service_rejects_resume_token_content_conflict():
    async def execute():
        service = RunService()
        token = "b" * 64
        first = {
            "resumeToken": token,
            "conversationId": "conversation-1",
            "messages": [{"role": "user", "content": "One"}],
            "remainingToolCalls": 2,
        }
        await service.resume(first)
        with pytest.raises(ResumeTokenConflictError):
            await service.resume(
                {
                    **first,
                    "messages": [{"role": "user", "content": "Changed"}],
                }
            )

    asyncio.run(execute())


def test_run_service_waits_for_tool_result_and_continues_the_model_loop():
    async def execute():
        service = RunService()
        requests = []

        async def stream_provider(request):
            requests.append(request)
            if len(requests) == 1:
                yield ProviderDelta("I'll check that first. ")
                yield ProviderToolCall(
                    index=0,
                    call_id="call-1",
                    name="lookup",
                    arguments='{"query":"checkout"}',
                )
                yield ProviderResult(
                    content="",
                    usage=ProviderUsage(input_tokens=3, output_tokens=1),
                    first_token_latency_ms=2,
                    duration_ms=4,
                )
                return
            yield ProviderDelta("Tool result accepted")
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=5, output_tokens=3),
                first_token_latency_ms=1,
                duration_ms=2,
            )

        service._stream_provider = stream_provider
        run_id = await service.create(RUN_INPUT)
        state = service.require(run_id)
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: any(
                        event["type"] == "tool.call.requested"
                        for event in state.events
                    )
                ),
                timeout=1,
            )

        assert state.terminal_type is None
        requested = next(
            event
            for event in state.events
            if event["type"] == "tool.call.requested"
        )
        assert requested["data"] == {
            "agentTurn": 1,
            "toolCall": {
                "index": 0,
                "id": "call-1",
                "name": "lookup",
                "arguments": '{"query":"checkout"}',
            }
        }

        await service.submit_tool_result(
            run_id,
            {
                "callId": "call-1",
                "status": "completed",
                "output": {"value": "found"},
            },
        )
        events = []
        async for frame in service.stream(run_id, None):
            events.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )
        return requests, events

    requests, events = asyncio.run(execute())

    assert requests[1]["messages"] == [
        {
            "role": "user",
            "content": "Generate the analysis artifact for Checkout.",
        },
        {
            "role": "assistant",
            "content": "I'll check that first. ",
            "toolCalls": [
                {
                    "id": "call-1",
                    "name": "lookup",
                    "arguments": '{"query":"checkout"}',
                }
            ],
        },
        {
            "role": "tool",
            "content": '{"value":"found"}',
            "toolCallId": "call-1",
            "name": "lookup",
        },
    ]
    assert events[-1]["type"] == "run.completed"
    assert [
        event["data"]["delta"]
        for event in events
        if event["type"] == "answer.delta"
    ] == ["I'll check that first. ", "Tool result accepted"]
    completed = next(
        event
        for event in events
        if event["type"] == "tool.call.completed"
    )
    assert completed["data"] == {
        "toolResult": {
            "callId": "call-1",
            "status": "completed",
            "output": {"value": "found"},
        }
    }
    assert events[-1]["data"]["usage"] == {
        "inputTokens": 8,
        "outputTokens": 4,
        "cachedTokens": 0,
        "reasoningTokens": 0,
    }


def test_run_service_suspends_a_tool_call_without_advancing_the_model():
    async def execute():
        service = RunService()
        requests: list[dict[str, object]] = []

        async def stream_provider(request):
            requests.append(request)
            if len(requests) == 1:
                yield ProviderToolCall(
                    index=0,
                    call_id="call-1",
                    name="files.write",
                    arguments='{"path":"result.txt"}',
                )
            else:
                yield ProviderDelta("Finished")
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=1, output_tokens=1),
                first_token_latency_ms=1,
                duration_ms=1,
            )

        service._stream_provider = stream_provider
        run_id = await service.create(RUN_INPUT)
        state = service.require(run_id)
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: "call-1" in state.pending_tool_calls
                ),
                timeout=1,
            )

        suspension = {
            "callId": "call-1",
            "requestId": "permission-1",
            "toolExecutionId": "execution-1",
        }
        await service.suspend_tool_call(run_id, suspension)
        await service.suspend_tool_call(run_id, suspension)
        await asyncio.sleep(0)

        assert list(state.pending_tool_calls) == ["call-1"]
        assert state.tool_results == {}
        assert len(requests) == 1
        permission_events = [
            event
            for event in state.events
            if event["type"] == "tool.call.permission_required"
        ]
        assert len(permission_events) == 1
        assert permission_events[0]["data"] == suspension

        await service.submit_tool_result(
            run_id,
            {
                "callId": "call-1",
                "status": "completed",
                "output": {"path": "result.txt"},
            },
        )
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: state.terminal_type is not None
                ),
                timeout=1,
            )
        return requests

    requests = asyncio.run(execute())

    assert len(requests) == 2
    assert requests[1]["messages"][-1] == {
        "role": "tool",
        "content": '{"path":"result.txt"}',
        "toolCallId": "call-1",
        "name": "files.write",
    }


def test_tool_loop_separates_intermediate_summary_reference_and_final_answer():
    async def execute():
        service = RunService()
        rounds = 0

        async def stream_provider(_request):
            nonlocal rounds
            rounds += 1
            if rounds == 1:
                yield ProviderSummaryDelta("summary-1", "正在检索")
                yield ProviderSummaryDelta(
                    "summary-1", "，不得进入最终回答"
                )
                yield ProviderToolCall(
                    index=0,
                    call_id="call-1",
                    name="lookup",
                    arguments="{}",
                )
            else:
                yield ProviderReference(
                    reference_id="reference-1",
                    title="RealmFlow 设计",
                    source_type="knowledge",
                    summary="设计约束",
                    location="design",
                )
                yield ProviderDelta("最终回答")
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=1, output_tokens=1),
                first_token_latency_ms=1,
                duration_ms=1,
            )

        service._stream_provider = stream_provider
        run_id = await service.create(RUN_INPUT)
        state = service.require(run_id)
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: "call-1" in state.pending_tool_calls
                ),
                timeout=1,
            )
        await service.submit_tool_result(
            run_id,
            {"callId": "call-1", "status": "completed", "output": {}},
        )
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: state.terminal_type is not None
                ),
                timeout=1,
            )
        return state.events

    events = asyncio.run(execute())

    assert [
        event["data"]["delta"]
        for event in events
        if event["type"] == "answer.delta"
    ] == ["最终回答"]
    assert [
        event["data"]["delta"]
        for event in events
        if event["type"] == "execution.summary.delta"
    ] == ["正在检索", "，不得进入最终回答"]
    assert [
        event["data"]["reference"]["id"]
        for event in events
        if event["type"] == "reference.added"
    ] == ["reference-1"]


def test_legacy_tool_limit_does_not_truncate_a_parallel_agent_turn():
    async def execute():
        service = RunService()
        round_number = 0

        async def stream_provider(_request):
            nonlocal round_number
            round_number += 1
            if round_number == 1:
                yield ProviderToolCall(
                    index=0,
                    call_id="call-1",
                    name="lookup",
                    arguments="{}",
                )
            elif round_number == 2:
                yield ProviderToolCall(
                    index=0,
                    call_id="call-2",
                    name="lookup",
                    arguments="{}",
                )
                yield ProviderToolCall(
                    index=1,
                    call_id="call-3",
                    name="lookup",
                    arguments="{}",
                )
            else:
                yield ProviderDelta("Completed with available Tool results")
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=1, output_tokens=1),
                first_token_latency_ms=1,
                duration_ms=1,
            )

        service._stream_provider = stream_provider
        run_id = await service.create({**RUN_INPUT, "maxToolCalls": 2})
        state = service.require(run_id)
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: "call-1" in state.pending_tool_calls
                ),
                timeout=1,
            )
        await service.submit_tool_result(
            run_id,
            {
                "callId": "call-1",
                "status": "completed",
                "output": {},
            },
        )
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: "call-2" in state.pending_tool_calls
                    and "call-3" in state.pending_tool_calls
                ),
                timeout=1,
            )
        for call_id in ("call-2", "call-3"):
            await service.submit_tool_result(
                run_id,
                {
                    "callId": call_id,
                    "status": "completed",
                    "output": {},
                },
            )
        events = []
        async for frame in service.stream(run_id, None):
            events.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )
        return state, events

    state, events = asyncio.run(execute())

    assert state.terminal_type == "run.completed"
    assert [
        event["data"]["toolCall"]["id"]
        for event in state.events
        if event["type"] == "tool.call.requested"
    ] == ["call-1", "call-2", "call-3"]
    assert not any(
        event["data"].get("toolResult", {}).get("errorCode")
        == "tool_call_limit"
        for event in events
    )
    assert events[-1]["type"] == "run.completed"


def test_run_service_does_not_stop_after_nine_sequential_tool_calls():
    async def execute():
        service = RunService()
        round_number = 0

        async def stream_provider(_request):
            nonlocal round_number
            round_number += 1
            if round_number <= 9:
                yield ProviderToolCall(
                    index=0,
                    call_id=f"call-{round_number}",
                    name="lookup",
                    arguments="{}",
                )
            else:
                yield ProviderDelta("Completed after nine Tool calls")
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=1, output_tokens=1),
                first_token_latency_ms=1,
                duration_ms=1,
            )

        service._stream_provider = stream_provider
        run_id = await service.create(
            {
                **RUN_INPUT,
                "maxToolCalls": 2,
                "maxAgentTurns": 180,
            }
        )
        state = service.require(run_id)
        for index in range(1, 10):
            call_id = f"call-{index}"
            async with state.condition:
                await asyncio.wait_for(
                    state.condition.wait_for(
                        lambda: call_id in state.pending_tool_calls
                    ),
                    timeout=1,
                )
            await service.submit_tool_result(
                run_id,
                {
                    "callId": call_id,
                    "status": "completed",
                    "output": {"index": index},
                },
            )
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: state.terminal_type is not None
                ),
                timeout=1,
            )
        return state, round_number

    state, round_number = asyncio.run(execute())

    assert state.terminal_type == "run.completed"
    assert round_number == 10
    assert [
        event["data"]["toolCall"]["id"]
        for event in state.events
        if event["type"] == "tool.call.requested"
    ] == [f"call-{index}" for index in range(1, 10)]
    assert not any(
        event["data"].get("toolResult", {}).get("errorCode")
        == "tool_call_limit"
        for event in state.events
    )


def test_run_service_stops_at_the_agent_turn_segment_boundary():
    async def execute():
        service = RunService()
        round_number = 0

        async def stream_provider(_request):
            nonlocal round_number
            round_number += 1
            yield ProviderToolCall(
                index=0,
                call_id=f"call-{round_number}",
                name="lookup",
                arguments="{}",
            )
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=1, output_tokens=1),
                first_token_latency_ms=1,
                duration_ms=1,
            )

        service._stream_provider = stream_provider
        run_id = await service.create(
            {**RUN_INPUT, "maxAgentTurns": 2}
        )
        state = service.require(run_id)
        for index in range(1, 3):
            call_id = f"call-{index}"
            async with state.condition:
                await asyncio.wait_for(
                    state.condition.wait_for(
                        lambda: call_id in state.pending_tool_calls
                    ),
                    timeout=1,
                )
            await service.submit_tool_result(
                run_id,
                {
                    "callId": call_id,
                    "status": "completed",
                    "output": {"index": index},
                },
            )
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: state.terminal_type is not None
                ),
                timeout=1,
            )
        return state, round_number

    state, round_number = asyncio.run(execute())

    assert round_number == 2
    assert state.terminal_type == "run.failed"
    assert state.events[-1]["data"]["errorCode"] == "max_agent_turns"
    assert state.events[-1]["data"]["agentTurn"] == 2


def test_active_stream_does_not_lose_events_when_replay_cache_limit_is_exceeded():
    async def execute():
        service = RunService()
        release = asyncio.Event()

        async def long_stream(_request):
            await release.wait()
            for index in range(300):
                yield ProviderDelta(str(index))
            yield ProviderResult(
                content="",
                usage=ProviderUsage(input_tokens=1, output_tokens=300),
                first_token_latency_ms=1,
                duration_ms=2,
            )

        service._stream_provider = long_stream
        run_id = await service.create(RUN_INPUT)
        stream = service.stream(run_id, None)
        observed = []
        for _index in range(2):
            frame = await asyncio.wait_for(anext(stream), timeout=1)
            observed.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )

        release.set()
        await asyncio.sleep(0.05)
        async for frame in stream:
            observed.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )
        return observed, len(service.require(run_id).events)

    events, retained_event_count = asyncio.run(execute())

    assert [event["sequence"] for event in events] == list(
        range(1, len(events) + 1)
    )
    assert sum(event["type"] == "answer.delta" for event in events) == 300
    assert events[-1]["type"] == "run.completed"
    assert retained_event_count == 256


def test_event_stream_replays_only_events_after_last_event_id() -> None:
    with authenticated_client() as client:
        run_id = client.post("/api/v1/runs", json=RUN_INPUT).json()["runId"]
        events = read_events(client, run_id)

        replayed = read_events(client, run_id, events[2]["id"])

    assert replayed
    assert all(event["sequence"] > events[2]["sequence"] for event in replayed)
    assert replayed[-1]["type"] == "run.completed"


def test_event_stream_rejects_an_unknown_replay_cursor() -> None:
    with authenticated_client() as client:
        run_id = client.post("/api/v1/runs", json=RUN_INPUT).json()["runId"]
        read_events(client, run_id)

        response = client.get(
            f"/api/v1/runs/{run_id}/events",
            headers={"Last-Event-ID": f"{run_id}:expired"},
        )

    assert response.status_code == 409
    assert response.json() == {"detail": "Run replay cursor expired"}


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
                "providerType": "openai_completions",
                "modelId": "example-model",
                "gateway": {
                    "url": (
                        "http://127.0.0.1:43210"
                        "/v1/model/stream"
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


def test_local_model_requires_the_same_main_gateway_contract():
    request = CreateRunRequest.model_validate(
        {
            **RUN_INPUT,
            "model": {
                "providerType": "local",
                "modelId": "local-model",
                "gateway": {
                    "url": (
                        "http://127.0.0.1:43210"
                        "/v1/model/stream"
                    ),
                    "token": "local-grant",
                },
            },
        }
    )

    assert request.model is not None
    assert request.model.gateway.token == "local-grant"
    with pytest.raises(ValidationError):
        CreateRunRequest.model_validate(
            {
                **RUN_INPUT,
                "model": {
                    "providerType": "local",
                    "modelId": "local-model",
                },
            }
        )


def test_create_run_request_accepts_turn_limits_and_definitions():
    request = CreateRunRequest.model_validate(
        {
            **RUN_INPUT,
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "lookup",
                        "description": "Lookup a value",
                        "parameters": {"type": "object"},
                    },
                }
            ],
            "maxAgentTurns": 180,
            "maxParallelToolsPerTurn": 16,
            "maxToolCalls": 4,
        }
    )

    assert request.maxAgentTurns == 180
    assert request.maxParallelToolsPerTurn == 16
    assert request.maxToolCalls == 4
    assert request.tools[0]["function"]["name"] == "lookup"


def test_tool_result_endpoint_reports_a_missing_run():
    with authenticated_client() as client:
        response = client.post(
            "/api/v1/runs/missing/tool-results",
            json={
                "callId": "call-1",
                "status": "completed",
                "output": {"value": "found"},
            },
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Run not found"}


def test_tool_suspension_endpoint_reports_a_missing_run():
    with authenticated_client() as client:
        response = client.post(
            "/api/v1/runs/missing/tool-calls/call-1/suspend",
            json={
                "requestId": "permission-1",
                "toolExecutionId": "execution-1",
            },
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Run not found"}


def test_tool_result_endpoint_rejects_permission_required_as_terminal_result():
    with authenticated_client() as client:
        response = client.post(
            "/api/v1/runs/missing/tool-results",
            json={
                "callId": "call-1",
                "status": "permission_required",
            },
        )

    assert response.status_code == 422


def test_cancel_stops_the_active_provider_task():
    async def execute():
        service = RunService()
        started = asyncio.Event()
        cancelled = asyncio.Event()

        async def blocking_stream(_request):
            started.set()
            try:
                await asyncio.Future()
            finally:
                cancelled.set()
            if False:
                yield ProviderDelta("")

        service._stream_provider = blocking_stream
        run_id = await service.create(RUN_INPUT)
        await asyncio.wait_for(started.wait(), timeout=1)

        assert await service.cancel(run_id) == "run.cancelled"
        await asyncio.wait_for(cancelled.wait(), timeout=1)
        return service.require(run_id)

    state = asyncio.run(execute())

    assert state.terminal_type == "run.cancelled"
    assert [event["type"] for event in state.events].count("run.cancelled") == 1
    assert all(event["type"] != "run.failed" for event in state.events)
    cancelled_event = next(
        event for event in state.events if event["type"] == "run.cancelled"
    )
    assert cancelled_event["data"]["errorCode"] == "request_cancelled"
    assert cancelled_event["data"]["durationMs"] >= 0
    assert cancelled_event["data"]["retryCount"] == 0
    assert cancelled_event["data"]["usage"] == {
        "inputTokens": 0,
        "outputTokens": 0,
        "cachedTokens": 0,
        "reasoningTokens": 0,
    }


def test_run_service_times_out_a_provider_that_never_returns():
    async def execute():
        service = RunService(provider_timeout_seconds=0.01)

        async def blocking_stream(_request):
            await asyncio.Future()
            if False:
                yield ProviderDelta("")

        service._stream_provider = blocking_stream
        run_id = await service.create(RUN_INPUT)
        events = []
        async for frame in service.stream(run_id, None):
            events.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )
        return events

    events = asyncio.run(execute())

    assert events[-1]["type"] == "run.failed"
    assert events[-1]["data"]["errorCode"] == "provider_timeout"
    assert events[-1]["data"]["message"] == "Provider request timed out"
    assert sum(
        event["type"] in {"run.completed", "run.failed", "run.cancelled"}
        for event in events
    ) == 1


def test_run_service_turns_provider_preparation_errors_into_terminal_failure():
    async def execute():
        service = RunService()
        run_id = await service.create({"messages": [1]})
        state = service.require(run_id)
        async with state.condition:
            await asyncio.wait_for(
                state.condition.wait_for(
                    lambda: state.terminal_type is not None
                ),
                timeout=1,
            )
        return state

    state = asyncio.run(execute())

    assert state.terminal_type == "run.failed"
    assert state.events[-1]["data"]["errorCode"] == "protocol_error"
    assert state.events[-1]["data"]["message"] == "Provider request failed"


def test_run_service_emits_sanitized_provider_failure_metrics():
    async def execute():
        service = RunService()

        async def failing_stream(_request):
            if False:
                yield ProviderDelta("")
            raise providers.ProviderExecutionError(
                error_code="provider_timeout",
                duration_ms=125,
                retry_count=2,
            )

        service._stream_provider = failing_stream
        run_id = await service.create(RUN_INPUT)
        events = []
        async for frame in service.stream(run_id, None):
            events.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )
        return events

    events = asyncio.run(execute())

    assert events[-1] == {
        "id": f"{events[-1]['runId']}:3",
        "runId": events[-1]["runId"],
        "sequence": 3,
        "type": "run.failed",
        "timestamp": events[-1]["timestamp"],
        "data": {
            "message": "Provider request failed",
            "errorCode": "provider_timeout",
            "usage": {
                "inputTokens": 0,
                "outputTokens": 0,
                "cachedTokens": 0,
                "reasoningTokens": 0,
            },
            "durationMs": 125,
            "retryCount": 2,
        },
    }


def test_run_service_emits_bounded_rate_limit_retry_guidance():
    async def execute():
        service = RunService()

        async def failing_stream(_request):
            if False:
                yield ProviderDelta("")
            raise providers.ProviderExecutionError(
                error_code="provider_rate_limited",
                duration_ms=50,
                retry_count=1,
                retryable=True,
                retry_after_ms=45_000,
            )

        service._stream_provider = failing_stream
        run_id = await service.create(RUN_INPUT)
        events = []
        async for frame in service.stream(run_id, None):
            events.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )
        return events

    events = asyncio.run(execute())

    assert events[-1]["data"]["errorCode"] == "provider_rate_limited"
    assert events[-1]["data"]["retryable"] is True
    assert events[-1]["data"]["retryAfterMs"] == 30_000


def test_run_service_emits_quota_recovery_guidance():
    async def execute():
        service = RunService()

        async def failing_stream(_request):
            if False:
                yield ProviderDelta("")
            raise providers.ProviderExecutionError(
                error_code="provider_rejected",
                duration_ms=125,
                message=(
                    "Model service quota is insufficient. "
                    "Add credits or switch model."
                ),
            )

        service._stream_provider = failing_stream
        run_id = await service.create(RUN_INPUT)
        events = []
        async for frame in service.stream(run_id, None):
            events.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )
        return events

    events = asyncio.run(execute())

    assert events[-1]["type"] == "run.failed"
    assert events[-1]["data"]["errorCode"] == "provider_rejected"
    assert events[-1]["data"]["message"] == (
        "Model service quota is insufficient. Add credits or switch model."
    )


def test_run_service_emits_protocol_metrics_when_stream_has_no_completion():
    async def execute():
        service = RunService()

        async def incomplete_stream(_request):
            if False:
                yield ProviderDelta("")

        service._stream_provider = incomplete_stream
        run_id = await service.create(RUN_INPUT)
        events = []
        async for frame in service.stream(run_id, None):
            events.append(
                json.loads(
                    next(
                        line.removeprefix("data: ")
                        for line in frame.splitlines()
                        if line.startswith("data: ")
                    )
                )
            )
        return events

    events = asyncio.run(execute())

    assert events[-1]["type"] == "run.failed"
    assert events[-1]["data"] == {
        "message": "Provider stream ended without completion",
        "errorCode": "protocol_error",
        "usage": {
            "inputTokens": 0,
            "outputTokens": 0,
            "cachedTokens": 0,
            "reasoningTokens": 0,
        },
        "durationMs": events[-1]["data"]["durationMs"],
        "retryCount": 0,
    }
    assert events[-1]["data"]["durationMs"] >= 0


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
    assert "answer.delta" in event_types
    assert "artifact.ready" not in event_types
    assert event_types[-1] == "run.completed"
