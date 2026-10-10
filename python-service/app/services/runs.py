import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from time import monotonic
from typing import AsyncIterator
from uuid import NAMESPACE_URL, uuid4, uuid5

import httpx

from app.services.providers import (
    FakeProvider,
    MainGatewayProvider,
    ProviderDelta,
    ProviderExecutionError,
    ProviderReference,
    ProviderResult,
    ProviderSummaryDelta,
    ProviderStreamEvent,
    ProviderToolCall,
    ProviderUsage,
    provider_messages,
)


TERMINAL_TYPES = {"run.completed", "run.failed", "run.cancelled"}
MAX_REPLAY_EVENTS = 256
DEFAULT_PROVIDER_TIMEOUT_SECONDS = 30 * 60.0


class ReplayCursorExpiredError(Exception):
    pass


class ToolResultConflictError(Exception):
    pass


class ResumeTokenConflictError(Exception):
    pass


def restore_pending_tool_calls(
    value: object,
) -> tuple[
    dict[str, ProviderToolCall],
    dict[str, dict[str, object]],
]:
    if not isinstance(value, list):
        raise ValueError("Invalid pending Tool Calls")
    calls: dict[str, ProviderToolCall] = {}
    suspensions: dict[str, dict[str, object]] = {}
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("Invalid pending Tool Call")
        call_id = item.get("callId")
        index = item.get("index")
        name = item.get("name")
        arguments = item.get("arguments")
        request_id = item.get("requestId")
        execution_id = item.get("toolExecutionId")
        if (
            not isinstance(call_id, str)
            or not call_id
            or not isinstance(index, int)
            or isinstance(index, bool)
            or index < 0
            or not isinstance(name, str)
            or not name
            or not isinstance(arguments, str)
            or not isinstance(request_id, str)
            or not request_id
            or not isinstance(execution_id, str)
            or not execution_id
            or call_id in calls
            or request_id in suspensions
        ):
            raise ValueError("Invalid pending Tool Call")
        calls[call_id] = ProviderToolCall(
            index=index,
            call_id=call_id,
            name=name,
            arguments=arguments,
        )
        suspensions[request_id] = {
            "callId": call_id,
            "requestId": request_id,
            "toolExecutionId": execution_id,
        }
    return calls, suspensions


@dataclass
class RunState:
    run_id: str
    request: dict[str, object]
    events: list[dict[str, object]] = field(default_factory=list)
    terminal_type: str | None = None
    cancel_requested: bool = False
    condition: asyncio.Condition = field(default_factory=asyncio.Condition)
    provider_task: asyncio.Task[None] | None = None
    started_at: float = field(default_factory=monotonic)
    active_streams: int = 0
    replay_consumed: bool = False
    pending_tool_calls: dict[str, ProviderToolCall] = field(
        default_factory=dict
    )
    tool_results: dict[str, dict[str, object]] = field(default_factory=dict)
    accepted_tool_results: dict[str, dict[str, object]] = field(
        default_factory=dict
    )
    suspended_tool_calls: dict[str, dict[str, object]] = field(
        default_factory=dict
    )
    agent_turns: int = 0
    pending_turn: int | None = None
    turn_messages: list[dict[str, object]] | None = None
    accepted_turns: dict[int, str] = field(default_factory=dict)


