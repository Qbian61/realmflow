import type { ModelExecutionConfig } from '../../../domain/model'
import { executePiModelProtocol, isPiModelProtocol } from './pi-model-protocol'

export type ModelProtocolMessage = {
  role: string
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | {
            type: 'image'
            attachmentId: string
            mimeType: string
            dataBase64: string
          }
      >
  toolCalls?: Array<{
    id: string
    name: string
    arguments: string
  }>
  toolCallId?: string
  name?: string
}

export type ModelProtocolCommand = {
  messages: ModelProtocolMessage[]
  stream: boolean
  tools?: unknown[]
  temperature?: number
  maxOutputTokens?: number
  reasoning?: 'off' | 'low' | 'medium' | 'high'
}

export type ModelProtocolRequest = {
  url: string
  headers: Record<string, string>
  body: string
}

export type ModelStreamEvent =
  | { type: 'message_start' }
  | { type: 'text_delta'; text: string; channel?: 'reasoning' }
  | {
      type: 'tool_delta'
      index: number
      id?: string
      name?: string
      arguments?: string
    }
  | {
      type: 'usage'
      inputTokens: number
      outputTokens: number
      cachedTokens: number
      reasoningTokens: number
    }
  | { type: 'message_complete' }
  | { type: 'error'; code: 'protocol_error'; message: string }

export interface ModelProtocolAdapter {
  buildRequest(
    model: ModelExecutionConfig,
    command: ModelProtocolCommand
  ): ModelProtocolRequest
  normalizeStream(
    stream: ReadableStream<Uint8Array>
  ): ReadableStream<Uint8Array>
  execute?(
    model: ModelExecutionConfig,
    command: ModelProtocolCommand,
    signal: AbortSignal
  ): ReadableStream<Uint8Array>
}

export function createModelProtocolAdapter(
  model: ModelExecutionConfig
): ModelProtocolAdapter {
  if (
    model.providerType === 'openai_completions' ||
    model.providerType === 'local'
  ) {
    return openAiCompletionsAdapter(model.providerType === 'local')
  }
  if (model.providerType === 'openai_responses') {
    return openAiResponsesAdapter()
  }
  if (model.providerType === 'anthropic_messages') {
    return anthropicMessagesAdapter()
  }
  if (isPiModelProtocol(model.providerType)) {
    return delegatedPiAdapter()
  }
  return assertNever(model.providerType)
}

function delegatedPiAdapter(): ModelProtocolAdapter {
  return {
    buildRequest() {
      throw new Error('Delegated model protocols do not expose raw requests')
    },
    normalizeStream(stream) {
      return stream
    },
    execute: executePiModelProtocol
  }
}

export function isValidModelProtocolResponse(
  providerType: ModelExecutionConfig['providerType'],
  payload: unknown
): boolean {
  const body = optionalRecord(payload)
  if (!body) return false
  if (providerType === 'openai_completions' || providerType === 'local') {
    const choices = body.choices
    if (!Array.isArray(choices) || choices.length === 0) return false
    return optionalRecord(choices[0])?.message !== undefined
  }
  if (providerType === 'openai_responses') {
    const output = body.output
    return (
      Array.isArray(output) &&
      output.some((item) => {
        const content = optionalRecord(item)?.content
        return (
          Array.isArray(content) &&
          content.some((part) => optionalRecord(part)?.type === 'output_text')
        )
      })
    )
  }
  if (isPiModelProtocol(providerType)) return true
  const content = body.content
  return (
    Array.isArray(content) &&
    content.some((item) => optionalRecord(item)?.type === 'text')
  )
}

function openAiCompletionsAdapter(local: boolean): ModelProtocolAdapter {
  const tools = new Map<number, ToolAccumulator>()
  return {
    buildRequest(model, command) {
      return {
        url: appendPath(model.baseUrl, '/chat/completions'),
        headers: authenticationHeaders(model, local ? 'none' : 'bearer'),
        body: JSON.stringify({
          model: model.modelId,
          messages: mapOpenAiCompletionsMessages(command.messages),
          ...(command.tools ? { tools: command.tools } : {}),
          ...(command.temperature !== undefined
            ? { temperature: command.temperature }
            : {}),
          ...(command.maxOutputTokens !== undefined
            ? { max_tokens: command.maxOutputTokens }
            : {}),
          ...(command.reasoning
            ? {
                reasoning_effort:
                  command.reasoning === 'off' ? 'none' : command.reasoning
              }
            : {}),
          ...(command.stream
            ? {
                stream: true,
                stream_options: { include_usage: true }
              }
            : {})
        })
      }
    },
    normalizeStream(stream) {
      return normalizeSseStream(stream, (payload) =>
        normalizeOpenAiCompletionsEvent(payload, tools)
      )
    }
  }
}

