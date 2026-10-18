import { writeFile } from 'node:fs/promises'
import {
  getBuiltinModels,
  builtinProviders
} from '@realmflow/pi-ai-catalog/providers/all'

const outputPath = new URL('../domain/model-provider-catalog-data.ts', import.meta.url)
const verifiedAt = '2026-10-17'
const upstreamPackage = '@earendil-works/pi-ai@1.3.0'

const providerOrder = [
  'amazon-bedrock',
  'ant-ling',
  'anthropic',
  'ark',
  'ark-agent-plan',
  'ark-coding-plan',
  'azure-openai-responses',
  'deepseek',
  'google',
  'groq',
  'huggingface',
  'minimax',
  'minimax-cn',
  'moonshotai',
  'moonshotai-cn',
  'nvidia',
  'openai',
  'openai-codex',
  'openrouter',
  'vercel-ai-gateway',
  'xai',
  'xiaomi',
  'zai',
  'zai-coding-cn'
]

const metadata = {
  'amazon-bedrock': ['Amazon Bedrock', 'https://aws.amazon.com/bedrock/', 'https://bedrock-runtime.us-east-1.amazonaws.com', 'aws'],
  'ant-ling': ['Ant Ling', 'https://www.ant-ling.com/', 'https://api.ant-ling.com/v1', 'bearer'],
  anthropic: ['Anthropic', 'https://claude.com/platform/api', 'https://api.anthropic.com', 'anthropic_api_key'],
  ark: ['VolcEngine Ark', 'https://www.volcengine.com/product/ark', 'https://ark.cn-beijing.volces.com/api/v3', 'bearer'],
  'ark-agent-plan': ['VolcEngine Ark - Agent Plan', 'https://www.volcengine.com/product/ark', 'https://ark.cn-beijing.volces.com/api/plan/v3', 'bearer'],
  'ark-coding-plan': ['VolcEngine Ark - Coding Plan', 'https://www.volcengine.com/product/ark', 'https://ark.cn-beijing.volces.com/api/coding/v3', 'bearer'],
  'azure-openai-responses': ['Azure OpenAI Responses', 'https://azure.microsoft.com/en-us/products/ai-services/openai-service', 'https://openai.azure.com', 'bearer'],
  deepseek: ['DeepSeek', 'https://www.deepseek.com', 'https://api.deepseek.com', 'bearer'],
  google: ['Google', 'https://ai.google.dev', 'https://generativelanguage.googleapis.com/v1beta', 'google_api_key'],
  groq: ['Groq', 'https://groq.com', 'https://api.groq.com/openai/v1', 'bearer'],
  huggingface: ['Hugging Face', 'https://huggingface.co', 'https://router.huggingface.co/v1', 'bearer'],
  minimax: ['MiniMax', 'https://www.minimax.io', 'https://api.minimax.io/anthropic', 'anthropic_api_key'],
  'minimax-cn': ['MiniMax CN', 'https://www.minimaxi.com', 'https://api.minimaxi.com/anthropic', 'anthropic_api_key'],
  moonshotai: ['Moonshot AI', 'https://www.moonshot.ai', 'https://api.moonshot.ai/v1', 'bearer'],
  'moonshotai-cn': ['Moonshot AI CN', 'https://www.moonshot.cn', 'https://api.moonshot.cn/v1', 'bearer'],
  nvidia: ['NVIDIA', 'https://build.nvidia.com', 'https://integrate.api.nvidia.com/v1', 'bearer'],
  openai: ['OpenAI', 'https://openai.com', 'https://api.openai.com/v1', 'bearer'],
  'openai-codex': ['OpenAI Codex', 'https://openai.com/codex', 'https://chatgpt.com/backend-api', 'oauth'],
  openrouter: ['OpenRouter', 'https://openrouter.ai', 'https://openrouter.ai/api/v1', 'bearer'],
  'vercel-ai-gateway': ['Vercel AI Gateway', 'https://vercel.com/ai-gateway', 'https://ai-gateway.vercel.sh', 'anthropic_api_key'],
  xai: ['xAI', 'https://x.ai', 'https://api.x.ai/v1', 'bearer'],
  xiaomi: ['Xiaomi', 'https://mimo.mi.com/zh', 'https://api.xiaomimimo.com/v1', 'bearer'],
  zai: ['Z.AI', 'https://z.ai', 'https://api.z.ai/api/paas/v4', 'bearer'],
  'zai-coding-cn': ['Z.AI Coding CN', 'https://z.ai/subscribe', 'https://open.bigmodel.cn/api/coding/paas/v4', 'bearer']
}

