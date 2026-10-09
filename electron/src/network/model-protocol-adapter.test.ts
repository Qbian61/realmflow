import { describe, expect, it } from 'vitest'
import type { ModelExecutionConfig } from '../../../domain/model'
import { BUILTIN_MODEL_PROVIDERS } from '../../../domain/model-provider-catalog'
import {
  createModelProtocolAdapter,
  type ModelStreamEvent
} from './model-protocol-adapter'
import { normalizePiEvent, toPiContext } from './pi-model-protocol'

describe('ModelProtocolAdapter', () => {
  it('covers every protocol used by a production-visible provider', () => {
    for (const definition of BUILTIN_MODEL_PROVIDERS) {
      expect(() =>
        createModelProtocolAdapter(execution(definition.provider.type))
      ).not.toThrow()
    }
  })

  it('delegates SDK-backed protocols through the unified executor', () => {
    for (const providerType of [
      'azure_openai_responses',
      'bedrock_converse_stream',
      'google_generative_ai',
      'openai_codex_responses'
    ] as const) {
      expect(
        createModelProtocolAdapter(execution(providerType)).execute
      ).toBeTypeOf('function')
    }
  })

  it('maps unified function tools to OpenAI Responses tools', () => {
    const request = createModelProtocolAdapter(
      execution('openai_responses')
    ).buildRequest(execution('openai_responses'), {
      messages: [{ role: 'user', content: 'Find the docs' }],
      stream: true,
      tools: [functionTool()]
    })

    expect(JSON.parse(request.body).tools).toEqual([
      {
        type: 'function',
        name: 'search',
        description: 'Search documentation',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        }
      }
    ])
  })

  it('maps unified reasoning levels to provider request fields', () => {
    const openAi = createModelProtocolAdapter(
      execution('openai_responses')
    ).buildRequest(execution('openai_responses'), {
      messages: [{ role: 'user', content: 'Think carefully' }],
      stream: true,
      reasoning: 'high'
    })
    const anthropic = createModelProtocolAdapter(
      execution('anthropic_messages')
    ).buildRequest(execution('anthropic_messages'), {
      messages: [{ role: 'user', content: 'Think carefully' }],
      stream: true,
      reasoning: 'medium'
    })

    expect(JSON.parse(openAi.body).reasoning).toEqual({ effort: 'high' })
    expect(JSON.parse(anthropic.body).thinking).toEqual({
      type: 'enabled',
      budget_tokens: 4096
    })
  })

  it('maps approved image parts to each provider without a local path', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: 'Analyze this diagram' },
          {
            type: 'image' as const,
            attachmentId: 'attachment-1',
            mimeType: 'image/png',
            dataBase64: 'iVBORw=='
          }
        ]
      }
    ]
    const openAi = JSON.parse(
      createModelProtocolAdapter(
        execution('openai_completions')
      ).buildRequest(execution('openai_completions'), {
        messages,
        stream: true
      }).body
    )
    const responses = JSON.parse(
      createModelProtocolAdapter(
        execution('openai_responses')
      ).buildRequest(execution('openai_responses'), {
        messages,
        stream: true
      }).body
    )
    const anthropic = JSON.parse(
      createModelProtocolAdapter(
        execution('anthropic_messages')
      ).buildRequest(execution('anthropic_messages'), {
        messages,
        stream: true
      }).body
    )
    const pi = toPiContext({ messages, stream: true })

    expect(openAi.messages[0].content).toEqual([
      { type: 'text', text: 'Analyze this diagram' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,iVBORw==' }
      }
    ])
    expect(responses.input[0].content).toEqual([
      { type: 'input_text', text: 'Analyze this diagram' },
      {
        type: 'input_image',
        image_url: 'data:image/png;base64,iVBORw=='
      }
    ])
    expect(anthropic.messages[0].content).toEqual([
      { type: 'text', text: 'Analyze this diagram' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw=='
        }
      }
    ])
    expect(pi.messages[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this diagram' },
        { type: 'image', data: 'iVBORw==', mimeType: 'image/png' }
      ]
    })
    expect(JSON.stringify({ openAi, responses, anthropic, pi })).not.toContain(
      '/private/'
    )
  })

  it('maps unified function tools to Anthropic tools', () => {
    const request = createModelProtocolAdapter(
      execution('anthropic_messages')
    ).buildRequest(execution('anthropic_messages'), {
      messages: [{ role: 'user', content: 'Find the docs' }],
      stream: true,
      tools: [functionTool()]
    })

    expect(JSON.parse(request.body).tools).toEqual([
      {
        name: 'search',
        description: 'Search documentation',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        }
      }
    ])
  })

  it('maps canonical Tool history to each provider message protocol', () => {
    const messages = [
      { role: 'user', content: 'Read the file' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            name: 'files_read',
            arguments: '{"path":"README.md"}'
          }
        ]
      },
      {
        role: 'tool',
        content: '{"content":"RealmFlow"}',
        toolCallId: 'call-1',
        name: 'files_read'
      }
    ]
    const openAi = JSON.parse(
      createModelProtocolAdapter(
        execution('openai_completions')
      ).buildRequest(execution('openai_completions'), {
        messages,
        stream: true
      }).body
    )
    const responses = JSON.parse(
      createModelProtocolAdapter(
        execution('openai_responses')
      ).buildRequest(execution('openai_responses'), {
        messages,
        stream: true
      }).body
    )
    const anthropic = JSON.parse(
      createModelProtocolAdapter(
        execution('anthropic_messages')
      ).buildRequest(execution('anthropic_messages'), {
        messages,
        stream: true
      }).body
    )

    expect(openAi.messages.slice(1)).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'files_read',
              arguments: '{"path":"README.md"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        content: '{"content":"RealmFlow"}',
        tool_call_id: 'call-1',
        name: 'files_read'
      }
    ])
    expect(responses.input.slice(1)).toEqual([
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'files_read',
        arguments: '{"path":"README.md"}'
      },
      {
        type: 'function_call_output',
        call_id: 'call-1',
        output: '{"content":"RealmFlow"}'
      }
    ])
    expect(anthropic.messages.slice(1)).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'files_read',
            input: { path: 'README.md' }
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: '{"content":"RealmFlow"}'
          }
        ]
      }
    ])
  })

  it('maps canonical Tool history to Pi SDK context messages', () => {
    const context = toPiContext({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'files_read',
              arguments: '{"path":"README.md"}'
            }
          ]
        },
        {
          role: 'tool',
          content: '{"content":"RealmFlow"}',
          toolCallId: 'call-1',
          name: 'files_read'
        }
      ],
      stream: true
    })

    expect(context.messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'files_read',
            arguments: { path: 'README.md' }
          }
        ]
      }),
      expect.objectContaining({
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'files_read',
        content: [{ type: 'text', text: '{"content":"RealmFlow"}' }],
        isError: false
      })
    ])
  })

  it('reassembles OpenAI Responses tool arguments into one tool event', async () => {
    const events = await normalize(execution('openai_responses'), [
      { type: 'response.created' },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'call-1',
          name: 'lookup'
        }
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        item_id: 'call-1',
        delta: '{"city":'
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        item_id: 'call-1',
        delta: '"Paris"}'
      },
      {
        type: 'response.completed',
        response: {
          usage: { input_tokens: 4, output_tokens: 3 }
        }
      }
    ])

    expect(events.filter(({ type }) => type === 'tool_delta')).toEqual([
      {
        type: 'tool_delta',
        index: 0,
        id: 'call-1',
        name: 'lookup',
        arguments: '{"city":"Paris"}'
      }
    ])
  })

  it('reassembles Anthropic tool input and preserves thinking usage', async () => {
    const events = await normalize(execution('anthropic_messages'), [
      {
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 8,
            cache_read_input_tokens: 3
          }
        }
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Plan' }
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'tool-1',
          name: 'search'
        }
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"q":' }
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '"docs"}' }
      },
      { type: 'content_block_stop', index: 1 },
      {
        type: 'message_delta',
        usage: { output_tokens: 5 }
      },
      { type: 'message_stop' }
    ])

    expect(events).toContainEqual({
      type: 'text_delta',
      text: 'Plan',
      channel: 'reasoning'
    })
    expect(events.filter(({ type }) => type === 'tool_delta')).toEqual([
      {
        type: 'tool_delta',
        index: 1,
        id: 'tool-1',
        name: 'search',
        arguments: '{"q":"docs"}'
      }
    ])
    expect(events).toContainEqual({
      type: 'usage',
      inputTokens: 8,
      outputTokens: 5,
      cachedTokens: 3,
      reasoningTokens: 0
    })
  })

  it('rejects a truncated provider stream without a completion event', async () => {
    const adapter = createModelProtocolAdapter(execution('openai_completions'))
    const stream = adapter.normalizeStream(
      sseStream([{ choices: [{ delta: { content: 'partial' } }] }])
    )

    await expect(readEvents(stream)).rejects.toThrow(
      'Provider stream ended without completion'
    )
  })

  it('maps an OpenAI stream error envelope without exposing its message', async () => {
    const events = await normalize(execution('openai_completions'), [
      {
        error: {
          message: 'Authorization Bearer secret failed',
          type: 'invalid_request_error'
        }
      }
    ])

    expect(events).toEqual([
      { type: 'message_start' },
      {
        type: 'error',
        code: 'protocol_error',
        message: 'Provider protocol error'
      }
    ])
    expect(JSON.stringify(events)).not.toContain('secret')
  })

  it('normalizes delegated provider events to the RealmFlow stream contract', () => {
    const usage = {
      input: 8,
      output: 5,
      cacheRead: 3,
      cacheWrite: 0,
      totalTokens: 16,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    }
    const message = {
      role: 'assistant' as const,
      content: [],
      api: 'google-generative-ai',
      provider: 'google',
      model: 'gemini',
      usage,
      stopReason: 'stop' as const,
      timestamp: 1
    }

    expect(
      normalizePiEvent({
        type: 'thinking_delta',
        contentIndex: 0,
        delta: 'plan',
        partial: message
      })
    ).toEqual([{ type: 'text_delta', text: 'plan', channel: 'reasoning' }])
    expect(normalizePiEvent({ type: 'done', reason: 'stop', message })).toEqual(
      [
        {
          type: 'usage',
          inputTokens: 8,
          outputTokens: 5,
          cachedTokens: 3,
          reasoningTokens: 0
        },
        { type: 'message_complete' }
      ]
    )
  })
})

async function normalize(
  model: ModelExecutionConfig,
  payloads: unknown[]
): Promise<ModelStreamEvent[]> {
  return readEvents(
    createModelProtocolAdapter(model).normalizeStream(sseStream(payloads))
  )
}

function sseStream(payloads: unknown[]): ReadableStream<Uint8Array> {
  const body = payloads
    .map((payload) => `data: ${JSON.stringify(payload)}\n\n`)
    .join('')
  return new Response(body).body!
}

async function readEvents(
  stream: ReadableStream<Uint8Array>
): Promise<ModelStreamEvent[]> {
  const text = await new Response(stream).text()
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.slice('data: '.length)))
}

function execution(
  providerType: ModelExecutionConfig['providerType']
): ModelExecutionConfig {
  return {
    providerType,
    baseUrl: 'https://api.example.com/v1',
    modelId: 'model-1',
    timeoutMs: 5000,
    maxRetries: 0,
    maxConcurrency: 1,
    apiKey: 'secret'
  }
}

function functionTool(): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search documentation',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  }
}
