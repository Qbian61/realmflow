from dataclasses import dataclass
from time import monotonic

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


class OpenAICompatibleProvider:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def generate(self, request: dict[str, object]) -> ProviderResult:
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
        response = await self._client.post(
            gateway_url,
            headers={"Authorization": f"Bearer {gateway_token}"},
            json={"messages": messages},
        )
        first_token_latency_ms = elapsed_ms(started)
        response.raise_for_status()
        payload = response.json()
        content = extract_content(payload)
        usage = extract_usage(payload)
        return ProviderResult(
            content=content,
            usage=usage,
            first_token_latency_ms=first_token_latency_ms,
            duration_ms=elapsed_ms(started),
        )


class FakeProvider:
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


def provider_messages(request: dict[str, object]) -> list[dict[str, str]]:
    raw_messages = request.get("messages")
    if isinstance(raw_messages, list):
        messages: list[dict[str, str]] = []
        for item in raw_messages:
            if not isinstance(item, dict):
                raise ValueError("Invalid conversation message")
            role = require_string(item, "role")
            content = require_string(item, "content")
            if role not in {"user", "assistant", "tool"}:
                raise ValueError("Invalid conversation message role")
            messages.append({"role": role, "content": content})
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


def require_string(value: dict[str, object], key: str) -> str:
    item = value.get(key)
    if not isinstance(item, str) or not item:
        raise ValueError(f"Missing model request field: {key}")
    return item


def extract_content(payload: object) -> str:
    if not isinstance(payload, dict):
        raise ValueError("Invalid OpenAI-compatible response")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("OpenAI-compatible response has no choices")
    choice = choices[0]
    if not isinstance(choice, dict):
        raise ValueError("Invalid OpenAI-compatible choice")
    message = choice.get("message")
    if not isinstance(message, dict):
        raise ValueError("Invalid OpenAI-compatible message")
    content = message.get("content")
    if not isinstance(content, str) or not content:
        raise ValueError("OpenAI-compatible response has no content")
    return content


def extract_usage(payload: dict[str, object]) -> ProviderUsage:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        return ProviderUsage(input_tokens=0, output_tokens=0)
    prompt_details = usage.get("prompt_tokens_details")
    completion_details = usage.get("completion_tokens_details")
    return ProviderUsage(
        input_tokens=non_negative_int(usage.get("prompt_tokens")),
        output_tokens=non_negative_int(usage.get("completion_tokens")),
        cached_tokens=detail_token_count(prompt_details, "cached_tokens"),
        reasoning_tokens=detail_token_count(
            completion_details, "reasoning_tokens"
        ),
    )


def detail_token_count(value: object, key: str) -> int:
    if not isinstance(value, dict):
        return 0
    return non_negative_int(value.get(key))


def non_negative_int(value: object) -> int:
    return value if isinstance(value, int) and value >= 0 else 0


def elapsed_ms(started: float) -> int:
    return max(0, round((monotonic() - started) * 1000))