const documentationUrls = {
  'amazon-bedrock': 'https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html',
  'ant-ling': 'https://developer.ant-ling.com/en/docs/api-reference/',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/models/overview',
  ark: 'https://ark.volcengine.com/region:cn-beijing/docs/model-list',
  'ark-agent-plan': 'https://ark.volcengine.com/region:cn-beijing/docs/agent-plan-personal-plan-overview',
  'ark-coding-plan': 'https://ark.volcengine.com/region:cn-beijing/docs/coding-plan-personal-plan-overview',
  'azure-openai-responses': 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
  google: 'https://ai.google.dev/gemini-api/docs/models',
  groq: 'https://console.groq.com/docs/models',
  huggingface: 'https://router.huggingface.co/v1/models',
  minimax: 'https://platform.minimax.io/docs/guides/models-intro',
  'minimax-cn': 'https://platform.minimaxi.com/document/models',
  moonshotai: 'https://platform.moonshot.ai/docs/guide/use-kimi-api',
  'moonshotai-cn': 'https://platform.moonshot.cn/docs/guide/use-kimi-api',
  nvidia: 'https://integrate.api.nvidia.com/v1/models',
  openai: 'https://platform.openai.com/docs/models',
  'openai-codex': 'https://developers.openai.com/codex/models/',
  openrouter: 'https://openrouter.ai/api/v1/models',
  'vercel-ai-gateway': 'https://vercel.com/docs/ai-gateway/models-and-providers',
  xai: 'https://docs.x.ai/developers/models',
  xiaomi: 'https://mimo.mi.com/docs/quick-start/summary/model',
  zai: 'https://docs.bigmodel.cn/cn/guide/start/model-overview',
  'zai-coding-cn': 'https://docs.bigmodel.cn/cn/coding-plan/latest-model'
}

const apiTypes = {
  'openai-completions': 'openai_completions',
  'openai-responses': 'openai_responses',
  'anthropic-messages': 'anthropic_messages',
  'bedrock-converse-stream': 'bedrock_converse_stream',
  'google-generative-ai': 'google_generative_ai',
  'azure-openai-responses': 'azure_openai_responses',
  'openai-codex-responses': 'openai_codex_responses'
}

const upstreamProviderIds = {
  'azure-openai-responses': 'azure'
}

const excludedModelIds = {
  google: [
    'gemini-2.5-computer-use-preview-10-2025',
    'gemini-3.1-flash-lite-preview'
  ],
  groq: ['qwen/qwen3.6-27b'],
  huggingface: [
    'MiniMaxAI/MiniMax-M2',
    'MiniMaxAI/MiniMax-M2.1',
    'moonshotai/Kimi-K2-Thinking',
    'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    'Qwen/Qwen3-Coder-Next',
    'Qwen/Qwen3-Next-80B-A3B-Thinking',
    'Qwen/Qwen3-VL-235B-A22B-Thinking',
    'XiaomiMiMo/MiMo-V2-Flash'
  ],
  openrouter: ['auto'],
  xiaomi: ['mimo-v2.5', 'mimo-v2.5-pro', 'mimo-v2.5-pro-ultraspeed']
}

