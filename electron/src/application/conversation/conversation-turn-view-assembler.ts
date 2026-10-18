import type {
  ConversationTurnMessage,
  ConversationTurnView
} from '../../../../domain/conversation-turn'
import type {
  ConversationTurnPage,
  ConversationTurnPageRepository
} from '../ports/business-repositories'

export type { ConversationTurnPage } from '../ports/business-repositories'

export type ListConversationTurnsQuery = {
  sessionId: string
  cursor?: string
  anchorTurnId?: string
  limit: number
}

export type ListConversationTurnsResponse = {
  turns: ConversationTurnView[]
  nextCursor?: string
  totalCount: number
}

export class ConversationTurnViewAssembler {
  constructor(
    private readonly turns: ConversationTurnPageRepository
  ) {}

  async execute(
    query: ListConversationTurnsQuery
  ): Promise<ListConversationTurnsResponse> {
    const page = await this.turns.listTurns(query)
    const messages = new Map(
      page.messages.map((message) => [message.id, message])
    )
    const projections = new Map(
      page.projections.map((projection) => [projection.runId, projection])
    )
    const turns = page.turns.map((turn): ConversationTurnView => {
      const userMessage = messages.get(turn.userMessageId)
      const assistantMessage = messages.get(turn.assistantMessageId)
      assertMessage(userMessage, turn.id, turn.sessionId, 'user')
      assertMessage(assistantMessage, turn.id, turn.sessionId, 'assistant')
      const execution = turn.runId ? projections.get(turn.runId) : undefined
      if (
        execution &&
        (execution.turnId !== turn.id ||
          execution.assistantMessageId !== assistantMessage.id)
      ) {
        throw new Error('conversation_turn_view_invalid')
      }
      const isLast = turn.index === page.totalCount - 1
      return {
        id: turn.id,
        index: turn.index,
        status: turn.status,
        userMessage,
        assistantMessage,
        ...(execution ? { execution } : {}),
        isLast,
        isHistory: !isLast
      }
    })
    return {
      turns,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      totalCount: page.totalCount
    }
  }
}

function assertMessage(
  message: ConversationTurnMessage | undefined,
  turnId: string,
  sessionId: string,
  role: ConversationTurnMessage['role']
): asserts message is ConversationTurnMessage {
  if (
    !message ||
    message.turnId !== turnId ||
    message.sessionId !== sessionId ||
    message.role !== role
  ) {
    throw new Error('conversation_turn_view_invalid')
  }
}
