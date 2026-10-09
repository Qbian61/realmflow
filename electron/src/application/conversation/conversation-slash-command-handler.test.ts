import { describe, expect, it } from 'vitest'
import type { ConversationProcessingSnapshot } from '../../../../domain/conversation-processor'
import {
  ConversationSlashCommandHandler,
  applyConversationHistoryCommands
} from './conversation-slash-command-handler'

describe('ConversationSlashCommandHandler', () => {
  const handler = new ConversationSlashCommandHandler()

  it('returns a local context snapshot summary', async () => {
    await expect(
      handler.execute({
        rawCommand: '/context',
        processing: snapshot()
      })
    ).resolves.toEqual({
      handled: true,
      content: expect.stringContaining('上下文快照'),
      command: 'context',
      effect: { kind: 'none' }
    })
  })

  it('validates unknown commands without delegating to a model', async () => {
    await expect(
      handler.execute({
        rawCommand: '/unknown',
        processing: snapshot('/unknown')
      })
    ).resolves.toEqual({
      handled: true,
      content: '未知命令：/unknown',
      command: 'unknown',
      effect: { kind: 'none' }
    })
  })

  it('turns prompt commands into deterministic execution intent', async () => {
    await expect(
      handler.execute({
        rawCommand: '/review src/main.ts',
        processing: snapshot('/review src/main.ts')
      })
    ).resolves.toEqual({
      handled: false,
      prompt: '请审查 src/main.ts',
      command: 'review'
    })
  })

  it('applies new, compact, and reasoning commands to later model context', () => {
    const afterNew = applyConversationHistoryCommands([
      message('old-user', 'user', 'Old question'),
      message('old-assistant', 'assistant', 'Old answer'),
      message('new-command', 'user', '/new'),
      message('new-result', 'assistant', '已从下一条消息开始使用新的上下文。'),
      message('reasoning-command', 'user', '/reasoning high'),
      message('reasoning-result', 'assistant', '已切换'),
      message('current', 'user', 'Current question')
    ])

    expect(afterNew.messages).toEqual([
      expect.objectContaining({ id: 'reasoning-command' }),
      expect.objectContaining({ id: 'reasoning-result' }),
      expect.objectContaining({ id: 'current' })
    ])
    expect(afterNew.reasoning).toBe('high')

    const compacted = applyConversationHistoryCommands([
      message('old-user', 'user', 'A long previous question'),
      message('old-assistant', 'assistant', 'A long previous answer'),
      message('compact-command', 'user', '/compact'),
      message('compact-result', 'assistant', '已压缩'),
      message('current', 'user', 'Continue')
    ])
    expect(compacted.messages).toEqual([
      expect.objectContaining({ id: 'current' })
    ])
    expect(compacted.compactedContext).toContain('A long previous question')
    expect(compacted.compactedContext).toContain('A long previous answer')
  })
})

function message(
  id: string,
  role: 'user' | 'assistant' | 'tool',
  content: string
) {
  return { id, role, content, status: 'completed' as const }
}

function snapshot(
  content = '/context'
): ConversationProcessingSnapshot {
  return {
    schemaVersion: 1,
    pipelineVersion: 'pipeline-1',
    rawUserInput: {
      messageId: 'message-1',
      content,
      contentDigest: 'a'.repeat(64),
      capturedAt: 1
    },
    normalizedText: content,
    slashCommand: {
      name: content.slice(1).split(/\s/, 1)[0],
      arguments: content.split(/\s+/, 2)[1] ?? ''
    },
    registeredInputs: { references: [], attachmentPaths: [] },
    sensitiveData: { labels: [] },
    semanticUnderstanding: {
      sourceMessageId: 'message-1',
      sourceDigest: 'a'.repeat(64),
      processorVersion: '1.0.0',
      generatedBy: 'deterministic',
      revision: 1,
      intent: 'request',
      objective: content,
      entities: [],
      constraints: [],
      acceptanceCriteria: [],
      ambiguity: [],
      riskLevel: 'low',
      retrievalQueries: [],
      confidence: 1
    },
    executionBrief: {
      sourceMessageId: 'message-1',
      semanticProcessorVersion: '1.0.0',
      objective: content,
      entities: [],
      constraints: [],
      acceptanceCriteria: [],
      riskLevel: 'low',
      capabilityRestrictions: {
        allowWrites: false,
        allowExternalSideEffects: false
      }
    },
    gate: { status: 'continue' },
    locale: 'zh-CN',
    contextEnvelope: {
      sourceMessageId: 'message-1',
      retrievalQueries: [],
      entityReferences: []
    },
    outputPolicy: {
      validateCitations: true,
      redactSensitiveEcho: true,
      extractStructuredArtifacts: true
    },
    diagnostics: [],
    trace: []
  }
}
