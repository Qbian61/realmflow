import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Model,
  Provider,
  Tool
} from '@earendil-works/pi-ai'
import { amazonBedrockProvider } from '@earendil-works/pi-ai/providers/amazon-bedrock'
import { azureOpenAIResponsesProvider } from '@earendil-works/pi-ai/providers/azure-openai-responses'
import { googleProvider } from '@earendil-works/pi-ai/providers/google'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import type { ModelExecutionConfig } from '../../../domain/model'
import type {
  ModelProtocolCommand,
  ModelStreamEvent
} from './model-protocol-adapter'

export type PiModelProtocol =
  | 'azure_openai_responses'
  | 'bedrock_converse_stream'
  | 'google_generative_ai'
  | 'openai_codex_responses'

const PI_PROTOCOLS = new Set<PiModelProtocol>([
  'azure_openai_responses',
  'bedrock_converse_stream',
  'google_generative_ai',
  'openai_codex_responses'
])

const providers = new Map<string, Provider<Api>>(
  [
    amazonBedrockProvider(),
    azureOpenAIResponsesProvider(),
    googleProvider(),
    openaiCodexProvider()
  ].map((provider) => [provider.id, provider as Provider<Api>])
)

export function isPiModelProtocol(
  providerType: ModelExecutionConfig['providerType']
): providerType is PiModelProtocol {
  return PI_PROTOCOLS.has(providerType as PiModelProtocol)
}

export function executePiModelProtocol(
  model: ModelExecutionConfig,
  command: ModelProtocolCommand,
  signal: AbortSignal
): ReadableStream<Uint8Array> {
  const catalogProviderId =
    model.catalogProviderId ?? model.providerId?.replace(/^builtin-/, '')
  const provider = catalogProviderId
    ? providers.get(catalogProviderId)
    : undefined
  const catalogModel = provider
    ?.getModels()
    .find((candidate) => candidate.id === model.modelId)
  if (!provider || !catalogModel) {
    throw new Error('Built-in model protocol metadata is unavailable')
  }

  const stream = provider.streamSimple(
    {
      ...catalogModel,
      baseUrl: model.baseUrl || catalogModel.baseUrl
    } as Model<Api>,
    toPiContext(command),
    {
      apiKey: model.apiKey,
      headers: model.customHeaders,
      maxTokens: command.maxOutputTokens,
      maxRetries: model.maxRetries,
      ...(command.reasoning && command.reasoning !== 'off'
        ? { reasoning: command.reasoning }
        : {}),
      signal,
      temperature: command.temperature,
      timeoutMs: model.timeoutMs
    }
  )

  return encodePiEvents(stream)
}

export function toPiContext(command: ModelProtocolCommand): Context {
  const systemPrompt = command.messages
    .filter(({ role }) => role === 'system')
    .map((message) => textContent(message))
    .join('\n\n')
  const messages: Context['messages'] = []
  for (const message of command.messages) {
    if (message.role === 'system') continue
    if (message.role === 'assistant') {
      messages.push(
        assistantMessage(textContent(message), message.toolCalls)
      )
      continue
    }
    if (
      message.role === 'tool' &&
      message.toolCallId &&
      message.name
    ) {
      messages.push({
        role: 'toolResult',
        toolCallId: message.toolCallId,
        toolName: message.name,
        content: [{ type: 'text', text: textContent(message) }],
        isError: isToolError(textContent(message)),
        timestamp: Date.now()
      })
      continue
    }
    messages.push({
      role: 'user',
      content:
        typeof message.content === 'string'
          ? message.content
          : message.content.map((part) =>
              part.type === 'text'
                ? part
                : {
                    type: 'image' as const,
                    data: part.dataBase64,
                    mimeType: part.mimeType
                  }
            ),
      timestamp: Date.now()
    })
  }
  return {
    ...(systemPrompt ? { systemPrompt } : {}),
    messages,
    ...(command.tools ? { tools: toPiTools(command.tools) } : {})
  }
}

function textContent(
  message: ModelProtocolCommand['messages'][number]
): string {
  if (typeof message.content !== 'string') {
    throw new Error(`${message.role} messages require text content`)
  }
  return message.content
}

function assistantMessage(
  content: string,
  toolCalls?: NonNullable<
    ModelProtocolCommand['messages'][number]['toolCalls']
  >
): AssistantMessage {
  return {
    role: 'assistant',
    content: [
      ...(content ? [{ type: 'text' as const, text: content }] : []),
      ...(toolCalls ?? []).map((call) => ({
        type: 'toolCall' as const,
        id: call.id,
        name: call.name,
        arguments: parseToolArguments(call.arguments)
      }))
    ],
    api: 'openai-completions',
    provider: 'realmflow-history',
    model: 'history',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    },
    stopReason: 'stop',
    timestamp: Date.now()
  }
}

function parseToolArguments(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be an object')
  }
  return parsed as Record<string, unknown>
}

function isToolError(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content)
    return (
      Boolean(parsed) &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as { status?: unknown }).status === 'failed'
    )
  } catch {
    return false
  }
}

function toPiTools(tools: unknown[]): Tool[] {
  return tools.flatMap((value) => {
    const record = optionalRecord(value)
    const fn = optionalRecord(record?.function)
    if (
      record?.type !== 'function' ||
      typeof fn?.name !== 'string' ||
      typeof fn.description !== 'string' ||
      !optionalRecord(fn.parameters)
    ) {
      return []
    }
    return [
      {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters as Tool['parameters']
      }
    ]
  })
}

function encodePiEvents(
  events: AsyncIterable<AssistantMessageEvent>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          for (const normalized of normalizePiEvent(event)) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(normalized)}\n\n`)
            )
          }
        }
        controller.close()
      } catch {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              code: 'protocol_error',
              message: 'Provider protocol error'
            })}\n\n`
          )
        )
        controller.close()
      }
    }
  })
}

export function normalizePiEvent(
  event: AssistantMessageEvent
): ModelStreamEvent[] {
  if (event.type === 'start') return [{ type: 'message_start' }]
  if (event.type === 'text_delta') {
    return [{ type: 'text_delta', text: event.delta }]
  }
  if (event.type === 'thinking_delta') {
    return [{ type: 'text_delta', text: event.delta, channel: 'reasoning' }]
  }
  if (event.type === 'toolcall_end') {
    return [
      {
        type: 'tool_delta',
        index: event.contentIndex,
        id: event.toolCall.id,
        name: event.toolCall.name,
        arguments: JSON.stringify(event.toolCall.arguments)
      }
    ]
  }
  if (event.type === 'done') {
    return [
      {
        type: 'usage',
        inputTokens: event.message.usage.input,
        outputTokens: event.message.usage.output,
        cachedTokens: event.message.usage.cacheRead,
        reasoningTokens: 0
      },
      { type: 'message_complete' }
    ]
  }
  if (event.type === 'error') {
    return [
      {
        type: 'error',
        code: 'protocol_error',
        message: 'Provider protocol error'
      }
    ]
  }
  return []
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}