const modelOverrides = {
  deepseek: {
    'deepseek-flash': {
      displayName: 'DeepSeek-V4.1-Flash'
    }
  },
  huggingface: {
    'deepseek-ai/DeepSeek-V3': { contextWindow: 163840 },
    'deepseek-ai/DeepSeek-V3.1': { contextWindow: 163840 },
    'deepseek-ai/DeepSeek-V4-Pro-0813': { contextWindow: 1048576 },
    'MiniMaxAI/MiniMax-M3': { contextWindow: 1000000 },
    'moonshotai/Kimi-K3': { contextWindow: 1048576 },
    'Qwen/Qwen3-235B-A22B': { contextWindow: 32000 },
    'Qwen/Qwen3-32B': { contextWindow: 40960 },
    'Qwen/Qwen3-VL-235B-A22B-Instruct': { contextWindow: 262144 },
    'Qwen/Qwen3-VL-30B-A3B-Instruct': { contextWindow: 262144 },
    'Qwen/Qwen3.8-2.4T-A95B': { contextWindow: 1010000 },
    'Qwen/Qwen3.8-27B': { contextWindow: 1000000 },
    'tencent/Hy4-preview': { contextWindow: 1048576 },
    'XiaomiMiMo/MiMo-V2.5': { contextWindow: 1048576 },
    'zai-org/GLM-4.7-Flash': { contextWindow: 202752 },
    'zai-org/GLM-5': { contextWindow: 202800 },
    'zai-org/GLM-5.2': { contextWindow: 1048576 }
  },
  openai: {
    'gpt-5.5': { contextWindow: 1050000 }
  },
  openrouter: {
    '~deepseek/deepseek-flash-latest': { maxOutputTokens: 131072 },
    '~moonshotai/kimi-latest': { maxOutputTokens: 943718 },
    'deepseek/deepseek-chat-v3-0324': { contextWindow: 163840 },
    'deepseek/deepseek-v3.2': { maxOutputTokens: 65536 },
    'deepseek/deepseek-v4-flash': { contextWindow: 1048576 },
    'deepseek/deepseek-v4-pro': { contextWindow: 1048576 },
    'deepseek/deepseek-v4.1-flash': { maxOutputTokens: 393216 },
    'deepseek/deepseek-v4.1-flash:batch': { maxOutputTokens: 384000 },
    'google/gemini-3-pro-image': { contextWindow: 131072 },
    'meta-llama/llama-3.3-70b-instruct': { maxOutputTokens: 16384 },
    'meta-llama/llama-4-maverick': { contextWindow: 1048576 },
    'meta-llama/llama-4-scout': {
      contextWindow: 1310720,
      maxOutputTokens: 16384
    },
    'minimax/minimax-m2.5': { contextWindow: 204800 },
    'minimax/minimax-m3': { contextWindow: 1048576 },
    'moonshotai/kimi-k2.5': { maxOutputTokens: 235929 },
    'moonshotai/kimi-k3': { maxOutputTokens: 943718 },
    'nvidia/nemotron-3-ultra-550b-a55b': { contextWindow: 262144 },
    'nvidia/nemotron-3.5-super-vl': { contextWindow: 1048576 },
    'qwen/qwen3-32b': { contextWindow: 131072 },
    'qwen/qwen3-next-80b-a3b-instruct': { maxOutputTokens: 16384 },
    'qwen/qwen3-vl-235b-a22b-instruct': { contextWindow: 262144 },
    'qwen/qwen3.5-35b-a3b': { contextWindow: 262144 },
    'qwen/qwen3.5-9b': { contextWindow: 262144 },
    'qwen/qwen3.8-2.4t-a95b': { contextWindow: 1048576 },
    'qwen/qwen3.8-27b': { contextWindow: 1000000 },
    'stepfun/step-3.7-flash': { contextWindow: 262144 },
    'stepfun/step-5-preview': { contextWindow: 1048576 },
    'xiaomi/mimo-v2.5': { contextWindow: 1050000 },
    'xiaomi/mimo-v2.5-pro': { contextWindow: 1050000 },
    'xiaomi/mimo-v2.6-flash': { contextWindow: 1050000 },
    'xiaomi/mimo-v2.6-pro': { contextWindow: 1050000 },
    'z-ai/glm-4.6': { contextWindow: 204800 },
    'z-ai/glm-4.7': { contextWindow: 204800 },
    'z-ai/glm-4.7-flash': { contextWindow: 200000 },
    'z-ai/glm-5': { contextWindow: 204800 },
    'z-ai/glm-5.1': { contextWindow: 204800 },
    'z-ai/glm-5.3-flash': { contextWindow: 1048576 }
  }
}

