import { describe, expect, it } from 'vitest'
import {
  requireCreateConversationCommand,
  requireAppendConversationMessageCommand,
  requireSendFollowUpSuggestionCommand
} from './runtime-validation'

const cases = [
  [requireCreateConversationCommand, {
    id: 'chat', kind: 'general', knowledgeScope: { kind: 'none' }, title: 'Chat', prompt: 'Hello'
  }],
  [requireAppendConversationMessageCommand, {
    sessionId: 'chat', messageId: 'message', content: 'Hello', expectedRevision: 1
  }],
  [requireSendFollowUpSuggestionCommand, {
    sessionId: 'chat', suggestionSetId: 'set', suggestionId: 'suggestion',
    expectedSessionRevision: 1, expectedSuggestionRevision: 1
  }]
] as const

describe('conversation approval IPC validation', () => {
  it.each(cases)('accepts all three modes through %s', (validate, command) => {
    for (const approvalProfileId of ['cautious', 'protected', 'trusted']) {
      expect(validate({ ...command, approvalProfileId }, 'conversation')).toMatchObject({ approvalProfileId })
    }
  })
  it.each(cases)('rejects unrecognized modes through %s', (validate, command) => {
    expect(() => validate({ ...command, approvalProfileId: 'allow-all' }, 'conversation'))
      .toThrow('command.approvalProfileId')
  })
})
