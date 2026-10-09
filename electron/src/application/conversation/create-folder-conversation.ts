import type { WorkspaceBinding } from '../../../../shared/workspace'
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

type CreateFolderConversationCommand = {
  id: string
  kind: 'general' | 'space' | 'requirement_node'
  knowledgeScope: ConversationKnowledgeScope
  title: string
  prompt: string
  folderBindingId?: string
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  modelProfileId?: string
  reasoningMode?: ReasoningPreference
  applicationLocale?: 'zh-CN' | 'en' | 'ja'
  attachments?: ConversationAttachmentSubmission
}

type Dependencies = {
  folders: {
    getSessionDirectoryBinding: (
      bindingId: string
    ) => Promise<WorkspaceBinding | null>
  }
  sender: Pick<SendConversationMessageUseCase, 'execute'>
  now?: () => number
}

export class CreateFolderConversationUseCase {
  private readonly now: () => number

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
  }

  async execute(
    input: CreateFolderConversationCommand,
    onUpdate?: (session: Revisioned<ChatSessionRecord>) => void
  ): Promise<Revisioned<ChatSessionRecord>> {
    const title = input.title.trim()
    const prompt = input.prompt.trim()
    if (!title) throw new Error('Conversation title is required')
    if (!prompt) throw new Error('Conversation message is required')
    if (
      input.kind !== 'general' ||
      !input.folderBindingId?.trim() ||
      input.workspaceId !== undefined ||
      input.requirementId !== undefined ||
      input.nodeRunId !== undefined ||
      input.folderPath !== undefined
    ) {
      throw new Error(
        'Folder conversations require exactly one folder binding'
      )
    }
    const binding = await this.dependencies.folders.getSessionDirectoryBinding(
      input.folderBindingId
    )
    if (!binding) throw new Error('文件夹授权已失效，请重新选择')
    assertConversationKnowledgeScopeBindings({
      kind: 'general',
      folderPath: binding.rootPath,
      knowledgeScope: input.knowledgeScope
    })

    const now = this.now()
    return this.dependencies.sender.execute({
      sessionId: input.id,
      session: {
        id: input.id,
        kind: 'general',
        knowledgeScope: input.knowledgeScope,
        folderPath: binding.rootPath,
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
