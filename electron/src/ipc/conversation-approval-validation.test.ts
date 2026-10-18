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
  it.each([
    [requireCreateConversationCommand, {
      id: 'chat',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Chat',
      prompt: 'Hello'
    }],
    [requireAppendConversationMessageCommand, {
      sessionId: 'chat',
      messageId: 'message',
      content: 'Hello',
      expectedRevision: 1
    }]
  ] as const)('accepts a selected Skill through %s', (validate, command) => {
    const skill = {
      kind: 'skill' as const,
      id: 'builtin.skill.code_review',
      version: '1.0.2',
      digest: 'c'.repeat(64)
    }

    expect(
      validate(
        {
          ...command,
          capabilities: { skill }
        },
        'conversation'
      )
    ).toMatchObject({
      capabilities: { skill }
    })
  })

  it.each([
    [requireCreateConversationCommand, {
      id: 'chat',
      kind: 'general',
      knowledgeScope: { kind: 'none' },
      title: 'Chat',
      prompt: 'Hello'
    }],
    [requireAppendConversationMessageCommand, {
      sessionId: 'chat',
      messageId: 'message',
      content: 'Hello',
      expectedRevision: 1
    }]
  ] as const)('accepts Connector and MCP selections through %s', (validate, command) => {
    expect(
      validate(
        {
          ...command,
          capabilities: {
            connectorBindings: [
              { service: 'http', connectorId: 'connector.tc-p1-invalid' }
            ],
            mcpServerIds: ['mcp.tc-p1-local']
          }
        },
        'conversation'
      )
    ).toMatchObject({
      capabilities: {
        connectorBindings: [
          { service: 'http', connectorId: 'connector.tc-p1-invalid' }
        ],
        mcpServerIds: ['mcp.tc-p1-local']
      }
    })
  })

  it.each(['auto', 'fresh', 'continuation'] as const)(
    'accepts append context mode %s',
    (contextMode) => {
      expect(requireAppendConversationMessageCommand({
        sessionId: 'chat',
        messageId: 'message',
        content: 'Hello',
        expectedRevision: 1,
        contextMode
      }, 'conversation')).toMatchObject({ contextMode })
    }
  )

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
