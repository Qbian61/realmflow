import anthropicLogo from './provider-logos/anthropic.svg?url'
import antGroupLogo from './provider-logos/antgroup.svg?url'
import azureLogo from './provider-logos/azure.svg?url'
import bedrockLogo from './provider-logos/bedrock.svg?url'
import deepSeekLogo from './provider-logos/deepseek.svg?url'
import googleLogo from './provider-logos/google.svg?url'
import groqLogo from './provider-logos/groq.svg?url'
import huggingFaceLogo from './provider-logos/huggingface.svg?url'
import minimaxLogo from './provider-logos/minimax.svg?url'
import moonshotLogo from './provider-logos/moonshot.svg?url'
import nvidiaLogo from './provider-logos/nvidia.svg?url'
import openAiLogo from './provider-logos/openai.svg?url'
import openRouterLogo from './provider-logos/openrouter.svg?url'
import vercelLogo from './provider-logos/vercel.svg?url'
import volcengineLogo from './provider-logos/volcengine.svg?url'
import xAiLogo from './provider-logos/xai.svg?url'
import zhipuLogo from './provider-logos/zhipu.svg?url'

const PROVIDER_LOGOS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [bedrockLogo, ['amazonbedrock', 'bedrock']],
  [antGroupLogo, ['antling', 'antgroup']],
  [anthropicLogo, ['anthropic']],
  [
    volcengineLogo,
    [
      'ark',
      'arkagentplan',
      'arkcodingplan',
      'builtinark',
      'volcengine',
      'volcengineark'
    ]
  ],
  [azureLogo, ['azureopenairesponses', 'azure']],
  [deepSeekLogo, ['deepseek']],
  [googleLogo, ['google']],
  [groqLogo, ['groq']],
  [huggingFaceLogo, ['huggingface']],
  [minimaxLogo, ['minimax', 'minimaxcn']],
  [moonshotLogo, ['moonshotai', 'moonshotaicn', 'moonshot']],
  [nvidiaLogo, ['nvidia']],
  [openAiLogo, ['openai', 'openaicodex']],
  [openRouterLogo, ['openrouter']],
  [vercelLogo, ['vercelaigateway', 'vercel']],
  [xAiLogo, ['xai']],
  [zhipuLogo, ['zai', 'zaicodingcn', 'zhipu']]
]

function normalizeBrandKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

const LOGO_BY_KEY = new Map<string, string>()

for (const [source, keys] of PROVIDER_LOGOS) {
  for (const key of keys) {
    LOGO_BY_KEY.set(key, source)
  }
}

export function resolveProviderBrandLogo(
  ...candidates: readonly string[]
): string | undefined {
  for (const candidate of candidates) {
    const source = LOGO_BY_KEY.get(normalizeBrandKey(candidate))
    if (source) return source
  }
  return undefined
}
