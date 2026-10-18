// Generated from @earendil-works/pi-ai@1.3.0 with official provider overrides verified 2026-10-17.
// Run `node scripts/generate-model-provider-catalog.mjs` to refresh.
// Keep this data static so catalog upgrades are explicit and reviewable.
export const MODEL_PROVIDER_CATALOG_SEEDS = [
  {
    "id": "amazon-bedrock",
    "website": "https://aws.amazon.com/bedrock/",
    "productionVisible": true,
    "authentication": "aws",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "amazon-bedrock"
    },
    "provider": {
      "id": "builtin-amazon-bedrock",
      "type": "bedrock_converse_stream",
      "name": "Amazon Bedrock",
      "baseUrl": "https://bedrock-runtime.us-east-1.amazonaws.com",
      "enabled": true
    },
    "models": [
      {
        "id": "amazon.nova-2-lite-v1:0",
        "displayName": "Nova 2 Lite",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.33,
        "outputCostPerMillionTokens": 2.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon.nova-lite-v1:0",
        "displayName": "Nova Lite",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon.nova-micro-v1:0",
        "displayName": "Nova Micro",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.035,
        "outputCostPerMillionTokens": 0.14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon.nova-pro-v1:0",
        "displayName": "Nova Pro",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.8,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-fable-5",
        "displayName": "Claude Fable 5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-fable-5-1",
        "displayName": "Claude Fable 5.1",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-haiku-4-5-20251001-v1:0",
        "displayName": "Claude Haiku 4.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-haiku-5-5",
        "displayName": "Claude Haiku 5.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-opus-4-1-20250805-v1:0",
        "displayName": "Claude Opus 4.1",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-opus-4-5-20251101-v1:0",
        "displayName": "Claude Opus 4.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-opus-4-6-v1",
        "displayName": "Claude Opus 4.6",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-opus-4-7",
        "displayName": "Claude Opus 4.7",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-opus-4-8",
        "displayName": "Claude Opus 4.8",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-opus-5-5",
        "displayName": "Claude Opus 5.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-sonnet-4-5-20250929-v1:0",
        "displayName": "Claude Sonnet 4.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-sonnet-4-6",
        "displayName": "Claude Sonnet 4.6",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-sonnet-5",
        "displayName": "Claude Sonnet 5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic.claude-sonnet-5-5",
        "displayName": "Claude Sonnet 5.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "apac.amazon.nova-lite-v1:0",
        "displayName": "Nova Lite (APAC)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.063,
        "outputCostPerMillionTokens": 0.252,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "apac.amazon.nova-micro-v1:0",
        "displayName": "Nova Micro (APAC)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.037,
        "outputCostPerMillionTokens": 0.148,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "apac.amazon.nova-pro-v1:0",
        "displayName": "Nova Pro (APAC)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.84,
        "outputCostPerMillionTokens": 3.36,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "apac.anthropic.claude-sonnet-4-20250514-v1:0",
        "displayName": "Claude Sonnet 4 (APAC)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-haiku-4-5-20251001-v1:0",
        "displayName": "Claude Haiku 4.5 (AU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 5.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-haiku-5-5",
        "displayName": "Claude Haiku 5.5 (AU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 0.55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-opus-4-6-v1",
        "displayName": "AU Anthropic Claude Opus 4.6",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-opus-4-7",
        "displayName": "Claude Opus 4.7 (AU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-opus-4-8",
        "displayName": "Claude Opus 4.8 (AU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-opus-5",
        "displayName": "Claude Opus 5 (AU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-opus-5-5",
        "displayName": "Claude Opus 5.5 (AU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.4,
        "outputCostPerMillionTokens": 22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "displayName": "Claude Sonnet 4.5 (AU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-sonnet-4-6",
        "displayName": "AU Anthropic Claude Sonnet 4.6",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "au.anthropic.claude-sonnet-5",
        "displayName": "Claude Sonnet 5 (AU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "ca.amazon.nova-lite-v1:0",
        "displayName": "Nova Lite (CA)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.064,
        "outputCostPerMillionTokens": 0.256,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek.v3-v1:0",
        "displayName": "DeepSeek-V3.1",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 163840,
        "maxOutputTokens": 81920,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.58,
        "outputCostPerMillionTokens": 1.68,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek.v3.2",
        "displayName": "DeepSeek V3.2",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 163840,
        "maxOutputTokens": 81920,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.62,
        "outputCostPerMillionTokens": 1.85,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.amazon.nova-2-lite-v1:0",
        "displayName": "Nova 2 Lite (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.374,
        "outputCostPerMillionTokens": 3.157,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.amazon.nova-lite-v1:0",
        "displayName": "Nova Lite (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.069,
        "outputCostPerMillionTokens": 0.276,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.amazon.nova-micro-v1:0",
        "displayName": "Nova Micro (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.04,
        "outputCostPerMillionTokens": 0.16,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.amazon.nova-pro-v1:0",
        "displayName": "Nova Pro (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.92,
        "outputCostPerMillionTokens": 3.68,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-fable-5",
        "displayName": "Claude Fable 5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 11,
        "outputCostPerMillionTokens": 55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
        "displayName": "Claude Haiku 4.5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 5.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-haiku-5-5",
        "displayName": "Claude Haiku 5.5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 0.55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-opus-4-5-20251101-v1:0",
        "displayName": "Claude Opus 4.5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-opus-4-6-v1",
        "displayName": "Claude Opus 4.6 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-opus-4-7",
        "displayName": "Claude Opus 4.7 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-opus-4-8",
        "displayName": "Claude Opus 4.8 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-opus-5",
        "displayName": "Claude Opus 5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-opus-5-5",
        "displayName": "Claude Opus 5.5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.4,
        "outputCostPerMillionTokens": 22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-sonnet-4-20250514-v1:0",
        "displayName": "Claude Sonnet 4 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "displayName": "Claude Sonnet 4.5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-sonnet-4-6",
        "displayName": "Claude Sonnet 4.6 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-sonnet-5",
        "displayName": "Claude Sonnet 5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.anthropic.claude-sonnet-5-5",
        "displayName": "Claude Sonnet 5.5 (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "eu.mistral.pixtral-large-2502-v1:0",
        "displayName": "Pixtral Large (25.02) (EU)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.amazon.nova-2-lite-v1:0",
        "displayName": "Nova 2 Lite (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-fable-5",
        "displayName": "Claude Fable 5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-fable-5-1",
        "displayName": "Claude Fable 5.1 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        "displayName": "Claude Haiku 4.5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-haiku-5-5",
        "displayName": "Claude Haiku 5.5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-opus-4-5-20251101-v1:0",
        "displayName": "Claude Opus 4.5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-opus-4-6-v1",
        "displayName": "Claude Opus 4.6 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-opus-4-7",
        "displayName": "Claude Opus 4.7 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-opus-4-8",
        "displayName": "Claude Opus 4.8 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-opus-5",
        "displayName": "Claude Opus 5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-opus-5-5",
        "displayName": "Claude Opus 5.5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-sonnet-4-20250514-v1:0",
        "displayName": "Claude Sonnet 4 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "displayName": "Claude Sonnet 4.5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-sonnet-4-6",
        "displayName": "Claude Sonnet 4.6 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-sonnet-5",
        "displayName": "Claude Sonnet 5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.anthropic.claude-sonnet-5-5",
        "displayName": "Claude Sonnet 5.5 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.moonshotai.kimi-k3",
        "displayName": "Kimi K3 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1048576,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.openai.gpt-5.6-luna",
        "displayName": "GPT-5.6 Luna (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.openai.gpt-5.6-sol",
        "displayName": "GPT-5.6 Sol (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.openai.gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.openai.gpt-6-astra",
        "displayName": "GPT-6 Astra (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.openai.gpt-6-luna",
        "displayName": "GPT-6 Luna (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.openai.gpt-6-sol",
        "displayName": "GPT-6 Sol (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.openai.gpt-6.1-sol",
        "displayName": "GPT-6.1 Sol (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.xai.grok-4.6",
        "displayName": "Grok 4.6 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.xai.grok-4.7",
        "displayName": "Grok 4.7 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "global.zai.glm-5.3",
        "displayName": "GLM-5.3 (Global)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.68,
        "outputCostPerMillionTokens": 5.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google.gemma-4-26b-a4b",
        "displayName": "Gemma 4 26B A4B IT",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google.gemma-4-31b",
        "displayName": "Gemma 4 31B IT",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google.gemma-4-e2b",
        "displayName": "Gemma 4 E2B IT",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 131072,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.04,
        "outputCostPerMillionTokens": 0.08,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "in.anthropic.claude-haiku-4-5-20251001-v1:0",
        "displayName": "Claude Haiku 4.5 (India)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 5.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "in.anthropic.claude-opus-5",
        "displayName": "Claude Opus 5 (India)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "in.anthropic.claude-sonnet-5",
        "displayName": "Claude Sonnet 5 (India)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "in.openai.gpt-5.6-luna",
        "displayName": "GPT-5.6 Luna (India)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 1.32,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "in.openai.gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra (India)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 13.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.amazon.nova-2-lite-v1:0",
        "displayName": "Nova 2 Lite (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.396,
        "outputCostPerMillionTokens": 3.311,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-haiku-4-5-20251001-v1:0",
        "displayName": "Claude Haiku 4.5 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 5.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-haiku-5-5",
        "displayName": "Claude Haiku 5.5 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 0.55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-opus-4-7",
        "displayName": "Claude Opus 4.7 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-opus-4-8",
        "displayName": "Claude Opus 4.8 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-opus-5",
        "displayName": "Claude Opus 5 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-opus-5-5",
        "displayName": "Claude Opus 5.5 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.4,
        "outputCostPerMillionTokens": 22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "displayName": "Claude Sonnet 4.5 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-sonnet-4-6",
        "displayName": "Claude Sonnet 4.6 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-sonnet-5",
        "displayName": "Claude Sonnet 5 (JP)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta.llama3-1-70b-instruct-v1:0",
        "displayName": "Llama 3.1 70B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.72,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta.llama3-1-8b-instruct-v1:0",
        "displayName": "Llama 3.1 8B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 0.22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta.llama3-3-70b-instruct-v1:0",
        "displayName": "Llama 3.3 70B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.72,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta.llama4-maverick-17b-instruct-v1:0",
        "displayName": "Llama 4 Maverick 17B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.24,
        "outputCostPerMillionTokens": 0.97,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta.llama4-scout-17b-instruct-v1:0",
        "displayName": "Llama 4 Scout 17B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 10000000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.17,
        "outputCostPerMillionTokens": 0.66,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax.minimax-m2",
        "displayName": "MiniMax-M2",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 204608,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax.minimax-m2.1",
        "displayName": "MiniMax-M2.1",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 196608,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax.minimax-m2.5",
        "displayName": "MiniMax-M2.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 196608,
        "maxOutputTokens": 98304,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.devstral-2-123b",
        "displayName": "Devstral 2 123B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.magistral-small-2509",
        "displayName": "Magistral Small 1.2",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 40000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.ministral-3-14b-instruct",
        "displayName": "Ministral 14B 3.0",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.ministral-3-3b-instruct",
        "displayName": "Ministral 3 3B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 256000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.ministral-3-8b-instruct",
        "displayName": "Ministral 3 8B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.mistral-large-3-675b-instruct",
        "displayName": "Mistral Large 3",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.pixtral-large-2502-v1:0",
        "displayName": "Pixtral Large (25.02)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.voxtral-mini-3b-2507",
        "displayName": "Voxtral Mini 3B 2507",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 32768,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.04,
        "outputCostPerMillionTokens": 0.04,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.voxtral-small-24b-2507",
        "displayName": "Voxtral Small 24B 2507",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 32768,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshot.kimi-k2-thinking",
        "displayName": "Kimi K2 Thinking",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 16000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai.kimi-k2.5",
        "displayName": "Kimi K2.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia.nemotron-nano-12b-v2",
        "displayName": "NVIDIA Nemotron Nano 12B v2 VL BF16",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 131072,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia.nemotron-nano-3-30b",
        "displayName": "NVIDIA Nemotron Nano 3 30B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia.nemotron-nano-9b-v2",
        "displayName": "NVIDIA Nemotron Nano 9B v2",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 131072,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.23,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia.nemotron-super-3-120b",
        "displayName": "NVIDIA Nemotron 3 Super 120B A12B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.65,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-5.4",
        "displayName": "GPT-5.4",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.75,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-5.5",
        "displayName": "GPT-5.5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 33,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-5.6-luna",
        "displayName": "GPT-5.6 Luna",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 1.32,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-5.6-sol",
        "displayName": "GPT-5.6 Sol",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.4,
        "outputCostPerMillionTokens": 22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 13.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-6-astra",
        "displayName": "GPT-6 Astra",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 11,
        "outputCostPerMillionTokens": 55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-6-luna",
        "displayName": "GPT-6 Luna",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 0.55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-6-sol",
        "displayName": "GPT-6 Sol",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-6.1-sol",
        "displayName": "GPT-6.1 Sol",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-oss-120b",
        "displayName": "gpt-oss-120b",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-oss-120b-1:0",
        "displayName": "gpt-oss-120b",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 131072,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-oss-20b",
        "displayName": "gpt-oss-20b",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-oss-20b-1:0",
        "displayName": "gpt-oss-20b",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 131072,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-oss-safeguard-120b",
        "displayName": "GPT OSS Safeguard 120B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-oss-safeguard-20b",
        "displayName": "GPT OSS Safeguard 20B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-235b-a22b-2507-v1:0",
        "displayName": "Qwen3 235B-A22B Instruct 2507",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 0.88,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-32b-v1:0",
        "displayName": "Qwen3 32B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 32768,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-coder-30b-a3b-v1:0",
        "displayName": "Qwen3-Coder 30B-A3B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-coder-480b-a35b-v1:0",
        "displayName": "Qwen3-Coder 480B-A35B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.45,
        "outputCostPerMillionTokens": 1.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-coder-next",
        "displayName": "Qwen3 Coder Next",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-next-80b-a3b",
        "displayName": "Qwen3-Next 80B-A3B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 262000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-vl-235b-a22b",
        "displayName": "Qwen3 VL 235B A22B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262144,
        "maxOutputTokens": 262000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.53,
        "outputCostPerMillionTokens": 2.66,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us-gov.openai.gpt-oss-120b-1:0",
        "displayName": "gpt-oss-120b (GovCloud)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.18,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us-gov.openai.gpt-oss-20b-1:0",
        "displayName": "gpt-oss-20b (GovCloud)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.084,
        "outputCostPerMillionTokens": 0.36,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.amazon.nova-2-lite-v1:0",
        "displayName": "Nova 2 Lite (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.33,
        "outputCostPerMillionTokens": 2.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.amazon.nova-lite-v1:0",
        "displayName": "Nova Lite (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.amazon.nova-micro-v1:0",
        "displayName": "Nova Micro (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.035,
        "outputCostPerMillionTokens": 0.14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.amazon.nova-premier-v1:0",
        "displayName": "Nova Premier (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.amazon.nova-pro-v1:0",
        "displayName": "Nova Pro (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 300000,
        "maxOutputTokens": 10000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.8,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-fable-5",
        "displayName": "Claude Fable 5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 11,
        "outputCostPerMillionTokens": 55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-fable-5-1",
        "displayName": "Claude Fable 5.1 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 11,
        "outputCostPerMillionTokens": 55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        "displayName": "Claude Haiku 4.5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 5.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-haiku-5-5",
        "displayName": "Claude Haiku 5.5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 0.55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-opus-4-1-20250805-v1:0",
        "displayName": "Claude Opus 4.1 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-opus-4-5-20251101-v1:0",
        "displayName": "Claude Opus 4.5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-opus-4-6-v1",
        "displayName": "Claude Opus 4.6 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-opus-4-7",
        "displayName": "Claude Opus 4.7 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-opus-4-8",
        "displayName": "Claude Opus 4.8 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-opus-5",
        "displayName": "Claude Opus 5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 27.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-opus-5-5",
        "displayName": "Claude Opus 5.5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.4,
        "outputCostPerMillionTokens": 22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
        "displayName": "Claude Sonnet 4 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "displayName": "Claude Sonnet 4.5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-sonnet-4-6",
        "displayName": "Claude Sonnet 4.6 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-sonnet-5",
        "displayName": "Claude Sonnet 5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-sonnet-5-5",
        "displayName": "Claude Sonnet 5.5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.meta.llama3-1-70b-instruct-v1:0",
        "displayName": "Llama 3.1 70B Instruct (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.72,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.meta.llama3-1-8b-instruct-v1:0",
        "displayName": "Llama 3.1 8B Instruct (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 0.22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.meta.llama3-3-70b-instruct-v1:0",
        "displayName": "Llama 3.3 70B Instruct (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.72,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.meta.llama4-maverick-17b-instruct-v1:0",
        "displayName": "Llama 4 Maverick 17B Instruct (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.24,
        "outputCostPerMillionTokens": 0.97,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.meta.llama4-scout-17b-instruct-v1:0",
        "displayName": "Llama 4 Scout 17B Instruct (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 10000000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.17,
        "outputCostPerMillionTokens": 0.66,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.mistral.pixtral-large-2502-v1:0",
        "displayName": "Pixtral Large (25.02) (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.moonshotai.kimi-k3",
        "displayName": "Kimi K3 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1048576,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.3,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.openai.gpt-5.6-luna",
        "displayName": "GPT-5.6 Luna (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 1.32,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.openai.gpt-5.6-sol",
        "displayName": "GPT-5.6 Sol (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.4,
        "outputCostPerMillionTokens": 22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.openai.gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 13.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.openai.gpt-6-astra",
        "displayName": "GPT-6 Astra (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 11,
        "outputCostPerMillionTokens": 55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.openai.gpt-6-luna",
        "displayName": "GPT-6 Luna (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 0.55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.openai.gpt-6-sol",
        "displayName": "GPT-6 Sol (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.openai.gpt-6.1-sol",
        "displayName": "GPT-6.1 Sol (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 11,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.writer.palmyra-x4-v1:0",
        "displayName": "Palmyra X4 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 122880,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.writer.palmyra-x5-v1:0",
        "displayName": "Palmyra X5 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1040000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.xai.grok-4.6",
        "displayName": "Grok 4.6 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 6.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.xai.grok-4.7",
        "displayName": "Grok 4.7 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 6.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.zai.glm-5.3",
        "displayName": "GLM-5.3 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.848,
        "outputCostPerMillionTokens": 5.808,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "writer.palmyra-x4-v1:0",
        "displayName": "Palmyra X4",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 122880,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "writer.palmyra-x5-v1:0",
        "displayName": "Palmyra X5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1040000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xai.grok-4.3",
        "displayName": "Grok 4.3",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xai.grok-4.6",
        "displayName": "Grok 4.6",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.2,
        "outputCostPerMillionTokens": 6.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai.glm-4.7",
        "displayName": "GLM-4.7",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 202752,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai.glm-4.7-flash",
        "displayName": "GLM-4.7-Flash",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 202752,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai.glm-5",
        "displayName": "GLM-5",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 202752,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "ant-ling",
    "website": "https://www.ant-ling.com/",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://developer.ant-ling.com/en/docs/api-reference/",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "ant-ling"
    },
    "provider": {
      "id": "builtin-ant-ling",
      "type": "openai_completions",
      "name": "Ant Ling",
      "baseUrl": "https://api.ant-ling.com/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "Ling-3.1-flash",
        "displayName": "Ling 3.1 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Ling-3.0-flash",
        "displayName": "Ling 3.0 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Ling-2.6-1T",
        "displayName": "Ling 2.6 1T",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Ling-2.6-flash",
        "displayName": "Ling 2.6 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.01,
        "outputCostPerMillionTokens": 0.02,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Ring-2.6-1T",
        "displayName": "Ring 2.6 1T",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "anthropic",
    "website": "https://claude.com/platform/api",
    "productionVisible": true,
    "authentication": "anthropic_api_key",
    "recommendedGroup": "recommended",
    "catalogSource": {
      "documentationUrl": "https://platform.claude.com/docs/en/about-claude/models/overview",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "anthropic"
    },
    "provider": {
      "id": "builtin-anthropic",
      "type": "anthropic_messages",
      "name": "Anthropic",
      "baseUrl": "https://api.anthropic.com",
      "enabled": true
    },
    "models": [
      {
        "id": "claude-fable-5",
        "displayName": "Claude Fable 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-fable-5-1",
        "displayName": "Claude Fable 5.1",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-haiku-4-5",
        "displayName": "Claude Haiku 4.5 (latest)",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-haiku-4-5-20251001",
        "displayName": "Claude Haiku 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-haiku-5-5",
        "displayName": "Claude Haiku 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-opus-4-5",
        "displayName": "Claude Opus 4.5 (latest)",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-opus-4-5-20251101",
        "displayName": "Claude Opus 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-opus-4-6",
        "displayName": "Claude Opus 4.6",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-opus-4-7",
        "displayName": "Claude Opus 4.7",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-opus-4-8",
        "displayName": "Claude Opus 4.8",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-opus-5",
        "displayName": "Claude Opus 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-opus-5-5",
        "displayName": "Claude Opus 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-sonnet-4-5",
        "displayName": "Claude Sonnet 4.5 (latest)",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-sonnet-4-5-20250929",
        "displayName": "Claude Sonnet 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-sonnet-4-6",
        "displayName": "Claude Sonnet 4.6",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-sonnet-5",
        "displayName": "Claude Sonnet 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "claude-sonnet-5-5",
        "displayName": "Claude Sonnet 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "ark",
    "website": "https://www.volcengine.com/product/ark",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://ark.volcengine.com/region:cn-beijing/docs/model-list",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "official-manual"
    },
    "provider": {
      "id": "builtin-ark",
      "type": "openai_completions",
      "name": "VolcEngine Ark",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "enabled": true
    },
    "models": [
      {
        "id": "doubao-seed-evolving",
        "displayName": "Doubao-Seed-Evolving",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-2-1-pro-260915",
        "displayName": "Doubao-Seed-2.1-pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-2-1-lite-260915",
        "displayName": "Doubao-Seed-2.1-lite",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-2-1-turbo-260628",
        "displayName": "Doubao-Seed-2.1-turbo",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "ark-agent-plan",
    "website": "https://www.volcengine.com/product/ark",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://ark.volcengine.com/region:cn-beijing/docs/agent-plan-personal-plan-overview",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "official-manual"
    },
    "provider": {
      "id": "builtin-ark-agent-plan",
      "type": "openai_completions",
      "name": "VolcEngine Ark - Agent Plan",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/plan/v3",
      "enabled": true
    },
    "models": [
      {
        "id": "doubao-seed-2.0-mini",
        "displayName": "Doubao-Seed-2.0-mini",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-2.1-lite",
        "displayName": "Doubao-Seed-2.1-lite",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4-flash",
        "displayName": "DeepSeek-V4-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3-flash",
        "displayName": "GLM-5.3-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-2.1-pro",
        "displayName": "Doubao-Seed-2.1-pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-evolving",
        "displayName": "Doubao-Seed-Evolving",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax-m3",
        "displayName": "MiniMax-M3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3",
        "displayName": "GLM-5.3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.7-code",
        "displayName": "Kimi-K2.7-Code",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.8-preview",
        "displayName": "Kimi-K2.8-Preview",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4-pro",
        "displayName": "DeepSeek-V4-Pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k3",
        "displayName": "Kimi-K3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4.1-flash",
        "displayName": "DeepSeek-V4.1-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "ark-coding-plan",
    "website": "https://www.volcengine.com/product/ark",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://ark.volcengine.com/region:cn-beijing/docs/coding-plan-personal-plan-overview",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "official-manual"
    },
    "provider": {
      "id": "builtin-ark-coding-plan",
      "type": "openai_completions",
      "name": "VolcEngine Ark - Coding Plan",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3",
      "enabled": true
    },
    "models": [
      {
        "id": "doubao-seed-2.0-mini",
        "displayName": "Doubao-Seed-2.0-mini",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-2.1-lite",
        "displayName": "Doubao-Seed-2.1-lite",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4-flash",
        "displayName": "DeepSeek-V4-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3-flash",
        "displayName": "GLM-5.3-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-2.1-pro",
        "displayName": "Doubao-Seed-2.1-pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "doubao-seed-evolving",
        "displayName": "Doubao-Seed-Evolving",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax-m3",
        "displayName": "MiniMax-M3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3",
        "displayName": "GLM-5.3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.7-code",
        "displayName": "Kimi-K2.7-Code",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.8-preview",
        "displayName": "Kimi-K2.8-Preview",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4-pro",
        "displayName": "DeepSeek-V4-Pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k3",
        "displayName": "Kimi-K3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4.1-flash",
        "displayName": "DeepSeek-V4.1-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "azure-openai-responses",
    "website": "https://azure.microsoft.com/en-us/products/ai-services/openai-service",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "azure"
    },
    "provider": {
      "id": "builtin-azure-openai-responses",
      "type": "azure_openai_responses",
      "name": "Azure OpenAI Responses",
      "baseUrl": "https://openai.azure.com",
      "enabled": true
    },
    "models": [
      {
        "id": "gpt-4",
        "displayName": "GPT-4",
        "apiType": "azure_openai_responses",
        "contextWindow": 8192,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4-turbo",
        "displayName": "GPT-4 Turbo",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4.1",
        "displayName": "GPT-4.1",
        "apiType": "azure_openai_responses",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4.1-mini",
        "displayName": "GPT-4.1 mini",
        "apiType": "azure_openai_responses",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 1.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4.1-nano",
        "displayName": "GPT-4.1 nano",
        "apiType": "azure_openai_responses",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o",
        "displayName": "GPT-4o",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o-2024-05-13",
        "displayName": "GPT-4o (2024-05-13)",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o-2024-08-06",
        "displayName": "GPT-4o (2024-08-06)",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o-2024-11-20",
        "displayName": "GPT-4o (2024-11-20)",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o-mini",
        "displayName": "GPT-4o mini",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5",
        "displayName": "GPT-5",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5-chat-latest",
        "displayName": "GPT-5 Chat Latest",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5-mini",
        "displayName": "GPT-5 Mini",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5-nano",
        "displayName": "GPT-5 Nano",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5-pro",
        "displayName": "GPT-5 Pro",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 120,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.1",
        "displayName": "GPT-5.1",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.2",
        "displayName": "GPT-5.2",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.2-chat-latest",
        "displayName": "GPT-5.2 Chat",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.2-pro",
        "displayName": "GPT-5.2 Pro",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 21,
        "outputCostPerMillionTokens": 168,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.3-chat-latest",
        "displayName": "GPT-5.3 Chat (latest)",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.3-codex",
        "displayName": "GPT-5.3 Codex",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.3-codex-spark",
        "displayName": "GPT-5.3 Codex Spark",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4",
        "displayName": "GPT-5.4",
        "apiType": "azure_openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4-mini",
        "displayName": "GPT-5.4 mini",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4-nano",
        "displayName": "GPT-5.4 nano",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4-pro",
        "displayName": "GPT-5.4 Pro",
        "apiType": "azure_openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 180,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.5",
        "displayName": "GPT-5.5",
        "apiType": "azure_openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.5-pro",
        "displayName": "GPT-5.5 Pro",
        "apiType": "azure_openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 180,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-luna",
        "displayName": "GPT-5.6 Luna",
        "apiType": "azure_openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-sol",
        "displayName": "GPT-5.6 Sol",
        "apiType": "azure_openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra",
        "apiType": "azure_openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-astra",
        "displayName": "GPT-6 Astra",
        "apiType": "azure_openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-luna",
        "displayName": "GPT-6 Luna",
        "apiType": "azure_openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-sol",
        "displayName": "GPT-6 Sol",
        "apiType": "azure_openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6.1-sol",
        "displayName": "GPT-6.1 Sol",
        "apiType": "azure_openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-daybreak-blue-latest",
        "displayName": "Daybreak Blue",
        "apiType": "azure_openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-daybreak-red-latest",
        "displayName": "Daybreak Red",
        "apiType": "azure_openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 12.5,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-realtime-2.1",
        "displayName": "GPT-Realtime-2.1",
        "apiType": "azure_openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o1",
        "displayName": "o1",
        "apiType": "azure_openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o1-pro",
        "displayName": "o1-pro",
        "apiType": "azure_openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 150,
        "outputCostPerMillionTokens": 600,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o3",
        "displayName": "o3",
        "apiType": "azure_openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o3-mini",
        "displayName": "o3-mini",
        "apiType": "azure_openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o3-pro",
        "displayName": "o3-pro",
        "apiType": "azure_openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 20,
        "outputCostPerMillionTokens": 80,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o4-mini",
        "displayName": "o4-mini",
        "apiType": "azure_openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4-pro",
        "displayName": "DeepSeek V4 Pro",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.925,
        "outputCostPerMillionTokens": 3.828,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "deepseek",
    "website": "https://www.deepseek.com",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "recommended",
    "catalogSource": {
      "documentationUrl": "https://api-docs.deepseek.com/quick_start/pricing",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "deepseek"
    },
    "provider": {
      "id": "builtin-deepseek",
      "type": "openai_completions",
      "name": "DeepSeek",
      "baseUrl": "https://api.deepseek.com",
      "enabled": true
    },
    "models": [
      {
        "id": "deepseek-flash",
        "displayName": "DeepSeek-V4.1-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4-pro",
        "displayName": "DeepSeek V4 Pro",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.32,
        "outputCostPerMillionTokens": 3.96,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "google",
    "website": "https://ai.google.dev",
    "productionVisible": true,
    "authentication": "google_api_key",
    "recommendedGroup": "recommended",
    "catalogSource": {
      "documentationUrl": "https://ai.google.dev/gemini-api/docs/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "google"
    },
    "provider": {
      "id": "builtin-google",
      "type": "google_generative_ai",
      "name": "Google",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "enabled": true
    },
    "models": [
      {
        "id": "deep-research-max-preview-04-2026",
        "displayName": "Deep Research Max Preview (Apr-21-2026)",
        "apiType": "google_generative_ai",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deep-research-preview-04-2026",
        "displayName": "Deep Research Preview (Apr-21-2026)",
        "apiType": "google_generative_ai",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-2.5-flash",
        "displayName": "Gemini 2.5 Flash",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-2.5-flash-lite",
        "displayName": "Gemini 2.5 Flash-Lite",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-2.5-pro",
        "displayName": "Gemini 2.5 Pro",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3-flash-preview",
        "displayName": "Gemini 3 Flash Preview",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.1-flash-lite",
        "displayName": "Gemini 3.1 Flash Lite",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.1-flash-lite-image",
        "displayName": "Nano Banana 2 Lite",
        "apiType": "google_generative_ai",
        "contextWindow": 65536,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.1-flash-live-preview",
        "displayName": "Gemini 3.1 Flash Live Preview",
        "apiType": "google_generative_ai",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.1-pro-preview",
        "displayName": "Gemini 3.1 Pro Preview",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.1-pro-preview-customtools",
        "displayName": "Gemini 3.1 Pro Preview Custom Tools",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.5-flash",
        "displayName": "Gemini 3.5 Flash",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.5-flash-lite",
        "displayName": "Gemini 3.5 Flash Lite",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.6-flash",
        "displayName": "Gemini 3.6 Flash",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.7-flash",
        "displayName": "Gemini 3.7 Flash",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-3.8-flash",
        "displayName": "Gemini 3.8 Flash",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-4-argon",
        "displayName": "Gemini 4 Argon",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-flash-latest",
        "displayName": "Gemini Flash Latest",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-flash-lite-latest",
        "displayName": "Gemini Flash-Lite Latest",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemma-4-26b-a4b-it",
        "displayName": "Gemma 4 26B A4B IT",
        "apiType": "google_generative_ai",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemma-4-31b-it",
        "displayName": "Gemma 4 31B IT",
        "apiType": "google_generative_ai",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "groq",
    "website": "https://groq.com",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://console.groq.com/docs/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "groq"
    },
    "provider": {
      "id": "builtin-groq",
      "type": "openai_completions",
      "name": "Groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "llama-3.1-8b-instant",
        "displayName": "Llama 3.1 8B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.08,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "llama-3.3-70b-versatile",
        "displayName": "Llama 3.3 70B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.59,
        "outputCostPerMillionTokens": 0.79,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-120b",
        "displayName": "GPT OSS 120B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-20b",
        "displayName": "GPT OSS 20B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-safeguard-20b",
        "displayName": "Safety GPT OSS 20B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimaxai/minimax-m2.7",
        "displayName": "MiniMax M2.7",
        "apiType": "openai_completions",
        "contextWindow": 196608,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.8-27b",
        "displayName": "Qwen3.8 27B",
        "apiType": "openai_completions",
        "contextWindow": 131042,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.8,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "huggingface",
    "website": "https://huggingface.co",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://router.huggingface.co/v1/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "huggingface"
    },
    "provider": {
      "id": "builtin-huggingface",
      "type": "openai_completions",
      "name": "Hugging Face",
      "baseUrl": "https://router.huggingface.co/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "deepseek-ai/DeepSeek-R1",
        "displayName": "DeepSeek-R1",
        "apiType": "openai_completions",
        "contextWindow": 64000,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.7,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-R1-0528",
        "displayName": "DeepSeek-R1-0528",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 163840,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V3",
        "displayName": "DeepSeek-V3",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 1.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V3-0324",
        "displayName": "DeepSeek V3 0324",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 163840,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.27,
        "outputCostPerMillionTokens": 1.12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V3.1",
        "displayName": "DeepSeek-V3.1",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.27,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V3.2",
        "displayName": "DeepSeek-V3.2",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.28,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V4-Flash",
        "displayName": "DeepSeek V4 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V4-Flash-0731",
        "displayName": "DeepSeek V4 Flash 0731",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp",
        "displayName": "DeepSeek V4 Flash Vision Exp",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.44,
        "outputCostPerMillionTokens": 1.32,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V4-Pro",
        "displayName": "DeepSeek V4 Pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V4-Pro-0813",
        "displayName": "DeepSeek V4 Pro 0813",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.32,
        "outputCostPerMillionTokens": 3.96,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-ai/DeepSeek-V4.1-Flash",
        "displayName": "DeepSeek V4.1 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-3-12b-it",
        "displayName": "Gemma 3 12B IT",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-3-27b-it",
        "displayName": "Gemma 3 27B IT",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.08,
        "outputCostPerMillionTokens": 0.16,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-3-4b-it",
        "displayName": "Gemma 3 4B IT",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-26B-A4B-it",
        "displayName": "Gemma 4 26B A4B IT",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-31B-it",
        "displayName": "Gemma 4 31B IT",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/Llama-3.1-8B-Instruct",
        "displayName": "Llama-3.1-8B-Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.06,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/Llama-3.3-70B-Instruct",
        "displayName": "Llama-3.3-70B-Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.59,
        "outputCostPerMillionTokens": 0.79,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMaxAI/MiniMax-M1-80k",
        "displayName": "MiniMax M1 80K",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 80000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.55,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMaxAI/MiniMax-M2.5",
        "displayName": "MiniMax-M2.5",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMaxAI/MiniMax-M2.7",
        "displayName": "MiniMax-M2.7",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMaxAI/MiniMax-M3",
        "displayName": "MiniMax-M3",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 512000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/Kimi-K2-Instruct",
        "displayName": "Kimi-K2-Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/Kimi-K2-Instruct-0905",
        "displayName": "Kimi-K2-Instruct-0905",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/Kimi-K2.5",
        "displayName": "Kimi-K2.5",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/Kimi-K2.6",
        "displayName": "Kimi-K2.6",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/Kimi-K2.7-Code",
        "displayName": "Kimi K2.7 Code",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/Kimi-K3",
        "displayName": "Kimi K3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-120b",
        "displayName": "GPT OSS 120B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.69,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-20b",
        "displayName": "GPT OSS 20B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen2.5-Coder-32B-Instruct",
        "displayName": "Qwen2.5-Coder-32B-Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-235B-A22B",
        "displayName": "Qwen3 235B-A22B",
        "apiType": "openai_completions",
        "contextWindow": 32000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-235B-A22B-Instruct-2507",
        "displayName": "Qwen3 235B-A22B Instruct 2507",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.855,
        "outputCostPerMillionTokens": 2.565,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-235B-A22B-Thinking-2507",
        "displayName": "Qwen3-235B-A22B-Thinking-2507",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-30B-A3B",
        "displayName": "Qwen3 30B A3B",
        "apiType": "openai_completions",
        "contextWindow": 40960,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.12,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-32B",
        "displayName": "Qwen3 32B",
        "apiType": "openai_completions",
        "contextWindow": 40960,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.29,
        "outputCostPerMillionTokens": 0.59,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-Coder-30B-A3B-Instruct",
        "displayName": "Qwen3-Coder 30B-A3B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.26,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-Next-80B-A3B-Instruct",
        "displayName": "Qwen3-Next-80B-A3B-Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 66536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-VL-235B-A22B-Instruct",
        "displayName": "Qwen3 VL 235B A22B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-VL-30B-A3B-Instruct",
        "displayName": "Qwen3 VL 30B A3B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.5-122B-A10B",
        "displayName": "Qwen3.5 122B-A10B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.5-27B",
        "displayName": "Qwen3.5 27B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.5-35B-A3B",
        "displayName": "Qwen3.5 35B-A3B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.5-397B-A17B",
        "displayName": "Qwen3.5-397B-A17B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 3.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.5-9B",
        "displayName": "Qwen3.5 9B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.17,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.6-27B",
        "displayName": "Qwen3.6 27B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.47,
        "outputCostPerMillionTokens": 3.19,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.6-35B-A3B",
        "displayName": "Qwen3.6 35B-A3B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.95,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.8-2.4T-A95B",
        "displayName": "Qwen3.8 2.4T A95B",
        "apiType": "openai_completions",
        "contextWindow": 1010000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 6.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3.8-27B",
        "displayName": "Qwen3.8 27B",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stepfun-ai/Step-3.5-Flash",
        "displayName": "Step 3.5 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stepfun-ai/Step-3.7-Flash",
        "displayName": "Step 3.7 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/Hy3",
        "displayName": "Hy3",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.58,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/Hy4-preview",
        "displayName": "Hy4 preview",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.834,
        "outputCostPerMillionTokens": 2.501,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "thinkingmachines/Inkling",
        "displayName": "Inkling",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 4.05,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "thinkingmachines/Inkling-Small",
        "displayName": "Inkling Small",
        "apiType": "openai_completions",
        "contextWindow": 524288,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "XiaomiMiMo/MiMo-V2.5",
        "displayName": "MiMo-V2.5",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "XiaomiMiMo/MiMo-V2.5-Pro",
        "displayName": "MiMo-V2.5-Pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-4.5",
        "displayName": "GLM-4.5",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 98304,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-4.5-Air",
        "displayName": "GLM-4.5-Air",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 98304,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 0.85,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-4.5V",
        "displayName": "GLM-4.5V",
        "apiType": "openai_completions",
        "contextWindow": 65536,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 1.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-4.6",
        "displayName": "GLM-4.6",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.55,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-4.6V-Flash",
        "displayName": "GLM-4.6V-Flash",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-4.7",
        "displayName": "GLM-4.7",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-4.7-Flash",
        "displayName": "GLM-4.7-Flash",
        "apiType": "openai_completions",
        "contextWindow": 202752,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-5",
        "displayName": "GLM-5",
        "apiType": "openai_completions",
        "contextWindow": 202800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-5.1",
        "displayName": "GLM-5.1",
        "apiType": "openai_completions",
        "contextWindow": 202752,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-5.2",
        "displayName": "GLM-5.2",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-5.3",
        "displayName": "GLM-5.3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-5.3-Flash",
        "displayName": "GLM-5.3-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "minimax",
    "website": "https://www.minimax.io",
    "productionVisible": true,
    "authentication": "anthropic_api_key",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://platform.minimax.io/docs/guides/models-intro",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "minimax"
    },
    "provider": {
      "id": "builtin-minimax",
      "type": "anthropic_messages",
      "name": "MiniMax",
      "baseUrl": "https://api.minimax.io/anthropic",
      "enabled": true
    },
    "models": [
      {
        "id": "MiniMax-M2.7",
        "displayName": "MiniMax-M2.7",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMax-M2.7-highspeed",
        "displayName": "MiniMax-M2.7-highspeed",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMax-M3",
        "displayName": "MiniMax-M3",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 512000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "minimax-cn",
    "website": "https://www.minimaxi.com",
    "productionVisible": true,
    "authentication": "anthropic_api_key",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://platform.minimaxi.com/document/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "minimax-cn"
    },
    "provider": {
      "id": "builtin-minimax-cn",
      "type": "anthropic_messages",
      "name": "MiniMax CN",
      "baseUrl": "https://api.minimaxi.com/anthropic",
      "enabled": true
    },
    "models": [
      {
        "id": "MiniMax-M2.7",
        "displayName": "MiniMax-M2.7",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMax-M2.7-highspeed",
        "displayName": "MiniMax-M2.7-highspeed",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMax-M3",
        "displayName": "MiniMax-M3",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 512000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "moonshotai",
    "website": "https://www.moonshot.ai",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://platform.moonshot.ai/docs/guide/use-kimi-api",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "moonshotai"
    },
    "provider": {
      "id": "builtin-moonshotai",
      "type": "openai_completions",
      "name": "Moonshot AI",
      "baseUrl": "https://api.moonshot.ai/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "kimi-k2.6",
        "displayName": "Kimi K2.6",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.7-code",
        "displayName": "Kimi K2.7 Code",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.7-code-highspeed",
        "displayName": "Kimi K2.7 Code HighSpeed",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.9,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k3",
        "displayName": "Kimi K3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "moonshotai-cn",
    "website": "https://www.moonshot.cn",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://platform.moonshot.cn/docs/guide/use-kimi-api",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "moonshotai-cn"
    },
    "provider": {
      "id": "builtin-moonshotai-cn",
      "type": "openai_completions",
      "name": "Moonshot AI CN",
      "baseUrl": "https://api.moonshot.cn/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "kimi-k2.6",
        "displayName": "Kimi K2.6",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.7-code",
        "displayName": "Kimi K2.7 Code",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.7-code-highspeed",
        "displayName": "Kimi K2.7 Code HighSpeed",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.9,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k3",
        "displayName": "Kimi K3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "nvidia",
    "website": "https://build.nvidia.com",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://integrate.api.nvidia.com/v1/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "nvidia"
    },
    "provider": {
      "id": "builtin-nvidia",
      "type": "openai_completions",
      "name": "NVIDIA",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "deepseek-ai/deepseek-v4.1-flash",
        "displayName": "DeepSeek V4.1 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/diffusiongemma-26b-a4b-it",
        "displayName": "DiffusionGemma 26B A4B IT",
        "apiType": "openai_completions",
        "contextWindow": 250000,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-3-12b-it",
        "displayName": "Gemma 3 12B IT",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-3-4b-it",
        "displayName": "Gemma 3 4B IT",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-3.2-11b-vision-instruct",
        "displayName": "Llama 3.2 11b Vision Instruct",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-3.2-90b-vision-instruct",
        "displayName": "Llama-3.2-90B-Vision-Instruct",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-glimmer-30b",
        "displayName": "Muse Glimmer 30B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-7b-instruct-v0.3",
        "displayName": "Mistral-7B-Instruct-v0.3",
        "apiType": "openai_completions",
        "contextWindow": 65536,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.6",
        "displayName": "Kimi K2.6",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/cosmos-reason2-8b",
        "displayName": "Cosmos Reason2 8B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/llama-3.1-nemotron-70b-instruct",
        "displayName": "Llama 3.1 Nemotron 70B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/llama-3.1-nemotron-ultra-253b-v1",
        "displayName": "Llama 3.1 Nemotron Ultra 253B",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "displayName": "Nemotron 3 Nano Omni",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-ultra-550b-a55b",
        "displayName": "Nemotron 3 Ultra 550B A55B",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-lightning-30b-a3b",
        "displayName": "Nemotron 3.5 Lightning 30B A3B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-super-vl-120b-a12b",
        "displayName": "Nemotron 3.5 Super VL 120B A12B",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-20b",
        "displayName": "GPT OSS 20B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "poolside/laguna-xs-2.1",
        "displayName": "Laguna XS 2.1",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.3",
        "displayName": "GLM-5.3",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.3-flash",
        "displayName": "GLM-5.3-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "openai",
    "website": "https://openai.com",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "recommended",
    "catalogSource": {
      "documentationUrl": "https://platform.openai.com/docs/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "openai"
    },
    "provider": {
      "id": "builtin-openai",
      "type": "openai_responses",
      "name": "OpenAI",
      "baseUrl": "https://api.openai.com/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "gpt-4",
        "displayName": "GPT-4",
        "apiType": "openai_responses",
        "contextWindow": 8192,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4-turbo",
        "displayName": "GPT-4 Turbo",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4.1",
        "displayName": "GPT-4.1",
        "apiType": "openai_responses",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4.1-mini",
        "displayName": "GPT-4.1 mini",
        "apiType": "openai_responses",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 1.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4.1-nano",
        "displayName": "GPT-4.1 nano",
        "apiType": "openai_responses",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o",
        "displayName": "GPT-4o",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o-2024-05-13",
        "displayName": "GPT-4o (2024-05-13)",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o-2024-08-06",
        "displayName": "GPT-4o (2024-08-06)",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o-2024-11-20",
        "displayName": "GPT-4o (2024-11-20)",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-4o-mini",
        "displayName": "GPT-4o mini",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5",
        "displayName": "GPT-5",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5-chat-latest",
        "displayName": "GPT-5 Chat Latest",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5-mini",
        "displayName": "GPT-5 Mini",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5-nano",
        "displayName": "GPT-5 Nano",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5-pro",
        "displayName": "GPT-5 Pro",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 120,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.1",
        "displayName": "GPT-5.1",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.2",
        "displayName": "GPT-5.2",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.2-chat-latest",
        "displayName": "GPT-5.2 Chat",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.2-pro",
        "displayName": "GPT-5.2 Pro",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 21,
        "outputCostPerMillionTokens": 168,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.3-chat-latest",
        "displayName": "GPT-5.3 Chat (latest)",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.3-codex",
        "displayName": "GPT-5.3 Codex",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.3-codex-spark",
        "displayName": "GPT-5.3 Codex Spark",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4",
        "displayName": "GPT-5.4",
        "apiType": "openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4-mini",
        "displayName": "GPT-5.4 mini",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4-nano",
        "displayName": "GPT-5.4 nano",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4-pro",
        "displayName": "GPT-5.4 Pro",
        "apiType": "openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 180,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.5",
        "displayName": "GPT-5.5",
        "apiType": "openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.5-pro",
        "displayName": "GPT-5.5 Pro",
        "apiType": "openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 180,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-luna",
        "displayName": "GPT-5.6 Luna",
        "apiType": "openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-sol",
        "displayName": "GPT-5.6 Sol",
        "apiType": "openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra",
        "apiType": "openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-astra",
        "displayName": "GPT-6 Astra",
        "apiType": "openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-luna",
        "displayName": "GPT-6 Luna",
        "apiType": "openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-sol",
        "displayName": "GPT-6 Sol",
        "apiType": "openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6.1-sol",
        "displayName": "GPT-6.1 Sol",
        "apiType": "openai_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-daybreak-blue-latest",
        "displayName": "Daybreak Blue",
        "apiType": "openai_responses",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-daybreak-red-latest",
        "displayName": "Daybreak Red",
        "apiType": "openai_responses",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 12.5,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-realtime-2.1",
        "displayName": "GPT-Realtime-2.1",
        "apiType": "openai_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o1",
        "displayName": "o1",
        "apiType": "openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o1-pro",
        "displayName": "o1-pro",
        "apiType": "openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 150,
        "outputCostPerMillionTokens": 600,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o3",
        "displayName": "o3",
        "apiType": "openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o3-mini",
        "displayName": "o3-mini",
        "apiType": "openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o3-pro",
        "displayName": "o3-pro",
        "apiType": "openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 20,
        "outputCostPerMillionTokens": 80,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "o4-mini",
        "displayName": "o4-mini",
        "apiType": "openai_responses",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "openai-codex",
    "website": "https://openai.com/codex",
    "productionVisible": true,
    "authentication": "oauth",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://developers.openai.com/codex/models/",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "openai-codex"
    },
    "provider": {
      "id": "builtin-openai-codex",
      "type": "openai_codex_responses",
      "name": "OpenAI Codex",
      "baseUrl": "https://chatgpt.com/backend-api",
      "enabled": true
    },
    "models": [
      {
        "id": "gpt-5.3-codex-spark",
        "displayName": "GPT-5.3 Codex Spark",
        "apiType": "openai_codex_responses",
        "contextWindow": 128000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.5",
        "displayName": "GPT-5.5",
        "apiType": "openai_codex_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-luna",
        "displayName": "GPT-5.6 Luna",
        "apiType": "openai_codex_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-sol",
        "displayName": "GPT-5.6 Sol",
        "apiType": "openai_codex_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra",
        "apiType": "openai_codex_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-astra",
        "displayName": "GPT-6 Astra",
        "apiType": "openai_codex_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-luna",
        "displayName": "GPT-6 Luna",
        "apiType": "openai_codex_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6-sol",
        "displayName": "GPT-6 Sol",
        "apiType": "openai_codex_responses",
        "contextWindow": 272000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-6.1-sol",
        "displayName": "GPT-6.1 Sol",
        "apiType": "openai_codex_responses",
        "contextWindow": 500000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "openrouter",
    "website": "https://openrouter.ai",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://openrouter.ai/api/v1/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "openrouter"
    },
    "provider": {
      "id": "builtin-openrouter",
      "type": "anthropic_messages",
      "name": "OpenRouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "anthropic/claude-fable-5",
        "displayName": "Anthropic: Claude Fable 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-fable-5.1",
        "displayName": "Anthropic: Claude Fable 5.1",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-haiku-4.5",
        "displayName": "Anthropic: Claude Haiku 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-haiku-5.5",
        "displayName": "Anthropic: Claude Haiku 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.1",
        "displayName": "Anthropic: Claude Opus 4.1",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.5",
        "displayName": "Anthropic: Claude Opus 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.6",
        "displayName": "Anthropic: Claude Opus 4.6",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.7",
        "displayName": "Anthropic: Claude Opus 4.7",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.8",
        "displayName": "Anthropic: Claude Opus 4.8",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5",
        "displayName": "Anthropic: Claude Opus 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5.5",
        "displayName": "Anthropic: Claude Opus 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.5",
        "displayName": "Anthropic: Claude Sonnet 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.6",
        "displayName": "Anthropic: Claude Sonnet 4.6",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5",
        "displayName": "Anthropic: Claude Sonnet 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5.5",
        "displayName": "Anthropic: Claude Sonnet 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~anthropic/claude-fable-latest",
        "displayName": "Anthropic: Claude Fable Latest",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~anthropic/claude-haiku-latest",
        "displayName": "Anthropic: Claude Haiku Latest",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~anthropic/claude-opus-latest",
        "displayName": "Anthropic: Claude Opus Latest",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~anthropic/claude-sonnet-latest",
        "displayName": "Anthropic: Claude Sonnet Latest",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~deepseek/deepseek-flash-latest",
        "displayName": "DeepSeek: DeepSeek Flash Latest",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.00576,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~deepseek/deepseek-pro-latest",
        "displayName": "DeepSeek: DeepSeek Pro Latest",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1307,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~deepseek/deepseek-v4-flash-latest",
        "displayName": "DeepSeek: DeepSeek V4 Flash Latest",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.0144,
        "outputCostPerMillionTokens": 0.576,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~google/gemini-flash-latest",
        "displayName": "Google: Gemini Flash Latest",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~google/gemini-pro-latest",
        "displayName": "Google: Gemini Pro Latest",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~moonshotai/kimi-latest",
        "displayName": "MoonshotAI: Kimi Latest",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~openai/gpt-astra-latest",
        "displayName": "OpenAI: GPT Astra Latest",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~openai/gpt-luna-latest",
        "displayName": "OpenAI: GPT Luna Latest",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~openai/gpt-mini-latest",
        "displayName": "OpenAI: GPT Mini Latest",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~openai/gpt-sol-latest",
        "displayName": "OpenAI: GPT Sol Latest",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~openai/gpt-terra-latest",
        "displayName": "OpenAI: GPT Terra Latest",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~unbiased/pareto-latest",
        "displayName": "Pareto Latest",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~x-ai/grok-latest",
        "displayName": "xAI: Grok Latest",
        "apiType": "openai_completions",
        "contextWindow": 500000,
        "maxOutputTokens": 450000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~z-ai/glm-flash-latest",
        "displayName": "Z.ai: GLM Flash Latest",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.036,
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~z-ai/glm-latest",
        "displayName": "Z.ai: GLM Latest",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.0608,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "aion-labs/aion-2.0",
        "displayName": "AionLabs: Aion-2.0",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.8,
        "outputCostPerMillionTokens": 1.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "aion-labs/aion-3.0",
        "displayName": "AionLabs: Aion-3.0",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "aion-labs/aion-3.0-mini",
        "displayName": "AionLabs: Aion-3.0-Mini",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.7,
        "outputCostPerMillionTokens": 1.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "aion-labs/aion-3.5",
        "displayName": "AionLabs: Aion 3.5",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "aion-labs/aion-3.5-mini",
        "displayName": "AionLabs: Aion 3.5 Mini",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.7,
        "outputCostPerMillionTokens": 1.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-2-lite-v1",
        "displayName": "Amazon: Nova 2 Lite",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-lite-v1",
        "displayName": "Amazon: Nova Lite 1.0",
        "apiType": "openai_completions",
        "contextWindow": 300000,
        "maxOutputTokens": 5120,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-micro-v1",
        "displayName": "Amazon: Nova Micro 1.0",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 5120,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.035,
        "outputCostPerMillionTokens": 0.14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-premier-v1",
        "displayName": "Amazon: Nova Premier 1.0",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-pro-v1",
        "displayName": "Amazon: Nova Pro 1.0",
        "apiType": "openai_completions",
        "contextWindow": 300000,
        "maxOutputTokens": 5120,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.8,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-fable-5:batch",
        "displayName": "Anthropic: Claude Fable 5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-fable-5.1:batch",
        "displayName": "Anthropic: Claude Fable 5.1 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-haiku-4.5:batch",
        "displayName": "Anthropic: Claude Haiku 4.5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-haiku-5.5:batch",
        "displayName": "Anthropic: Claude Haiku 5.5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.1:batch",
        "displayName": "Anthropic: Claude Opus 4.1 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 7.5,
        "outputCostPerMillionTokens": 37.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.5:batch",
        "displayName": "Anthropic: Claude Opus 4.5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.6:batch",
        "displayName": "Anthropic: Claude Opus 4.6 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.7:batch",
        "displayName": "Anthropic: Claude Opus 4.7 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.8:batch",
        "displayName": "Anthropic: Claude Opus 4.8 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5:batch",
        "displayName": "Anthropic: Claude Opus 5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5.5:batch",
        "displayName": "Anthropic: Claude Opus 5.5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.5:batch",
        "displayName": "Anthropic: Claude Sonnet 4.5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.6:batch",
        "displayName": "Anthropic: Claude Sonnet 4.6 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5:batch",
        "displayName": "Anthropic: Claude Sonnet 5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5.5:batch",
        "displayName": "Anthropic: Claude Sonnet 5.5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "arcee-ai/trinity-large-thinking",
        "displayName": "Arcee AI: Trinity Large Thinking",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 80000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance-seed/seed-1.6",
        "displayName": "ByteDance Seed: Seed 1.6",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance-seed/seed-1.6-flash",
        "displayName": "ByteDance Seed: Seed 1.6 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance-seed/seed-2-1-turbo",
        "displayName": "ByteDance Seed: Seed 2.1 Turbo",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance-seed/seed-2.0-code",
        "displayName": "ByteDance Seed: Seed-2.0-Code",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance-seed/seed-2.0-lite",
        "displayName": "ByteDance Seed: Seed-2.0-Lite",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance-seed/seed-2.0-mini",
        "displayName": "ByteDance Seed: Seed-2.0-Mini",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "cohere/command-a-plus",
        "displayName": "Cohere: Command A+",
        "apiType": "openai_completions",
        "contextWindow": 192000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "cohere/command-r-08-2024",
        "displayName": "Cohere: Command R (08-2024)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 4000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "cohere/command-r-plus-08-2024",
        "displayName": "Cohere: Command R+ (08-2024)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 4000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "cohere/north-mini-code:free",
        "displayName": "Cohere: North Mini Code (free)",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-chat",
        "displayName": "DeepSeek: DeepSeek V3",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.32,
        "outputCostPerMillionTokens": 0.89,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-chat-v3-0324",
        "displayName": "DeepSeek: DeepSeek V3 0324",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 115200,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.29,
        "outputCostPerMillionTokens": 1.14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-chat-v3.1",
        "displayName": "DeepSeek: DeepSeek V3.1",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.95,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-r1",
        "displayName": "DeepSeek: R1",
        "apiType": "openai_completions",
        "contextWindow": 64000,
        "maxOutputTokens": 16000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.7,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-r1-0528",
        "displayName": "DeepSeek: R1 0528",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 2.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v3.1-terminus",
        "displayName": "DeepSeek: DeepSeek V3.1 Terminus",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 147456,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.27,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v3.2",
        "displayName": "DeepSeek: DeepSeek V3.2",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.259,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v3.2-exp",
        "displayName": "DeepSeek: DeepSeek V3.2 Exp",
        "apiType": "openai_completions",
        "contextWindow": 163840,
        "maxOutputTokens": 147456,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.27,
        "outputCostPerMillionTokens": 0.41,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-flash",
        "displayName": "DeepSeek: DeepSeek V4 Flash 0423",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943717,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.091,
        "outputCostPerMillionTokens": 0.182,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-flash-0731",
        "displayName": "DeepSeek: DeepSeek V4 Flash 0731",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.016,
        "outputCostPerMillionTokens": 0.64,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-flash-vision-exp",
        "displayName": "DeepSeek: DeepSeek V4 Flash Vision Exp",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2156,
        "outputCostPerMillionTokens": 0.6468,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-pro",
        "displayName": "DeepSeek: DeepSeek V4 Pro 0423",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.392022,
        "outputCostPerMillionTokens": 0.784044,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-pro-0813",
        "displayName": "DeepSeek: DeepSeek V4 Pro 0813",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.66,
        "outputCostPerMillionTokens": 1.98,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4.1-flash",
        "displayName": "DeepSeek: DeepSeek V4.1 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 393216,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.00576,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4.1-flash:batch",
        "displayName": "DeepSeek: DeepSeek V4.1 Flash (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.112,
        "outputCostPerMillionTokens": 0.336,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "dots-studio/dots-3-note-preview:free",
        "displayName": "Dots Studio: Dots3-Note Preview (free)",
        "apiType": "openai_completions",
        "contextWindow": 512000,
        "maxOutputTokens": 460800,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "fireworks/ember-1",
        "displayName": "Fireworks: Ember-1",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash",
        "displayName": "Google: Gemini 2.5 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash-lite",
        "displayName": "Google: Gemini 2.5 Flash Lite",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash-lite:batch",
        "displayName": "Google: Gemini 2.5 Flash Lite (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash:batch",
        "displayName": "Google: Gemini 2.5 Flash (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-pro",
        "displayName": "Google: Gemini 2.5 Pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-pro-preview",
        "displayName": "Google: Gemini 2.5 Pro Preview 06-05",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-pro:batch",
        "displayName": "Google: Gemini 2.5 Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.625,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3-flash-preview",
        "displayName": "Google: Gemini 3 Flash Preview",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3-flash-preview:batch",
        "displayName": "Google: Gemini 3 Flash Preview (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3-pro-image",
        "displayName": "Google: Nano Banana Pro (Gemini 3 Pro Image)",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-flash-lite",
        "displayName": "Google: Gemini 3.1 Flash Lite",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-flash-lite-preview",
        "displayName": "Google: Gemini 3.1 Flash Lite Preview",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-flash-lite:batch",
        "displayName": "Google: Gemini 3.1 Flash Lite (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.125,
        "outputCostPerMillionTokens": 0.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-pro-preview",
        "displayName": "Google: Gemini 3.1 Pro Preview",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-pro-preview-customtools",
        "displayName": "Google: Gemini 3.1 Pro Preview Custom Tools",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-pro-preview:batch",
        "displayName": "Google: Gemini 3.1 Pro Preview (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.5-flash",
        "displayName": "Google: Gemini 3.5 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.5-flash-lite",
        "displayName": "Google: Gemini 3.5 Flash Lite",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.5-flash-lite:batch",
        "displayName": "Google: Gemini 3.5 Flash Lite (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.5-flash:batch",
        "displayName": "Google: Gemini 3.5 Flash (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.6-flash",
        "displayName": "Google: Gemini 3.6 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.6-flash:batch",
        "displayName": "Google: Gemini 3.6 Flash (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.375,
        "outputCostPerMillionTokens": 1.875,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.7-flash",
        "displayName": "Google: Gemini 3.7 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.7-flash:batch",
        "displayName": "Google: Gemini 3.7 Flash (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.375,
        "outputCostPerMillionTokens": 1.875,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.8-flash",
        "displayName": "Google: Gemini 3.8 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.8-flash:batch",
        "displayName": "Google: Gemini 3.8 Flash (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.375,
        "outputCostPerMillionTokens": 1.875,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-4-argon",
        "displayName": "Google: Gemini 4 Argon",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-4-argon:batch",
        "displayName": "Google: Gemini 4 Argon (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-nano-banana-2.1",
        "displayName": "Google: Nano Banana 2.1",
        "apiType": "openai_completions",
        "contextWindow": 65536,
        "maxOutputTokens": 58982,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-3-12b-it",
        "displayName": "Google: Gemma 3 12B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-3-27b-it",
        "displayName": "Google: Gemma 3 27B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 117964,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.08,
        "outputCostPerMillionTokens": 0.45,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-26b-a4b-it",
        "displayName": "Google: Gemma 4 26B A4B ",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.09,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-26b-a4b-it:free",
        "displayName": "Google: Gemma 4 26B A4B  (free)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-31b-it",
        "displayName": "Google: Gemma 4 31B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-31b-it:free",
        "displayName": "Google: Gemma 4 31B (free)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "ibm-granite/granite-4.2-8b",
        "displayName": "IBM: Granite 4.2 8B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 117964,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inception/mercury-2",
        "displayName": "Inception: Mercury 2",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 50000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inception/mercury-2.5",
        "displayName": "Inception: Mercury 2.5",
        "apiType": "openai_completions",
        "contextWindow": 260000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.04,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-3.0-flash",
        "displayName": "inclusionAI: Ling 3.0 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.021,
        "outputCostPerMillionTokens": 0.063,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-3.0-flash-vl",
        "displayName": "inclusionAI: Ling 3.0 Flash VL",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.18,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-3.1-flash",
        "displayName": "inclusionAI: Ling 3.1 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.225,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "liquid/lfm-2.5-2.6b:free",
        "displayName": "LiquidAI: LFM2.5-2.6B (free)",
        "apiType": "openai_completions",
        "contextWindow": 65536,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "liquid/lfm-2.5-24b-a2b",
        "displayName": "LiquidAI: LFM2.5-24B-A2B",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meituan/longcat-2.0",
        "displayName": "Meituan: LongCat 2.0",
        "apiType": "openai_completions",
        "contextWindow": 1048756,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/llama-3.1-70b-instruct",
        "displayName": "Meta: Llama 3.1 70B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/llama-3.1-8b-instruct",
        "displayName": "Meta: Llama 3.1 8B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 117964,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.08,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/llama-3.3-70b-instruct",
        "displayName": "Meta: Llama 3.3 70B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.59,
        "outputCostPerMillionTokens": 0.79,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/llama-4-maverick",
        "displayName": "Meta: Llama 4 Maverick",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1875,
        "outputCostPerMillionTokens": 0.6525,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/llama-4-scout",
        "displayName": "Meta: Llama 4 Scout",
        "apiType": "openai_completions",
        "contextWindow": 1310720,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.18,
        "outputCostPerMillionTokens": 0.59,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-glimmer-30b",
        "displayName": "Meta: Muse Glimmer 30B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.1",
        "displayName": "Meta: Muse Spark 1.1",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.2",
        "displayName": "Meta: Muse Spark 1.2",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.2-contributor",
        "displayName": "Meta: Muse Spark 1.2 Contributor",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.3",
        "displayName": "Meta: Muse Spark 1.3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.3-contributor",
        "displayName": "Meta: Muse Spark 1.3 Contributor",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-open",
        "displayName": "Meta: Muse Spark Open",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-wonder",
        "displayName": "Meta: Muse Wonder",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m1",
        "displayName": "MiniMax: MiniMax M1",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 40000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.55,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2",
        "displayName": "MiniMax: MiniMax M2",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.255,
        "outputCostPerMillionTokens": 1.02,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.1",
        "displayName": "MiniMax: MiniMax M2.1",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.5",
        "displayName": "MiniMax: MiniMax M2.5",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.27,
        "outputCostPerMillionTokens": 0.95,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.7",
        "displayName": "MiniMax: MiniMax M2.7",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m3",
        "displayName": "MiniMax: MiniMax M3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 512000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/codestral-2508",
        "displayName": "Mistral: Codestral 2508",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 204800,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/codestral-2508:batch",
        "displayName": "Mistral: Codestral 2508 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 204800,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.45,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/devstral-2512",
        "displayName": "Mistral: Devstral 2 2512",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/ministral-14b-2512",
        "displayName": "Mistral: Ministral 3 14B 2512",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/ministral-3b-2512",
        "displayName": "Mistral: Ministral 3 3B 2512",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 104857,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/ministral-8b-2512",
        "displayName": "Mistral: Ministral 3 8B 2512",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/ministral-8b-2512:batch",
        "displayName": "Mistral: Ministral 3 8B 2512 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.075,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-large",
        "displayName": "Mistral Large",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 102400,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-large-2407",
        "displayName": "Mistral Large 2407",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 104857,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-large-2512",
        "displayName": "Mistral: Mistral Large 3 2512",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-large-2512:batch",
        "displayName": "Mistral: Mistral Large 3 2512 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-large-4-0",
        "displayName": "Mistral: Mistral Large 4",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.68,
        "outputCostPerMillionTokens": 2.09,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-medium-3",
        "displayName": "Mistral: Mistral Medium 3",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 104857,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-medium-3-5",
        "displayName": "Mistral: Mistral Medium 3.5",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-medium-3-5:batch",
        "displayName": "Mistral: Mistral Medium 3.5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-medium-3.1",
        "displayName": "Mistral: Mistral Medium 3.1",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 104857,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-medium-3.1:batch",
        "displayName": "Mistral: Mistral Medium 3.1 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 104857,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-nemo",
        "displayName": "Mistral: Mistral Nemo",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.029,
        "outputCostPerMillionTokens": 0.03,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-saba",
        "displayName": "Mistral: Saba",
        "apiType": "openai_completions",
        "contextWindow": 32768,
        "maxOutputTokens": 26214,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-small-2603",
        "displayName": "Mistral: Mistral Small 4",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-small-2603:batch",
        "displayName": "Mistral: Mistral Small 4 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 209715,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-small-3.1-24b-instruct",
        "displayName": "Mistral: Mistral Small 3.1 24B",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 102400,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.351,
        "outputCostPerMillionTokens": 0.555,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-small-3.2-24b-instruct",
        "displayName": "Mistral: Mistral Small 3.2 24B",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.09375,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mixtral-8x22b-instruct",
        "displayName": "Mistral: Mixtral 8x22B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 65536,
        "maxOutputTokens": 52428,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/voxtral-small-24b-2507",
        "displayName": "Mistral: Voxtral Small 24B 2507",
        "apiType": "openai_completions",
        "contextWindow": 32768,
        "maxOutputTokens": 26214,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2",
        "displayName": "MoonshotAI: Kimi K2 0711",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 98304,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.57,
        "outputCostPerMillionTokens": 2.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2-0905",
        "displayName": "MoonshotAI: Kimi K2 0905",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 98304,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2-thinking",
        "displayName": "MoonshotAI: Kimi K2 Thinking",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 98304,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.5",
        "displayName": "MoonshotAI: Kimi K2.5",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.41,
        "outputCostPerMillionTokens": 2.06,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.6",
        "displayName": "MoonshotAI: Kimi K2.6",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.65,
        "outputCostPerMillionTokens": 3.41,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.7-code",
        "displayName": "MoonshotAI: Kimi K2.7 Code",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6712,
        "outputCostPerMillionTokens": 3.35,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k3",
        "displayName": "MoonshotAI: Kimi K3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.405,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k3:batch",
        "displayName": "MoonshotAI: Kimi K3 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.28,
        "outputCostPerMillionTokens": 11.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nex-agi/nex-n2.5-pro",
        "displayName": "Nex AGI: Nex-N2.5-Pro",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-nano-30b-a3b",
        "displayName": "NVIDIA: Nemotron 3 Nano 30B A3B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "displayName": "NVIDIA: Nemotron 3 Nano Omni (free)",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-super-120b-a12b",
        "displayName": "NVIDIA: Nemotron 3 Super",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.08,
        "outputCostPerMillionTokens": 0.45,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-super-120b-a12b:free",
        "displayName": "NVIDIA: Nemotron 3 Super (free)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-ultra-550b-a55b",
        "displayName": "NVIDIA: Nemotron 3 Ultra",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 182520,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "displayName": "NVIDIA: Nemotron 3 Ultra (free)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-lightning",
        "displayName": "NVIDIA: Nemotron 3.5 Lightning",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-lightning:free",
        "displayName": "NVIDIA: Nemotron 3.5 Lightning (free)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-super-vl",
        "displayName": "NVIDIA: Nemotron 3.5 Super VL",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-super-vl:free",
        "displayName": "NVIDIA: Nemotron 3.5 Super VL (free)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-3.5-turbo",
        "displayName": "OpenAI: GPT-3.5 Turbo",
        "apiType": "openai_completions",
        "contextWindow": 16385,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-3.5-turbo-0613",
        "displayName": "OpenAI: GPT-3.5 Turbo (older v0613)",
        "apiType": "openai_completions",
        "contextWindow": 4095,
        "maxOutputTokens": 3685,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-3.5-turbo-16k",
        "displayName": "OpenAI: GPT-3.5 Turbo 16k",
        "apiType": "openai_completions",
        "contextWindow": 16385,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-3.5-turbo:batch",
        "displayName": "OpenAI: GPT-3.5 Turbo (batch)",
        "apiType": "openai_completions",
        "contextWindow": 16385,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4",
        "displayName": "OpenAI: GPT-4",
        "apiType": "openai_completions",
        "contextWindow": 8191,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4-turbo",
        "displayName": "OpenAI: GPT-4 Turbo",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4-turbo:batch",
        "displayName": "OpenAI: GPT-4 Turbo (batch)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1",
        "displayName": "OpenAI: GPT-4.1",
        "apiType": "openai_completions",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-mini",
        "displayName": "OpenAI: GPT-4.1 Mini",
        "apiType": "openai_completions",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 1.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-mini:batch",
        "displayName": "OpenAI: GPT-4.1 Mini (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-nano",
        "displayName": "OpenAI: GPT-4.1 Nano",
        "apiType": "openai_completions",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-nano:batch",
        "displayName": "OpenAI: GPT-4.1 Nano (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1:batch",
        "displayName": "OpenAI: GPT-4.1 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o",
        "displayName": "OpenAI: GPT-4o",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-2024-05-13",
        "displayName": "OpenAI: GPT-4o (2024-05-13)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-2024-08-06",
        "displayName": "OpenAI: GPT-4o (2024-08-06)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-2024-11-20",
        "displayName": "OpenAI: GPT-4o (2024-11-20)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-mini",
        "displayName": "OpenAI: GPT-4o-mini",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-mini-2024-07-18",
        "displayName": "OpenAI: GPT-4o-mini (2024-07-18)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-mini:batch",
        "displayName": "OpenAI: GPT-4o-mini (batch)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o:batch",
        "displayName": "OpenAI: GPT-4o (batch)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5",
        "displayName": "OpenAI: GPT-5",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-mini",
        "displayName": "OpenAI: GPT-5 Mini",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-mini:batch",
        "displayName": "OpenAI: GPT-5 Mini (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.125,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-nano",
        "displayName": "OpenAI: GPT-5 Nano",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-nano:batch",
        "displayName": "OpenAI: GPT-5 Nano (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.025,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-pro",
        "displayName": "OpenAI: GPT-5 Pro",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 120,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-pro:batch",
        "displayName": "OpenAI: GPT-5 Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 7.5,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5:batch",
        "displayName": "OpenAI: GPT-5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.625,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1",
        "displayName": "OpenAI: GPT-5.1",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1-codex",
        "displayName": "OpenAI: GPT-5.1-Codex",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1-codex-max",
        "displayName": "OpenAI: GPT-5.1-Codex-Max",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1-codex-mini",
        "displayName": "OpenAI: GPT-5.1-Codex-Mini",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1:batch",
        "displayName": "OpenAI: GPT-5.1 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.625,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2",
        "displayName": "OpenAI: GPT-5.2",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2-chat",
        "displayName": "OpenAI: GPT-5.2 Chat",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2-codex",
        "displayName": "OpenAI: GPT-5.2-Codex",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2-pro",
        "displayName": "OpenAI: GPT-5.2 Pro",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 21,
        "outputCostPerMillionTokens": 168,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2-pro:batch",
        "displayName": "OpenAI: GPT-5.2 Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10.5,
        "outputCostPerMillionTokens": 84,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2:batch",
        "displayName": "OpenAI: GPT-5.2 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.875,
        "outputCostPerMillionTokens": 7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.3-codex",
        "displayName": "OpenAI: GPT-5.3-Codex",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4",
        "displayName": "OpenAI: GPT-5.4",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-mini",
        "displayName": "OpenAI: GPT-5.4 Mini",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-mini:batch",
        "displayName": "OpenAI: GPT-5.4 Mini (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.375,
        "outputCostPerMillionTokens": 2.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-nano",
        "displayName": "OpenAI: GPT-5.4 Nano",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-nano:batch",
        "displayName": "OpenAI: GPT-5.4 Nano (batch)",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.625,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-pro",
        "displayName": "OpenAI: GPT-5.4 Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 180,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-pro:batch",
        "displayName": "OpenAI: GPT-5.4 Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 90,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4:batch",
        "displayName": "OpenAI: GPT-5.4 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5",
        "displayName": "OpenAI: GPT-5.5",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5-pro",
        "displayName": "OpenAI: GPT-5.5 Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 180,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5-pro:batch",
        "displayName": "OpenAI: GPT-5.5 Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 90,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5:batch",
        "displayName": "OpenAI: GPT-5.5 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-luna",
        "displayName": "OpenAI: GPT-5.6 Luna",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-luna-pro",
        "displayName": "OpenAI: GPT-5.6 Luna Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-luna-pro:batch",
        "displayName": "OpenAI: GPT-5.6 Luna Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-luna:batch",
        "displayName": "OpenAI: GPT-5.6 Luna (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-sol",
        "displayName": "OpenAI: GPT-5.6 Sol",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-sol-pro",
        "displayName": "OpenAI: GPT-5.6 Sol Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-sol-pro:batch",
        "displayName": "OpenAI: GPT-5.6 Sol Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-sol:batch",
        "displayName": "OpenAI: GPT-5.6 Sol (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-terra",
        "displayName": "OpenAI: GPT-5.6 Terra",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-terra-pro",
        "displayName": "OpenAI: GPT-5.6 Terra Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-terra-pro:batch",
        "displayName": "OpenAI: GPT-5.6 Terra Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-terra:batch",
        "displayName": "OpenAI: GPT-5.6 Terra (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-astra",
        "displayName": "OpenAI: GPT-6 Astra",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-astra-pro",
        "displayName": "OpenAI: GPT-6 Astra Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-astra-pro:batch",
        "displayName": "OpenAI: GPT-6 Astra Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-astra:batch",
        "displayName": "OpenAI: GPT-6 Astra (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-luna",
        "displayName": "OpenAI: GPT-6 Luna",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-luna-pro",
        "displayName": "OpenAI: GPT-6 Luna Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-luna-pro:batch",
        "displayName": "OpenAI: GPT-6 Luna Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-luna:batch",
        "displayName": "OpenAI: GPT-6 Luna (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-sol",
        "displayName": "OpenAI: GPT-6 Sol",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-sol-pro",
        "displayName": "OpenAI: GPT-6 Sol Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-sol-pro:batch",
        "displayName": "OpenAI: GPT-6 Sol Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-sol:batch",
        "displayName": "OpenAI: GPT-6 Sol (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6.1-sol",
        "displayName": "OpenAI: GPT-6.1 Sol",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6.1-sol-pro",
        "displayName": "OpenAI: GPT-6.1 Sol Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6.1-sol-pro:batch",
        "displayName": "OpenAI: GPT-6.1 Sol Pro (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6.1-sol:batch",
        "displayName": "OpenAI: GPT-6.1 Sol (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-audio",
        "displayName": "OpenAI: GPT Audio",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-audio-mini",
        "displayName": "OpenAI: GPT Audio Mini",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-chat-latest",
        "displayName": "OpenAI: GPT Chat Latest",
        "apiType": "openai_completions",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-120b",
        "displayName": "OpenAI: gpt-oss-120b",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-120b:batch",
        "displayName": "OpenAI: gpt-oss-120b (batch)",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 117964,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.0296,
        "outputCostPerMillionTokens": 0.136,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-20b",
        "displayName": "OpenAI: gpt-oss-20b",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.018,
        "outputCostPerMillionTokens": 0.09,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-20b:batch",
        "displayName": "OpenAI: gpt-oss-20b (batch)",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 117964,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.024,
        "outputCostPerMillionTokens": 0.112,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-safeguard-20b",
        "displayName": "OpenAI: gpt-oss-safeguard-20b",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o1",
        "displayName": "OpenAI: o1",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3",
        "displayName": "OpenAI: o3",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3-mini",
        "displayName": "OpenAI: o3 Mini",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3-mini-high",
        "displayName": "OpenAI: o3 Mini High",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3-mini:batch",
        "displayName": "OpenAI: o3 Mini (batch)",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.55,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3-pro",
        "displayName": "OpenAI: o3 Pro",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 20,
        "outputCostPerMillionTokens": 80,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3:batch",
        "displayName": "OpenAI: o3 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o4-mini",
        "displayName": "OpenAI: o4 Mini",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o4-mini-high",
        "displayName": "OpenAI: o4 Mini High",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o4-mini:batch",
        "displayName": "OpenAI: o4 Mini (batch)",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.55,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openrouter/auto",
        "displayName": "Auto Router",
        "apiType": "openai_completions",
        "contextWindow": 2000000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openrouter/auto-beta",
        "displayName": "Auto Router (Beta)",
        "apiType": "openai_completions",
        "contextWindow": 2000000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openrouter/free",
        "displayName": "Free Models Router",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openrouter/fusion",
        "displayName": "OpenRouter: Fusion",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 30000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openrouter/pareto-code",
        "displayName": "Pareto Code Router",
        "apiType": "openai_completions",
        "contextWindow": 2000000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "perceptron/perceptron-mk1.5",
        "displayName": "Perceptron: Perceptron Mk1.5",
        "apiType": "openai_completions",
        "contextWindow": 36864,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "poolside/laguna-s-2.1",
        "displayName": "Poolside: Laguna S 2.1",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.09,
        "outputCostPerMillionTokens": 0.18,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "poolside/laguna-s-2.1:free",
        "displayName": "Poolside: Laguna S 2.1 (free)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "poolside/laguna-xs-2.1",
        "displayName": "Poolside: Laguna XS 2.1",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "poolside/laguna-xs-2.1:free",
        "displayName": "Poolside: Laguna XS 2.1 (free)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "prism-ml/ternary-bonsai-2-27b",
        "displayName": "PrismML: Ternary Bonsai 2 27B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen-2.5-72b-instruct",
        "displayName": "Qwen2.5 72B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 32768,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.36,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen-2.5-7b-instruct",
        "displayName": "Qwen: Qwen2.5 7B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 32768,
        "maxOutputTokens": 29491,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen-plus",
        "displayName": "Qwen: Qwen-Plus",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.26,
        "outputCostPerMillionTokens": 0.78,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-14b",
        "displayName": "Qwen: Qwen3 14B",
        "apiType": "openai_completions",
        "contextWindow": 40960,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.12,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-235b-a22b-2507",
        "displayName": "Qwen: Qwen3 235B A22B Instruct 2507",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.09,
        "outputCostPerMillionTokens": 0.55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-235b-a22b-thinking-2507",
        "displayName": "Qwen: Qwen3 235B A22B Thinking 2507",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.45,
        "outputCostPerMillionTokens": 3.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-30b-a3b",
        "displayName": "Qwen: Qwen3 30B A3B",
        "apiType": "openai_completions",
        "contextWindow": 40960,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.12,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-30b-a3b-instruct-2507",
        "displayName": "Qwen: Qwen3 30B A3B Instruct 2507",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-32b",
        "displayName": "Qwen: Qwen3 32B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.08,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-coder",
        "displayName": "Qwen: Qwen3 Coder 480B A35B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-coder-30b-a3b-instruct",
        "displayName": "Qwen: Qwen3 Coder 30B A3B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-coder-flash",
        "displayName": "Qwen: Qwen3 Coder Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.195,
        "outputCostPerMillionTokens": 0.975,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-coder-next",
        "displayName": "Qwen: Qwen3 Coder Next",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.12,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-next-80b-a3b-instruct",
        "displayName": "Qwen: Qwen3 Next 80B A3B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 1.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-next-80b-a3b-thinking",
        "displayName": "Qwen: Qwen3 Next 80B A3B Thinking",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-235b-a22b-instruct",
        "displayName": "Qwen: Qwen3 VL 235B A22B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.21,
        "outputCostPerMillionTokens": 1.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-30b-a3b-instruct",
        "displayName": "Qwen: Qwen3 VL 30B A3B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-30b-a3b-thinking",
        "displayName": "Qwen: Qwen3 VL 30B A3B Thinking",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.29,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-8b-instruct",
        "displayName": "Qwen: Qwen3 VL 8B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-122b-a10b",
        "displayName": "Qwen: Qwen3.5-122B-A10B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.26,
        "outputCostPerMillionTokens": 2.08,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-27b",
        "displayName": "Qwen: Qwen3.5-27B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 81920,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.26,
        "outputCostPerMillionTokens": 2.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-35b-a3b",
        "displayName": "Qwen: Qwen3.5-35B-A3B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-397b-a17b",
        "displayName": "Qwen: Qwen3.5 397B A17B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-9b",
        "displayName": "Qwen: Qwen3.5-9B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-flash-02-23",
        "displayName": "Qwen: Qwen3.5-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.065,
        "outputCostPerMillionTokens": 0.26,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-plus-02-15",
        "displayName": "Qwen: Qwen3.5 Plus 2026-02-15",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.26,
        "outputCostPerMillionTokens": 1.56,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-plus-20260420",
        "displayName": "Qwen: Qwen3.5 Plus 2026-04-20",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.6-27b",
        "displayName": "Qwen: Qwen3.6 27B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.6-35b-a3b",
        "displayName": "Qwen: Qwen3.6 35B A3B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.6-flash",
        "displayName": "Qwen: Qwen3.6 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1875,
        "outputCostPerMillionTokens": 1.125,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.6-plus",
        "displayName": "Qwen: Qwen3.6 Plus",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.325,
        "outputCostPerMillionTokens": 1.95,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.7-flash",
        "displayName": "Qwen: Qwen3.7 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.03,
        "outputCostPerMillionTokens": 0.13,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.7-max",
        "displayName": "Qwen: Qwen3.7 Max",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.475,
        "outputCostPerMillionTokens": 4.425,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.7-plus",
        "displayName": "Qwen: Qwen3.7 Plus",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.32,
        "outputCostPerMillionTokens": 1.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.8-2.4t-a95b",
        "displayName": "Qwen: Qwen3.8 2.4T A95B",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.8-27b",
        "displayName": "Qwen: Qwen3.8 27B",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.24,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.8-flash",
        "displayName": "Qwen: Qwen3.8 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.47,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.8-max-0902",
        "displayName": "Qwen: Qwen3.8 Max (0902)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.8-max-prime",
        "displayName": "Qwen: Qwen3.8 Max Prime",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.8-omni-flash",
        "displayName": "Qwen: Qwen3.8 Omni Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.47,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "rekaai/reka-edge",
        "displayName": "Reka Edge",
        "apiType": "openai_completions",
        "contextWindow": 16384,
        "maxOutputTokens": 14745,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "relace/relace-search",
        "displayName": "Relace: Relace Search",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "sakana/fugu-max",
        "displayName": "Sakana: Fugu Max",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "sakana/fugu-ultra",
        "displayName": "Sakana: Fugu Ultra",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "sakana/fugu-ultra-v2",
        "displayName": "Sakana: Fugu Ultra v2",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "sakana/sakana-namazu",
        "displayName": "Sakana: Sakana Namazu",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stepfun/step-3.5-flash",
        "displayName": "StepFun: Step 3.5 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stepfun/step-3.7-flash",
        "displayName": "StepFun: Step 3.7 Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 230400,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stepfun/step-5-preview",
        "displayName": "StepFun: Step 5 Preview",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/hy3",
        "displayName": "Tencent: Hy3",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.0825,
        "outputCostPerMillionTokens": 0.33,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/hy3-preview",
        "displayName": "Tencent: Hy3 preview",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 235929,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.18,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/hy4-preview",
        "displayName": "Tencent: Hy4 preview",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.7506,
        "outputCostPerMillionTokens": 2.2509,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "thinkingmachines/inkling",
        "displayName": "Thinking Machines: Inkling",
        "apiType": "openai_completions",
        "contextWindow": 524288,
        "maxOutputTokens": 471859,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 4.05,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "thinkingmachines/inkling-small",
        "displayName": "Thinking Machines: Inkling Small",
        "apiType": "openai_completions",
        "contextWindow": 524288,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.45,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "thinkingmachines/inkling-small:free",
        "displayName": "Thinking Machines: Inkling Small (free)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "thinkingmachines/inkling:free",
        "displayName": "Thinking Machines: Inkling (free)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "typesafe/jev-router",
        "displayName": "TypeSafe: Jev Router",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "unbiased/pareto-26.9",
        "displayName": "Pareto 26.9",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "upstage/solar-mini4",
        "displayName": "Upstage: Solar Mini 4",
        "apiType": "openai_completions",
        "contextWindow": 524288,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "upstage/solar-pro-3",
        "displayName": "Upstage: Solar Pro 3",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 117964,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "upstage/solar-pro4",
        "displayName": "Upstage: Solar Pro 4",
        "apiType": "openai_completions",
        "contextWindow": 524288,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.09,
        "outputCostPerMillionTokens": 0.36,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.20",
        "displayName": "SpaceXAI: Grok 4.20",
        "apiType": "openai_completions",
        "contextWindow": 2000000,
        "maxOutputTokens": 1800000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.3",
        "displayName": "SpaceXAI: Grok 4.3",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 900000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.3:batch",
        "displayName": "SpaceXAI: Grok 4.3 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 900000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.5",
        "displayName": "SpaceXAI: Grok 4.5",
        "apiType": "openai_completions",
        "contextWindow": 500000,
        "maxOutputTokens": 450000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.6",
        "displayName": "SpaceXAI: Grok 4.6",
        "apiType": "openai_completions",
        "contextWindow": 500000,
        "maxOutputTokens": 450000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.7",
        "displayName": "SpaceXAI: Grok 4.7",
        "apiType": "openai_completions",
        "contextWindow": 500000,
        "maxOutputTokens": 450000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-build-0.1",
        "displayName": "SpaceXAI: Grok Build 0.1",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 230400,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.5",
        "displayName": "Xiaomi: MiMo-V2.5",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.5-pro",
        "displayName": "Xiaomi: MiMo-V2.5-Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.6-flash",
        "displayName": "Xiaomi: MiMo-V2.6-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.6-pro",
        "displayName": "Xiaomi: MiMo-V2.6-Pro",
        "apiType": "openai_completions",
        "contextWindow": 1050000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.6-pro-ultraspeed",
        "displayName": "Xiaomi: MiMo-V2.6-Pro-UltraSpeed",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.35,
        "outputCostPerMillionTokens": 8.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-4.5",
        "displayName": "Z.ai: GLM 4.5",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 98304,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-4.5-air",
        "displayName": "Z.ai: GLM 4.5 Air",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 98304,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 0.85,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-4.5v",
        "displayName": "Z.ai: GLM 4.5V",
        "apiType": "openai_completions",
        "contextWindow": 65536,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 1.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-4.6",
        "displayName": "Z.ai: GLM 4.6",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-4.6v",
        "displayName": "Z.ai: GLM 4.6V",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-4.7",
        "displayName": "Z.ai: GLM 4.7",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-4.7-flash",
        "displayName": "Z.ai: GLM 4.7 Flash",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 117964,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.0605,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5",
        "displayName": "Z.ai: GLM 5",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 1.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5-turbo",
        "displayName": "Z.ai: GLM 5 Turbo",
        "apiType": "openai_completions",
        "contextWindow": 202752,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.2,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.1",
        "displayName": "Z.ai: GLM 5.1",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.966,
        "outputCostPerMillionTokens": 3.036,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.2",
        "displayName": "Z.ai: GLM 5.2",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.65,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.3",
        "displayName": "Z.ai: GLM 5.3",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943718,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.3-flash",
        "displayName": "Z.ai: GLM 5.3 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 943717,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.3-flash:batch",
        "displayName": "Z.ai: GLM 5.3 Flash (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.3-flashx",
        "displayName": "Z.ai: GLM 5.3 FlashX",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.37,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.3-prime",
        "displayName": "Z.ai: GLM 5.3 Prime",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.8,
        "outputCostPerMillionTokens": 8.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5.3:batch",
        "displayName": "Z.ai: GLM 5.3 (batch)",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.45,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5v-turbo",
        "displayName": "Z.ai: GLM 5V Turbo",
        "apiType": "openai_completions",
        "contextWindow": 202752,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.2,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "vercel-ai-gateway",
    "website": "https://vercel.com/ai-gateway",
    "productionVisible": true,
    "authentication": "anthropic_api_key",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://vercel.com/docs/ai-gateway/models-and-providers",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "vercel-ai-gateway"
    },
    "provider": {
      "id": "builtin-vercel-ai-gateway",
      "type": "anthropic_messages",
      "name": "Vercel AI Gateway",
      "baseUrl": "https://ai-gateway.vercel.sh",
      "enabled": true
    },
    "models": [
      {
        "id": "alibaba/qwen-3-14b",
        "displayName": "Qwen3-14B",
        "apiType": "anthropic_messages",
        "contextWindow": 40960,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.12,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen-3-235b",
        "displayName": "Qwen3 235B A22B",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 0.88,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen-3-30b",
        "displayName": "Qwen3-30B-A3B",
        "apiType": "anthropic_messages",
        "contextWindow": 40960,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.12,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen-3-32b",
        "displayName": "Qwen 3 32B",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-coder",
        "displayName": "Qwen3 Coder 480B A35B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 1.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-coder-30b-a3b",
        "displayName": "Qwen 3 Coder 30B A3B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-coder-next",
        "displayName": "Qwen3 Coder Next",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-max-thinking",
        "displayName": "Qwen 3 Max Thinking",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-next-80b-a3b-instruct",
        "displayName": "Qwen3 Next 80B A3B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 262114,
        "maxOutputTokens": 262114,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-next-80b-a3b-thinking",
        "displayName": "Qwen3 Next 80B A3B Thinking",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-vl-instruct",
        "displayName": "Qwen3 VL 235B A22B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.88,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.5-flash",
        "displayName": "Qwen 3.5 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.5-plus",
        "displayName": "Qwen 3.5 Plus",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.6-27b",
        "displayName": "Qwen 3.6 27B",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 3.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.6-plus",
        "displayName": "Qwen 3.6 Plus",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.7-flash",
        "displayName": "Qwen 3.7 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 991000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.03,
        "outputCostPerMillionTokens": 0.13,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.7-max",
        "displayName": "Qwen 3.7 Max",
        "apiType": "anthropic_messages",
        "contextWindow": 991000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.7-plus",
        "displayName": "Qwen 3.7 Plus",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 1.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.8-2.4t-a95b",
        "displayName": "Qwen3.8 2.4T A95B",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.8-27b",
        "displayName": "Qwen3.8 27B",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.8-flash",
        "displayName": "Qwen 3.8 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 991000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.47,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.8-max",
        "displayName": "Qwen 3.8 Max",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.8-max-0902",
        "displayName": "Qwen3.8 Max 0902",
        "apiType": "anthropic_messages",
        "contextWindow": 991000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.8-max-prime",
        "displayName": "Qwen 3.8 Max Prime",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3.8-omni-flash",
        "displayName": "Qwen 3.8 Omni Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.47,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-2-lite",
        "displayName": "Nova 2 Lite",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-lite",
        "displayName": "Nova Lite",
        "apiType": "anthropic_messages",
        "contextWindow": 300000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-micro",
        "displayName": "Nova Micro",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.035,
        "outputCostPerMillionTokens": 0.14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "amazon/nova-pro",
        "displayName": "Nova Pro",
        "apiType": "anthropic_messages",
        "contextWindow": 300000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.8,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-fable-5",
        "displayName": "Claude Fable 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-fable-5-batch",
        "displayName": "Claude Fable 5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-fable-5.1",
        "displayName": "Claude Fable 5.1",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-fable-5.1-batch",
        "displayName": "Claude Fable 5.1 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-haiku-4.5",
        "displayName": "Claude Haiku 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-haiku-4.5-batch",
        "displayName": "Claude Haiku 4.5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-haiku-5.5",
        "displayName": "Claude Haiku 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-haiku-5.5-batch",
        "displayName": "Claude Haiku 5.5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.5",
        "displayName": "Claude Opus 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.5-batch",
        "displayName": "Claude Opus 4.5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.6",
        "displayName": "Claude Opus 4.6",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.6-batch",
        "displayName": "Claude Opus 4.6 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.7",
        "displayName": "Claude Opus 4.7",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.7-batch",
        "displayName": "Claude Opus 4.7 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.8",
        "displayName": "Claude Opus 4.8",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.8-batch",
        "displayName": "Claude Opus 4.8 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.8-fast",
        "displayName": "Claude Opus 4.8 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5",
        "displayName": "Claude Opus 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5-batch",
        "displayName": "Claude Opus 5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 12.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5-fast",
        "displayName": "Claude Opus 5 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5.5",
        "displayName": "Claude Opus 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5.5-batch",
        "displayName": "Claude Opus 5.5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-5.5-fast",
        "displayName": "Claude Opus 5.5 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 8,
        "outputCostPerMillionTokens": 40,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4",
        "displayName": "Claude Sonnet 4",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.5",
        "displayName": "Claude Sonnet 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.5-batch",
        "displayName": "Claude Sonnet 4.5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.6",
        "displayName": "Claude Sonnet 4.6",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.6-batch",
        "displayName": "Claude Sonnet 4.6 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5",
        "displayName": "Claude Sonnet 5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5-batch",
        "displayName": "Claude Sonnet 5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5.5",
        "displayName": "Claude Sonnet 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5.5-batch",
        "displayName": "Claude Sonnet 5.5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "arcee-ai/trinity-large-thinking",
        "displayName": "Trinity Large Thinking",
        "apiType": "anthropic_messages",
        "contextWindow": 262100,
        "maxOutputTokens": 80000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance/seed-1.6",
        "displayName": "Seed 1.6",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance/seed-1.8",
        "displayName": "Bytedance Seed 1.8",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "bytedance/seed-2.1-turbo",
        "displayName": "Seed 2.1 Turbo",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "callstack/apex",
        "displayName": "Apex",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "cohere/command-a",
        "displayName": "Command A",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 8000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-r1",
        "displayName": "DeepSeek-R1",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.35,
        "outputCostPerMillionTokens": 5.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v3.1",
        "displayName": "DeepSeek V3.1",
        "apiType": "anthropic_messages",
        "contextWindow": 163840,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.95,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v3.2",
        "displayName": "DeepSeek V3.2",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.62,
        "outputCostPerMillionTokens": 1.85,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v3.2-thinking",
        "displayName": "DeepSeek V3.2 Thinking",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.62,
        "outputCostPerMillionTokens": 1.85,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-flash",
        "displayName": "DeepSeek V4 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 0.26,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-flash-0731",
        "displayName": "DeepSeek V4 Flash 0731",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.076,
        "outputCostPerMillionTokens": 0.153,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-flash-vision-exp",
        "displayName": "DeepSeek V4 Flash Vision Exp",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2156,
        "outputCostPerMillionTokens": 0.6468,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-pro",
        "displayName": "DeepSeek V4 Pro",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.66,
        "outputCostPerMillionTokens": 1.98,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-pro-0813",
        "displayName": "DeepSeek V4 Pro 0813",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 384000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.66,
        "outputCostPerMillionTokens": 1.98,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4.1-flash",
        "displayName": "DeepSeek V4.1 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4.1-flash-fast",
        "displayName": "DeepSeek V4.1 Flash Fast",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "fireworks/ember-1",
        "displayName": "Ember-1",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash",
        "displayName": "Gemini 2.5 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash-batch",
        "displayName": "Gemini 2.5 Flash (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash-lite",
        "displayName": "Gemini 2.5 Flash Lite",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash-lite-batch",
        "displayName": "Gemini 2.5 Flash Lite (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-pro",
        "displayName": "Gemini 2.5 Pro",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-pro-batch",
        "displayName": "Gemini 2.5 Pro (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.625,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3-flash",
        "displayName": "Gemini 3 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3-flash-batch",
        "displayName": "Gemini 3 Flash (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-flash-lite",
        "displayName": "Gemini 3.1 Flash Lite",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-flash-lite-batch",
        "displayName": "Gemini 3.1 Flash Lite (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.125,
        "outputCostPerMillionTokens": 0.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-pro-preview",
        "displayName": "Gemini 3.1 Pro Preview",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.1-pro-preview-batch",
        "displayName": "Gemini 3.1 Pro Preview (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.5-flash",
        "displayName": "Gemini 3.5 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.5-flash-batch",
        "displayName": "Gemini 3.5 Flash (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.5-flash-lite",
        "displayName": "Gemini 3.5 Flash Lite",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.5-flash-lite-batch",
        "displayName": "Gemini 3.5 Flash Lite (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.6-flash",
        "displayName": "Gemini 3.6 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.6-flash-batch",
        "displayName": "Gemini 3.6 Flash (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.375,
        "outputCostPerMillionTokens": 1.875,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.7-flash",
        "displayName": "Gemini 3.7 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.7-flash-batch",
        "displayName": "Gemini 3.7 Flash (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.375,
        "outputCostPerMillionTokens": 1.875,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3.8-flash",
        "displayName": "Gemini 3.8 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65535,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-4-argon",
        "displayName": "Gemini 4 Argon",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-26b-a4b-it",
        "displayName": "Google Gemma 4 26B A4B",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-31b-it",
        "displayName": "Gemma 4 31B IT",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inception/mercury-2",
        "displayName": "Mercury 2",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 0.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inception/mercury-2.5",
        "displayName": "Mercury 2.5",
        "apiType": "anthropic_messages",
        "contextWindow": 260000,
        "maxOutputTokens": 65536,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.04,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inception/mercury-coder-small",
        "displayName": "Mercury Coder Small Beta",
        "apiType": "anthropic_messages",
        "contextWindow": 32000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-3.0-flash",
        "displayName": "Ling 3.0 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.021,
        "outputCostPerMillionTokens": 0.063,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-3.0-flash-fin",
        "displayName": "Ling 3.0 Flash Fin",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-3.0-flash-sante",
        "displayName": "Ling 3.0 Flash Sante",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-3.0-flash-vl",
        "displayName": "Ling 3.0 Flash VL",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-3.1-flash",
        "displayName": "Ling 3.1 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "interfaze/interfaze-beta",
        "displayName": "Interfaze Beta",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 3.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "liquid/lfm2.5-24b-a2b",
        "displayName": "LFM2.5-24B-A2B",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8200,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meituan/longcat-2.5-preview",
        "displayName": "LongCat 2.5 Preview",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-3.1-70b",
        "displayName": "Llama 3.1 70B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.72,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-3.1-8b",
        "displayName": "Llama 3.1 8B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 0.22,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-3.3-70b",
        "displayName": "Llama 3.3 70B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.72,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-4-maverick",
        "displayName": "Llama 4 Maverick 17B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.24,
        "outputCostPerMillionTokens": 0.97,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-4-scout",
        "displayName": "Llama 4 Scout 17B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.17,
        "outputCostPerMillionTokens": 0.66,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-glimmer-30b",
        "displayName": "Muse Glimmer 30B",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.35,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.1",
        "displayName": "Muse Spark 1.1",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.2",
        "displayName": "Muse Spark 1.2",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.2-contributor",
        "displayName": "Muse Spark 1.2 Contributor",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.3",
        "displayName": "Muse Spark 1.3",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.3-contributor",
        "displayName": "Muse Spark 1.3 Contributor",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-open",
        "displayName": "Muse Spark Open",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-wonder-1.0",
        "displayName": "Muse Wonder",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2",
        "displayName": "MiniMax M2",
        "apiType": "anthropic_messages",
        "contextWindow": 205000,
        "maxOutputTokens": 205000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.1",
        "displayName": "MiniMax M2.1",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.1-lightning",
        "displayName": "MiniMax M2.1 Lightning",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.5",
        "displayName": "MiniMax M2.5",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.5-highspeed",
        "displayName": "MiniMax M2.5 High Speed",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.7",
        "displayName": "MiniMax M2.7",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m2.7-highspeed",
        "displayName": "MiniMax M2.7 High Speed",
        "apiType": "anthropic_messages",
        "contextWindow": 204800,
        "maxOutputTokens": 131100,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax/minimax-m3",
        "displayName": "MiniMax M3",
        "apiType": "anthropic_messages",
        "contextWindow": 512000,
        "maxOutputTokens": 512000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/codestral",
        "displayName": "Mistral Codestral",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 4000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/ministral-14b",
        "displayName": "Ministral 14B",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/ministral-3b",
        "displayName": "Ministral 3B",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 4000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/ministral-8b",
        "displayName": "Ministral 8B",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 4000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/mistral-large-3",
        "displayName": "Mistral Large 3",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/mistral-large-4",
        "displayName": "Mistral Large 4",
        "apiType": "anthropic_messages",
        "contextWindow": 524288,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.68,
        "outputCostPerMillionTokens": 2.09,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/mistral-medium-3.5",
        "displayName": "Mistral Medium Latest",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/mistral-nemo",
        "displayName": "Mistral Nemo 12B",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.029,
        "outputCostPerMillionTokens": 0.03,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/mistral-small",
        "displayName": "Mistral Small",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 4000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mixedbread/toast-1",
        "displayName": "Toast 1",
        "apiType": "anthropic_messages",
        "contextWindow": 131000,
        "maxOutputTokens": 4000,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 0.72,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2",
        "displayName": "Kimi K2 Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.57,
        "outputCostPerMillionTokens": 2.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.5",
        "displayName": "Kimi K2.5",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.6",
        "displayName": "Kimi K2.6",
        "apiType": "anthropic_messages",
        "contextWindow": 262000,
        "maxOutputTokens": 262000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.7-code",
        "displayName": "Kimi K2.7 Code",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.7-code-highspeed",
        "displayName": "Kimi K2.7 Code High Speed",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.9,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k3",
        "displayName": "Kimi K3",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k3-fast",
        "displayName": "Kimi K3 Fast",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.5,
        "outputCostPerMillionTokens": 22.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-nano-30b-a3b",
        "displayName": "Nemotron 3 Nano 30B A3B",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-super-120b-a12b",
        "displayName": "NVIDIA Nemotron 3 Super 120B A12B",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.65,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-ultra-550b-a55b",
        "displayName": "Nemotron 3 Ultra",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-lightning",
        "displayName": "Nemotron 3.5 Lightning 30B",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-lightning-free",
        "displayName": "Nemotron 3.5 Lightning Free",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 65000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3.5-super-vl",
        "displayName": "NVIDIA Nemotron 3.5 Super VL",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-nano-12b-v2-vl",
        "displayName": "Nvidia Nemotron Nano 12B V2 VL",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-nano-9b-v2",
        "displayName": "Nvidia Nemotron Nano 9B V2",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.23,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-3.5-turbo",
        "displayName": "GPT-3.5 Turbo",
        "apiType": "anthropic_messages",
        "contextWindow": 16385,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4-turbo",
        "displayName": "GPT-4 Turbo",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 4096,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1",
        "displayName": "GPT-4.1",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-batch",
        "displayName": "GPT-4.1 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-fast",
        "displayName": "GPT-4.1 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.5,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-mini",
        "displayName": "GPT-4.1 mini",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 1.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-mini-batch",
        "displayName": "GPT-4.1 mini (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-mini-fast",
        "displayName": "GPT-4.1 mini (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.7,
        "outputCostPerMillionTokens": 2.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-nano",
        "displayName": "GPT-4.1 nano",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-nano-batch",
        "displayName": "GPT-4.1 nano (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4.1-nano-fast",
        "displayName": "GPT-4.1 nano (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1047576,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o",
        "displayName": "GPT-4o",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-batch",
        "displayName": "GPT-4o (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-fast",
        "displayName": "GPT-4o (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.25,
        "outputCostPerMillionTokens": 17,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-mini",
        "displayName": "GPT-4o mini",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-mini-batch",
        "displayName": "GPT-4o mini (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-4o-mini-fast",
        "displayName": "GPT-4o mini (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 16384,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5",
        "displayName": "GPT-5",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-batch",
        "displayName": "GPT-5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.625,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-codex",
        "displayName": "GPT-5-Codex",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-fast",
        "displayName": "GPT-5 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-mini",
        "displayName": "GPT-5 mini",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-mini-batch",
        "displayName": "GPT-5 mini (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.125,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-mini-fast",
        "displayName": "GPT-5 mini (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.45,
        "outputCostPerMillionTokens": 3.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-nano",
        "displayName": "GPT-5 nano",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-nano-batch",
        "displayName": "GPT-5 nano (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.025,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-pro",
        "displayName": "GPT-5 pro",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 272000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 120,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5-pro-batch",
        "displayName": "GPT-5 pro (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 272000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 7.5,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1-codex",
        "displayName": "GPT-5.1-Codex",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1-codex-max",
        "displayName": "GPT 5.1 Codex Max",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1-codex-mini",
        "displayName": "GPT 5.1 Codex Mini",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1-thinking",
        "displayName": "GPT 5.1 Thinking",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.1-thinking-fast",
        "displayName": "GPT 5.1 Thinking (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2",
        "displayName": "GPT 5.2",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2-batch",
        "displayName": "GPT 5.2 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.875,
        "outputCostPerMillionTokens": 7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2-codex",
        "displayName": "GPT 5.2 Codex",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2-fast",
        "displayName": "GPT 5.2 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.5,
        "outputCostPerMillionTokens": 28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.2-pro",
        "displayName": "GPT 5.2 ",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 21,
        "outputCostPerMillionTokens": 168,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.3-codex",
        "displayName": "GPT 5.3 Codex",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.3-codex-fast",
        "displayName": "GPT 5.3 Codex (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.5,
        "outputCostPerMillionTokens": 28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4",
        "displayName": "GPT 5.4",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-batch",
        "displayName": "GPT 5.4 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-fast",
        "displayName": "GPT 5.4 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-mini",
        "displayName": "GPT 5.4 Mini",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-mini-batch",
        "displayName": "GPT 5.4 Mini (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.375,
        "outputCostPerMillionTokens": 2.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-mini-fast",
        "displayName": "GPT 5.4 Mini (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-nano",
        "displayName": "GPT 5.4 Nano",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-nano-batch",
        "displayName": "GPT 5.4 Nano (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 400000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.625,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.4-pro",
        "displayName": "GPT 5.4 Pro",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 180,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5",
        "displayName": "GPT 5.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5-batch",
        "displayName": "GPT 5.5 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5-fast",
        "displayName": "GPT 5.5 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 12.5,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5-pro",
        "displayName": "GPT 5.5 Pro",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 180,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.5-pro-batch",
        "displayName": "GPT 5.5 Pro (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 90,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-luna",
        "displayName": "GPT 5.6 Luna",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-luna-batch",
        "displayName": "GPT 5.6 Luna (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-luna-fast",
        "displayName": "GPT 5.6 Luna (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-sol",
        "displayName": "GPT 5.6 Sol",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-sol-batch",
        "displayName": "GPT 5.6 Sol (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-sol-fast",
        "displayName": "GPT 5.6 Sol (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 8,
        "outputCostPerMillionTokens": 40,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-terra",
        "displayName": "GPT 5.6 Terra",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 12,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-terra-batch",
        "displayName": "GPT 5.6 Terra (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-5.6-terra-fast",
        "displayName": "GPT 5.6 Terra (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-astra",
        "displayName": "GPT-6 Astra",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-astra-batch",
        "displayName": "GPT-6 Astra (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-astra-fast",
        "displayName": "GPT-6 Astra (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 20,
        "outputCostPerMillionTokens": 100,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-luna",
        "displayName": "GPT-6 Luna",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-luna-batch",
        "displayName": "GPT-6 Luna (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-luna-fast",
        "displayName": "GPT-6 Luna (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-sol",
        "displayName": "GPT-6 Sol",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-sol-batch",
        "displayName": "GPT-6 Sol (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6-sol-fast",
        "displayName": "GPT-6 Sol (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6.1-sol",
        "displayName": "GPT-6.1 Sol",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6.1-sol-batch",
        "displayName": "GPT-6.1 Sol (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-6.1-sol-fast",
        "displayName": "GPT-6.1 Sol (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-120b",
        "displayName": "GPT OSS 120B",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-20b",
        "displayName": "GPT OSS 20B",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 8192,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.03,
        "outputCostPerMillionTokens": 0.14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-safeguard-120b",
        "displayName": "GPT OSS Safeguard 120B",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 16000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-safeguard-20b",
        "displayName": "GPT OSS Safeguard 20B",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 16000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o1",
        "displayName": "o1",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 60,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3",
        "displayName": "o3",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3-fast",
        "displayName": "o3 (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 3.5,
        "outputCostPerMillionTokens": 14,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3-mini",
        "displayName": "o3-mini",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o3-pro",
        "displayName": "o3 Pro",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 20,
        "outputCostPerMillionTokens": 80,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o4-mini",
        "displayName": "o4-mini",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.1,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/o4-mini-fast",
        "displayName": "o4-mini (Fast)",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 100000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "poolside/laguna-s-2.1",
        "displayName": "Laguna S 2.1",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.09,
        "outputCostPerMillionTokens": 0.18,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "poolside/laguna-s-2.1-free",
        "displayName": "Laguna S 2.1 Free",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "quiverai/arrow-2",
        "displayName": "Arrow 2",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4,
        "outputCostPerMillionTokens": 20,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "quiverai/arrow-2-telos",
        "displayName": "Arrow 2 Telos",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 6,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "sakana/fugu-max",
        "displayName": "Fugu Max",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "sakana/fugu-ultra",
        "displayName": "Fugu Ultra",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "sakana/fugu-ultra-v2",
        "displayName": "Fugu Ultra v2",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "sakana/namazu",
        "displayName": "Sakana Namazu",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.1-fast-non-reasoning",
        "displayName": "Grok 4.1 Fast Non-Reasoning",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.1-fast-reasoning",
        "displayName": "Grok 4.1 Fast Reasoning",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-multi-agent",
        "displayName": "Grok 4.20 Multi-Agent",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-multi-agent-batch",
        "displayName": "Grok 4.20 Multi-Agent (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-multi-agent-beta",
        "displayName": "Grok 4.20 Multi Agent Beta",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-non-reasoning",
        "displayName": "Grok 4.20 Non-Reasoning",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-non-reasoning-batch",
        "displayName": "Grok 4.20 Non-Reasoning (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-non-reasoning-beta",
        "displayName": "Grok 4.20 Beta Non-Reasoning",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": false,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-reasoning",
        "displayName": "Grok 4.20 Reasoning",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-reasoning-batch",
        "displayName": "Grok 4.20 Reasoning (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.20-reasoning-beta",
        "displayName": "Grok 4.20 Beta Reasoning",
        "apiType": "anthropic_messages",
        "contextWindow": 2000000,
        "maxOutputTokens": 2000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.3",
        "displayName": "Grok 4.3",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.3-batch",
        "displayName": "Grok 4.3 (Batch)",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.5",
        "displayName": "Grok 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.6",
        "displayName": "Grok 4.6",
        "apiType": "anthropic_messages",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-4.7",
        "displayName": "Grok 4.7",
        "apiType": "anthropic_messages",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "spacexai/grok-build-0.1",
        "displayName": "Grok Build 0.1",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stealth/cat-jam",
        "displayName": "Cat Jam",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stealth/glyph-cluster",
        "displayName": "Glyph Cluster",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stepfun/step-3.7-flash",
        "displayName": "Step 3.7 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stepfun/step-5-preview",
        "displayName": "Step 5 Preview",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 1048576,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/hy3",
        "displayName": "Hy3",
        "apiType": "anthropic_messages",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.58,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/hy4-preview",
        "displayName": "Tencent Hy4 Preview",
        "apiType": "anthropic_messages",
        "contextWindow": 1024000,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.834,
        "outputCostPerMillionTokens": 2.501,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "thinkingmachines/inkling",
        "displayName": "Inkling",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 256000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 4.05,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "thinkingmachines/inkling-small",
        "displayName": "Inkling Small",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.45,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.5",
        "displayName": "MiMo M2.5",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 131100,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.5-pro",
        "displayName": "MiMo V2.5 Pro",
        "apiType": "anthropic_messages",
        "contextWindow": 1050000,
        "maxOutputTokens": 131000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3045,
        "outputCostPerMillionTokens": 0.609,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.6-flash",
        "displayName": "MiMo V2.6 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.6-pro",
        "displayName": "MiMo V2.6 Pro",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.6-pro-ultraspeed",
        "displayName": "MiMo V2.6 Pro UltraSpeed",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.35,
        "outputCostPerMillionTokens": 8.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-4.5",
        "displayName": "GLM 4.5",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 96000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-4.5-air",
        "displayName": "GLM 4.5 Air",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 96000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-4.5v",
        "displayName": "GLM 4.5V",
        "apiType": "anthropic_messages",
        "contextWindow": 66000,
        "maxOutputTokens": 16000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 1.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-4.6",
        "displayName": "GLM 4.6",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 96000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-4.7",
        "displayName": "GLM 4.7",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 120000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-4.7-flash",
        "displayName": "GLM 4.7 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 131000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-4.7-flashx",
        "displayName": "GLM 4.7 FlashX",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5",
        "displayName": "GLM 5",
        "apiType": "anthropic_messages",
        "contextWindow": 202800,
        "maxOutputTokens": 131100,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 3.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5-turbo",
        "displayName": "GLM 5 Turbo",
        "apiType": "anthropic_messages",
        "contextWindow": 202800,
        "maxOutputTokens": 131100,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.2,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5.1",
        "displayName": "GLM 5.1",
        "apiType": "anthropic_messages",
        "contextWindow": 202800,
        "maxOutputTokens": 64000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5.2",
        "displayName": "GLM 5.2",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.8,
        "outputCostPerMillionTokens": 2.55,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5.2-fast",
        "displayName": "GLM 5.2 Fast",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.8,
        "outputCostPerMillionTokens": 8.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5.3",
        "displayName": "GLM 5.3",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 1000000,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5.3-fast",
        "displayName": "GLM 5.3 Fast",
        "apiType": "anthropic_messages",
        "contextWindow": 1048576,
        "maxOutputTokens": 262144,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2.1,
        "outputCostPerMillionTokens": 6.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5.3-flash",
        "displayName": "GLM 5.3 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 131000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5.3-flashx",
        "displayName": "GLM 5.3 FlashX",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.37,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5v-turbo",
        "displayName": "GLM 5V Turbo",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.2,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "xai",
    "website": "https://x.ai",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://docs.x.ai/developers/models",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "xai"
    },
    "provider": {
      "id": "builtin-xai",
      "type": "openai_responses",
      "name": "xAI",
      "baseUrl": "https://api.x.ai/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "grok-4.3",
        "displayName": "Grok 4.3",
        "apiType": "openai_responses",
        "contextWindow": 1000000,
        "maxOutputTokens": 30000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "grok-4.5",
        "displayName": "Grok 4.5",
        "apiType": "openai_responses",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "grok-4.6",
        "displayName": "Grok 4.6",
        "apiType": "openai_responses",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "grok-4.7",
        "displayName": "Grok 4.7",
        "apiType": "openai_responses",
        "contextWindow": 500000,
        "maxOutputTokens": 500000,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "xiaomi",
    "website": "https://mimo.mi.com/zh",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://mimo.mi.com/docs/quick-start/summary/model",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "xiaomi"
    },
    "provider": {
      "id": "builtin-xiaomi",
      "type": "openai_completions",
      "name": "Xiaomi",
      "baseUrl": "https://api.xiaomimimo.com/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "mimo-v2.6-flash",
        "displayName": "MiMo-V2.6-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mimo-v2.6-pro",
        "displayName": "MiMo-V2.6-Pro",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mimo-v2.6-pro-ultraspeed",
        "displayName": "MiMo-V2.6-Pro-UltraSpeed",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 4.35,
        "outputCostPerMillionTokens": 8.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "zai",
    "website": "https://z.ai",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://docs.bigmodel.cn/cn/guide/start/model-overview",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "zai"
    },
    "provider": {
      "id": "builtin-zai",
      "type": "openai_completions",
      "name": "Z.AI",
      "baseUrl": "https://api.z.ai/api/paas/v4",
      "enabled": true
    },
    "models": [
      {
        "id": "glm-4.7",
        "displayName": "GLM-4.7",
        "apiType": "openai_completions",
        "contextWindow": 204800,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5-turbo",
        "displayName": "GLM-5-Turbo",
        "apiType": "openai_completions",
        "contextWindow": 200000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.2,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.2",
        "displayName": "GLM-5.2",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.2-highspeed",
        "displayName": "GLM-5.2 Highspeed",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3",
        "displayName": "GLM-5.3",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3-flash",
        "displayName": "GLM-5.3-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3-highspeed",
        "displayName": "GLM-5.3 Highspeed",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3-flashx",
        "displayName": "GLM-5.3-FlashX",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  },
  {
    "id": "zai-coding-cn",
    "website": "https://z.ai/subscribe",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "catalogSource": {
      "documentationUrl": "https://docs.bigmodel.cn/cn/coding-plan/latest-model",
      "verifiedAt": "2026-10-17",
      "upstreamPackage": "@earendil-works/pi-ai@1.3.0",
      "sourceProviderId": "zai-coding-cn"
    },
    "provider": {
      "id": "builtin-zai-coding-cn",
      "type": "openai_completions",
      "name": "Z.AI Coding CN",
      "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
      "enabled": true
    },
    "models": [
      {
        "id": "glm-4.6v",
        "displayName": "GLM-4.6V",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 32768,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3",
        "displayName": "GLM-5.3",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3-flash",
        "displayName": "GLM-5.3-Flash",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text",
          "image"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": true,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.3-highspeed",
        "displayName": "GLM-5.3 Highspeed",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
        "maxOutputTokens": 131072,
        "inputTypes": [
          "text"
        ],
        "reasoning": true,
        "capabilities": {
          "text": true,
          "vision": false,
          "toolCalling": true,
          "structuredOutput": true
        },
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      }
    ]
  }
] as const;