function openAiResponsesAdapter(): ModelProtocolAdapter {
  const tools = new Map<number, ToolAccumulator>()
  return {
    buildRequest(model, command) {
      return {
        url: appendPath(model.baseUrl, '/responses'),
        headers: authenticationHeaders(model, 'bearer'),
        body: JSON.stringify({
          model: model.modelId,
          input: mapOpenAiResponsesMessages(command.messages),
          ...(command.tools
            ? { tools: mapOpenAiResponsesTools(command.tools) }
            : {}),
          ...(command.temperature !== undefined
            ? { temperature: command.temperature }
            : {}),
          ...(command.maxOutputTokens !== undefined
            ? { max_output_tokens: command.maxOutputTokens }
            : {}),
          ...(command.reasoning
            ? {
                reasoning: {
                  effort:
                    command.reasoning === 'off' ? 'none' : command.reasoning
                }
              }
            : {}),
          ...(command.stream ? { stream: true } : {})
        })
      }
    },
    normalizeStream(stream) {
      return normalizeSseStream(stream, (payload) =>
        normalizeOpenAiResponsesEvent(payload, tools)
      )
    }
  }
}

function anthropicMessagesAdapter(): ModelProtocolAdapter {
  const tools = new Map<number, ToolAccumulator>()
  return {
    buildRequest(model, command) {
      const system = command.messages
        .filter(({ role }) => role === 'system')
        .map(({ content }) => content)
        .join('\n\n')
      const messages = mapAnthropicMessages(
        command.messages.filter(({ role }) => role !== 'system')
      )
      return {
        url: appendAnthropicMessagesPath(model.baseUrl),
        headers: authenticationHeaders(model, 'anthropic'),
        body: JSON.stringify({
          model: model.modelId,
          ...(system ? { system } : {}),
          messages,
          max_tokens: command.maxOutputTokens ?? 1024,
          ...(command.tools ? { tools: mapAnthropicTools(command.tools) } : {}),
          ...(command.temperature !== undefined
            ? { temperature: command.temperature }
            : {}),
          ...(command.reasoning && command.reasoning !== 'off'
            ? {
                thinking: {
                  type: 'enabled',
                  budget_tokens: reasoningBudget(command.reasoning)
                }
              }
            : {}),
          ...(command.stream ? { stream: true } : {})
        })
      }
    },
    normalizeStream(stream) {
      let usage = emptyUsage()
      return normalizeSseStream(stream, (payload) => {
        const event = requireRecord(payload)
        if (event.type === 'message_start') {
          const message = optionalRecord(event.message)
          usage = {
            ...usage,
            inputTokens: tokenCount(
              optionalRecord(message?.usage)?.input_tokens
            ),
            cachedTokens:
              tokenCount(
                optionalRecord(message?.usage)?.cache_read_input_tokens
              ) +
              tokenCount(
                optionalRecord(message?.usage)?.cache_creation_input_tokens
              )
          }
          return [{ type: 'message_start' }, { type: 'usage', ...usage }]
        }
        if (event.type === 'content_block_start') {
          const block = requireRecord(event.content_block)
          if (block.type === 'tool_use') {
            const index = tokenCount(event.index)
            tools.set(index, {
              index,
              ...(typeof block.id === 'string' ? { id: block.id } : {}),
              ...(typeof block.name === 'string' ? { name: block.name } : {}),
              arguments: ''
            })
          }
          return []
        }
        if (event.type === 'content_block_delta') {
          const delta = requireRecord(event.delta)
          if (delta.type === 'text_delta' && typeof delta.text === 'string') {
            return [{ type: 'text_delta', text: delta.text }]
          }
          if (
            delta.type === 'thinking_delta' &&
            typeof delta.thinking === 'string'
          ) {
            return [
              {
                type: 'text_delta',
                text: delta.thinking,
                channel: 'reasoning'
              }
            ]
          }
          if (
            delta.type === 'input_json_delta' &&
            typeof delta.partial_json === 'string'
          ) {
            const index = tokenCount(event.index)
            const tool = tools.get(index) ?? { index, arguments: '' }
            tool.arguments += delta.partial_json
            tools.set(index, tool)
          }
          return []
        }
        if (event.type === 'content_block_stop') {
          const index = tokenCount(event.index)
          const tool = tools.get(index)
          if (!tool) return []
          tools.delete(index)
          return [{ type: 'tool_delta', ...tool }]
        }
        if (event.type === 'message_delta') {
          const deltaUsage = optionalRecord(event.usage)
          usage = {
            ...usage,
            outputTokens: tokenCount(deltaUsage?.output_tokens)
          }
          return [{ type: 'usage', ...usage }]
        }
        if (event.type === 'message_stop') {
          return [{ type: 'message_complete' }]
        }
        if (event.type === 'error') {
          return [protocolErrorEvent()]
        }
        return []
      })
    }
  }
}

