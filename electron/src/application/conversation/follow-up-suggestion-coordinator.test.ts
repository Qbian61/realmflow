import { describe, expect, it, vi } from 'vitest'
import {
  DeterministicFollowUpSuggestionGenerator,
  FollowUpSuggestionCoordinator
} from './follow-up-suggestion-coordinator'

const completedTurn = {
  conversationId: 'conversation-1',
  assistantMessageId: 'assistant-1',
  sourceRunId: 'run-1',
  responseLocale: 'zh-CN',
  userObjective: '实现回复后建议',
  finalAnswer: '实现已完成。',
  unresolvedItems: [],
  artifactSummaries: [],
  executionOutcome: 'completed' as const
}

describe('FollowUpSuggestionCoordinator', () => {
  it('uses a deterministic local default strategy without external side effects', async () => {
    const generator = new DeterministicFollowUpSuggestionGenerator()

    await expect(
      generator.generate({
        ...completedTurn,
        unresolvedItems: ['补充 IPC 验证'],
        artifactSummaries: [
          { id: 'artifact-1', kind: 'report', displayName: '验收报告' }
        ]
      })
    ).resolves.toEqual([
      {
        label: '继续处理未完成项',
        prompt: '请继续处理：补充 IPC 验证',
        intent: 'continue'
      },
      {
        label: '查看验收报告',
        prompt: '请打开并说明验收报告中的关键内容。',
        intent: 'open_artifact'
      },
      {
        label: '验证本次结果',
        prompt: '请验证本次结果，并总结验证结论。',
        intent: 'verify'
      }
    ])
  })

  it('does not invoke the generator when suggestions are disabled by default', async () => {
    const generate = vi.fn()
    const saveGenerated = vi.fn()
    const coordinator = new FollowUpSuggestionCoordinator({
      generator: { generate },
      repository: { saveGenerated },
      createId: () => 'unused',
      now: () => 100
    })

    await coordinator.generate(completedTurn)

    expect(generate).not.toHaveBeenCalled()
    expect(saveGenerated).not.toHaveBeenCalled()
  })

  it('persists validated suggestions from an injected generator when enabled', async () => {
    const saveGenerated = vi.fn(async (set) => set)
    const coordinator = new FollowUpSuggestionCoordinator({
      enabled: () => true,
      generator: {
        generate: vi.fn().mockResolvedValue([
          {
            label: '验证结果',
            prompt: '请运行验证并总结结果。',
            intent: 'verify'
          }
        ])
      },
      repository: { saveGenerated },
      createId: (() => {
        const ids = ['set-1', 'suggestion-1']
        return () => ids.shift()!
      })(),
      now: () => 100
    })

    await coordinator.generate(completedTurn)

    expect(saveGenerated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'set-1',
        status: 'ready',
        responseLocale: 'zh-CN',
        suggestions: [
          expect.objectContaining({
            id: 'suggestion-1',
            prompt: '请运行验证并总结结果。'
          })
        ]
      })
    )
  })

  it('silently ignores generator failures and empty results', async () => {
    const saveGenerated = vi.fn()
    const failing = new FollowUpSuggestionCoordinator({
      enabled: () => true,
      generator: {
        generate: vi.fn().mockRejectedValue(new Error('provider unavailable'))
      },
      repository: { saveGenerated }
    })
    const empty = new FollowUpSuggestionCoordinator({
      enabled: () => true,
      generator: { generate: vi.fn().mockResolvedValue([]) },
      repository: { saveGenerated }
    })

    await expect(failing.generate(completedTurn)).resolves.toBeUndefined()
    await expect(empty.generate(completedTurn)).resolves.toBeUndefined()
    expect(saveGenerated).not.toHaveBeenCalled()
  })
})
