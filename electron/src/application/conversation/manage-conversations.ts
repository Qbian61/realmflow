import type {
  ConversationManagementRepository,
  DeleteChatSessionResult,
  Revisioned,
  ChatSessionRecord
} from '../ports/business-repositories'

export class ManageConversations {
  private readonly sessions: ConversationManagementRepository
  private readonly now: () => number

  constructor(input: {
    sessions: ConversationManagementRepository
    now?: () => number
  }) {
    this.sessions = input.sessions
    this.now = input.now ?? Date.now
  }

  async rename(input: {
    id: string
    title: string
    expectedRevision: number
  }): Promise<Revisioned<ChatSessionRecord>> {
    const title = input.title.trim()
    if (!title || title.length > 240) {
      throw new Error('Conversation title must contain 1 to 240 characters')
    }
    const result = await this.sessions.renameConversation({
      id: input.id,
      expectedRevision: input.expectedRevision,
      title,
      updatedAt: this.now()
    })
    if (result.status === 'conflict') {
      throw new Error('Conversation revision conflict')
    }
    return result.entity
  }

  delete(input: {
    id: string
    expectedRevision: number
  }): Promise<DeleteChatSessionResult> {
    return this.sessions.deleteConversation(input.id, input.expectedRevision)
  }
}
