import { describe, expect, it, vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import type {
  ChatSessionRecord,
  Revisioned
} from '../ports/business-repositories'
import { SendConversationMessageUseCase } from './send-conversation-message'

describe('SendConversationMessageUseCase', () => {
  it('persists the user and streamed assistant messages and records metrics', async () => {
    let session: Revisioned<ChatSessionRecord> = {
      id: 'conversation-1',
      kind: 'general',
      title: 'Hello',
      sortOrder: 1,
      messages: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    }
    const recordCall = vi.fn()
    const events: AiRunEvent[] = [
      event(1, 'run.started', {}),
      event(2, 'content.delta', { delta: 'Hello ' }),
      event(3, 'content.delta', { delta: 'world' }),
      event(4, 'run.completed', {
        usage: {
          inputTokens: 5,
          outputTokens: 2,
          cachedTokens: 1,
          reasoningTokens: 0
        },
        firstTokenLatencyMs: 12,
        durationMs: 30,
        retryCount: 0
      })
    ]
    const useCase = new SendConversationMessageUseCase({
      sessions: {
        get: async () => structuredClone(session),
        listByWorkspace: async () => [],
        listRecent: async () => [],
        delete: async () => false,
        save: async (entity, expectedRevision) => {
          if (expectedRevision !== session.revision) {
            return { status: 'conflict', entity: session }
          }
          session = { ...entity, revision: expectedRevision + 1 }
          return { status: 'saved', entity: structuredClone(session) }
        }
      },
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
        streamEvents: async function* () {
          yield* events
        }
      },
      models: {
        resolveExecution: vi.fn().mockResolvedValue({
          providerType: 'local',
          baseUrl: 'http://127.0.0.1',
          modelId: 'local-test'
        }),
        recordCall
      },
      now: () => 100,
      createId: (() => {
        const ids = ['message-user', 'message-assistant']
        return () => ids.shift() as string
      })()
    })

    const result = await useCase.execute({
      sessionId: session.id,
      content: 'Hi',
      expectedRevision: 1,
      modelProfileId: 'profile-local'
    })

    expect(result.messages).toEqual([
      expect.objectContaining({ id: 'message-user', role: 'user', content: 'Hi' }),
      expect.objectContaining({
        id: 'message-assistant',
        role: 'assistant',
        content: 'Hello world'
      })
    ])
    expect(recordCall).toHaveBeenCalledWith(
      expect.objectContaining({
        modelProfileId: 'profile-local',
        conversationId: 'conversation-1',
        aiRunId: 'run-1',
        inputTokens: 5,
        outputTokens: 2,
        status: 'completed'
      })
    )
  })
})

function event(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data']
): AiRunEvent {
  return {
    id: `event-${sequence}`,
    runId: 'run-1',
    sequence,
    type,
    timestamp: '2026-09-17T00:00:00.000Z',
    data
  }
}