class RunService:
    def __init__(
        self,
        *,
        provider_timeout_seconds: float = DEFAULT_PROVIDER_TIMEOUT_SECONDS,
    ) -> None:
        self._runs: dict[str, RunState] = {}
        self._resume_tokens: dict[str, tuple[str, str]] = {}
        self._provider_timeout_seconds = provider_timeout_seconds

    async def create(self, request: dict[str, object]) -> str:
        run_id = str(uuid4())
        state = RunState(run_id=run_id, request=request)
        self._runs[run_id] = state
        state.provider_task = asyncio.create_task(self._run_provider(state))
        return run_id

    async def resume(self, request: dict[str, object]) -> str:
        resume_token = request.get("resumeToken")
        max_agent_turns = request.get("maxAgentTurns", 180)
        pending_tool_calls = request.get("pendingToolCalls", [])
        if (
            not isinstance(resume_token, str)
            or len(resume_token) != 64
            or any(character not in "0123456789abcdef" for character in resume_token)
        ):
            raise ValueError("Invalid resume token")
        if (
            not isinstance(max_agent_turns, int)
            or isinstance(max_agent_turns, bool)
            or max_agent_turns < 1
            or max_agent_turns > 180
        ):
            raise ValueError("Invalid Agent Turn budget")
        resumed_request = {
            key: value
            for key, value in request.items()
            if key not in {
                "resumeToken",
                "remainingToolCalls",
                "pendingToolCalls",
            }
        }
        resumed_request["maxAgentTurns"] = max_agent_turns
        request_digest = hashlib.sha256(
            json.dumps(
                {
                    **resumed_request,
                    "pendingToolCalls": pending_tool_calls,
                },
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        existing = self._resume_tokens.get(resume_token)
        if existing is not None:
            if existing[0] != request_digest:
                raise ResumeTokenConflictError(
                    "Resume token conflicts with persisted request"
                )
            return existing[1]
        restored_calls, restored_suspensions = restore_pending_tool_calls(
            pending_tool_calls
        )
        # Main persists this attempt identity. Recreating the process must not
        # assign another provider ID to the same immutable checkpoint.
        run_id = str(uuid5(NAMESPACE_URL, f"realmflow:resume:{resume_token}"))
        state = RunState(
            run_id=run_id,
            request=resumed_request,
            pending_tool_calls=restored_calls,
            suspended_tool_calls=restored_suspensions,
        )
        self._runs[run_id] = state
        state.provider_task = asyncio.create_task(self._run_provider(state))
        self._resume_tokens[resume_token] = (request_digest, run_id)
        return run_id

    def require(self, run_id: str) -> RunState:
        try:
            return self._runs[run_id]
        except KeyError as error:
            raise LookupError("Run not found") from error

    async def acknowledge_turn(self, run_id: str, payload: dict[str, object]) -> None:
        state = self.require(run_id)
        turn = payload.get("turn")
        messages = payload.get("messages")
        if (not isinstance(turn, int) or isinstance(turn, bool) or turn < 1
                or not isinstance(messages, list) or len(messages) > 100
                or any(not isinstance(m, dict) or set(m) != {"role", "content"}
                       or m["role"] != "user" or not isinstance(m["content"], str)
                       or not m["content"] or len(m["content"]) > 12000 for m in messages)):
            raise ValueError("Invalid turn acknowledgment")
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        async with state.condition:
            if turn in state.accepted_turns:
                if state.accepted_turns[turn] != digest:
                    raise ValueError("Turn acknowledgment conflict")
                return
            if state.terminal_type or state.cancel_requested or state.pending_turn != turn:
                raise ValueError("Turn is not awaiting acknowledgment")
            state.accepted_turns[turn] = digest
            state.turn_messages = [dict(message) for message in messages]
            state.condition.notify_all()

    async def _await_turn(self, state: RunState) -> list[dict[str, object]] | None:
        async with state.condition:
            state.pending_turn = state.agent_turns + 1
            state.turn_messages = None
            self._append_locked(state, "run.turn_ready", {"agentTurn": state.pending_turn})
            state.condition.notify_all()
            await state.condition.wait_for(lambda: state.terminal_type is not None
                                           or state.cancel_requested or state.turn_messages is not None)
            if state.terminal_type or state.cancel_requested:
                return None
            messages = state.turn_messages
            state.pending_turn = None
            state.turn_messages = None
            return messages

    def validate_replay_cursor(
        self, run_id: str, last_event_id: str | None
    ) -> None:
        self._replay_index(self.require(run_id), last_event_id)

    async def cancel(self, run_id: str) -> str:
        state = self.require(run_id)
        provider_task: asyncio.Task[None] | None = None
        async with state.condition:
            if state.terminal_type is not None:
                return state.terminal_type
            state.cancel_requested = True
            self._append_locked(
                state,
                "run.cancelled",
                terminal_metrics(
                    duration_ms=elapsed_ms(state.started_at),
                    retry_count=0,
                    error_code="request_cancelled",
                ),
            )
            state.condition.notify_all()
            provider_task = state.provider_task
        if provider_task is not None:
            provider_task.cancel()
        return "run.cancelled"

    async def submit_tool_result(
        self,
        run_id: str,
        result: dict[str, object],
    ) -> None:
        state = self.require(run_id)
        call_id = result.get("callId")
        if not isinstance(call_id, str) or not call_id:
            raise ValueError("Tool result callId is required")
        async with state.condition:
            accepted = state.accepted_tool_results.get(call_id)
            if accepted is not None:
                if accepted != result:
                    raise ToolResultConflictError(
                        "Tool result already submitted"
                    )
                return
            if state.terminal_type is not None:
                raise ToolResultConflictError("Run is already terminal")
            if call_id not in state.pending_tool_calls:
                raise ToolResultConflictError("Tool call is not pending")
            status = result.get("status")
            event_type = {
                "completed": "tool.call.completed",
                "failed": "tool.call.failed",
            }.get(status)
            if event_type is None:
                raise ValueError("Invalid tool result status")
            state.tool_results[call_id] = result
            state.accepted_tool_results[call_id] = result
            self._append_locked(
                state,
                event_type,
                {"toolResult": result},
            )
            state.condition.notify_all()

    async def suspend_tool_call(
        self,
        run_id: str,
        suspension: dict[str, object],
    ) -> None:
        state = self.require(run_id)
        call_id = suspension.get("callId")
        request_id = suspension.get("requestId")
        if not isinstance(call_id, str) or not call_id:
            raise ValueError("Tool suspension callId is required")
        if not isinstance(request_id, str) or not request_id:
            raise ValueError("Tool suspension requestId is required")
        async with state.condition:
            accepted = state.suspended_tool_calls.get(request_id)
            if accepted is not None:
                if accepted != suspension:
                    raise ToolResultConflictError(
                        "Tool suspension already submitted"
                    )
                return
            if state.terminal_type is not None:
                raise ToolResultConflictError("Run is already terminal")
            if call_id not in state.pending_tool_calls:
                raise ToolResultConflictError("Tool call is not pending")
            if any(
                value.get("callId") == call_id
                for value in state.suspended_tool_calls.values()
            ):
                raise ToolResultConflictError("Tool call is already suspended")
            state.suspended_tool_calls[request_id] = suspension
            self._append_locked(
                state,
                "tool.call.permission_required",
                suspension,
            )
            state.condition.notify_all()

    async def stream(
        self, run_id: str, last_event_id: str | None
    ) -> AsyncIterator[str]:
        state = self.require(run_id)
        async with state.condition:
            index = self._replay_index(state, last_event_id)
            state.active_streams += 1
        try:
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
        finally:
            async with state.condition:
                state.active_streams -= 1
                state.replay_consumed = True
                self._trim_replay_locked(state)

    async def _run_provider(self, state: RunState) -> None:
        try:
            async with asyncio.timeout(self._provider_timeout_seconds):
                await self._execute_provider(state)
        except TimeoutError:
            await self._emit(
                state,
                "run.failed",
                {
                    "message": "Provider request timed out",
                    **terminal_metrics(
                        duration_ms=elapsed_ms(state.started_at),
                        retry_count=0,
                        error_code="provider_timeout",
                        retryable=True,
                    ),
                },
            )
        except asyncio.CancelledError:
            return
        except Exception as error:
            await self._emit(state, "run.failed", failure_metrics(error, state))

    async def _execute_provider(self, state: RunState) -> None:
        await self._emit(state, "run.started", {})
        await self._emit(state, "run.progress", {"progress": 0})
        content_parts: list[str] = []
        messages = provider_messages(state.request)
        request = state.request
        aggregate_result: ProviderResult | None = None
        max_agent_turns = state.request.get("maxAgentTurns", 180)
        if (
            not isinstance(max_agent_turns, int)
            or isinstance(max_agent_turns, bool)
            or max_agent_turns < 1
        ):
            max_agent_turns = 180
        max_parallel_tools = state.request.get(
            "maxParallelToolsPerTurn", 16
        )
        if (
            not isinstance(max_parallel_tools, int)
            or isinstance(max_parallel_tools, bool)
            or max_parallel_tools < 1
            or max_parallel_tools > 16
        ):
            max_parallel_tools = 16
        try:
            if state.pending_tool_calls:
                async with state.condition:
                    await state.condition.wait_for(
                        lambda: state.terminal_type is not None
                        or state.cancel_requested
                        or all(
                            call_id in state.tool_results
                            for call_id in state.pending_tool_calls
                        )
                    )
                    if state.terminal_type is not None or state.cancel_requested:
                        return
                    restored_calls = list(state.pending_tool_calls.values())
                    restored_results = dict(state.tool_results)
                    state.pending_tool_calls = {}
                    state.tool_results = {}
                    state.suspended_tool_calls = {}
                for tool_call in restored_calls:
                    messages.append(
                        {
                            "role": "tool",
                            "content": tool_result_content(
                                restored_results[tool_call.call_id]
                            ),
                            "toolCallId": tool_call.call_id,
                            "name": tool_call.name,
                        }
                    )
                request = {**state.request, "messages": messages}
            while True:
                if state.request.get("turnGate") is True:
                    additions = await self._await_turn(state)
                    if additions is None:
                        return
                    messages.extend(additions)
                    request = {**request, "messages": messages}
                round_content: list[str] = []
                tool_calls: list[ProviderToolCall] = []
                result: ProviderResult | None = None
                async for item in self._stream_provider(request):
                    if state.terminal_type is not None or state.cancel_requested:
                        return
                    if isinstance(item, ProviderDelta):
                        round_content.append(item.content)
                        content_parts.append(item.content)
                        await self._emit(
                            state, "answer.delta", {"delta": item.content}
                        )
                        await self._emit(state, "heartbeat", {})
                    elif isinstance(item, ProviderSummaryDelta):
                        await self._emit(
                            state,
                            "execution.summary.delta",
                            {
                                "summaryId": item.summary_id,
                                "delta": item.content,
                                "source": "provider",
                            },
                        )
                    elif isinstance(item, ProviderReference):
                        await self._emit(
                            state,
                            "reference.added",
                            {
                                "reference": {
                                    "id": item.reference_id,
                                    "title": item.title,
                                    "sourceType": item.source_type,
                                    "summary": item.summary,
                                    **(
                                        {"location": item.location}
                                        if item.location is not None
                                        else {}
                                    ),
                                }
                            },
                        )
                    elif isinstance(item, ProviderToolCall):
                        tool_calls.append(item)
                    else:
                        result = item
                if result is None:
                    await self._emit(
                        state,
                        "run.failed",
                        {
                            "message": (
                                "Provider stream ended without completion"
                            ),
                            **terminal_metrics(
                                duration_ms=elapsed_ms(state.started_at),
                                retry_count=0,
                                error_code="protocol_error",
                            ),
                        },
                    )
                    return
                aggregate_result = merge_provider_results(
                    aggregate_result,
                    result,
                )
                state.agent_turns += 1
                if not tool_calls:
                    break
                call_ids = [
                    tool_call.call_id for tool_call in tool_calls
                ]
                if (
                    len(set(call_ids)) != len(call_ids)
                    or any(
                        call_id in state.accepted_tool_results
                        for call_id in call_ids
                    )
                ):
                    await self._emit(
                        state,
                        "run.failed",
                        {
                            "message": "Invalid duplicate tool call",
                            **terminal_metrics(
                                duration_ms=elapsed_ms(state.started_at),
                                retry_count=(
                                    aggregate_result.retry_count
                                    if aggregate_result is not None
                                    else 0
                                ),
                                error_code="protocol_error",
                            ),
                        },
                    )
                    return
                accepted_calls = tool_calls[:max_parallel_tools]
                rejected_calls = tool_calls[max_parallel_tools:]
                rejected_results = {
                    tool_call.call_id: {
                        "callId": tool_call.call_id,
                        "status": "failed",
                        "errorCode": "parallel_tool_limit",
                        "message": "Parallel Tool call limit exceeded",
                    }
                    for tool_call in rejected_calls
                }
                async with state.condition:
                    state.pending_tool_calls = {
                        tool_call.call_id: tool_call
                        for tool_call in accepted_calls
                    }
                    state.tool_results = {}
                    state.accepted_tool_results.update(rejected_results)
                for tool_call in accepted_calls:
                    await self._emit(
                        state,
                        "tool.call.requested",
                        {
                            "agentTurn": state.agent_turns,
                            "toolCall": {
                                "index": tool_call.index,
                                "id": tool_call.call_id,
                                "name": tool_call.name,
                                "arguments": tool_call.arguments,
                            }
                        },
                    )
                for tool_call in rejected_calls:
                    await self._emit(
                        state,
                        "tool.call.failed",
                        {
                            "agentTurn": state.agent_turns,
                            "toolName": tool_call.name,
                            "toolResult": rejected_results[
                                tool_call.call_id
                            ],
                        },
                    )
                async with state.condition:
                    await state.condition.wait_for(
                        lambda: state.terminal_type is not None
                        or state.cancel_requested
                        or all(
                            tool_call.call_id in state.tool_results
                            for tool_call in accepted_calls
                        )
                    )
                    if state.terminal_type is not None or state.cancel_requested:
                        return
                    results_by_call_id = {
                        **rejected_results,
                        **state.tool_results,
                    }
                    state.pending_tool_calls = {}
                    state.tool_results = {}
                messages.append(
                    {
                        "role": "assistant",
                        "content": "".join(round_content),
                        "toolCalls": [
                            {
                                "id": tool_call.call_id,
                                "name": tool_call.name,
                                "arguments": tool_call.arguments,
                            }
                            for tool_call in tool_calls
                        ],
                    }
                )
                for tool_call in tool_calls:
                    tool_result = results_by_call_id[tool_call.call_id]
                    messages.append(
                        {
                            "role": "tool",
                            "content": tool_result_content(tool_result),
                            "toolCallId": tool_call.call_id,
                            "name": tool_call.name,
                        }
                    )
                request = {
                    **state.request,
                    "messages": messages,
                }
                request.pop("context", None)
                if state.agent_turns >= max_agent_turns:
                    await self._emit(
                        state,
                        "run.failed",
                        {
                            "agentTurn": state.agent_turns,
                            "message": "Agent Turn segment limit reached",
                            **terminal_metrics(
                                duration_ms=elapsed_ms(state.started_at),
                                retry_count=(
                                    aggregate_result.retry_count
                                    if aggregate_result is not None
                                    else 0
                                ),
                                error_code="max_agent_turns",
                                retryable=True,
                            ),
                        },
                    )
                    return
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await self._emit(state, "run.failed", failure_metrics(error, state))
            return
        if aggregate_result is None:
            return
        content = "".join(content_parts)
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
        await self._emit(
            state,
            "run.completed",
            {
                **completion_metrics(aggregate_result),
                "agentTurn": state.agent_turns,
            },
        )

    async def _stream_provider(
        self, request: dict[str, object]
    ) -> AsyncIterator[ProviderStreamEvent]:
        model = request.get("model")
        if isinstance(model, dict):
            async with httpx.AsyncClient(timeout=None) as client:
                async for item in MainGatewayProvider(client).stream(request):
                    yield item
            return
        async for item in FakeProvider().stream(request):
            yield item

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
        self._trim_replay_locked(state)
        if event_type in TERMINAL_TYPES:
            state.terminal_type = event_type

    def _trim_replay_locked(self, state: RunState) -> None:
        if state.active_streams > 0 or not state.replay_consumed:
            return
        overflow = len(state.events) - MAX_REPLAY_EVENTS
        if overflow > 0:
            del state.events[:overflow]

    def _replay_index(self, state: RunState, last_event_id: str | None) -> int:
        if not last_event_id:
            return 0
        for index, event in enumerate(state.events):
            if event["id"] == last_event_id:
                return index + 1
        raise ReplayCursorExpiredError("Run replay cursor expired")

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


def merge_provider_results(
    aggregate: ProviderResult | None,
    result: ProviderResult,
) -> ProviderResult:
    if aggregate is None:
        return result
    return ProviderResult(
        content="",
        usage=ProviderUsage(
            input_tokens=(
                aggregate.usage.input_tokens + result.usage.input_tokens
            ),
            output_tokens=(
                aggregate.usage.output_tokens + result.usage.output_tokens
            ),
            cached_tokens=(
                aggregate.usage.cached_tokens + result.usage.cached_tokens
            ),
            reasoning_tokens=(
                aggregate.usage.reasoning_tokens
                + result.usage.reasoning_tokens
            ),
        ),
        first_token_latency_ms=aggregate.first_token_latency_ms,
        duration_ms=aggregate.duration_ms + result.duration_ms,
        retry_count=aggregate.retry_count + result.retry_count,
    )


def tool_result_content(result: dict[str, object]) -> str:
    status = result.get("status")
    if status == "completed":
        output = result.get("output")
        if not isinstance(output, dict):
            raise ValueError("Completed tool result output is required")
        content: object = output
    elif status == "failed":
        content = {
            key: value
            for key, value in result.items()
            if key not in {"callId", "status"}
        }
        content = {"status": status, **content}
    else:
        raise ValueError("Invalid tool result status")
    return json.dumps(content, separators=(",", ":"), sort_keys=True)


def failure_metrics(
    error: Exception, state: RunState
) -> dict[str, object]:
    if isinstance(error, ProviderExecutionError):
        return {
            "message": str(error),
            **terminal_metrics(
                duration_ms=error.duration_ms,
                retry_count=error.retry_count,
                error_code=error.error_code,
                retryable=error.retryable,
                retry_after_ms=error.retry_after_ms,
            ),
        }
    return {
        "message": "Provider request failed",
        **terminal_metrics(
            duration_ms=elapsed_ms(state.started_at),
            retry_count=0,
            error_code="protocol_error",
        ),
    }


def terminal_metrics(
    *,
    duration_ms: int,
    retry_count: int,
    error_code: str,
    retryable: bool = False,
    retry_after_ms: int | None = None,
) -> dict[str, object]:
    return {
        "usage": {
            "inputTokens": 0,
            "outputTokens": 0,
            "cachedTokens": 0,
            "reasoningTokens": 0,
        },
        "durationMs": max(0, duration_ms),
        "retryCount": max(0, retry_count),
        "errorCode": error_code,
        **({"retryable": True} if retryable else {}),
        **(
            {"retryAfterMs": min(30_000, max(0, retry_after_ms))}
            if retry_after_ms is not None
            else {}
        ),
    }


def elapsed_ms(started: float) -> int:
    return max(0, round((monotonic() - started) * 1000))
