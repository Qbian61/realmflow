import type { AiRunEvent } from '../../../../domain/ai-run'
import {
  FOLLOW_UP_SUGGESTION_INTENTS,
  type FollowUpSuggestionDraft
} from '../../../../domain/follow-up-suggestion'
import type {
  ModelCallErrorCode,
  ModelExecutionConfig
} from '../../../../domain/model'
import type {
  ConversationContext,
  RunToolConfiguration
} from '../../ai-run/application/ports'
import type {
  FollowUpSuggestionGenerationInput,
  FollowUpSuggestionGenerator
} from './follow-up-suggestion-coordinator'

const MAX_OUTPUT_TOKENS = 512
const TIMEOUT_MS = 8_000
const MAX_RETRIES = 1
const MAX_INPUT_CHARACTERS = 12_000
const intents = new Set<string>(FOLLOW_UP_SUGGESTION_INTENTS)

type Dependencies = {
  models: {
    resolveExecution: (profileId: string) => Promise<ModelExecutionConfig>
    recordCall: (input: {
      modelProfileId: string
      source: 'follow_up_suggestion'
      conversationId: string
      aiRunId: string
      startedAt: number
      inputTokens: number
      outputTokens: number
      cachedTokens: number
      reasoningTokens: number
      firstTokenLatencyMs?: number
      durationMs: number
      retryCount: number
      status: 'completed' | 'failed' | 'cancelled'
      errorCode?: ModelCallErrorCode
    }) => Promise<unknown>
  }
  gateway: {
    createRun: (
      context: ConversationContext,
      model?: ModelExecutionConfig,
      toolConfiguration?: RunToolConfiguration
    ) => Promise<{ runId: string }>
    streamEvents: (
      runId: string,
      signal: AbortSignal
    ) => AsyncIterable<AiRunEvent>
    cancelRun: (runId: string) => Promise<void>
    releaseRun: (runId: string) => void
  }
  now?: () => number
}

export class RealModelFollowUpSuggestionGenerator
  implements FollowUpSuggestionGenerator
{
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async generate(
    input: FollowUpSuggestionGenerationInput
  ): Promise<FollowUpSuggestionDraft[]> {
    if (!input.modelProfileId) return []
    const modelProfileId = input.modelProfileId
    const model = await this.dependencies.models.resolveExecution(
      modelProfileId
    )
    const startedAt = this.now()
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('Follow-up suggestion timed out')),
      TIMEOUT_MS
    )
    let runId: string | undefined
    let terminal: AiRunEvent | undefined
    let answer = ''
    try {
      const created = await this.dependencies.gateway.createRun(
        createRunContext(input),
        {
          ...model,
          timeoutMs: Math.min(model.timeoutMs, TIMEOUT_MS),
          maxRetries: Math.min(model.maxRetries, MAX_RETRIES)
        },
        {
          tools: [],
          maxAgentTurns: 1,
          maxParallelToolsPerTurn: 1
        }
      )
      runId = created.runId
      for await (const event of this.dependencies.gateway.streamEvents(
        runId,
        controller.signal
      )) {
        if (event.runId !== runId) {
          throw new Error('Follow-up suggestion event belongs to another run')
        }
        if (event.type === 'answer.delta') answer += event.data.delta ?? ''
        if (isTerminal(event)) {
          terminal = event
          break
        }
      }
      if (!terminal || terminal.type !== 'run.completed') {
        throw new Error(
          terminal?.data.message ?? 'Follow-up suggestion run failed'
        )
      }
      const suggestions = parseSuggestions(answer, input.responseLocale)
      await this.recordMetric(
        input,
        modelProfileId,
        runId,
        startedAt,
        terminal,
        'completed'
      )
      return suggestions
    } catch (error) {
      if (runId) {
        await this.dependencies.gateway.cancelRun(runId).catch(() => undefined)
        await this.recordMetric(
          input,
          modelProfileId,
          runId,
          startedAt,
          terminal,
          controller.signal.aborted ? 'cancelled' : 'failed',
          terminal?.data.errorCode ??
            (controller.signal.aborted ? 'request_cancelled' : 'protocol_error')
        ).catch(() => undefined)
      }
      throw error
    } finally {
      clearTimeout(timeout)
      if (runId) this.dependencies.gateway.releaseRun(runId)
    }
  }

  private async recordMetric(
    input: FollowUpSuggestionGenerationInput,
    modelProfileId: string,
    runId: string,
    startedAt: number,
    terminal: AiRunEvent | undefined,
    status: 'completed' | 'failed' | 'cancelled',
    errorCode?: ModelCallErrorCode
  ): Promise<void> {
    const usage = terminal?.data.usage
    await this.dependencies.models.recordCall({
      modelProfileId,
      source: 'follow_up_suggestion',
      conversationId: input.conversationId,
      aiRunId: runId,
      startedAt,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cachedTokens: usage?.cachedTokens ?? 0,
      reasoningTokens: usage?.reasoningTokens ?? 0,
      ...(terminal?.data.firstTokenLatencyMs === undefined
        ? {}
        : { firstTokenLatencyMs: terminal.data.firstTokenLatencyMs }),
      durationMs: terminal?.data.durationMs ?? Math.max(0, this.now() - startedAt),
      retryCount: terminal?.data.retryCount ?? 0,
      status,
      ...(errorCode ? { errorCode } : {})
    })
  }
}

