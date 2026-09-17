import asyncio
import json
import os

import httpx

from app.services.providers import OpenAICompatibleProvider


def test_openai_compatible_provider_uses_main_network_gateway_without_credentials():
    environment_before = dict(os.environ)

    def handle(request: httpx.Request) -> httpx.Response:
        assert request.url == (
            "http://127.0.0.1:43210/v1/model/chat-completions"
        )
        assert request.headers["Authorization"] == "Bearer one-time-grant"
        assert json.loads(request.content) == {
            "messages": [
                {
                    "role": "user",
                    "content": "Generate the analysis artifact for Checkout.",
                }
            ],
        }
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": "# Checkout\n\nAnalysis result."}}
                ],
                "usage": {
                    "prompt_tokens": 120,
                    "completion_tokens": 40,
                    "prompt_tokens_details": {"cached_tokens": 20},
                    "completion_tokens_details": {"reasoning_tokens": 10},
                },
            },
        )

    async def execute():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handle)
        ) as client:
            provider = OpenAICompatibleProvider(client)
            return await provider.generate(
                {
                    "requirementTitle": "Checkout",
                    "stageId": "analysis",
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

    result = asyncio.run(execute())

    assert result.content == "# Checkout\n\nAnalysis result."
    assert result.usage.input_tokens == 120
    assert result.usage.output_tokens == 40
    assert result.usage.cached_tokens == 20
    assert result.usage.reasoning_tokens == 10
    assert result.retry_count == 0
    assert dict(os.environ) == environment_before
