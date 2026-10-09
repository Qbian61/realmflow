import { randomUUID } from 'node:crypto'
import type { SendFollowUpSuggestionCommand } from '../../../../shared/business'
import type { FollowUpSuggestionRepository } from '../ports/business-repositories'
import type { SendConversationMessageUseCase } from './send-conversation-message'

type Dependencies = {
  suggestions: Pick<
    FollowUpSuggestionRepository,
    'getReadySuggestion' | 'beginSuggestedTurn'
  >
  sender: Pick<SendConversationMessageUseCase, 'execute'>
  createId?: () => string
}

export class SendFollowUpSuggestionUseCase {
  private readonly createId: () => string

  constructor(private readonly dependencies: Dependencies) {
    this.createId = dependencies.createId ?? randomUUID
  }

  async execute(
    command: SendFollowUpSuggestionCommand,
    onUpdate?: Parameters<SendConversationMessageUseCase['execute']>[0]['onUpdate']
  ) {
    const suggestion = await this.dependencies.suggestions.getReadySuggestion({
      sessionId: command.sessionId,
      suggestionSetId: command.suggestionSetId,
      suggestionId: command.suggestionId,
      expectedSuggestionRevision: command.expectedSuggestionRevision
    })
    if (!suggestion) {
      throw new Error('Follow-up suggestion is no longer available')
    }
    return this.dependencies.sender.execute({
      sessionId: command.sessionId,
      messageId: this.createId(),
      content: suggestion.prompt,
      expectedRevision: command.expectedSessionRevision,
      ...(command.modelProfileId
        ? { modelProfileId: command.modelProfileId }
        : {}),
      ...(command.reasoningMode
        ? { reasoningMode: command.reasoningMode }
        : {}),
      ...(command.applicationLocale
        ? { applicationLocale: command.applicationLocale }
        : {}),
      ...(onUpdate ? { onUpdate } : {}),
      turnStarter: (turn) =>
        this.dependencies.suggestions.beginSuggestedTurn({
          sessionId: command.sessionId,
          suggestionSetId: command.suggestionSetId,
          suggestionId: command.suggestionId,
          expectedSessionRevision: turn.expectedRevision,
          expectedSuggestionRevision: command.expectedSuggestionRevision,
          userMessageId: turn.userMessageId,
          assistantMessageId: turn.assistantMessageId,
          processing: turn.processing,
          modelName: turn.modelName,
          createdAt: turn.createdAt
        })
    })
  }
}
