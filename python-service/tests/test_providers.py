import asyncio
import json
import os

import httpx
import pytest

from app.services import providers
from app.services.providers import MainGatewayProvider, provider_messages


class ChunkedStream(httpx.AsyncByteStream):
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks

    async def __aiter__(self):
        for chunk in self._chunks:
            yield chunk

    async def aclose(self) -> None:
        return None


def test_conversation_context_precedes_persisted_history_as_system_message():
    assert provider_messages(
        {
            "conversationId": "conversation-space",
            "workspaceId": "workspace-1",
            "context": "## Space knowledge\nLocal checkout rules",
            "messages": [
                {"role": "user", "content": "How should retries work?"},
            ],
        }
    ) == [
        {
            "role": "system",
            "content": "## Space knowledge\nLocal checkout rules",
        },
        {"role": "user", "content": "How should retries work?"},
    ]


def test_provider_messages_preserve_validated_multimodal_user_content():
    content = [
        {"type": "text", "text": "Analyze this diagram"},
        {
            "type": "image",
            "attachmentId": "attachment-1",
            "mimeType": "image/png",
            "dataBase64": "iVBORw==",
        },
    ]

    assert provider_messages(
        {
            "conversationId": "conversation-image",
            "messages": [{"role": "user", "content": content}],
        }
    ) == [{"role": "user", "content": content}]


def test_agent_profile_prompt_precedes_business_context():
    assert provider_messages(
        {
            "conversationId": "conversation-space",
            "systemPrompt": "## System invariants\n- Respect permission gates.",
            "context": "## Space knowledge\nLocal checkout rules",
            "messages": [
                {"role": "user", "content": "How should retries work?"},
            ],
        }
    ) == [
        {
            "role": "system",
            "content": "## System invariants\n- Respect permission gates.",
        },
        {
            "role": "system",
            "content": "## Space knowledge\nLocal checkout rules",
        },
        {"role": "user", "content": "How should retries work?"},
    ]


