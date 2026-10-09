import asyncio
import base64
import binascii
import json
from dataclasses import dataclass
from time import monotonic
from typing import AsyncIterator

import httpx


@dataclass(frozen=True)
class ProviderUsage:
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0
    reasoning_tokens: int = 0


@dataclass(frozen=True)
class ProviderResult:
    content: str
    usage: ProviderUsage
    first_token_latency_ms: int
    duration_ms: int
    retry_count: int = 0


@dataclass(frozen=True)
class ProviderDelta:
    content: str


@dataclass(frozen=True)
class ProviderSummaryDelta:
    summary_id: str
    content: str


@dataclass(frozen=True)
class ProviderReference:
    reference_id: str
    title: str
    source_type: str
    summary: str
    location: str | None = None


@dataclass(frozen=True)
class ProviderToolCall:
    index: int
    call_id: str
    name: str
    arguments: str


ProviderStreamEvent = (
    ProviderDelta
    | ProviderSummaryDelta
    | ProviderReference
    | ProviderToolCall
    | ProviderResult
)


class ProviderExecutionError(Exception):
    def __init__(
        self,
        *,
        error_code: str,
        duration_ms: int,
        retry_count: int = 0,
        retryable: bool = False,
        retry_after_ms: int | None = None,
        message: str = "Provider request failed",
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.duration_ms = duration_ms
        self.retry_count = retry_count
        self.retryable = retryable
        self.retry_after_ms = (
            None
            if retry_after_ms is None
            else min(30_000, max(0, retry_after_ms))
        )


class MainGatewayProvider:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def stream(
        self, request: dict[str, object]
    ) -> AsyncIterator[ProviderStreamEvent]:
        model = request.get("model")
        if not isinstance(model, dict):
            raise ValueError("OpenAI-compatible model configuration is required")
        gateway = model.get("gateway")
        if not isinstance(gateway, dict):
            raise ValueError("Main network gateway grant is required")
        gateway_url = require_string(gateway, "url")
        gateway_token = require_string(gateway, "token")
        messages = provider_messages(request)
        started = monotonic()
        first_token_latency_ms: int | None = None
        usage = ProviderUsage(input_tokens=0, output_tokens=0)
        message_started = False
        message_completed = False
        tool_calls: dict[int, dict[str, str]] = {}

        try:
            async with self._client.stream(
                "POST",
                gateway_url,
                headers={"Authorization": f"Bearer {gateway_token}"},
                json={
                    "messages": messages,
                    "stream": True,
                    **(
                        {"tools": request["tools"]}
                        if isinstance(request.get("tools"), list)
                        else {}
                    ),
                    **(
                        {"reasoning": request["reasoning"]}
                        if request.get("reasoning")
                        in {"off", "low", "medium", "high"}
                        else {}
                    ),
                    **(
                        {"maxOutputTokens": request["maxOutputTokens"]}
                        if isinstance(request.get("maxOutputTokens"), int)
                        else {}
                    ),
                },
            ) as response:
                retry_count = non_negative_header(
                    response.headers.get("X-RealmFlow-Retry-Count")
                )
                if not response.is_success:
                    await response.aread()
                    error_code, message = provider_error(response)
                    retryable, retry_after_ms = provider_retry_metadata(
                        response
                    )
                    raise ProviderExecutionError(
                        error_code=error_code,
                        duration_ms=elapsed_ms(started),
                        retry_count=retry_count,
                        retryable=retryable,
                        retry_after_ms=retry_after_ms,
                        message=message,
                    )
                if "text/event-stream" not in response.headers.get(
                    "Content-Type", ""
                ):
                    raise ValueError(
                        "Invalid OpenAI-compatible stream response"
                    )
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line.removeprefix("data:").strip()
                    payload = parse_stream_payload(data)
                    event_type = require_string(payload, "type")
                    if event_type == "message_start":
                        if message_started:
                            raise ValueError("Duplicate message_start event")
                        message_started = True
                    elif event_type == "text_delta":
                        if not message_started or message_completed:
                            raise ValueError("Out-of-order text_delta event")
                        delta = require_string(payload, "text")
                        if first_token_latency_ms is None:
                            first_token_latency_ms = elapsed_ms(started)
                        yield ProviderDelta(delta)
                    elif event_type == "reasoning_summary_delta":
                        if not message_started or message_completed:
                            raise ValueError(
                                "Out-of-order reasoning_summary_delta event"
                            )
                        yield ProviderSummaryDelta(
                            summary_id=require_string(payload, "summaryId"),
                            content=require_string(payload, "text"),
                        )
                    elif event_type == "reference":
                        if not message_started or message_completed:
                            raise ValueError("Out-of-order reference event")
                        yield ProviderReference(
                            reference_id=require_string(payload, "id"),
                            title=require_string(payload, "title"),
                            source_type=require_string(payload, "sourceType"),
                            summary=require_string(payload, "summary"),
                            location=optional_string(payload, "location"),
                        )
                    elif event_type == "tool_delta":
                        if not message_started or message_completed:
                            raise ValueError("Out-of-order tool_delta event")
                        index = payload.get("index")
                        if (
                            not isinstance(index, int)
                            or isinstance(index, bool)
                            or index < 0
                        ):
                            raise ValueError("Invalid tool call index")
                        tool_call = tool_calls.setdefault(
                            index,
                            {"id": "", "name": "", "arguments": ""},
                        )
                        for source, target in (
                            ("id", "id"),
                            ("name", "name"),
                            ("arguments", "arguments"),
                        ):
                            fragment = payload.get(source)
                            if fragment is None:
                                continue
                            if not isinstance(fragment, str):
                                raise ValueError(
                                    "Invalid tool call fragment"
                                )
                            tool_call[target] += fragment
                    elif event_type == "usage":
                        if not message_started or message_completed:
                            raise ValueError("Out-of-order usage event")
                        usage = extract_gateway_usage(payload)
                    elif event_type == "message_complete":
                        if not message_started or message_completed:
                            raise ValueError(
                                "Out-of-order message_complete event"
                            )
                        message_completed = True
                    elif event_type == "error":
                        raise ProviderExecutionError(
                            error_code=gateway_error_code(payload),
                            duration_ms=elapsed_ms(started),
                            retry_count=retry_count,
                        )
                    else:
                        raise ValueError("Unknown Main gateway stream event")
        except ProviderExecutionError:
            raise
        except httpx.TimeoutException as error:
            raise ProviderExecutionError(
                error_code="provider_timeout",
                duration_ms=elapsed_ms(started),
            ) from error
        except httpx.HTTPError as error:
            raise ProviderExecutionError(
                error_code="provider_unavailable",
                duration_ms=elapsed_ms(started),
            ) from error

        if not message_started or not message_completed:
            raise ValueError("Main gateway stream ended without completion")
        for index in sorted(tool_calls):
            tool_call = tool_calls[index]
            if not tool_call["id"] or not tool_call["name"]:
                raise ValueError("Incomplete tool call")
            yield ProviderToolCall(
                index=index,
                call_id=tool_call["id"],
                name=tool_call["name"],
                arguments=tool_call["arguments"],
            )
        yield ProviderResult(
            content="",
            usage=usage,
            first_token_latency_ms=first_token_latency_ms or 0,
            duration_ms=elapsed_ms(started),
            retry_count=retry_count,
        )

class FakeProvider:
    async def stream(
        self, request: dict[str, object]
    ) -> AsyncIterator[ProviderStreamEvent]:
        result = await self.generate(request)
        midpoint = len(result.content) // 2
        for content in (result.content[:midpoint], result.content[midpoint:]):
            if content:
                await asyncio.sleep(0.01)
                yield ProviderDelta(content)
        yield result

    async def generate(self, request: dict[str, object]) -> ProviderResult:
        if "conversationId" in request:
            messages = provider_messages(request)
            latest = messages[-1]["content"]
            content = f"RealmFlow response: {latest}"
        else:
            requirement_title = require_string(request, "requirementTitle")
            execution_name = request.get("nodeId") or request.get("stageId")
            if not isinstance(execution_name, str) or not execution_name:
                raise ValueError("Workflow node is required")
            content = (
                f"# {requirement_title}\n\n"
                f"## {execution_name.title()} artifact\n\n"
                "Generated deterministically by the RealmFlow fake AI "
                "provider.\n"
            )
        return ProviderResult(
            content=content,
            usage=ProviderUsage(input_tokens=0, output_tokens=0),
            first_token_latency_ms=0,
            duration_ms=0,
        )


def provider_messages(
    request: dict[str, object],
) -> list[dict[str, object]]:
    raw_messages = request.get("messages")
    if isinstance(raw_messages, list):
        messages: list[dict[str, object]] = []
        system_prompt = request.get("systemPrompt")
        if isinstance(system_prompt, str) and system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        context = request.get("context")
        if isinstance(context, str) and context:
            messages.append({"role": "system", "content": context})
        for item in raw_messages:
            if not isinstance(item, dict):
                raise ValueError("Invalid conversation message")
            role = require_string(item, "role")
            if role not in {"system", "user", "assistant", "tool"}:
                raise ValueError("Invalid conversation message role")
            content = item.get("content")
            if isinstance(content, list):
                if role != "user":
                    raise ValueError(
                        "Only user messages may contain multimodal content"
                    )
                content = validated_multimodal_content(content)
            elif not isinstance(content, str):
                raise ValueError("Invalid conversation message content")
            message: dict[str, object] = {
                "role": role,
                "content": content,
            }
            tool_calls = item.get("toolCalls")
            if role == "assistant" and tool_calls is not None:
                message["toolCalls"] = require_tool_calls(tool_calls)
            elif role == "tool":
                message["toolCallId"] = require_string(
                    item, "toolCallId"
                )
                message["name"] = require_string(item, "name")
            elif not content:
                raise ValueError("Conversation message content is required")
            messages.append(message)
        if messages:
            return messages
        raise ValueError("Conversation messages are required")
    requirement_title = require_string(request, "requirementTitle")
    prompt = request.get("prompt")
    if isinstance(prompt, str) and prompt:
        content = prompt
    else:
        stage_id = require_string(request, "stageId")
        content = f"Generate the {stage_id} artifact for {requirement_title}."
    return [
        {
            "role": "user",
            "content": content,
        }
    ]


def validated_multimodal_content(
    value: list[object],
) -> list[dict[str, str]]:
    if not value or len(value) > 21:
        raise ValueError("Invalid multimodal message content")
    result: list[dict[str, str]] = []
    total_image_bytes = 0
    for part in value:
        if not isinstance(part, dict):
            raise ValueError("Invalid multimodal message part")
        if part.get("type") == "text":
            text = part.get("text")
            if not isinstance(text, str) or not text:
                raise ValueError("Invalid multimodal text part")
            result.append({"type": "text", "text": text})
            continue
        if part.get("type") != "image":
            raise ValueError("Invalid multimodal message part")
        attachment_id = part.get("attachmentId")
        mime_type = part.get("mimeType")
        data_base64 = part.get("dataBase64")
        if (
            not isinstance(attachment_id, str)
            or not attachment_id
            or mime_type not in {
                "image/gif",
                "image/jpeg",
                "image/png",
                "image/webp",
            }
            or not isinstance(data_base64, str)
            or not data_base64
        ):
            raise ValueError("Invalid multimodal image part")
        try:
            decoded = base64.b64decode(data_base64, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("Invalid multimodal image data") from error
        total_image_bytes += len(decoded)
        if total_image_bytes > 20 * 1024 * 1024:
            raise ValueError("Multimodal image payload exceeds 20MB")
        result.append(
            {
                "type": "image",
                "attachmentId": attachment_id,
                "mimeType": mime_type,
                "dataBase64": data_base64,
            }
        )
    if not any(part["type"] == "text" for part in result):
        raise ValueError("Multimodal message requires text")
    return result


def require_tool_calls(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list) or not value:
        raise ValueError("Assistant tool calls are required")
    tool_calls: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("Invalid assistant tool call")
        tool_calls.append(
            {
                "id": require_string(item, "id"),
                "name": require_string(item, "name"),
                "arguments": require_string(item, "arguments"),
            }
        )
    return tool_calls


def require_string(value: dict[str, object], key: str) -> str:
    item = value.get(key)
    if not isinstance(item, str) or not item:
        raise ValueError(f"Missing model request field: {key}")
    return item


def optional_string(value: dict[str, object], key: str) -> str | None:
    item = value.get(key)
    if item is None:
        return None
    if not isinstance(item, str) or not item:
        raise ValueError(f"Invalid model response field: {key}")
    return item


def extract_gateway_usage(payload: dict[str, object]) -> ProviderUsage:
    keys = (
        "inputTokens",
        "outputTokens",
        "cachedTokens",
        "reasoningTokens",
    )
    if any(not is_non_negative_int(payload.get(key)) for key in keys):
        raise ValueError("Invalid Main gateway usage")
    return ProviderUsage(
        input_tokens=int(payload["inputTokens"]),
        output_tokens=int(payload["outputTokens"]),
        cached_tokens=int(payload["cachedTokens"]),
        reasoning_tokens=int(payload["reasoningTokens"]),
    )


def parse_stream_payload(value: str) -> dict[str, object]:
    try:
        payload = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError("Invalid OpenAI-compatible stream event") from error
    if not isinstance(payload, dict):
        raise ValueError("Invalid OpenAI-compatible stream event")
    return payload


def non_negative_int(value: object) -> int:
    return value if isinstance(value, int) and value >= 0 else 0


def is_non_negative_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def non_negative_header(value: str | None) -> int:
    try:
        parsed = int(value) if value is not None else 0
    except ValueError:
        return 0
    return max(0, parsed)


def elapsed_ms(started: float) -> int:
    return max(0, round((monotonic() - started) * 1000))


def provider_error(response: httpx.Response) -> tuple[str, str]:
    fallback = ("provider_unavailable", "Provider request failed")
    try:
        payload = response.json()
    except ValueError:
        return fallback
    if not isinstance(payload, dict):
        return fallback
    error = payload.get("error")
    if not isinstance(error, dict):
        return fallback
    code = error.get("code")
    if code not in {
        "provider_rejected",
        "provider_rate_limited",
        "provider_unavailable",
        "provider_timeout",
        "request_cancelled",
    }:
        return fallback
    message = error.get("message")
    safe_message = (
        message
        if message
        == "Model service quota is insufficient. Add credits or switch model."
        else "Provider request failed"
    )
    return str(code), safe_message


def provider_retry_metadata(
    response: httpx.Response,
) -> tuple[bool, int | None]:
    try:
        payload = response.json()
    except ValueError:
        return False, None
    if not isinstance(payload, dict):
        return False, None
    error = payload.get("error")
    if not isinstance(error, dict):
        return False, None
    retryable = error.get("retryable") is True
    retry_after_ms = error.get("retryAfterMs")
    if (
        not isinstance(retry_after_ms, int)
        or isinstance(retry_after_ms, bool)
        or retry_after_ms < 0
    ):
        retry_after_ms = None
    return (
        retryable,
        (
            None
            if retry_after_ms is None
            else min(30_000, retry_after_ms)
        ),
    )


def gateway_error_code(payload: dict[str, object]) -> str:
    code = payload.get("code")
    if code in {
        "provider_rejected",
        "provider_rate_limited",
        "provider_unavailable",
        "provider_timeout",
        "request_cancelled",
        "protocol_error",
        "stream_error",
        "interrupted",
    }:
        return str(code)
    return "protocol_error"
