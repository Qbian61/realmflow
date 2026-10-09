import { describe, expect, it } from 'vitest'
import {
  createReadyFollowUpSuggestionSet,
  supersedeFollowUpSuggestionSet
} from './follow-up-suggestion'

const input = {
  id: 'set-1',
  conversationId: 'conversation-1',
  assistantMessageId: 'assistant-1',
  sourceRunId: 'run-1',
  sourceDigest: 'a'.repeat(64),
  responseLocale: 'zh-CN',
  createdAt: 100
}

describe('follow-up suggestions', () => {
  it('creates a ready set with stable consecutive ordering', () => {
    expect(
      createReadyFollowUpSuggestionSet(input, [
        {
          id: 'suggestion-1',
          label: '验证结果',
          prompt: '请运行验证并总结结果。',
          intent: 'verify'
        },
        {
          id: 'suggestion-2',
          label: '解释设计',
          prompt: '请解释这个设计的关键取舍。',
          intent: 'explain'
        }
      ])
    ).toMatchObject({
      status: 'ready',
      revision: 1,
      suggestions: [
        { id: 'suggestion-1', sortOrder: 0 },
        { id: 'suggestion-2', sortOrder: 1 }
      ]
    })
  })

  it('rejects empty and oversized ready sets', () => {
    expect(() => createReadyFollowUpSuggestionSet(input, [])).toThrow(
      'Follow-up suggestions require between 1 and 3 items'
    )
    expect(() =>
      createReadyFollowUpSuggestionSet(
        input,
        Array.from({ length: 4 }, (_, index) => ({
          id: `suggestion-${index}`,
          label: `Suggestion ${index}`,
          prompt: `Prompt ${index}`,
          intent: 'continue' as const
        }))
      )
    ).toThrow('Follow-up suggestions require between 1 and 3 items')
  })

  it('does not restore a superseded set', () => {
    const ready = createReadyFollowUpSuggestionSet(input, [
      {
        id: 'suggestion-1',
        label: '继续',
        prompt: '请继续。',
        intent: 'continue'
      }
    ])
    const superseded = supersedeFollowUpSuggestionSet(ready, 120)

    expect(superseded).toMatchObject({
      status: 'superseded',
      revision: 2,
      updatedAt: 120
    })
    expect(() => supersedeFollowUpSuggestionSet(superseded, 130)).toThrow(
      'Follow-up suggestion set is already superseded'
    )
  })
})
