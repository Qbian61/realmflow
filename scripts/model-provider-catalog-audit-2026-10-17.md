# Model Provider Catalog Audit

- Audit date: 2026-10-17
- Catalog version: 3
- Providers: 24
- Models: 1,192
- Upstream snapshot: `@earendil-works/pi-ai@1.3.0`
- Runtime dependency: `@earendil-works/pi-ai@0.80.10` (unchanged)

## Result

The built-in catalog now uses a pinned, generator-only alias for the latest
model snapshot. Official provider corrections are applied deterministically
before the static TypeScript catalog is written. Normal builds remain offline.

Every provider definition records:

- The official documentation or public API URL.
- The verification date.
- The pinned upstream package and source provider ID.

Public catalog APIs are checked explicitly with:

```bash
npm run audit:model-catalog
```

This checks all configured Hugging Face, OpenRouter, and NVIDIA model IDs.
Where the public API supplies the fields, it also checks input modalities,
context windows, and maximum output tokens.

## Provider Matrix

| Provider | Models | Official source | Audit result |
| --- | ---: | --- | --- |
| Amazon Bedrock | 193 | [Supported foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) | Updated from the pinned upstream snapshot; Bedrock protocol retained. |
| Ant Ling | 5 | [API overview](https://developer.ant-ling.com/en/docs/api-reference/) | Added Ling 3.1 Flash and Ling 3.0 Flash; retained the three documented Ling/Ring 2.6 routes at 256K. |
| Anthropic | 17 | [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) | Added current Claude models; all entries accept image input. Current 1M/128K limits are pinned for Claude 5 families. |
| VolcEngine Ark | 4 | [Model list](https://ark.volcengine.com/region:cn-beijing/docs/model-list) | Rebuilt from current recommended IDs. Removed old Seed 2.0 and 260628 Pro entries; added 260915 Pro/Lite at 1M/256K. |
| Ark Agent Plan | 13 | [Agent Plan overview](https://ark.volcengine.com/region:cn-beijing/docs/agent-plan-personal-plan-overview) | Rebuilt from the current subscription list, including DeepSeek V4.1 Flash, Kimi K3, GLM 5.3 Flash, and current limits/modalities. |
| Ark Coding Plan | 13 | [Coding Plan overview](https://ark.volcengine.com/region:cn-beijing/docs/coding-plan-personal-plan-overview) | Rebuilt from the current subscription list. Removed the obsolete Seed 2.0 Code entry. |
| Azure OpenAI Responses | 45 | [Azure model concepts](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models) | Updated snapshot and retained the Azure Responses protocol. |
| DeepSeek | 2 | [API documentation](https://api-docs.deepseek.com/quick_start/pricing) | `deepseek-flash` is the multimodal DeepSeek V4.1 Flash route; legacy `deepseek-v4-flash` is absent. |
| Google Gemini | 21 | [Gemini models](https://ai.google.dev/gemini-api/docs/models) | Added current Gemini models; removed the shut-down Computer Use 2.5 and Flash Lite 3.1 preview routes. |
| Groq | 7 | [Supported models](https://console.groq.com/docs/models) | Matches four production chat models plus Safety GPT OSS, MiniMax M2.7, and Qwen 3.8. Removed Qwen 3.6. |
| Hugging Face | 70 | [Public models API](https://router.huggingface.co/v1/models) | Removed eight unavailable snapshot IDs and aligned 16 context-window values with live providers. Public API audit passes. |
| MiniMax | 3 | [Model introduction](https://platform.minimax.io/docs/guides/models-intro) | Includes M2.7, M2.7 Highspeed, and multimodal M3 at 1M context. |
| MiniMax CN | 3 | [Model documentation](https://platform.minimaxi.com/document/models) | Mirrors the documented CN endpoint and current MiniMax family. |
| Moonshot AI | 4 | [Kimi API guide](https://platform.moonshot.ai/docs/guide/use-kimi-api) | Replaced the old ten-model set with Kimi K2.6, K2.7 Code variants, and multimodal K3. |
| Moonshot AI CN | 4 | [Kimi API guide](https://platform.moonshot.cn/docs/guide/use-kimi-api) | Mirrors the documented CN endpoint and current Kimi family. |
| NVIDIA NIM | 20 | [Public models API](https://integrate.api.nvidia.com/v1/models) | All curated IDs exist in the 81-model public API response. |
| OpenAI | 44 | [Models](https://platform.openai.com/docs/models) | Updated snapshot; corrected GPT-5.5 to 1.05M context and 128K output with image input. |
| OpenAI Codex | 9 | [Codex models](https://developers.openai.com/codex/models/) | Updated Codex snapshot while retaining OAuth and the Codex Responses protocol. |
| OpenRouter | 395 | [Public models API](https://openrouter.ai/api/v1/models) | Removed unavailable `auto`; aligned 36 context/output values. All curated IDs and supplied capability fields pass the public API audit. |
| Vercel AI Gateway | 301 | [Models and providers](https://vercel.com/docs/ai-gateway/models-and-providers) | Updated to the pinned snapshot. The public catalog endpoint was unavailable during the audit, so this provider remains snapshot-backed. |
| xAI | 4 | [Models](https://docs.x.ai/developers/models) | Added current Grok models through Grok 4.7; multimodal Responses metadata retained. |
| Xiaomi MiMo | 3 | [Model overview](https://mimo.mi.com/docs/quick-start/summary/model) | Retains only the current MiMo V2.6 Flash/Pro/Pro UltraSpeed routes; all are multimodal at 1M/128K. |
| Z.AI | 8 | [Model overview](https://docs.bigmodel.cn/cn/guide/start/model-overview) | Corrected the general API base URL and added multimodal GLM-5.3-FlashX at 1M/128K. |
| Z.AI Coding CN | 4 | [Coding Plan models](https://docs.bigmodel.cn/cn/coding-plan/latest-model) | Updated the coding-plan subset and retained the dedicated coding endpoint. FlashX is intentionally excluded because the plan does not expose it. |

## Guardrails

- `npm run generate:model-catalog` is deterministic and does not access the
  network.
- The runtime package remains on 0.80.10; only the catalog generator imports
  the 1.3.0 alias.
- `domain/model-provider-catalog.test.ts` locks provider counts, source
  provenance, official high-risk capabilities, removed IDs, and Ark plan
  contents.
- `scripts/audit-model-provider-catalog.test.mjs` verifies both acceptance and
  drift-reporting behavior for the public API audit.
- Catalog version 3 causes the existing model catalog migration to add current
  profiles and retire IDs removed from the catalog without deleting user
  overrides or credentials.

## Remaining Limits

- Some first-party providers do not publish an unauthenticated machine-readable
  model API. Their entries are pinned from the upstream snapshot and corrected
  from dated official documentation.
- Pricing changes more frequently than model capabilities and is not exposed
  consistently by every provider. Snapshot pricing remains reviewable but is
  not asserted as an execution contract.
- Tool-calling and structured-output flags remain the catalog's compatibility
  contract. The upstream snapshot does not expose per-model support fields for
  all providers, so these two flags cannot be independently API-audited across
  all 1,192 entries.