function mapOpenAiCompletionsMessages(
  messages: ModelProtocolMessage[]
): Record<string, unknown>[] {
  return messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls) {
      return {
        role: 'assistant',
        content: textContent(message),
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: call.arguments
          }
        }))
      }
    }
    if (
      message.role === 'tool' &&
      message.toolCallId &&
      message.name
    ) {
      return {
        role: 'tool',
        content: textContent(message),
        tool_call_id: message.toolCallId,
        name: message.name
      }
    }
    return {
      role: message.role,
      content: openAiCompletionsContent(message.content)
    }
  })
}

function mapOpenAiResponsesMessages(
  messages: ModelProtocolMessage[]
): Record<string, unknown>[] {
  return messages.flatMap((message): Record<string, unknown>[] => {
    if (message.role === 'assistant' && message.toolCalls) {
      const content = textContent(message)
      const text = content
        ? [{ role: 'assistant', content }]
        : []
      return [
        ...text,
        ...message.toolCalls.map((call) => ({
          type: 'function_call',
          call_id: call.id,
          name: call.name,
          arguments: call.arguments
        }))
      ]
    }
    if (message.role === 'tool' && message.toolCallId) {
      return [
        {
          type: 'function_call_output',
          call_id: message.toolCallId,
          output: textContent(message)
        }
      ]
    }
    return [
      {
        role: message.role,
        content: openAiResponsesContent(message.content)
      }
    ]
  })
}

function mapAnthropicMessages(
  messages: ModelProtocolMessage[]
): Record<string, unknown>[] {
  return messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls) {
      return {
        role: 'assistant',
        content: [
          ...(textContent(message)
            ? [{ type: 'text', text: textContent(message) }]
            : []),
          ...message.toolCalls.map((call) => ({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: parseToolArguments(call.arguments)
          }))
        ]
      }
    }
    if (message.role === 'tool' && message.toolCallId) {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: textContent(message)
          }
        ]
      }
    }
    return {
      role: message.role,
      content: anthropicContent(message.content)
    }
  })
}

function textContent(message: ModelProtocolMessage): string {
  if (typeof message.content !== 'string') {
    throw new Error(`${message.role} messages require text content`)
  }
  return message.content
}

function openAiCompletionsContent(
  content: ModelProtocolMessage['content']
): ModelProtocolMessage['content'] | Record<string, unknown>[] {
  if (typeof content === 'string') return content
  return content.map((part) =>
    part.type === 'text'
      ? part
      : {
          type: 'image_url',
          image_url: {
            url: dataUrl(part)
          }
        }
  )
}

function openAiResponsesContent(
  content: ModelProtocolMessage['content']
): ModelProtocolMessage['content'] | Record<string, unknown>[] {
  if (typeof content === 'string') return content
  return content.map((part) =>
    part.type === 'text'
      ? { type: 'input_text', text: part.text }
      : {
          type: 'input_image',
          image_url: dataUrl(part)
        }
  )
}

function anthropicContent(
  content: ModelProtocolMessage['content']
): ModelProtocolMessage['content'] | Record<string, unknown>[] {
  if (typeof content === 'string') return content
  return content.map((part) =>
    part.type === 'text'
      ? part
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.mimeType,
            data: part.dataBase64
          }
        }
  )
}

