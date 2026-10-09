import { readFile, writeFile } from 'node:fs/promises'
import ts from 'typescript'
import {
  getBuiltinModels,
  builtinProviders
} from '@earendil-works/pi-ai/providers/all'

const outputPath = new URL('../domain/model-provider-catalog-data.ts', import.meta.url)
const existingSource = await readFile(outputPath, 'utf8')
const transpiled = ts.transpileModule(existingSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext }
}).outputText
const existingModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
)
const arkSeeds = existingModule.MODEL_PROVIDER_CATALOG_SEEDS.filter((seed) =>
  ['ark', 'ark-agent-plan', 'ark-coding-plan'].includes(seed.id)
)

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
  xiaomi: ['Xiaomi', 'https://mimo.xiaomi.com/zh', 'https://api.xiaomimimo.com/v1', 'bearer'],
  zai: ['Z.AI', 'https://z.ai', 'https://api.z.ai/api/paas/v4', 'bearer'],
  'zai-coding-cn': ['Z.AI Coding CN', 'https://z.ai/subscribe', 'https://open.bigmodel.cn/api/coding/paas/v4', 'bearer']
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

const providers = new Map(builtinProviders().map((provider) => [provider.id, provider]))
const recommended = new Set(['openai', 'anthropic', 'google', 'deepseek'])
const generatedSeeds = providerOrder.map((id) => {
  const arkSeed = arkSeeds.find((seed) => seed.id === id)
  if (arkSeed) return { ...arkSeed, productionVisible: true }

  const provider = providers.get(id)
  const models = getBuiltinModels(id)
  const [name, website, fallbackBaseUrl, authentication] = metadata[id]
  if (!provider || models.length === 0) {
    throw new Error(`Missing pi-ai provider catalog: ${id}`)
  }
  const mappedModels = models.map((model) => ({
    id: model.id,
    displayName: model.name,
    apiType: apiTypes[model.api],
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxTokens,
    inputTypes: model.input,
    reasoning: model.reasoning,
    capabilities: {
      text: model.input.includes('text'),
      vision: model.input.includes('image'),
      toolCalling: true,
      structuredOutput: true
    },
    inputCostPerMillionTokens: model.cost.input,
    outputCostPerMillionTokens: model.cost.output,
    defaultEnabled: true,
    lifecycleStatus: 'active'
  }))
  if (mappedModels.some((model) => !model.apiType)) {
    throw new Error(`Unsupported API type in provider catalog: ${id}`)
  }

  return {
    id,
    website,
    productionVisible: true,
    authentication,
    recommendedGroup: recommended.has(id) ? 'recommended' : 'builtin',
    provider: {
      id: `builtin-${id}`,
      type: mappedModels[0].apiType,
      name,
      baseUrl: provider.baseUrl || models[0]?.baseUrl || fallbackBaseUrl,
      enabled: true
    },
    models: mappedModels
  }
})

const banner = `// Generated from llm-space 2d647ca / @earendil-works/pi-ai 0.80.10.
// Run \`node scripts/generate-model-provider-catalog.mjs\` to refresh.
// Keep this data static so catalog upgrades are explicit and reviewable.
`
await writeFile(
  outputPath,
  `${banner}export const MODEL_PROVIDER_CATALOG_SEEDS = ${JSON.stringify(generatedSeeds, null, 2)} as const;\n`
)