function createCatalogModel({
  id,
  displayName,
  contextWindow,
  maxOutputTokens,
  inputTypes = ['text'],
  reasoning = true,
  apiType = 'openai_completions',
  inputCostPerMillionTokens = 0,
  outputCostPerMillionTokens = 0
}) {
  return {
    id,
    displayName,
    apiType,
    contextWindow,
    maxOutputTokens,
    inputTypes,
    reasoning,
    capabilities: {
      text: inputTypes.includes('text'),
      vision: inputTypes.includes('image'),
      toolCalling: true,
      structuredOutput: true
    },
    inputCostPerMillionTokens,
    outputCostPerMillionTokens,
    defaultEnabled: true,
    lifecycleStatus: 'active'
  }
}

const arkModels = [
  createCatalogModel({
    id: 'doubao-seed-evolving',
    displayName: 'Doubao-Seed-Evolving',
    contextWindow: 1048576,
    maxOutputTokens: 262144,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'doubao-seed-2-1-pro-260915',
    displayName: 'Doubao-Seed-2.1-pro',
    contextWindow: 1048576,
    maxOutputTokens: 262144,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'doubao-seed-2-1-lite-260915',
    displayName: 'Doubao-Seed-2.1-lite',
    contextWindow: 1048576,
    maxOutputTokens: 262144,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'doubao-seed-2-1-turbo-260628',
    displayName: 'Doubao-Seed-2.1-turbo',
    contextWindow: 262144,
    maxOutputTokens: 262144,
    inputTypes: ['text', 'image']
  })
]

const arkPlanModels = [
  createCatalogModel({
    id: 'doubao-seed-2.0-mini',
    displayName: 'Doubao-Seed-2.0-mini',
    contextWindow: 262144,
    maxOutputTokens: 131072,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'doubao-seed-2.1-lite',
    displayName: 'Doubao-Seed-2.1-lite',
    contextWindow: 1048576,
    maxOutputTokens: 262144,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'deepseek-v4-flash',
    displayName: 'DeepSeek-V4-Flash',
    contextWindow: 1048576,
    maxOutputTokens: 393216
  }),
  createCatalogModel({
    id: 'glm-5.3-flash',
    displayName: 'GLM-5.3-Flash',
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'doubao-seed-2.1-pro',
    displayName: 'Doubao-Seed-2.1-pro',
    contextWindow: 1048576,
    maxOutputTokens: 262144,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'doubao-seed-evolving',
    displayName: 'Doubao-Seed-Evolving',
    contextWindow: 1048576,
    maxOutputTokens: 262144,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'minimax-m3',
    displayName: 'MiniMax-M3',
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'glm-5.3',
    displayName: 'GLM-5.3',
    contextWindow: 1048576,
    maxOutputTokens: 131072
  }),
  createCatalogModel({
    id: 'kimi-k2.7-code',
    displayName: 'Kimi-K2.7-Code',
    contextWindow: 262144,
    maxOutputTokens: 32768,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'kimi-k2.8-preview',
    displayName: 'Kimi-K2.8-Preview',
    contextWindow: 1048576,
    maxOutputTokens: 1048576,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'deepseek-v4-pro',
    displayName: 'DeepSeek-V4-Pro',
    contextWindow: 1048576,
    maxOutputTokens: 393216
  }),
  createCatalogModel({
    id: 'kimi-k3',
    displayName: 'Kimi-K3',
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    inputTypes: ['text', 'image']
  }),
  createCatalogModel({
    id: 'deepseek-v4.1-flash',
    displayName: 'DeepSeek-V4.1-Flash',
    contextWindow: 1048576,
    maxOutputTokens: 393216,
    inputTypes: ['text', 'image']
  })
]

const manualModels = {
  ark: arkModels,
  'ark-agent-plan': arkPlanModels,
  'ark-coding-plan': arkPlanModels
}

