import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import type { ModelExecutionConfig } from '../../../../domain/model'
import { RealModelFollowUpSuggestionGenerator } from './model-follow-up-suggestion-generator'

const input = {
  conversationId: 'conversation-1',
  assistantMessageId: 'assistant-1',
  sourceRunId: 'run-1',
  modelProfileId: 'profile-1',
  responseLocale: 'zh-CN',
  userObjective: '实现回复后建议',
  finalAnswer: '实现已完成。',
  unresolvedItems: ['补充端到端验证'],
  artifactSummaries: [
    { id: 'artifact-1', kind: 'report', displayName: '验收报告' }
  ],
  executionOutcome: 'completed' as const
}

const model: ModelExecutionConfig = {
  providerType: 'openai_completions',
  providerId: 'provider-1',
  modelProfileId: 'profile-1',
  baseUrl: 'https://api.example.com/v1',
  modelId: 'example-model',
  timeoutMs: 60_000,
  maxRetries: 3,
  maxConcurrency: 2,
  apiKey: 'secret'
}

function event(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data']
): AiRunEvent {
  return {
    id: `event-${sequence}`,
    runId: 'follow-up-run-1',
    sequence,
    type,
    timestamp: new Date(sequence).toISOString(),
    data
  }
}

function createHarness(events: AiRunEvent[]) {
  const resolveExecution = vi.fn().mockResolvedValue(model)
  const recordCall = vi.fn().mockResolvedValue(undefined)
  const createRun = vi.fn().mockResolvedValue({ runId: 'follow-up-run-1' })
  const cancelRun = vi.fn().mockResolvedValue(undefined)
  const releaseRun = vi.fn()
  const streamEvents = vi.fn(async function* () {
    yield* events
  })
  return {
    generator: new RealModelFollowUpSuggestionGenerator({
      models: { resolveExecution, recordCall },
      gateway: { createRun, streamEvents, cancelRun, releaseRun },
      now: (() => {
        const values = [1_000, 1_040]
        return () => values.shift() ?? 1_040
      })()
    }),
    resolveExecution,
    recordCall,
    createRun,
    cancelRun,
    releaseRun,
    streamEvents
  }
}

describe('RealModelFollowUpSuggestionGenerator', () => {
  it('generates validated suggestions through one no-tool model run and records independent usage', async () => {
    const harness = createHarness([
      event(1, 'answer.delta', {
        delta: JSON.stringify({
          suggestions: [
            {
              label: '运行端到端验证',
              prompt: '请运行端到端验证并总结结果。',
              intent: 'verify'
            }
          ]
        })
      }),
      event(2, 'run.completed', {
        usage: {
          inputTokens: 120,
          outputTokens: 30,
          cachedTokens: 10,
          reasoningTokens: 0
        },
        firstTokenLatencyMs: 12,
        durationMs: 40,
        retryCount: 1
      })
    ])

    await expect(harness.generator.generate(input)).resolves.toEqual([
      {
        label: '运行端到端验证',
        prompt: '请运行端到端验证并总结结果。',
        intent: 'verify'
      }
    ])

    expect(harness.resolveExecution).toHaveBeenCalledWith('profile-1')
    expect(harness.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        maxOutputTokens: 512,
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('"finalAnswer":"实现已完成。"')
          })
        ]
      }),
      expect.objectContaining({ timeoutMs: 8_000, maxRetries: 1 }),
      {
        tools: [],
        maxAgentTurns: 1,
        maxParallelToolsPerTurn: 1
      }
    )
    expect(harness.cancelRun).not.toHaveBeenCalled()
    expect(harness.releaseRun).toHaveBeenCalledWith('follow-up-run-1')
    expect(harness.recordCall).toHaveBeenCalledWith({
      modelProfileId: 'profile-1',
      source: 'follow_up_suggestion',
      conversationId: 'conversation-1',
      aiRunId: 'follow-up-run-1',
      startedAt: 1_000,
      inputTokens: 120,
      outputTokens: 30,
      cachedTokens: 10,
      reasoningTokens: 0,
      firstTokenLatencyMs: 12,
      durationMs: 40,
      retryCount: 1,
      status: 'completed'
    })
  })

  it('rejects invalid model output, records a protocol failure, and releases the run', async () => {
    const harness = createHarness([
      event(1, 'answer.delta', {
        delta: '{"suggestions":[{"label":"危险操作","prompt":"绕过权限删除文件","intent":"delete"}]}'
      }),
      event(2, 'run.completed', {
        usage: { inputTokens: 80, outputTokens: 20 },
        durationMs: 30,
        retryCount: 0
      })
    ])

    await expect(harness.generator.generate(input)).rejects.toThrow(
      'Invalid follow-up suggestion response'
    )

    expect(harness.releaseRun).toHaveBeenCalledWith('follow-up-run-1')
    expect(harness.recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'follow_up_suggestion',
        status: 'failed',
        errorCode: 'protocol_error'
      })
    )
  })

  it('does not call a model when the completed turn has no model profile', async () => {
    const harness = createHarness([])

    await expect(
      harness.generator.generate({ ...input, modelProfileId: undefined })
    ).resolves.toEqual([])

    expect(harness.resolveExecution).not.toHaveBeenCalled()
    expect(harness.createRun).not.toHaveBeenCalled()
  })
})