def test_provider_messages_preserve_tool_call_and_result_metadata():
    messages = [
        {
            "role": "system",
            "content": "Workspace knowledge",
        },
        {
            "role": "assistant",
            "content": "",
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

    assert provider_messages({"messages": messages}) == messages


def test_main_gateway_provider_streams_deltas_and_final_usage():
    def handle(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content) == {
            "messages": [
                {
                    "role": "user",
                    "content": "Generate the analysis artifact for Checkout.",
                }
            ],
            "stream": True,
        }
        return httpx.Response(
            200,
            headers={
                "Content-Type": "text/event-stream",
                "X-RealmFlow-Retry-Count": "2",
            },
            stream=ChunkedStream(
                [
                    b'data: {"type":"message_start"}\n\n',
                    b'data: {"type":"text_delta","text":"# Check"}\n',
                    b'\ndata: {"type":"text_delta","text":"out"}\n\n',
                    b'data: {"type":"usage","inputTokens":120,'
                    b'"outputTokens":40,"cachedTokens":20,'
                    b'"reasoningTokens":10}\n\n',
                    b'data: {"type":"message_complete"}\n\n',
                ]
            ),
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = MainGatewayProvider(client)
            return [
                item
                async for item in provider.stream(
                    {
                        "requirementTitle": "Checkout",
                        "stageId": "analysis",
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
            ]

    streamed = asyncio.run(execute())

    assert [item.content for item in streamed[:-1]] == ["# Check", "out"]
    assert streamed[-1].usage.input_tokens == 120
    assert streamed[-1].usage.output_tokens == 40
    assert streamed[-1].usage.cached_tokens == 20
    assert streamed[-1].usage.reasoning_tokens == 10
    assert streamed[-1].retry_count == 2


def test_main_gateway_provider_forwards_reasoning_and_output_budget():
    def handle(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content) == {
            "messages": [{"role": "user", "content": "Verify the changes."}],
            "stream": True,
            "reasoning": "high",
            "maxOutputTokens": 8192,
        }
        return httpx.Response(
            200,
            headers={"Content-Type": "text/event-stream"},
            stream=ChunkedStream(
                [
                    b'data: {"type":"message_start"}\n\n',
                    b'data: {"type":"usage","inputTokens":5,'
                    b'"outputTokens":0,"cachedTokens":0,'
                    b'"reasoningTokens":0}\n\n',
                    b'data: {"type":"message_complete"}\n\n',
                ]
            ),
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = MainGatewayProvider(client)
            return [
                item
                async for item in provider.stream(
                    {
                        "conversationId": "conversation-reasoning",
                        "messages": [
                            {
                                "role": "user",
                                "content": "Verify the changes.",
                            }
                        ],
                        "reasoning": "high",
                        "maxOutputTokens": 8192,
                        "model": {
                            "providerType": "openai_responses",
                            "modelId": "reasoner",
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
            ]

    streamed = asyncio.run(execute())
    assert streamed[-1].usage.output_tokens == 0


@pytest.mark.parametrize(
    "provider_type",
    [
        "openai_completions",
        "openai_responses",
        "anthropic_messages",
    ],
)
def test_gateway_provider_consumes_the_same_realmflow_stream(provider_type):
    tools = [
        {
            "type": "function",
            "function": {
                "name": "lookup",
                "description": "Lookup a value",
                "parameters": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            },
        }
    ]

    def handle(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content) == {
            "messages": [
                {
                    "role": "user",
                    "content": "Generate the analysis artifact for Checkout.",
                }
            ],
            "stream": True,
            "tools": tools,
        }
        return httpx.Response(
            200,
            headers={
                "Content-Type": "text/event-stream",
                "X-RealmFlow-Retry-Count": "1",
            },
            stream=ChunkedStream(
                [
                    b'data: {"type":"message_start"}\n\n',
                    b'data: {"type":"text_delta","text":"# Check"}\n\n',
                    b'data: {"type":"tool_delta","index":0,'
                    b'"id":"call-1","name":"lookup",'
                    b'"arguments":"{\\"query\\":"}\n\n',
                    b'data: {"type":"tool_delta","index":0,'
                    b'"id":"","name":"","arguments":"\\"checkout\\"}"}\n\n',
                    b'data: {"type":"text_delta","text":"out"}\n\n',
                    b'data: {"type":"usage","inputTokens":12,'
                    b'"outputTokens":4,"cachedTokens":2,'
                    b'"reasoningTokens":1}\n\n',
                    b'data: {"type":"message_complete"}\n\n',
                ]
            ),
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = MainGatewayProvider(client)
            return [
                item
                async for item in provider.stream(
                    {
                        "requirementTitle": "Checkout",
                        "stageId": "analysis",
                        "model": {
                            "providerType": provider_type,
                            "modelId": "example-model",
                            "gateway": {
                                "url": (
                                    "http://127.0.0.1:43210"
                                    "/v1/model/stream"
                                ),
                                "token": "one-time-grant",
                            },
                        },
                            "tools": tools,
                    }
                )
            ]

    streamed = asyncio.run(execute())

    assert [item.content for item in streamed if hasattr(item, "content")] == [
        "# Check",
        "out",
        "",
    ]
    tool_call = next(
        item
        for item in streamed
        if isinstance(item, providers.ProviderToolCall)
    )
    assert tool_call.index == 0
    assert tool_call.call_id == "call-1"
    assert tool_call.name == "lookup"
    assert tool_call.arguments == '{"query":"checkout"}'
    assert streamed[-1].usage.input_tokens == 12
    assert streamed[-1].usage.output_tokens == 4
    assert streamed[-1].usage.cached_tokens == 2
    assert streamed[-1].usage.reasoning_tokens == 1
    assert streamed[-1].retry_count == 1


def test_gateway_provider_uses_main_network_gateway_without_credentials():
    environment_before = dict(os.environ)

    def handle(request: httpx.Request) -> httpx.Response:
        assert request.url == (
            "http://127.0.0.1:43210/v1/model/stream"
        )
        assert request.headers["Authorization"] == "Bearer one-time-grant"
        assert json.loads(request.content) == {
            "messages": [
                {
                    "role": "user",
                    "content": "Generate the analysis artifact for Checkout.",
                }
            ],
            "stream": True,
        }
        return httpx.Response(
            200,
            headers={
                "Content-Type": "text/event-stream",
                "X-RealmFlow-Retry-Count": "2",
            },
            stream=ChunkedStream(
                [
                    b'data: {"type":"message_start"}\n\n',
                    b'data: {"type":"text_delta","text":"# Checkout\\n\\n'
                    b'Analysis result."}\n\n',
                    b'data: {"type":"usage","inputTokens":120,'
                    b'"outputTokens":40,"cachedTokens":20,'
                    b'"reasoningTokens":10}\n\n',
                    b'data: {"type":"message_complete"}\n\n',
                ]
            ),
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = MainGatewayProvider(client)
            return [
                item
                async for item in provider.stream(
                    {
                        "requirementTitle": "Checkout",
                        "stageId": "analysis",
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
                    },
                )
            ]

    streamed = asyncio.run(execute())
    result = streamed[-1]

    assert "".join(item.content for item in streamed[:-1]) == (
        "# Checkout\n\nAnalysis result."
    )
    assert result.usage.input_tokens == 120
    assert result.usage.output_tokens == 40
    assert result.usage.cached_tokens == 20
    assert result.usage.reasoning_tokens == 10
    assert result.retry_count == 2
    assert dict(os.environ) == environment_before


def test_openai_completions_provider_exposes_sanitized_failure_metrics():
    def handle(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            502,
            headers={"X-RealmFlow-Retry-Count": "2"},
            json={
                "error": {
                    "code": "provider_unavailable",
                    "message": (
                        "POST https://provider.example failed "
                        "Authorization: Bearer secret"
                    ),
                    "retryCount": 2,
                }
            },
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = MainGatewayProvider(client)
            return [
                item
                async for item in provider.stream(
                    {
                        "requirementTitle": "Checkout",
                        "stageId": "analysis",
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
            ]

    with pytest.raises(Exception) as raised:
        asyncio.run(execute())

    assert isinstance(raised.value, providers.ProviderExecutionError)
    assert raised.value.error_code == "provider_unavailable"
    assert raised.value.retry_count == 2
    assert raised.value.duration_ms >= 0
    assert "provider.example" not in str(raised.value)
    assert "secret" not in str(raised.value)


def test_main_gateway_provider_preserves_bounded_rate_limit_guidance():
    def handle(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            headers={"X-RealmFlow-Retry-Count": "1"},
            json={
                "error": {
                    "code": "provider_rate_limited",
                    "message": "Provider request failed",
                    "retryable": True,
                    "retryAfterMs": 45_000,
                    "retryCount": 1,
                }
            },
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = MainGatewayProvider(client)
            return [
                item
                async for item in provider.stream(
                    {
                        "conversationId": "conversation-1",
                        "messages": [{"role": "user", "content": "Continue"}],
                        "model": {
                            "providerType": "openai_completions",
                            "modelId": "example-model",
                            "gateway": {
                                "url": "http://127.0.0.1:43210/v1/model/stream",
                                "token": "one-time-grant",
                            },
                        },
                    }
                )
            ]

    with pytest.raises(providers.ProviderExecutionError) as raised:
        asyncio.run(execute())

    assert raised.value.error_code == "provider_rate_limited"
    assert raised.value.retryable is True
    assert raised.value.retry_after_ms == 30_000


def test_openai_completions_provider_preserves_allowlisted_quota_guidance():
    def handle(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            502,
            headers={"Content-Type": "application/json"},
            stream=ChunkedStream(
                [
                    json.dumps(
                        {
                            "error": {
                                "code": "provider_rejected",
                                "message": (
                                    "Model service quota is insufficient. "
                                    "Add credits or switch model."
                                ),
                                "retryable": False,
                                "retryCount": 0,
                            }
                        }
                    ).encode()
                ]
            ),
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = MainGatewayProvider(client)
            return [
                item
                async for item in provider.stream(
                    {
                        "requirementTitle": "Checkout",
                        "stageId": "analysis",
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
            ]

    with pytest.raises(providers.ProviderExecutionError) as raised:
        asyncio.run(execute())

    assert raised.value.error_code == "provider_rejected"
    assert str(raised.value) == (
        "Model service quota is insufficient. Add credits or switch model."
    )


def test_gateway_provider_rejects_malformed_unified_usage():
    def handle(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"Content-Type": "text/event-stream"},
            stream=ChunkedStream(
                [
                    b'data: {"type":"message_start"}\n\n',
                    b'data: {"type":"usage","inputTokens":3}\n\n',
                    b'data: {"type":"message_complete"}\n\n',
                ]
            ),
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = MainGatewayProvider(client)
            return [
                item
                async for item in provider.stream(
                    {
                        "requirementTitle": "Checkout",
                        "stageId": "analysis",
                        "model": {
                            "providerType": "openai_responses",
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
            ]

    with pytest.raises(ValueError, match="Invalid Main gateway usage"):
        asyncio.run(execute())
