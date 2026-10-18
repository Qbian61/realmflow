import type { ModelExecutionConfig } from '../../domain/model'

export const REALMFLOW_DSH_MODEL_PROVIDER_ID = 'realmflow-model'
export const REALMFLOW_DSH_MODEL_CREDENTIAL_REF =
  'REALMFLOW_DSH_MODEL_API_KEY'

export type DshModelRoute = {
  providerId: string
  modelId: string
  credentialRef?: string
  piAiProviders: Record<string, unknown>
}

export const DEFAULT_DSH_MODEL_ROUTE: DshModelRoute = {
  providerId: 'deepseek-official',
  modelId: 'deepseek-flash',
  credentialRef: 'DEEPSEEK_API_KEY',
  piAiProviders: {}
}

const PI_AI_PROTOCOL_BY_PROVIDER_TYPE: Partial<
  Record<ModelExecutionConfig['providerType'], string>
> = {
  openai_completions: 'openai-completions',
  openai_responses: 'openai-responses',
  anthropic_messages: 'anthropic-messages',
  local: 'openai-completions'
}

export function resolveDshModelRoute(
  model: ModelExecutionConfig
): DshModelRoute {
  if (
    model.providerId === 'builtin-deepseek' ||
    model.modelProfileId?.startsWith('builtin-deepseek:')
  ) {
    return {
      ...DEFAULT_DSH_MODEL_ROUTE,
      modelId: model.modelId
    }
  }

  const api = PI_AI_PROTOCOL_BY_PROVIDER_TYPE[model.providerType]
  if (api === undefined) {
    throw new Error(
      `DSH model protocol is not supported: ${model.providerType}`
    )
  }
  const displayName = model.displayName?.trim() || model.modelId
  const credentialRef = model.apiKey?.trim()
    ? REALMFLOW_DSH_MODEL_CREDENTIAL_REF
    : undefined
  const input = model.capabilities?.vision === true
    ? ['text', 'image']
    : ['text']

  return {
    providerId: REALMFLOW_DSH_MODEL_PROVIDER_ID,
    modelId: model.modelId,
    ...(credentialRef === undefined ? {} : { credentialRef }),
    piAiProviders: {
      [REALMFLOW_DSH_MODEL_PROVIDER_ID]: {
        ...(credentialRef === undefined ? {} : { apiKeyEnv: credentialRef }),
        displayName,
        api,
        baseURL: model.baseUrl,
        models: [
          {
            id: model.modelId,
            name: displayName,
            input
          }
        ],
        timeoutMs: model.timeoutMs,
        retryPolicy: {
          mode: 'normal',
          maxRetries: model.maxRetries
        }
      }
    }
  }
}
