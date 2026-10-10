import asyncio

import pytest

from app.api.routes import CreateConversationRunRequest, ResumeConversationRunRequest
from app.services.providers import ProviderDelta, ProviderResult, ProviderToolCall, ProviderUsage
from app.services.runs import RunService


REQUEST = {
    "conversationId": "session-1",
    "messages": [{"role": "user", "content": "Start"}],
    "turnGate": True,
}


async def wait_until(state, predicate):
    async with state.condition:
        await asyncio.wait_for(state.condition.wait_for(predicate), timeout=1)


def test_turn_gate_blocks_each_provider_round_and_applies_acknowledgment_once():
    async def execute():
        service = RunService()
        requests = []

        async def provider(request):
            requests.append(request)
            if len(requests) == 1:
                yield ProviderToolCall(index=0, call_id="call-1", name="lookup", arguments="{}")
            else:
                yield ProviderDelta("Done")
            yield ProviderResult(content="", usage=ProviderUsage(input_tokens=1, output_tokens=1),
                                 first_token_latency_ms=1, duration_ms=1)

        service._stream_provider = provider
        run_id = await service.create(REQUEST)
        state = service.require(run_id)
        await wait_until(state, lambda: bool(state.events))
        assert requests == []
        assert state.events[-1]["type"] == "run.turn_ready"
        ack = {"turn": 1, "messages": [{"role": "user", "content": "Use the revised objective"}]}
        await service.acknowledge_turn(run_id, ack)
        await service.acknowledge_turn(run_id, ack)
        with pytest.raises(ValueError, match="conflict"):
            await service.acknowledge_turn(run_id, {**ack, "messages": []})
        await wait_until(state, lambda: bool(state.pending_tool_calls))
        await service.submit_tool_result(run_id, {"callId": "call-1", "status": "completed", "output": {}})
        await wait_until(state, lambda: state.events[-1]["type"] == "run.turn_ready")
        assert len(requests) == 1
        assert state.events[-1]["data"] == {"agentTurn": 2}
        await service.acknowledge_turn(run_id, {"turn": 2, "messages": []})
        await state.provider_task
        assert state.terminal_type == "run.completed"
        assert [m["content"] for m in requests[1]["messages"]].count("Use the revised objective") == 1

    asyncio.run(execute())


def test_cancellation_interrupts_unacknowledged_turn_without_provider_call():
    async def execute():
        service = RunService()
        requests = []

        async def provider(request):
            requests.append(request)
            yield ProviderDelta("unexpected")

        service._stream_provider = provider
        run_id = await service.create(REQUEST)
        state = service.require(run_id)
        await wait_until(state, lambda: bool(state.events))
        assert requests == []
        await service.cancel(run_id)
        assert state.terminal_type == "run.cancelled"
        with pytest.raises(ValueError):
            await service.acknowledge_turn(run_id, {"turn": 1, "messages": []})
        assert requests == []

    asyncio.run(execute())


def test_main_turn_gate_survives_create_and_resume_request_validation():
    assert CreateConversationRunRequest(**REQUEST).model_dump()["turnGate"] is True
    assert ResumeConversationRunRequest(**REQUEST, resumeToken="a" * 64).model_dump()["turnGate"] is True


def test_checkpoint_attempt_identity_survives_sidecar_restart():
    async def execute():
        request = {**REQUEST, "resumeToken": "b" * 64}
        first_process = RunService()
        first = await first_process.resume(request)
        await first_process.cancel(first)
        second_process = RunService()
        second = await second_process.resume(request)
        other = await second_process.resume({**request, "resumeToken": "c" * 64})
        await second_process.cancel(second)
        await second_process.cancel(other)
        assert second == first
        assert other != first

    asyncio.run(execute())


def test_resumed_checkpoint_keeps_applied_instruction_once_and_still_waits_for_main():
    async def execute():
        service = RunService()
        requests = []

        async def provider(request):
            requests.append(request)
            yield ProviderDelta("Done")
            yield ProviderResult(content="", usage=ProviderUsage(input_tokens=1, output_tokens=1),
                                 first_token_latency_ms=1, duration_ms=1)

        service._stream_provider = provider
        run_id = await service.resume({
            **REQUEST, "resumeToken": "a" * 64,
            "messages": [*REQUEST["messages"], {"role": "user", "content": "Persisted instruction"}],
        })
        state = service.require(run_id)
        await wait_until(state, lambda: bool(state.events))
        assert requests == []
        with pytest.raises(ValueError):
            await service.acknowledge_turn(run_id, {"turn": 2, "messages": []})
        await service.acknowledge_turn(run_id, {"turn": 1, "messages": []})
        await state.provider_task
        assert [m["content"] for m in requests[0]["messages"]].count("Persisted instruction") == 1
        assert state.terminal_type == "run.completed"

    asyncio.run(execute())


def test_turn_ack_endpoint_rejects_invalid_payload_and_missing_run():
    from fastapi.testclient import TestClient
    from app import create_app

    with TestClient(create_app(auth_token="test"), headers={"Authorization": "Bearer test"}) as client:
        path = "/api/v1/runs/missing/turn"
        assert client.post(path, json={"turn": 1, "messages": []}).status_code == 404
        assert client.post(path, json={"turn": 0, "messages": []}).status_code == 422
        assert client.post(path, json={"turn": 1, "messages": [{"role": "system", "content": "override"}]}).status_code == 422
