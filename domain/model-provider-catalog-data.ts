// Generated from llm-space 2d647ca / @earendil-works/pi-ai 0.80.10.
// Run `node scripts/generate-model-provider-catalog.mjs` to refresh.
// Keep this data static so catalog upgrades are explicit and reviewable.
export const MODEL_PROVIDER_CATALOG_SEEDS = [
  {
    "id": "amazon-bedrock",
    "website": "https://aws.amazon.com/bedrock/",
    "productionVisible": true,
    "authentication": "aws",
    "recommendedGroup": "builtin",
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
        "contextWindow": 128000,
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
        "id": "amazon.nova-micro-v1:0",
        "displayName": "Nova Micro",
        "apiType": "bedrock_converse_stream",
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
        "id": "amazon.nova-pro-v1:0",
        "displayName": "Nova Pro",
        "apiType": "bedrock_converse_stream",
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
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
        "inputCostPerMillionTokens": 16.5,
        "outputCostPerMillionTokens": 82.5,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
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
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
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
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek.r1-v1:0",
        "displayName": "DeepSeek-R1",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
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
        "inputCostPerMillionTokens": 1.35,
        "outputCostPerMillionTokens": 5.4,
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
        "displayName": "DeepSeek-V3.2",
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
        "id": "google.gemma-3-27b-it",
        "displayName": "Google Gemma 3 27B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 202752,
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
        "inputCostPerMillionTokens": 0.12,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google.gemma-3-4b-it",
        "displayName": "Gemma 3 4B IT",
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
        "inputCostPerMillionTokens": 0.04,
        "outputCostPerMillionTokens": 0.08,
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
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
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "jp.anthropic.claude-sonnet-4-6",
        "displayName": "Claude Sonnet 4.6 (JP)",
        "apiType": "bedrock_converse_stream",
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
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
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
        "inputCostPerMillionTokens": 0.24,
        "outputCostPerMillionTokens": 0.97,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta.llama4-scout-17b-instruct-v1:0",
        "displayName": "Llama 4 Scout 17B Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 3500000,
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
        "inputCostPerMillionTokens": 0.17,
        "outputCostPerMillionTokens": 0.66,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimax.minimax-m2",
        "displayName": "MiniMax M2",
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
        "displayName": "MiniMax M2.1",
        "apiType": "bedrock_converse_stream",
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
        "id": "minimax.minimax-m2.5",
        "displayName": "MiniMax M2.5",
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
        "contextWindow": 256000,
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
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.mistral-large-3-675b-instruct",
        "displayName": "Mistral Large 3",
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
        "inputCostPerMillionTokens": 0.04,
        "outputCostPerMillionTokens": 0.04,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral.voxtral-small-24b-2507",
        "displayName": "Voxtral Small 24B 2507",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 32000,
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
        "outputCostPerMillionTokens": 0.35,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshot.kimi-k2-thinking",
        "displayName": "Kimi K2 Thinking",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262143,
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
        "contextWindow": 262143,
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
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia.nemotron-nano-12b-v2",
        "displayName": "NVIDIA Nemotron Nano 12B v2 VL BF16",
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
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia.nemotron-nano-3-30b",
        "displayName": "NVIDIA Nemotron Nano 3 30B",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
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
        "inputCostPerMillionTokens": 0.06,
        "outputCostPerMillionTokens": 0.24,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia.nemotron-nano-9b-v2",
        "displayName": "NVIDIA Nemotron Nano 9B v2",
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
        "inputCostPerMillionTokens": 2.75,
        "outputCostPerMillionTokens": 16.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-5.5",
        "displayName": "GPT-5.5",
        "apiType": "bedrock_converse_stream",
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
        "inputCostPerMillionTokens": 5.5,
        "outputCostPerMillionTokens": 33,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-5.6-luna",
        "displayName": "GPT-5.6 Luna",
        "apiType": "bedrock_converse_stream",
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-5.6-sol",
        "displayName": "GPT-5.6 Sol",
        "apiType": "bedrock_converse_stream",
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
        "id": "openai.gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra",
        "apiType": "bedrock_converse_stream",
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
        "id": "openai.gpt-oss-120b",
        "displayName": "gpt-oss-120b",
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
        "id": "openai.gpt-oss-120b-1:0",
        "displayName": "gpt-oss-120b",
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
        "id": "openai.gpt-oss-20b",
        "displayName": "gpt-oss-20b",
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
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai.gpt-oss-20b-1:0",
        "displayName": "gpt-oss-20b",
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
        "id": "openai.gpt-oss-safeguard-20b",
        "displayName": "GPT OSS Safeguard 20B",
        "apiType": "bedrock_converse_stream",
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
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-235b-a22b-2507-v1:0",
        "displayName": "Qwen3 235B A22B 2507",
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
        "displayName": "Qwen3 32B (dense)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 16384,
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
        "displayName": "Qwen3 Coder 30B A3B Instruct",
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
        "displayName": "Qwen3 Coder 480B A35B Instruct",
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
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 1.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-coder-next",
        "displayName": "Qwen3 Coder Next",
        "apiType": "bedrock_converse_stream",
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
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 1.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-next-80b-a3b",
        "displayName": "Qwen/Qwen3-Next-80B-A3B-Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262000,
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
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 1.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen.qwen3-vl-235b-a22b",
        "displayName": "Qwen/Qwen3-VL-235B-A22B-Instruct",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 262000,
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
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.5,
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
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 50,
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
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
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.anthropic.claude-sonnet-4-6",
        "displayName": "Claude Sonnet 4.6 (US)",
        "apiType": "bedrock_converse_stream",
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
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.deepseek.r1-v1:0",
        "displayName": "DeepSeek-R1 (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 128000,
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
        "inputCostPerMillionTokens": 1.35,
        "outputCostPerMillionTokens": 5.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.meta.llama4-maverick-17b-instruct-v1:0",
        "displayName": "Llama 4 Maverick 17B Instruct (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 1000000,
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
        "inputCostPerMillionTokens": 0.24,
        "outputCostPerMillionTokens": 0.97,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "us.meta.llama4-scout-17b-instruct-v1:0",
        "displayName": "Llama 4 Scout 17B Instruct (US)",
        "apiType": "bedrock_converse_stream",
        "contextWindow": 3500000,
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
        "inputCostPerMillionTokens": 0.17,
        "outputCostPerMillionTokens": 0.66,
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
        "id": "zai.glm-4.7",
        "displayName": "GLM-4.7",
        "apiType": "bedrock_converse_stream",
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
        "id": "zai.glm-4.7-flash",
        "displayName": "GLM-4.7-Flash",
        "apiType": "bedrock_converse_stream",
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
        "maxOutputTokens": 101376,
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
    "provider": {
      "id": "builtin-ant-ling",
      "type": "openai_completions",
      "name": "Ant Ling",
      "baseUrl": "https://api.ant-ling.com/v1",
      "enabled": true
    },
    "models": [
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
        "id": "claude-opus-4-1",
        "displayName": "Claude Opus 4.1 (latest)",
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
        "id": "claude-opus-4-1-20250805",
        "displayName": "Claude Opus 4.1",
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
        "id": "claude-sonnet-4-5",
        "displayName": "Claude Sonnet 4.5 (latest)",
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
        "id": "claude-sonnet-4-5-20250929",
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
      }
    ]
  },
  {
    "id": "ark",
    "website": "https://www.volcengine.com/product/ark",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "provider": {
      "id": "builtin-ark",
      "type": "openai_completions",
      "name": "VolcEngine Ark",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "enabled": true
    },
    "models": [
      {
        "id": "doubao-seed-2-1-pro-260628",
        "displayName": "Doubao-Seed-2.1-pro",
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
      },
      {
        "id": "doubao-seed-evolving",
        "displayName": "Doubao-Seed-Evolving",
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
        "id": "doubao-seed-2.0-pro",
        "displayName": "Doubao-Seed-2.0-pro",
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
        "id": "doubao-seed-2.0-code",
        "displayName": "Doubao-Seed-2.0-code",
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
      }
    ]
  },
  {
    "id": "ark-agent-plan",
    "website": "https://ai.volcengine.com/activity/agentplan",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "provider": {
      "id": "builtin-ark-agent-plan",
      "type": "openai_completions",
      "name": "VolcEngine Ark - Agent Plan",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/plan/v3",
      "enabled": true
    },
    "models": [
      {
        "id": "doubao-seed-evolving",
        "displayName": "Doubao-Seed-Evolving",
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
        "id": "doubao-seed-2.0-code",
        "displayName": "Doubao-Seed-2.0-code",
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
        "id": "doubao-seed-2.0-pro",
        "displayName": "Doubao-Seed-2.0-pro",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4-flash",
        "displayName": "DeepSeek V4 Flash",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k3",
        "displayName": "Kimi K3",
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
        "id": "minimax-m3",
        "displayName": "Minimax M3",
        "apiType": "openai_completions",
        "contextWindow": 512000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
    "website": "https://www.volcengine.com/activity/codingplan",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "provider": {
      "id": "builtin-ark-coding-plan",
      "type": "openai_completions",
      "name": "VolcEngine Ark - Coding Plan",
      "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3",
      "enabled": true
    },
    "models": [
      {
        "id": "doubao-seed-evolving",
        "displayName": "Doubao-Seed-Evolving",
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
        "id": "doubao-seed-2.0-code",
        "displayName": "Doubao-Seed-2.0-code",
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
        "id": "doubao-seed-2.0-pro",
        "displayName": "Doubao-Seed-2.0-pro",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek-v4-flash",
        "displayName": "DeepSeek V4 Flash",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.7-code",
        "displayName": "Kimi K2.7 Code",
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
        "id": "minimax-m3",
        "displayName": "Minimax M3",
        "apiType": "openai_completions",
        "contextWindow": 512000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
        "id": "gpt-5-codex",
        "displayName": "GPT-5-Codex",
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
        "id": "gpt-5.1-chat-latest",
        "displayName": "GPT-5.1 Chat",
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
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.1-codex",
        "displayName": "GPT-5.1 Codex",
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
        "id": "gpt-5.1-codex-max",
        "displayName": "GPT-5.1 Codex Max",
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
        "id": "gpt-5.1-codex-mini",
        "displayName": "GPT-5.1 Codex mini",
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
        "id": "gpt-5.2-codex",
        "displayName": "GPT-5.2 Codex",
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
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
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
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
        "id": "o3-deep-research",
        "displayName": "o3-deep-research",
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
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 40,
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
        "id": "o4-mini-deep-research",
        "displayName": "o4-mini-deep-research",
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
      }
    ]
  },
  {
    "id": "deepseek",
    "website": "https://www.deepseek.com",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "recommended",
    "provider": {
      "id": "builtin-deepseek",
      "type": "openai_completions",
      "name": "DeepSeek",
      "baseUrl": "https://api.deepseek.com",
      "enabled": true
    },
    "models": [
      {
        "id": "deepseek-v4-flash",
        "displayName": "DeepSeek V4 Flash",
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
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
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
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
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
    "provider": {
      "id": "builtin-google",
      "type": "google_generative_ai",
      "name": "Google",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "enabled": true
    },
    "models": [
      {
        "id": "gemini-2.0-flash",
        "displayName": "Gemini 2.0 Flash",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
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
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gemini-2.0-flash-lite",
        "displayName": "Gemini 2.0 Flash-Lite",
        "apiType": "google_generative_ai",
        "contextWindow": 1048576,
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
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.3,
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
        "id": "gemini-3-pro-preview",
        "displayName": "Gemini 3 Pro Preview",
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
        "id": "gemini-3.1-flash-lite-preview",
        "displayName": "Gemini 3.1 Flash Lite Preview",
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
        "id": "meta-llama/llama-4-scout-17b-16e-instruct",
        "displayName": "Llama 4 Scout 17B 16E",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 0.34,
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
        "id": "qwen/qwen3-32b",
        "displayName": "Qwen3-32B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 40960,
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
      }
    ]
  },
  {
    "id": "huggingface",
    "website": "https://huggingface.co",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "provider": {
      "id": "builtin-huggingface",
      "type": "openai_completions",
      "name": "Hugging Face",
      "baseUrl": "https://router.huggingface.co/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "MiniMaxAI/MiniMax-M2",
        "displayName": "MiniMax-M2",
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
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "MiniMaxAI/MiniMax-M2.1",
        "displayName": "MiniMax-M2.1",
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
        "contextWindow": 524288,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
        "id": "Qwen/Qwen3-235B-A22B",
        "displayName": "Qwen3 235B-A22B",
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
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.8,
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
        "id": "Qwen/Qwen3-32B",
        "displayName": "Qwen3 32B",
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
        "id": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "displayName": "Qwen3-Coder-480B-A35B-Instruct",
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
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "Qwen/Qwen3-Coder-Next",
        "displayName": "Qwen3-Coder-Next",
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
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 1.5,
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
        "id": "Qwen/Qwen3-Next-80B-A3B-Thinking",
        "displayName": "Qwen3-Next-80B-A3B-Thinking",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 2,
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
        "id": "XiaomiMiMo/MiMo-V2-Flash",
        "displayName": "MiMo-V2-Flash",
        "apiType": "openai_completions",
        "contextWindow": 262144,
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
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
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
        "id": "moonshotai/Kimi-K2-Thinking",
        "displayName": "Kimi-K2-Thinking",
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
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.5,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai-org/GLM-5",
        "displayName": "GLM-5",
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
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
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
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
    "provider": {
      "id": "builtin-moonshotai",
      "type": "openai_completions",
      "name": "Moonshot AI",
      "baseUrl": "https://api.moonshot.ai/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "kimi-k2-0711-preview",
        "displayName": "Kimi K2 0711",
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
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2-0905-preview",
        "displayName": "Kimi K2 0905",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
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
        "id": "kimi-k2-thinking",
        "displayName": "Kimi K2 Thinking",
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
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2-thinking-turbo",
        "displayName": "Kimi K2 Thinking Turbo",
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
        "inputCostPerMillionTokens": 1.15,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2-turbo-preview",
        "displayName": "Kimi K2 Turbo",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
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
        "inputCostPerMillionTokens": 2.4,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.5",
        "displayName": "Kimi K2.5",
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
      }
    ]
  },
  {
    "id": "moonshotai-cn",
    "website": "https://www.moonshot.cn",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "provider": {
      "id": "builtin-moonshotai-cn",
      "type": "openai_completions",
      "name": "Moonshot AI CN",
      "baseUrl": "https://api.moonshot.cn/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "kimi-k2-0711-preview",
        "displayName": "Kimi K2 0711",
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
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2-0905-preview",
        "displayName": "Kimi K2 0905",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
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
        "id": "kimi-k2-thinking",
        "displayName": "Kimi K2 Thinking",
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
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2-thinking-turbo",
        "displayName": "Kimi K2 Thinking Turbo",
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
        "inputCostPerMillionTokens": 1.15,
        "outputCostPerMillionTokens": 8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2-turbo-preview",
        "displayName": "Kimi K2 Turbo",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
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
        "inputCostPerMillionTokens": 2.4,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kimi-k2.5",
        "displayName": "Kimi K2.5",
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
      }
    ]
  },
  {
    "id": "nvidia",
    "website": "https://build.nvidia.com",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "provider": {
      "id": "builtin-nvidia",
      "type": "openai_completions",
      "name": "NVIDIA",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "meta/llama-3.1-70b-instruct",
        "displayName": "Llama 3.1 70b Instruct",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-3.1-8b-instruct",
        "displayName": "Llama 3.1 8B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 16000,
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
        "id": "meta/llama-3.3-70b-instruct",
        "displayName": "Llama 3.3 70b Instruct",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "minimaxai/minimax-m3",
        "displayName": "MiniMax-M3",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
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
        "id": "mistralai/mistral-large-3-675b-instruct-2512",
        "displayName": "Mistral Large 3 675B Instruct 2512",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-small-4-119b-2603",
        "displayName": "mistral-small-4-119b-2603",
        "apiType": "openai_completions",
        "contextWindow": 128000,
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
        "id": "nvidia/nemotron-3-nano-30b-a3b",
        "displayName": "nemotron-3-nano-30b-a3b",
        "apiType": "openai_completions",
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
        "id": "nvidia/nemotron-3-super-120b-a12b",
        "displayName": "Nemotron 3 Super",
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
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.8,
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
        "id": "nvidia/nvidia-nemotron-nano-9b-v2",
        "displayName": "nvidia-nemotron-nano-9b-v2",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-120b",
        "displayName": "GPT-OSS-120B",
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
        "id": "qwen/qwen3.5-122b-a10b",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "stepfun-ai/step-3.5-flash",
        "displayName": "Step 3.5 Flash",
        "apiType": "openai_completions",
        "contextWindow": 256000,
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
        "id": "stepfun-ai/step-3.7-flash",
        "displayName": "Step 3.7 Flash",
        "apiType": "openai_completions",
        "contextWindow": 256000,
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
        "id": "z-ai/glm-5.2",
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
        "id": "gpt-5-codex",
        "displayName": "GPT-5-Codex",
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
        "id": "gpt-5.1-chat-latest",
        "displayName": "GPT-5.1 Chat",
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
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.1-codex",
        "displayName": "GPT-5.1 Codex",
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
        "id": "gpt-5.1-codex-max",
        "displayName": "GPT-5.1 Codex Max",
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
        "id": "gpt-5.1-codex-mini",
        "displayName": "GPT-5.1 Codex mini",
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
        "id": "gpt-5.2-codex",
        "displayName": "GPT-5.2 Codex",
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
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
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
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
        "id": "o3-deep-research",
        "displayName": "o3-deep-research",
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
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 40,
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
      },
      {
        "id": "o4-mini-deep-research",
        "displayName": "o4-mini-deep-research",
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
      }
    ]
  },
  {
    "id": "openai-codex",
    "website": "https://openai.com/codex",
    "productionVisible": true,
    "authentication": "oauth",
    "recommendedGroup": "builtin",
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
        "id": "gpt-5.4",
        "displayName": "GPT-5.4",
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
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "gpt-5.4-mini",
        "displayName": "GPT-5.4 mini",
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
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 4.5,
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
        "contextWindow": 372000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
        "id": "gpt-5.6-sol",
        "displayName": "GPT-5.6 Sol",
        "apiType": "openai_codex_responses",
        "contextWindow": 372000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
        "id": "gpt-5.6-terra",
        "displayName": "GPT-5.6 Terra",
        "apiType": "openai_codex_responses",
        "contextWindow": 372000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
      }
    ]
  },
  {
    "id": "openrouter",
    "website": "https://openrouter.ai",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "provider": {
      "id": "builtin-openrouter",
      "type": "openai_completions",
      "name": "OpenRouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "ai21/jamba-large-1.7",
        "displayName": "AI21: Jamba Large 1.7",
        "apiType": "openai_completions",
        "contextWindow": 256000,
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
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 8,
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
        "id": "anthropic/claude-3-haiku",
        "displayName": "Anthropic: Claude 3 Haiku",
        "apiType": "openai_completions",
        "contextWindow": 200000,
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
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-fable-5",
        "displayName": "Anthropic: Claude Fable 5",
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
        "id": "anthropic/claude-haiku-4.5",
        "displayName": "Anthropic: Claude Haiku 4.5",
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4",
        "displayName": "Anthropic: Claude Opus 4",
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
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.1",
        "displayName": "Anthropic: Claude Opus 4.1",
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
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.5",
        "displayName": "Anthropic: Claude Opus 4.5",
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.6",
        "displayName": "Anthropic: Claude Opus 4.6",
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
        "id": "anthropic/claude-opus-4.7",
        "displayName": "Anthropic: Claude Opus 4.7",
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
        "id": "anthropic/claude-opus-4.7-fast",
        "displayName": "Anthropic: Claude Opus 4.7 (Fast)",
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
        "inputCostPerMillionTokens": 30,
        "outputCostPerMillionTokens": 150,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.8",
        "displayName": "Anthropic: Claude Opus 4.8",
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
        "id": "anthropic/claude-opus-4.8-fast",
        "displayName": "Anthropic: Claude Opus 4.8 (Fast)",
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
        "id": "anthropic/claude-sonnet-4",
        "displayName": "Anthropic: Claude Sonnet 4",
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
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.5",
        "displayName": "Anthropic: Claude Sonnet 4.5",
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
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-4.6",
        "displayName": "Anthropic: Claude Sonnet 4.6",
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
        "inputCostPerMillionTokens": 3,
        "outputCostPerMillionTokens": 15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-sonnet-5",
        "displayName": "Anthropic: Claude Sonnet 5",
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
        "id": "arcee-ai/virtuoso-large",
        "displayName": "Arcee AI: Virtuoso Large",
        "apiType": "openai_completions",
        "contextWindow": 131072,
        "maxOutputTokens": 64000,
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
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "auto",
        "displayName": "Auto",
        "apiType": "openai_completions",
        "contextWindow": 2000000,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
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
        "contextWindow": 128000,
        "maxOutputTokens": 16000,
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
        "inputCostPerMillionTokens": 0.2002,
        "outputCostPerMillionTokens": 0.8001,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-chat-v3-0324",
        "displayName": "DeepSeek: DeepSeek V3 0324",
        "apiType": "openai_completions",
        "contextWindow": 163840,
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
        "inputCostPerMillionTokens": 0.27,
        "outputCostPerMillionTokens": 1.12,
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
        "inputCostPerMillionTokens": 0.269,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v3.2-exp",
        "displayName": "DeepSeek: DeepSeek V3.2 Exp",
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
        "inputCostPerMillionTokens": 0.27,
        "outputCostPerMillionTokens": 0.41,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-flash",
        "displayName": "DeepSeek: DeepSeek V4 Flash",
        "apiType": "openai_completions",
        "contextWindow": 1048575,
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
        "inputCostPerMillionTokens": 0.098,
        "outputCostPerMillionTokens": 0.196,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "deepseek/deepseek-v4-pro",
        "displayName": "DeepSeek: DeepSeek V4 Pro",
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
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
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
        "id": "google/gemini-2.5-pro-preview-05-06",
        "displayName": "Google: Gemini 2.5 Pro Preview 05-06",
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
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 10,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3-flash-preview",
        "displayName": "Google: Gemini 3 Flash Preview",
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
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-3-pro-image",
        "displayName": "Google: Nano Banana Pro (Gemini 3 Pro Image)",
        "apiType": "openai_completions",
        "contextWindow": 65536,
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
        "outputCostPerMillionTokens": 0.45,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-26b-a4b-it",
        "displayName": "Google: Gemma 4 26B A4B ",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemma-4-26b-a4b-it:free",
        "displayName": "Google: Gemma 4 26B A4B  (free)",
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
        "inputCostPerMillionTokens": 0.22,
        "outputCostPerMillionTokens": 0.55,
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
        "id": "ibm-granite/granite-4.1-8b",
        "displayName": "IBM: Granite 4.1 8B",
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
        "outputCostPerMillionTokens": 0.1,
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
        "id": "inclusionai/ling-2.6-1t",
        "displayName": "inclusionAI: Ling-2.6-1T",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.625,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ling-2.6-flash",
        "displayName": "inclusionAI: Ling-2.6-flash",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.01,
        "outputCostPerMillionTokens": 0.03,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "inclusionai/ring-2.6-1t",
        "displayName": "inclusionAI: Ring-2.6-1T",
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
        "inputCostPerMillionTokens": 0.075,
        "outputCostPerMillionTokens": 0.625,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kwaipilot/kat-coder-air-v2.5",
        "displayName": "Kwaipilot: KAT-Coder-Air V2.5",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 80000,
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
        "id": "kwaipilot/kat-coder-pro-v2",
        "displayName": "Kwaipilot: KAT-Coder-Pro V2",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 80000,
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
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kwaipilot/kat-coder-pro-v2.5",
        "displayName": "Kwaipilot: KAT-Coder-Pro V2.5",
        "apiType": "openai_completions",
        "contextWindow": 256000,
        "maxOutputTokens": 80000,
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
        "inputCostPerMillionTokens": 0.74,
        "outputCostPerMillionTokens": 2.96,
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
        "id": "meta-llama/llama-3.3-70b-instruct",
        "displayName": "Meta: Llama 3.3 70B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/llama-3.3-70b-instruct:free",
        "displayName": "Meta: Llama 3.3 70B Instruct (free)",
        "apiType": "openai_completions",
        "contextWindow": 65536,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
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
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta-llama/llama-4-scout",
        "displayName": "Meta: Llama 4 Scout",
        "apiType": "openai_completions",
        "contextWindow": 327680,
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
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/muse-spark-1.1",
        "displayName": "Meta: Muse Spark 1.1",
        "apiType": "openai_completions",
        "contextWindow": 1048576,
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
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 4.25,
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
        "contextWindow": 196608,
        "maxOutputTokens": 196608,
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
        "outputCostPerMillionTokens": 0.9,
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
        "contextWindow": 524288,
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
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/devstral-2512",
        "displayName": "Mistral: Devstral 2 2512",
        "apiType": "openai_completions",
        "contextWindow": 262144,
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
        "id": "mistralai/ministral-3b-2512",
        "displayName": "Mistral: Ministral 3 3B 2512",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "id": "mistralai/mistral-large",
        "displayName": "Mistral Large",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.5,
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-medium-3",
        "displayName": "Mistral: Mistral Medium 3",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-medium-3.1",
        "displayName": "Mistral: Mistral Medium 3.1",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2,
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
        "inputCostPerMillionTokens": 0.019,
        "outputCostPerMillionTokens": 0.03,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-saba",
        "displayName": "Mistral: Saba",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mistral-small-3.2-24b-instruct",
        "displayName": "Mistral: Mistral Small 3.2 24B",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/mixtral-8x22b-instruct",
        "displayName": "Mistral: Mixtral 8x22B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 65536,
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
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistralai/voxtral-small-24b-2507",
        "displayName": "Mistral: Voxtral Small 24B 2507",
        "apiType": "openai_completions",
        "contextWindow": 32000,
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
        "maxOutputTokens": 100352,
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
        "maxOutputTokens": 100352,
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
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.7-code",
        "displayName": "MoonshotAI: Kimi K2.7 Code",
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
        "inputCostPerMillionTokens": 0.75,
        "outputCostPerMillionTokens": 3.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k3",
        "displayName": "MoonshotAI: Kimi K3",
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
        "id": "nex-agi/nex-n2-mini",
        "displayName": "Nex AGI: Nex-N2-Mini",
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
        "inputCostPerMillionTokens": 0.025,
        "outputCostPerMillionTokens": 0.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nex-agi/nex-n2-pro",
        "displayName": "Nex AGI: Nex-N2-Pro",
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
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        "displayName": "NVIDIA: Llama 3.3 Nemotron Super 49B V1.5",
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
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-nano-30b-a3b",
        "displayName": "NVIDIA: Nemotron 3 Nano 30B A3B",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 228000,
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
        "id": "nvidia/nemotron-3-nano-30b-a3b:free",
        "displayName": "NVIDIA: Nemotron 3 Nano 30B A3B (free)",
        "apiType": "openai_completions",
        "contextWindow": 256000,
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
        "contextWindow": 1000000,
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
        "inputCostPerMillionTokens": 0.21,
        "outputCostPerMillionTokens": 0.455,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "nvidia/nemotron-3-super-120b-a12b:free",
        "displayName": "NVIDIA: Nemotron 3 Super (free)",
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
        "id": "nvidia/nemotron-3-ultra-550b-a55b",
        "displayName": "NVIDIA: Nemotron 3 Ultra",
        "apiType": "openai_completions",
        "contextWindow": 512288,
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
        "inputCostPerMillionTokens": 0.6,
        "outputCostPerMillionTokens": 3.6,
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
        "id": "nvidia/nemotron-nano-12b-v2-vl:free",
        "displayName": "NVIDIA: Nemotron Nano 12B 2 VL (free)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
        "maxOutputTokens": 128000,
        "inputTypes": [
          "text",
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
        "id": "nvidia/nemotron-nano-9b-v2:free",
        "displayName": "NVIDIA: Nemotron Nano 9B V2 (free)",
        "apiType": "openai_completions",
        "contextWindow": 128000,
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
        "id": "openai/gpt-4-turbo-preview",
        "displayName": "OpenAI: GPT-4 Turbo Preview",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 30,
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
        "id": "openai/gpt-5-codex",
        "displayName": "OpenAI: GPT-5 Codex",
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
        "id": "openai/gpt-5.1-chat",
        "displayName": "OpenAI: GPT-5.1 Chat",
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
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 2,
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
        "id": "openai/gpt-5.3-chat",
        "displayName": "OpenAI: GPT-5.3 Chat",
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
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
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
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
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
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
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
        "inputCostPerMillionTokens": 0.037,
        "outputCostPerMillionTokens": 0.17,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-20b",
        "displayName": "OpenAI: gpt-oss-20b",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.03,
        "outputCostPerMillionTokens": 0.13,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-20b:free",
        "displayName": "OpenAI: gpt-oss-20b (free)",
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
        "id": "openai/o3-deep-research",
        "displayName": "OpenAI: o3 Deep Research",
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
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 40,
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
        "id": "openai/o4-mini-deep-research",
        "displayName": "OpenAI: o4 Mini Deep Research",
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
        "inputCostPerMillionTokens": -1000000,
        "outputCostPerMillionTokens": -1000000,
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
        "id": "poolside/laguna-m.1",
        "displayName": "Poolside: Laguna M.1",
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
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "poolside/laguna-m.1:free",
        "displayName": "Poolside: Laguna M.1 (free)",
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
        "inputCostPerMillionTokens": 0.04,
        "outputCostPerMillionTokens": 0.1,
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
        "id": "qwen/qwen-plus-2025-07-28",
        "displayName": "Qwen: Qwen Plus 0728",
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
        "id": "qwen/qwen-plus-2025-07-28:thinking",
        "displayName": "Qwen: Qwen Plus 0728 (thinking)",
        "apiType": "openai_completions",
        "contextWindow": 1000000,
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
        "id": "qwen/qwen3-235b-a22b",
        "displayName": "Qwen: Qwen3 235B A22B",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.455,
        "outputCostPerMillionTokens": 1.82,
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
        "contextWindow": 131072,
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
        "inputCostPerMillionTokens": 0.1495,
        "outputCostPerMillionTokens": 1.495,
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
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-30b-a3b-thinking-2507",
        "displayName": "Qwen: Qwen3 30B A3B Thinking 2507",
        "apiType": "openai_completions",
        "contextWindow": 81920,
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
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 1.56,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-32b",
        "displayName": "Qwen: Qwen3 32B",
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
        "inputCostPerMillionTokens": 0.08,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-8b",
        "displayName": "Qwen: Qwen3 8B",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.117,
        "outputCostPerMillionTokens": 0.455,
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
        "contextWindow": 160000,
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
        "inputCostPerMillionTokens": 0.07,
        "outputCostPerMillionTokens": 0.27,
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
        "maxOutputTokens": 262144,
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
        "inputCostPerMillionTokens": 0.11,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-coder-plus",
        "displayName": "Qwen: Qwen3 Coder Plus",
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
        "inputCostPerMillionTokens": 0.65,
        "outputCostPerMillionTokens": 3.25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-coder:free",
        "displayName": "Qwen: Qwen3 Coder 480B A35B (free)",
        "apiType": "openai_completions",
        "contextWindow": 262000,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-max",
        "displayName": "Qwen: Qwen3 Max",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.78,
        "outputCostPerMillionTokens": 3.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-max-thinking",
        "displayName": "Qwen: Qwen3 Max Thinking",
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
        "inputCostPerMillionTokens": 0.78,
        "outputCostPerMillionTokens": 3.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-next-80b-a3b-instruct",
        "displayName": "Qwen: Qwen3 Next 80B A3B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 262144,
        "maxOutputTokens": 262144,
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
        "id": "qwen/qwen3-next-80b-a3b-instruct:free",
        "displayName": "Qwen: Qwen3 Next 80B A3B Instruct (free)",
        "apiType": "openai_completions",
        "contextWindow": 262144,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-next-80b-a3b-thinking",
        "displayName": "Qwen: Qwen3 Next 80B A3B Thinking",
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
        "inputCostPerMillionTokens": 0.0975,
        "outputCostPerMillionTokens": 0.78,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-235b-a22b-instruct",
        "displayName": "Qwen: Qwen3 VL 235B A22B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "id": "qwen/qwen3-vl-235b-a22b-thinking",
        "displayName": "Qwen: Qwen3 VL 235B A22B Thinking",
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
        "inputCostPerMillionTokens": 0.26,
        "outputCostPerMillionTokens": 2.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-30b-a3b-instruct",
        "displayName": "Qwen: Qwen3 VL 30B A3B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 0.52,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-30b-a3b-thinking",
        "displayName": "Qwen: Qwen3 VL 30B A3B Thinking",
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
        "inputCostPerMillionTokens": 0.13,
        "outputCostPerMillionTokens": 1.56,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-32b-instruct",
        "displayName": "Qwen: Qwen3 VL 32B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "inputCostPerMillionTokens": 0.104,
        "outputCostPerMillionTokens": 0.416,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-8b-instruct",
        "displayName": "Qwen: Qwen3 VL 8B Instruct",
        "apiType": "openai_completions",
        "contextWindow": 131072,
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
        "inputCostPerMillionTokens": 0.117,
        "outputCostPerMillionTokens": 0.455,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3-vl-8b-thinking",
        "displayName": "Qwen: Qwen3 VL 8B Thinking",
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
        "inputCostPerMillionTokens": 0.117,
        "outputCostPerMillionTokens": 1.365,
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
        "inputCostPerMillionTokens": 0.195,
        "outputCostPerMillionTokens": 1.56,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-35b-a3b",
        "displayName": "Qwen: Qwen3.5-35B-A3B",
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
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-397b-a17b",
        "displayName": "Qwen: Qwen3.5 397B A17B",
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
        "inputCostPerMillionTokens": 0.45,
        "outputCostPerMillionTokens": 3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.5-9b",
        "displayName": "Qwen: Qwen3.5-9B",
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
        "inputCostPerMillionTokens": 0.45,
        "outputCostPerMillionTokens": 2.7,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "qwen/qwen3.6-35b-a3b",
        "displayName": "Qwen: Qwen3.6 35B A3B",
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
        "inputCostPerMillionTokens": 0.14,
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
        "id": "qwen/qwen3.6-max-preview",
        "displayName": "Qwen: Qwen3.6 Max Preview",
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
        "inputCostPerMillionTokens": 1.04,
        "outputCostPerMillionTokens": 6.24,
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
        "id": "qwen/qwen3.7-max",
        "displayName": "Qwen: Qwen3.7 Max",
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
        "inputCostPerMillionTokens": 0.32,
        "outputCostPerMillionTokens": 1.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "rekaai/reka-edge",
        "displayName": "Reka Edge",
        "apiType": "openai_completions",
        "contextWindow": 16384,
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
        "id": "sao10k/l3.1-euryale-70b",
        "displayName": "Sao10K: Llama 3.1 Euryale 70B v2.2",
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
        "inputCostPerMillionTokens": 0.85,
        "outputCostPerMillionTokens": 0.85,
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
        "id": "tencent/hy3",
        "displayName": "Tencent: Hy3",
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
        "inputCostPerMillionTokens": 0.2,
        "outputCostPerMillionTokens": 0.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/hy3-preview",
        "displayName": "Tencent: Hy3 preview",
        "apiType": "openai_completions",
        "contextWindow": 262144,
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
        "inputCostPerMillionTokens": 0.063,
        "outputCostPerMillionTokens": 0.21,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "tencent/hy3:free",
        "displayName": "Tencent: Hy3 (free)",
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
        "id": "thedrummer/unslopnemo-12b",
        "displayName": "TheDrummer: UnslopNemo 12B",
        "apiType": "openai_completions",
        "contextWindow": 32768,
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
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "upstage/solar-pro-3",
        "displayName": "Upstage: Solar Pro 3",
        "apiType": "openai_completions",
        "contextWindow": 128000,
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
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.20",
        "displayName": "xAI: Grok 4.20",
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
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.3",
        "displayName": "xAI: Grok 4.3",
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
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-4.5",
        "displayName": "xAI: Grok 4.5",
        "apiType": "openai_completions",
        "contextWindow": 500000,
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
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "x-ai/grok-build-0.1",
        "displayName": "xAI: Grok Build 0.1",
        "apiType": "openai_completions",
        "contextWindow": 256000,
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "xiaomi/mimo-v2.5",
        "displayName": "Xiaomi: MiMo-V2.5",
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
        "id": "xiaomi/mimo-v2.5-pro",
        "displayName": "Xiaomi: MiMo-V2.5-Pro",
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
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
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
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 1.75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-4.7-flash",
        "displayName": "Z.ai: GLM 4.7 Flash",
        "apiType": "openai_completions",
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
        "inputCostPerMillionTokens": 0.0605,
        "outputCostPerMillionTokens": 0.4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "z-ai/glm-5",
        "displayName": "Z.ai: GLM 5",
        "apiType": "openai_completions",
        "contextWindow": 202752,
        "maxOutputTokens": 202752,
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
        "inputCostPerMillionTokens": 0.9086,
        "outputCostPerMillionTokens": 2.8556,
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
        "displayName": "Anthropic Claude Haiku Latest",
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 25,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "~anthropic/claude-sonnet-latest",
        "displayName": "Anthropic Claude Sonnet Latest",
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
        "id": "~google/gemini-flash-latest",
        "displayName": "Google Gemini Flash Latest",
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
        "id": "~google/gemini-pro-latest",
        "displayName": "Google Gemini Pro Latest",
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
        "id": "~moonshotai/kimi-latest",
        "displayName": "MoonshotAI Kimi Latest",
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
        "id": "~openai/gpt-latest",
        "displayName": "OpenAI GPT Latest",
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
        "id": "~openai/gpt-mini-latest",
        "displayName": "OpenAI GPT Mini Latest",
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
        "id": "~x-ai/grok-latest",
        "displayName": "xAI: Grok Latest",
        "apiType": "openai_completions",
        "contextWindow": 500000,
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
        "inputCostPerMillionTokens": 2,
        "outputCostPerMillionTokens": 6,
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
        "reasoning": true,
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
        "inputCostPerMillionTokens": 0.16,
        "outputCostPerMillionTokens": 0.64,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen-3.6-max-preview",
        "displayName": "Qwen 3.6 Max Preview",
        "apiType": "anthropic_messages",
        "contextWindow": 240000,
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
        "inputCostPerMillionTokens": 1.3,
        "outputCostPerMillionTokens": 7.8,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-235b-a22b-thinking",
        "displayName": "Qwen3 VL 235B A22B Thinking",
        "apiType": "anthropic_messages",
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
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 4,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-coder",
        "displayName": "Qwen3 Coder 480B A35B Instruct",
        "apiType": "anthropic_messages",
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
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
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
        "id": "alibaba/qwen3-coder-plus",
        "displayName": "Qwen3 Coder Plus",
        "apiType": "anthropic_messages",
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-max",
        "displayName": "Qwen3 Max",
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
        "inputCostPerMillionTokens": 1.2,
        "outputCostPerMillionTokens": 6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-max-preview",
        "displayName": "Qwen3 Max Preview",
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
        "inputCostPerMillionTokens": 1.2,
        "outputCostPerMillionTokens": 6,
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
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-next-80b-a3b-thinking",
        "displayName": "Qwen3 Next 80B A3B Thinking",
        "apiType": "anthropic_messages",
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
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "alibaba/qwen3-vl-235b-a22b-instruct",
        "displayName": "Qwen3 VL 235B A22B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 129024,
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
        "id": "alibaba/qwen3-vl-instruct",
        "displayName": "Qwen3 VL 235B A22B Instruct",
        "apiType": "anthropic_messages",
        "contextWindow": 131072,
        "maxOutputTokens": 129024,
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
        "id": "alibaba/qwen3-vl-thinking",
        "displayName": "Qwen3 VL 235B A22B Thinking",
        "apiType": "anthropic_messages",
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
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 4,
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
        "inputCostPerMillionTokens": 1.25,
        "outputCostPerMillionTokens": 3.75,
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
        "id": "anthropic/claude-3-haiku",
        "displayName": "Claude 3 Haiku",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
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
        "inputCostPerMillionTokens": 0.25,
        "outputCostPerMillionTokens": 1.25,
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
        "id": "anthropic/claude-opus-4",
        "displayName": "Claude Opus 4",
        "apiType": "anthropic_messages",
        "contextWindow": 200000,
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
        "inputCostPerMillionTokens": 15,
        "outputCostPerMillionTokens": 75,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "anthropic/claude-opus-4.1",
        "displayName": "Claude Opus 4.1",
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
        "id": "anthropic/claude-opus-4.7-fast",
        "displayName": "Claude Opus 4.7 (Fast)",
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
        "outputCostPerMillionTokens": 150,
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
        "id": "anthropic/claude-sonnet-4",
        "displayName": "Claude Sonnet 4",
        "apiType": "anthropic_messages",
        "contextWindow": 1000000,
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
        "outputCostPerMillionTokens": 0.9,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "arcee-ai/trinity-mini",
        "displayName": "Trinity Mini",
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
        "inputCostPerMillionTokens": 0.045,
        "outputCostPerMillionTokens": 0.15,
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
        "id": "deepseek/deepseek-v3",
        "displayName": "DeepSeek V3 0324",
        "apiType": "anthropic_messages",
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
        "id": "deepseek/deepseek-v3.1-terminus",
        "displayName": "DeepSeek V3.1 Terminus",
        "apiType": "anthropic_messages",
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
        "inputCostPerMillionTokens": 0.27,
        "outputCostPerMillionTokens": 1,
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
        "inputCostPerMillionTokens": 0.28,
        "outputCostPerMillionTokens": 0.42,
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
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
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
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash",
        "displayName": "Gemini 2.5 Flash",
        "apiType": "anthropic_messages",
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
        "outputCostPerMillionTokens": 2.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "google/gemini-2.5-flash-lite",
        "displayName": "Gemini 2.5 Flash Lite",
        "apiType": "anthropic_messages",
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
        "id": "google/gemini-2.5-pro",
        "displayName": "Gemini 2.5 Pro",
        "apiType": "anthropic_messages",
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
        "id": "google/gemini-3-pro-preview",
        "displayName": "Gemini 3 Pro Preview",
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
        "id": "google/gemini-3.1-flash-lite-preview",
        "displayName": "Gemini 3.1 Flash Lite Preview",
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
        "id": "google/gemma-4-26b-a4b-it",
        "displayName": "Gemma 4 26B A4B IT",
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
        "id": "kwaipilot/kat-coder-air-v2.5",
        "displayName": "Kat Coder Air V2.5",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
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
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.6,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kwaipilot/kat-coder-pro-v1",
        "displayName": "KAT-Coder-Pro V1",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
        "maxOutputTokens": 32000,
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
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kwaipilot/kat-coder-pro-v2",
        "displayName": "Kat Coder Pro V2",
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
        "inputCostPerMillionTokens": 0.3,
        "outputCostPerMillionTokens": 1.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "kwaipilot/kat-coder-pro-v2.5",
        "displayName": "Kat Coder Pro V2.5",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
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
        "inputCostPerMillionTokens": 0.74,
        "outputCostPerMillionTokens": 2.96,
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
        "id": "meta/llama-3.2-11b",
        "displayName": "Llama 3.2 11B Vision Instruct",
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
        "inputCostPerMillionTokens": 0.16,
        "outputCostPerMillionTokens": 0.16,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "meta/llama-3.2-90b",
        "displayName": "Llama 3.2 90B Vision Instruct",
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
        "inputCostPerMillionTokens": 0.72,
        "outputCostPerMillionTokens": 0.72,
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
        "id": "mistral/devstral-2",
        "displayName": "Devstral 2",
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
        "inputCostPerMillionTokens": 0.4,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/devstral-small-2",
        "displayName": "Devstral Small 2",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
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
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/magistral-medium",
        "displayName": "Magistral Medium 2509",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
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
        "outputCostPerMillionTokens": 5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/magistral-small",
        "displayName": "Magistral Small 2509",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
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
        "outputCostPerMillionTokens": 1.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/ministral-14b",
        "displayName": "Ministral 14B",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
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
        "inputCostPerMillionTokens": 0.1,
        "outputCostPerMillionTokens": 0.1,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/ministral-8b",
        "displayName": "Ministral 8B",
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
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/mistral-large-3",
        "displayName": "Mistral Large 3",
        "apiType": "anthropic_messages",
        "contextWindow": 256000,
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
        "id": "mistral/mistral-medium",
        "displayName": "Mistral Medium 3.1",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 64000,
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
        "id": "mistral/mistral-medium-3.5",
        "displayName": "Mistral Medium Latest",
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
        "inputCostPerMillionTokens": 1.5,
        "outputCostPerMillionTokens": 7.5,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/mistral-nemo",
        "displayName": "Mistral Nemo 12B",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
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
        "inputCostPerMillionTokens": 0.15,
        "outputCostPerMillionTokens": 0.15,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/mistral-small",
        "displayName": "Mistral Small",
        "apiType": "anthropic_messages",
        "contextWindow": 32000,
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
        "outputCostPerMillionTokens": 0.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mistral/pixtral-12b",
        "displayName": "Pixtral 12B 2409",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
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
        "id": "moonshotai/kimi-k2-thinking",
        "displayName": "Kimi K2 Thinking",
        "apiType": "anthropic_messages",
        "contextWindow": 216144,
        "maxOutputTokens": 216144,
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
        "inputCostPerMillionTokens": 0.47,
        "outputCostPerMillionTokens": 2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "moonshotai/kimi-k2.5",
        "displayName": "Kimi K2.5",
        "apiType": "anthropic_messages",
        "contextWindow": 262114,
        "maxOutputTokens": 262114,
        "inputTypes": [
          "text",
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
        "outputCostPerMillionTokens": 0.24,
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
        "id": "openai/gpt-5-chat",
        "displayName": "GPT 5 Chat",
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
        "outputCostPerMillionTokens": 10,
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
        "id": "openai/gpt-5.1-instant",
        "displayName": "GPT-5.1 Instant",
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
        "outputCostPerMillionTokens": 10,
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
        "id": "openai/gpt-5.2-chat",
        "displayName": "GPT 5.2 Chat",
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
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
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
        "id": "openai/gpt-5.3-chat",
        "displayName": "GPT-5.3 Chat",
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
        "inputCostPerMillionTokens": 1.75,
        "outputCostPerMillionTokens": 14,
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
        "inputCostPerMillionTokens": 1,
        "outputCostPerMillionTokens": 6,
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
        "inputCostPerMillionTokens": 5,
        "outputCostPerMillionTokens": 30,
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
        "inputCostPerMillionTokens": 2.5,
        "outputCostPerMillionTokens": 15,
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
        "inputCostPerMillionTokens": 0.05,
        "outputCostPerMillionTokens": 0.2,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "openai/gpt-oss-safeguard-20b",
        "displayName": "GPT OSS Safeguard 20B",
        "apiType": "anthropic_messages",
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
        "id": "openai/o3-deep-research",
        "displayName": "o3-deep-research",
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
        "inputCostPerMillionTokens": 10,
        "outputCostPerMillionTokens": 40,
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
        "id": "stepfun/step-3.5-flash",
        "displayName": "StepFun 3.5 Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 262114,
        "maxOutputTokens": 262114,
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
        "outputCostPerMillionTokens": 0.3,
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
        "id": "xai/grok-4.1-fast-non-reasoning",
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
        "id": "xai/grok-4.1-fast-reasoning",
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
        "id": "xai/grok-4.20-multi-agent",
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
        "id": "xai/grok-4.20-multi-agent-beta",
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
        "id": "xai/grok-4.20-non-reasoning",
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
        "id": "xai/grok-4.20-non-reasoning-beta",
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
        "id": "xai/grok-4.20-reasoning",
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
        "id": "xai/grok-4.20-reasoning-beta",
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
        "id": "xai/grok-4.3",
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
        "id": "xai/grok-4.5",
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
        "id": "xai/grok-build-0.1",
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
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
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
        "id": "zai/glm-4.6v",
        "displayName": "GLM-4.6V",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 24000,
        "inputTypes": [
          "text",
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
        "id": "zai/glm-4.6v-flash",
        "displayName": "GLM-4.6V-Flash",
        "apiType": "anthropic_messages",
        "contextWindow": 128000,
        "maxOutputTokens": 24000,
        "inputTypes": [
          "text",
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
        "inputCostPerMillionTokens": 0.95,
        "outputCostPerMillionTokens": 3.15,
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
        "contextWindow": 202000,
        "maxOutputTokens": 202000,
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
        "inputCostPerMillionTokens": 1.3,
        "outputCostPerMillionTokens": 4.3,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "zai/glm-5.2",
        "displayName": "GLM 5.2",
        "apiType": "anthropic_messages",
        "contextWindow": 1040000,
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
        "inputCostPerMillionTokens": 1.4,
        "outputCostPerMillionTokens": 4.4,
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
        "inputCostPerMillionTokens": 2.1,
        "outputCostPerMillionTokens": 6.6,
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
    "provider": {
      "id": "builtin-xai",
      "type": "openai_completions",
      "name": "xAI",
      "baseUrl": "https://api.x.ai/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "grok-4.3",
        "displayName": "Grok 4.3",
        "apiType": "openai_completions",
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
        "id": "grok-build-0.1",
        "displayName": "Grok Build 0.1",
        "apiType": "openai_completions",
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
      }
    ]
  },
  {
    "id": "xiaomi",
    "website": "https://mimo.xiaomi.com/zh",
    "productionVisible": true,
    "authentication": "bearer",
    "recommendedGroup": "builtin",
    "provider": {
      "id": "builtin-xiaomi",
      "type": "openai_completions",
      "name": "Xiaomi",
      "baseUrl": "https://api.xiaomimimo.com/v1",
      "enabled": true
    },
    "models": [
      {
        "id": "mimo-v2-flash",
        "displayName": "MiMo-V2-Flash",
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
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mimo-v2-omni",
        "displayName": "MiMo-V2-Omni",
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
        "inputCostPerMillionTokens": 0.14,
        "outputCostPerMillionTokens": 0.28,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mimo-v2-pro",
        "displayName": "MiMo-V2-Pro",
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
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mimo-v2.5",
        "displayName": "MiMo-V2.5",
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
        "id": "mimo-v2.5-pro",
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
        "inputCostPerMillionTokens": 0.435,
        "outputCostPerMillionTokens": 0.87,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "mimo-v2.5-pro-ultraspeed",
        "displayName": "MiMo-V2.5-Pro-UltraSpeed",
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
        "inputCostPerMillionTokens": 1.305,
        "outputCostPerMillionTokens": 2.61,
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
    "provider": {
      "id": "builtin-zai",
      "type": "openai_completions",
      "name": "Z.AI",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "enabled": true
    },
    "models": [
      {
        "id": "glm-4.5-air",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.1",
        "displayName": "GLM-5.1",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5v-turbo",
        "displayName": "GLM-5V-Turbo",
        "apiType": "openai_completions",
        "contextWindow": 200000,
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
    "provider": {
      "id": "builtin-zai-coding-cn",
      "type": "openai_completions",
      "name": "Z.AI Coding CN",
      "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
      "enabled": true
    },
    "models": [
      {
        "id": "glm-4.5-air",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5.1",
        "displayName": "GLM-5.1",
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
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
        "inputCostPerMillionTokens": 0,
        "outputCostPerMillionTokens": 0,
        "defaultEnabled": true,
        "lifecycleStatus": "active"
      },
      {
        "id": "glm-5v-turbo",
        "displayName": "GLM-5V-Turbo",
        "apiType": "openai_completions",
        "contextWindow": 200000,
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
  }
] as const;
