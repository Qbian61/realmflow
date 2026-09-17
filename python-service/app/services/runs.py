import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import AsyncIterator
from uuid import uuid4

import httpx

from app.services.providers import FakeProvider, OpenAICompatibleProvider, ProviderResult


TERMINAL_TYPES = {"run.completed", "run.failed", "run.cancelled"}
MAX_REPLAY_EVENTS = 256


@dataclass
class RunState:
    run_id: str
    request: dict[str, object]
    events: list[dict[str, object]] = field(default_factory=list)
    terminal_type: str | None = None
    cancel_requested: bool = False
    condition: asyncio.Condition = field(default_factory=asyncio.Condition)


class RunService:
    def __init__(self) -> None:
        self._runs: dict[str, RunState] = {}

    async def create(self, request: dict[str, object]) -> str:
        run_id = str(uuid4())
        state = RunState(run_id=run_id, request=request)
        self._runs[run_id] = state
        asyncio.create_task(self._execute_provider(state))
        return run_id

    def require(self, run_id: str) -> RunState:
        try:
            return self._runs[run_id]
        except KeyError as error:
            raise LookupError("Run not found") from error

    async def cancel(self, run_id: str) -> str:
        state = self.require(run_id)
        async with state.condition:
            if state.terminal_type is not None:
                return state.terminal_type
            state.cancel_requested = True
            self._append_locked(state, "run.cancelled", {})
            state.condition.notify_all()
            return "run.cancelled"

    async def stream(
        self, run_id: str, last_event_id: str | None
    ) -> AsyncIterator[str]:
        state = self.require(run_id)
        index = self._replay_index(state, last_event_id)
        while True:
            async with state.condition:
                await state.condition.wait_for(
                    lambda: index < len(state.events)
                    or state.terminal_type is not None
                )
                pending = state.events[index:]
                index = len(state.events)
                terminal = state.terminal_type is not None
            for event in pending:
                yield self._encode(event)
            if terminal and index >= len(state.events):
                return

    async def _execute_provider(self, state: RunState) -> None:
        await self._emit(state, "run.started", {})
        try:
            result = await self._generate(state.request)
        except Exception as error:
            await self._emit(state, "run.failed", {"message": str(error)})
            return
        content = result.content
        chunks = [content[: len(content) // 2], content[len(content) // 2 :]]
        for index, chunk in enumerate(chunks, start=1):
            await asyncio.sleep(0.01)
            if state.terminal_type is not None or state.cancel_requested:
                return
            await self._emit(state, "run.progress", {"progress": index * 40})
            await self._emit(state, "content.delta", {"delta": chunk})
            await self._emit(state, "heartbeat", {})
        await self._emit(state, "run.progress", {"progress": 100})
        stage_id = state.request.get("stageId")
        artifact_path = state.request.get("artifactPath")
        if isinstance(artifact_path, str) or isinstance(stage_id, str):
            await self._emit(
                state,
                "artifact.ready",
                {
                    "artifact": {
                        "path": (
                            artifact_path
                            if isinstance(artifact_path, str)
                            else f"artifacts/{stage_id}.md"
                        ),
                        "content": content,
                    }
                },
            )
        await self._emit(state, "run.completed", completion_metrics(result))

    async def _generate(self, request: dict[str, object]) -> ProviderResult:
        model = request.get("model")
        if isinstance(model, dict) and model.get("providerType") == (
            "openai_compatible"
        ):
            async with httpx.AsyncClient(timeout=120) as client:
                return await OpenAICompatibleProvider(client).generate(request)
        return await FakeProvider().generate(request)

    async def _emit(
        self, state: RunState, event_type: str, data: dict[str, object]
    ) -> None:
        async with state.condition:
            if state.terminal_type is not None:
                return
            self._append_locked(state, event_type, data)
            state.condition.notify_all()

    def _append_locked(
        self, state: RunState, event_type: str, data: dict[str, object]
    ) -> None:
        sequence = state.events[-1]["sequence"] + 1 if state.events else 1
        event = {
            "id": f"{state.run_id}:{sequence}",
            "runId": state.run_id,
            "sequence": sequence,
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
        state.events.append(event)
        if len(state.events) > MAX_REPLAY_EVENTS:
            state.events.pop(0)
        if event_type in TERMINAL_TYPES:
            state.terminal_type = event_type

    def _replay_index(self, state: RunState, last_event_id: str | None) -> int:
        if not last_event_id:
            return 0
        for index, event in enumerate(state.events):
            if event["id"] == last_event_id:
                return index + 1
        return 0

    def _encode(self, event: dict[str, object]) -> str:
        return (
            f"id: {event['id']}\n"
            f"event: {event['type']}\n"
            f"data: {json.dumps(event, separators=(',', ':'))}\n\n"
        )


def completion_metrics(result: ProviderResult) -> dict[str, object]:
    return {
        "usage": {
            "inputTokens": result.usage.input_tokens,
            "outputTokens": result.usage.output_tokens,
            "cachedTokens": result.usage.cached_tokens,
            "reasoningTokens": result.usage.reasoning_tokens,
        },
        "firstTokenLatencyMs": result.first_token_latency_ms,
        "durationMs": result.duration_ms,
        "retryCount": result.retry_count,
    }
