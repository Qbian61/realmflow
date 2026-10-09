import { describe, expect, it, vi } from 'vitest'
import type {
  ChatSessionRecord,
  Revisioned
} from '../ports/business-repositories'
import { ManageConversations } from './manage-conversations'

const session: Revisioned<ChatSessionRecord> = {
  id: 'conversation-1',
  kind: 'general',
  knowledgeScope: { kind: 'none' },
  title: 'Original title',
  sortOrder: 0,
  messages: [],
  revision: 1,
  createdAt: 10,
  updatedAt: 10
}

describe('ManageConversations', () => {
  it('normalizes and persists a renamed conversation', async () => {
    const renameConversation = vi.fn().mockResolvedValue({
      status: 'saved',
      entity: { ...session, title: 'Renamed title', revision: 2, updatedAt: 20 }
    })
    const service = new ManageConversations({
      sessions: {
        renameConversation,
        deleteConversation: vi.fn()
      },
      now: () => 20
    })

    await expect(
      service.rename({
        id: session.id,
        expectedRevision: 1,
        title: '  Renamed title  '
      })
    ).resolves.toMatchObject({
      title: 'Renamed title',
      revision: 2,
      updatedAt: 20
    })
    expect(renameConversation).toHaveBeenCalledWith({
      id: session.id,
      expectedRevision: 1,
      title: 'Renamed title',
      updatedAt: 20
    })
  })

  it('returns the repository deletion outcome', async () => {
    const deleteConversation = vi.fn().mockResolvedValue({
      status: 'deleted',
      id: session.id
    })
    const service = new ManageConversations({
      sessions: {
        renameConversation: vi.fn(),
        deleteConversation
      }
    })

    await expect(
      service.delete({ id: session.id, expectedRevision: 1 })
    ).resolves.toEqual({ status: 'deleted', id: session.id })
    expect(deleteConversation).toHaveBeenCalledWith(session.id, 1)
  })
})