function dataUrl(
  part: Extract<
    Exclude<ModelProtocolMessage['content'], string>[number],
    { type: 'image' }
  >
): string {
  return `data:${part.mimeType};base64,${part.dataBase64}`
}

function parseToolArguments(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be an object')
  }
  return parsed as Record<string, unknown>
}

function reasoningBudget(
  reasoning: Exclude<ModelProtocolCommand['reasoning'], undefined | 'off'>
): number {
  return reasoning === 'low' ? 1024 : reasoning === 'medium' ? 4096 : 16384
}

function normalizeOpenAiCompletionsEvent(
  payload: unknown,
  tools: Map<number, ToolAccumulator>
): ModelStreamEvent[] {
  if (payload === '[DONE]') {
    return [...flushTools(tools), { type: 'message_complete' }]
  }
  const event = requireRecord(payload)
  const result: ModelStreamEvent[] = []
  if (event.error !== undefined) return [protocolErrorEvent()]
  const choices = event.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = requireRecord(choices[0])
    const delta = requireRecord(choice.delta)
    if (typeof delta.content === 'string' && delta.content) {
      result.push({ type: 'text_delta', text: delta.content })
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const item of delta.tool_calls) {
        const tool = requireRecord(item)
        const fn = optionalRecord(tool.function)
        const index = tokenCount(tool.index)
        const current = tools.get(index) ?? { index, arguments: '' }
        if (typeof tool.id === 'string') current.id = tool.id
        if (typeof fn?.name === 'string') {
          current.name = `${current.name ?? ''}${fn.name}`
        }
        if (typeof fn?.arguments === 'string') {
          current.arguments += fn.arguments
        }
        tools.set(index, current)
      }
    }
  }
  if (event.usage !== undefined) {
    result.push({ type: 'usage', ...openAiUsage(event.usage) })
  }
  return result
}

function normalizeOpenAiResponsesEvent(
  payload: unknown,
  tools: Map<number, ToolAccumulator>
): ModelStreamEvent[] {
  const event = requireRecord(payload)
  if (event.type === 'response.created') return [{ type: 'message_start' }]
  if (
    event.type === 'response.output_text.delta' &&
    typeof event.delta === 'string'
  ) {
    return [{ type: 'text_delta', text: event.delta }]
  }
  if (
    event.type === 'response.reasoning_text.delta' &&
    typeof event.delta === 'string'
  ) {
    return [
      {
        type: 'text_delta',
        text: event.delta,
        channel: 'reasoning'
      }
    ]
  }
  if (event.type === 'response.output_item.added') {
    const item = optionalRecord(event.item)
    if (item?.type === 'function_call') {
      const index = tokenCount(event.output_index)
      tools.set(index, {
        index,
        ...(typeof item.id === 'string' ? { id: item.id } : {}),
        ...(typeof item.name === 'string' ? { name: item.name } : {}),
        arguments: ''
      })
    }
    return []
  }
  if (
    event.type === 'response.function_call_arguments.delta' &&
    typeof event.delta === 'string'
  ) {
    const index = tokenCount(event.output_index)
    const tool = tools.get(index) ?? { index, arguments: '' }
    if (typeof event.item_id === 'string') tool.id = event.item_id
    tool.arguments += event.delta
    tools.set(index, tool)
    return []
  }
  if (event.type === 'response.completed') {
    const response = requireRecord(event.response)
    return [
      ...flushTools(tools),
      { type: 'usage', ...openAiUsage(response.usage) },
      { type: 'message_complete' }
    ]
  }
  if (event.type === 'error' || event.type === 'response.failed') {
    return [protocolErrorEvent()]
  }
  return []
}

function normalizeSseStream(
  stream: ReadableStream<Uint8Array>,
  normalize: (payload: unknown) => ModelStreamEvent[]
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let started = false
        let terminal = false
        for await (const data of parseSseData(stream)) {
          let payload: unknown = data
          if (data !== '[DONE]') {
            try {
              payload = JSON.parse(data) as unknown
            } catch {
              throw new Error('Invalid provider stream event')
            }
          }
          const events = normalize(payload)
          for (const event of events) {
            if (!started && event.type !== 'message_start') {
              controller.enqueue(encodeSse(encoder, { type: 'message_start' }))
              started = true
            }
            controller.enqueue(encodeSse(encoder, event))
            if (event.type === 'message_start') started = true
            if (event.type === 'message_complete' || event.type === 'error') {
              terminal = true
            }
          }
        }
        if (!terminal) {
          throw new Error('Provider stream ended without completion')
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    }
  })
}

