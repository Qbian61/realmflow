import {
  assertConversationKnowledgeScopeBindings,
  type ConversationKnowledgeScope
} from '../../../../domain/conversation-knowledge-scope'
import type {
  ChatSessionRecord,
  Revisioned,
  WorkspaceRepository
} from '../ports/business-repositories'
import type { SendConversationMessageUseCase } from './send-conversation-message'
import type { ReasoningPreference } from '../../../../domain/reasoning-router'
import type { ConversationAttachmentSubmission } from '../../../../shared/conversation-attachments'

type CreateSpaceConversationCommand = {
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
  workspaces: Pick<WorkspaceRepository, 'get'>
  sender: Pick<SendConversationMessageUseCase, 'execute'>
  now?: () => number
}

export class CreateSpaceConversationUseCase {
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async execute(
    input: CreateSpaceConversationCommand,
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  ): Promise<Revisioned<ChatSessionRecord>> {
    const title = input.title.trim()
    const prompt = input.prompt.trim()
    if (!title) throw new Error('Conversation title is required')
    if (!prompt) throw new Error('Conversation message is required')
    if (
      input.kind !== 'space' ||
      !input.workspaceId ||
      input.requirementId !== undefined ||
      input.nodeRunId !== undefined ||
      input.folderPath !== undefined ||
      input.folderBindingId !== undefined
    ) {
      throw new Error('Space conversations require exactly one workspace')
    }
    if (!(await this.dependencies.workspaces.get(input.workspaceId))) {
      throw new Error(`Workspace not found: ${input.workspaceId}`)
    }
    assertConversationKnowledgeScopeBindings({
      kind: 'space',
      workspaceId: input.workspaceId,
      knowledgeScope: input.knowledgeScope
    })

    const now = this.now()
    return this.dependencies.sender.execute({
      sessionId: input.id,
      session: {
        id: input.id,
        kind: 'space',
        workspaceId: input.workspaceId,
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