const extraModels = {
  'ant-ling': [
    createCatalogModel({
      id: 'Ling-3.1-flash',
      displayName: 'Ling 3.1 Flash',
      contextWindow: 262144,
      maxOutputTokens: 65536
    }),
    createCatalogModel({
      id: 'Ling-3.0-flash',
      displayName: 'Ling 3.0 Flash',
      contextWindow: 262144,
      maxOutputTokens: 65536
    })
  ],
  groq: [
    createCatalogModel({
      id: 'minimaxai/minimax-m2.7',
      displayName: 'MiniMax M2.7',
      contextWindow: 196608,
      maxOutputTokens: 131072
    })
  ],
  zai: [
    createCatalogModel({
      id: 'glm-5.3-flashx',
      displayName: 'GLM-5.3-FlashX',
      contextWindow: 1000000,
      maxOutputTokens: 131072,
      inputTypes: ['text', 'image']
    })
  ]
}

function applyOfficialPolicy(providerId, models) {
  const excluded = new Set(excludedModelIds[providerId] ?? [])
  const overrides = modelOverrides[providerId] ?? {}
  let result = models
    .filter((model) => !excluded.has(model.id))
    .map((model) => {
      const override = overrides[model.id]
      if (!override) return model
      const updated = { ...model, ...override }
      return {
        ...updated,
        capabilities: {
          ...updated.capabilities,
          text: updated.inputTypes.includes('text'),
          vision: updated.inputTypes.includes('image')
        }
      }
    })

  if (providerId === 'ant-ling') {
    result = [...extraModels['ant-ling'], ...result]
  } else if (providerId === 'groq') {
    const qwen = result.find(({ id }) => id === 'qwen/qwen3.8-27b')
    result = [
      ...result.filter(({ id }) => id !== 'qwen/qwen3.8-27b'),
      ...extraModels.groq,
      ...(qwen ? [qwen] : [])
    ]
  } else if (providerId === 'zai') {
    result = [...result, ...extraModels.zai]
  }

  return result
}

const providers = new Map(
  builtinProviders().map((provider) => [provider.id, provider])
)
const recommended = new Set(['openai', 'anthropic', 'google', 'deepseek'])
const generatedSeeds = providerOrder.map((id) => {
  const [name, website, baseUrl, authentication] = metadata[id]
  const sourceProviderId = upstreamProviderIds[id] ?? id
  const manualCatalogModels = manualModels[id]
  let catalogModels

  if (manualCatalogModels) {
    catalogModels = manualCatalogModels
  } else {
    const provider = providers.get(sourceProviderId)
    const models = getBuiltinModels(sourceProviderId)
    if (!provider || models.length === 0) {
      throw new Error(`Missing pi-ai provider catalog: ${sourceProviderId}`)
    }
    const mappedModels = models.map((model) =>
      createCatalogModel({
        id: model.id,
        displayName: model.name,
        apiType: apiTypes[model.api],
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxTokens,
        inputTypes: model.input,
        reasoning: model.reasoning,
        inputCostPerMillionTokens: model.cost.input,
        outputCostPerMillionTokens: model.cost.output
      })
    )
    catalogModels = applyOfficialPolicy(id, mappedModels)
  }

  if (catalogModels.some((model) => !model.apiType)) {
    throw new Error(`Unsupported API type in provider catalog: ${id}`)
  }

  return {
    id,
    website,
    productionVisible: true,
    authentication,
    recommendedGroup: recommended.has(id) ? 'recommended' : 'builtin',
    catalogSource: {
      documentationUrl: documentationUrls[id],
      verifiedAt,
      upstreamPackage,
      sourceProviderId: manualCatalogModels ? 'official-manual' : sourceProviderId
    },
    provider: {
      id: `builtin-${id}`,
      type: catalogModels[0].apiType,
      name,
      baseUrl,
      enabled: true
    },
    models: catalogModels
  }
})

for (const id of providerOrder) {
  if (!documentationUrls[id]) {
    throw new Error(`Missing official documentation source: ${id}`)
  }
}

const banner = `// Generated from ${upstreamPackage} with official provider overrides verified ${verifiedAt}.
// Run \`node scripts/generate-model-provider-catalog.mjs\` to refresh.
// Keep this data static so catalog upgrades are explicit and reviewable.
`
await writeFile(
  outputPath,
  `${banner}export const MODEL_PROVIDER_CATALOG_SEEDS = ${JSON.stringify(generatedSeeds, null, 2)} as const;\n`
)
