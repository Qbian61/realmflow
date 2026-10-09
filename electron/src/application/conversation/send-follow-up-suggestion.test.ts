import { describe, expect, it, vi } from 'vitest'
import { SendFollowUpSuggestionUseCase } from './send-follow-up-suggestion'

describe('SendFollowUpSuggestionUseCase', () => {
  it('uses the persisted prompt and atomically starts the standard turn', async () => {
    const beginSuggestedTurn = vi.fn().mockResolvedValue({
      status: 'started',
      entity: { id: 'conversation-1', revision: 4, messages: [] }
    })
    const execute = vi.fn(async (input) => {
      await input.turnStarter({
        session: { id: 'conversation-1' },
        expectedRevision: 3,
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-2',
        content: input.content,
        createdAt: 200
      })
      return {
        id: 'conversation-1',
        kind: 'general' as const,
        title: 'Conversation',
        sortOrder: 0,
        revision: 7,
        messages: [],
        createdAt: 1,
        updatedAt: 200
      }
    })
    const useCase = new SendFollowUpSuggestionUseCase({
      suggestions: {
        getReadySuggestion: vi.fn().mockResolvedValue({
          prompt: '请运行完整验证。',
          suggestionRevision: 2
        }),
        beginSuggestedTurn
      },
      sender: { execute },
      createId: () => 'user-1'
    })

    await useCase.execute({
      sessionId: 'conversation-1',
      suggestionSetId: 'set-1',
      suggestionId: 'suggestion-1',
      expectedSessionRevision: 3,
      expectedSuggestionRevision: 2
    })

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'conversation-1',
        messageId: 'user-1',
        content: '请运行完整验证。',
        expectedRevision: 3,
        turnStarter: expect.any(Function)
      })
    )
    expect(beginSuggestedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestionSetId: 'set-1',
        suggestionId: 'suggestion-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-2',
        processing: undefined
      })
    )
  })

  it('rejects an expired suggestion before starting a run', async () => {
    const execute = vi.fn()
    const useCase = new SendFollowUpSuggestionUseCase({
      suggestions: {
        getReadySuggestion: vi.fn().mockResolvedValue(undefined),
        beginSuggestedTurn: vi.fn()
      },
      sender: { execute }
    })

    await expect(
      useCase.execute({
        sessionId: 'conversation-1',
        suggestionSetId: 'set-1',
        suggestionId: 'suggestion-1',
        expectedSessionRevision: 3,
        expectedSuggestionRevision: 2
      })
    ).rejects.toThrow('Follow-up suggestion is no longer available')
    expect(execute).not.toHaveBeenCalled()
  })
})