async function* parseSseData(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n')
        if (data) yield data
        boundary = buffer.indexOf('\n\n')
      }
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
}

function authenticationHeaders(
  model: ModelExecutionConfig,
  type: 'none' | 'bearer' | 'anthropic'
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...model.customHeaders
  }
  if (type === 'none') return headers
  if (!model.apiKey) throw new Error('Provider credential is required')
  if (type === 'bearer') headers.Authorization = `Bearer ${model.apiKey}`
  else {
    headers['x-api-key'] = model.apiKey
    headers['anthropic-version'] = '2023-06-01'
  }
  return headers
}

function appendPath(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return base.endsWith(path) ? base : `${base}${path}`
}

function appendAnthropicMessagesPath(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  if (base.endsWith('/v1/messages')) return base
  if (base.endsWith('/v1')) return `${base}/messages`
  return `${base}/v1/messages`
}

function mapOpenAiResponsesTools(tools: unknown[]): Record<string, unknown>[] {
  return tools.map((tool) => {
    const fn = requireUnifiedFunctionTool(tool)
    return {
      type: 'function',
      name: fn.name,
      ...(fn.description !== undefined ? { description: fn.description } : {}),
      parameters: fn.parameters
    }
  })
}

function mapAnthropicTools(tools: unknown[]): Record<string, unknown>[] {
  return tools.map((tool) => {
    const fn = requireUnifiedFunctionTool(tool)
    return {
      name: fn.name,
      ...(fn.description !== undefined ? { description: fn.description } : {}),
      input_schema: fn.parameters
    }
  })
}

function requireUnifiedFunctionTool(value: unknown): {
  name: string
  description?: string
  parameters: Record<string, unknown>
} {
  const tool = requireRecord(value)
  const fn = requireRecord(tool.function)
  const parameters = requireRecord(fn.parameters)
  if (
    tool.type !== 'function' ||
    typeof fn.name !== 'string' ||
    (fn.description !== undefined && typeof fn.description !== 'string')
  ) {
    throw new Error('Unsupported model tool')
  }
  return {
    name: fn.name,
    ...(typeof fn.description === 'string'
      ? { description: fn.description }
      : {}),
    parameters
  }
}

function openAiUsage(value: unknown): Omit<
  ModelStreamEvent & {
    type: 'usage'
  },
  'type'
> {
  const usage = optionalRecord(value)
  const inputDetails =
    optionalRecord(usage?.input_tokens_details) ??
    optionalRecord(usage?.prompt_tokens_details)
  const outputDetails =
    optionalRecord(usage?.output_tokens_details) ??
    optionalRecord(usage?.completion_tokens_details)
  return {
    inputTokens: tokenCount(usage?.input_tokens ?? usage?.prompt_tokens),
    outputTokens: tokenCount(usage?.output_tokens ?? usage?.completion_tokens),
    cachedTokens: tokenCount(inputDetails?.cached_tokens),
    reasoningTokens: tokenCount(outputDetails?.reasoning_tokens)
  }
}

function emptyUsage(): {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
} {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0
  }
}

function protocolErrorEvent(): ModelStreamEvent {
  return {
    type: 'error',
    code: 'protocol_error',
    message: 'Provider protocol error'
  }
}

function encodeSse(encoder: TextEncoder, event: ModelStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

function requireRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value)
  if (!record) throw new Error('Invalid provider stream event')
  return record
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0
}

type ToolAccumulator = {
  index: number
  id?: string
  name?: string
  arguments: string
}

function flushTools(tools: Map<number, ToolAccumulator>): ModelStreamEvent[] {
  const events = [...tools.values()]
    .sort((left, right) => left.index - right.index)
    .map((tool): ModelStreamEvent => ({ type: 'tool_delta', ...tool }))
  tools.clear()
  return events
}

function assertNever(value: never): never {
  throw new Error(`Unsupported model protocol: ${String(value)}`)
}
