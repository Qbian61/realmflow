import {
  assertConversationKnowledgeScopeBindings,
  type ConversationKnowledgeScope
} from '../../../../domain/conversation-knowledge-scope'
import type {
  ChatSessionRecord,
  Revisioned
} from '../ports/business-repositories'
import type { SendConversationMessageUseCase } from './send-conversation-message'
import type { ReasoningPreference } from '../../../../domain/reasoning-router'
import type { ConversationAttachmentSubmission } from '../../../../shared/conversation-attachments'

type CreateGeneralConversationCommand = {
  id: string
  kind: 'general' | 'space' | 'requirement_node'
  knowledgeScope: ConversationKnowledgeScope
  title: string
  prompt: string
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  folderBindingId?: string
  modelProfileId?: string
  reasoningMode?: ReasoningPreference
  applicationLocale?: 'zh-CN' | 'en' | 'ja'
  attachments?: ConversationAttachmentSubmission
}

type Dependencies = {
  sender: Pick<SendConversationMessageUseCase, 'execute'>
  now?: () => number
}

export class CreateGeneralConversationUseCase {
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async execute(
    input: CreateGeneralConversationCommand,
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  ): Promise<Revisioned<ChatSessionRecord>> {
    const title = input.title.trim()
    const prompt = input.prompt.trim()
    if (!title) throw new Error('Conversation title is required')
    if (!prompt) throw new Error('Conversation message is required')
    if (
      input.kind !== 'general' ||
      input.workspaceId !== undefined ||
      input.requirementId !== undefined ||
      input.nodeRunId !== undefined ||
      input.folderPath !== undefined ||
      input.folderBindingId !== undefined
    ) {
      throw new Error(
        'General conversations cannot bind workspace, requirement, node run, or folder context'
      )
    }
    assertConversationKnowledgeScopeBindings({
      kind: 'general',
      knowledgeScope: input.knowledgeScope
    })

    const now = this.now()
    return this.dependencies.sender.execute({
      sessionId: input.id,
      session: {
        id: input.id,
        kind: 'general',
        knowledgeScope: input.knowledgeScope,
        title,
        sortOrder: now,
        messages: [],
        createdAt: now,
        updatedAt: now
      },
      content: prompt,
      expectedRevision: 0,
      messageId: `${input.id}:message:1`,
      ...(onUpdate ? { onUpdate } : {}),
      ...(input.modelProfileId
        ? { modelProfileId: input.modelProfileId }
        : {}),
      ...(input.reasoningMode
        ? { reasoningMode: input.reasoningMode }
        : {}),
      ...(input.applicationLocale
        ? { applicationLocale: input.applicationLocale }
        : {}),
      ...(input.attachments ? { attachments: input.attachments } : {})
    })
  }
}