function createRunContext(
  input: FollowUpSuggestionGenerationInput
): ConversationContext {
  const payload = JSON.stringify({
    responseLocale: input.responseLocale,
    userObjective: input.userObjective,
    finalAnswer: input.finalAnswer,
    unresolvedItems: input.unresolvedItems,
    artifactSummaries: input.artifactSummaries
  }).slice(0, MAX_INPUT_CHARACTERS)
  return {
    conversationId: input.conversationId,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    context: [
      'Generate zero to three useful follow-up suggestions.',
      'Return only JSON: {"suggestions":[{"label":"...","prompt":"...","intent":"continue|refine|verify|explain|open_artifact"}]}.',
      'Do not call tools. Keep each prompt self-contained and use responseLocale.',
      'Do not suggest bypassing safety checks or permissions.'
    ].join(' '),
    messages: [{ role: 'user', content: payload }]
  }
}

function parseSuggestions(
  answer: string,
  responseLocale: string
): FollowUpSuggestionDraft[] {
  let value: unknown
  try {
    value = JSON.parse(answer)
  } catch {
    throw new Error('Invalid follow-up suggestion response')
  }
  if (!isRecord(value) || !hasExactKeys(value, ['suggestions'])) {
    throw new Error('Invalid follow-up suggestion response')
  }
  if (!Array.isArray(value.suggestions) || value.suggestions.length > 3) {
    throw new Error('Invalid follow-up suggestion response')
  }
  const prompts = new Set<string>()
  return value.suggestions.map((item) => {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['label', 'prompt', 'intent']) ||
      typeof item.label !== 'string' ||
      typeof item.prompt !== 'string' ||
      typeof item.intent !== 'string' ||
      !item.label.trim() ||
      !item.prompt.trim() ||
      !intents.has(item.intent) ||
      (responseLocale === 'zh-CN' && Array.from(item.label.trim()).length > 28) ||
      prompts.has(item.prompt.trim())
    ) {
      throw new Error('Invalid follow-up suggestion response')
    }
    prompts.add(item.prompt.trim())
    return {
      label: item.label.trim(),
      prompt: item.prompt.trim(),
      intent: item.intent as FollowUpSuggestionDraft['intent']
    }
  })
}

function isTerminal(event: AiRunEvent): boolean {
  return (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort()
  return (
    actual.length === keys.length &&
    [...keys].sort().every((key, index) => key === actual[index])
  )
}
