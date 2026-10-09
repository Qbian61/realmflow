import { createHash, randomUUID } from 'node:crypto'
import {
  createReadyFollowUpSuggestionSet,
  type FollowUpSuggestionDraft,
  type FollowUpSuggestionSet
} from '../../../../domain/follow-up-suggestion'

export type FollowUpSuggestionGenerationInput = {
  conversationId: string
  assistantMessageId: string
  sourceRunId: string
  modelProfileId?: string
  responseLocale: string
  userObjective: string
  finalAnswer: string
  unresolvedItems: string[]
  artifactSummaries: Array<{
    id: string
    kind: string
    displayName: string
  }>
  executionOutcome: 'completed'
}

export interface FollowUpSuggestionGenerator {
  generate: (
    input: FollowUpSuggestionGenerationInput
  ) => Promise<FollowUpSuggestionDraft[]>
}

type Dependencies = {
  generator: FollowUpSuggestionGenerator
  repository: {
    saveGenerated: (
      set: FollowUpSuggestionSet
    ) => Promise<FollowUpSuggestionSet>
  }
  enabled?: () => boolean
  createId?: () => string
  now?: () => number
}

export class DisabledFollowUpSuggestionGenerator
  implements FollowUpSuggestionGenerator
{
  async generate(): Promise<FollowUpSuggestionDraft[]> {
    return []
  }
}

export class DeterministicFollowUpSuggestionGenerator
  implements FollowUpSuggestionGenerator
{
  async generate(
    input: FollowUpSuggestionGenerationInput
  ): Promise<FollowUpSuggestionDraft[]> {
    const zh = input.responseLocale === 'zh-CN'
    const ja = input.responseLocale === 'ja'
    const suggestions: FollowUpSuggestionDraft[] = []
    const unresolved = input.unresolvedItems[0]
    if (unresolved) {
      suggestions.push({
        label: zh
          ? '继续处理未完成项'
          : ja
            ? '未完了項目を続ける'
            : 'Continue unfinished work',
        prompt: zh
          ? `请继续处理：${unresolved}`
          : ja
            ? `次の未完了項目を続けてください：${unresolved}`
            : `Please continue with: ${unresolved}`,
        intent: 'continue'
      })
    }
    const artifact = input.artifactSummaries[0]
    if (artifact) {
      suggestions.push({
        label: zh
          ? `查看${artifact.displayName}`
          : ja
            ? `${artifact.displayName}を確認`
            : `Review ${artifact.displayName}`,
        prompt: zh
          ? `请打开并说明${artifact.displayName}中的关键内容。`
          : ja
            ? `${artifact.displayName}を開き、重要な内容を説明してください。`
            : `Please open ${artifact.displayName} and explain its key contents.`,
        intent: 'open_artifact'
      })
    }
    suggestions.push({
      label: zh ? '验证本次结果' : ja ? '結果を検証' : 'Verify this result',
      prompt: zh
        ? '请验证本次结果，并总结验证结论。'
        : ja
          ? '今回の結果を検証し、結論をまとめてください。'
          : 'Please verify this result and summarize the conclusion.',
      intent: 'verify'
    })
    return suggestions.slice(0, 3)
  }
}

export class FollowUpSuggestionCoordinator {
  private readonly enabled: () => boolean
  private readonly createId: () => string
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.enabled = dependencies.enabled ?? (() => false)
    this.createId = dependencies.createId ?? randomUUID
    this.now = dependencies.now ?? Date.now
  }

  async generate(input: FollowUpSuggestionGenerationInput): Promise<void> {
    if (!this.enabled()) return
    try {
      const drafts = await this.dependencies.generator.generate(input)
      if (drafts.length === 0) return
      const createdAt = this.now()
      const set = createReadyFollowUpSuggestionSet(
        {
          id: this.createId(),
          conversationId: input.conversationId,
          assistantMessageId: input.assistantMessageId,
          sourceRunId: input.sourceRunId,
          sourceDigest: digestGenerationInput(input),
          responseLocale: input.responseLocale,
          createdAt
        },
        drafts.map((draft) => ({ ...draft, id: this.createId() }))
      )
      await this.dependencies.repository.saveGenerated(set)
    } catch {
      // Suggestions are optional and must never alter a completed response.
    }
  }

  schedule(input: FollowUpSuggestionGenerationInput): void {
    void this.generate(input)
  }
}

function digestGenerationInput(
  input: FollowUpSuggestionGenerationInput
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        userObjective: input.userObjective,
        finalAnswer: input.finalAnswer,
        unresolvedItems: input.unresolvedItems,
        artifactSummaries: input.artifactSummaries,
        responseLocale: input.responseLocale
      })
    )
    .digest('hex')
}
