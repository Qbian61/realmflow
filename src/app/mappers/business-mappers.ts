import type {
  ConversationDto,
  RequirementDto,
  SpaceDto
} from '../../../shared/business'
import type { ChatSession } from '../../domain/chat-session'
import type { WorkspaceNavigation } from '../../domain/workspace'

export function mapBusinessNavigation(
  spaces: SpaceDto[],
  requirements: Array<readonly [string, RequirementDto[]]>
): WorkspaceNavigation {
  return {
    spaces: spaces.map((space) => ({
      id: space.id,
      path: `/spaces/${space.id}`,
      physicalPath: space.path,
      label: space.label,
      description: space.description,
      sortOrder: space.sortOrder,
      revision: space.revision
    })),
    requirementsBySpace: Object.fromEntries(
      requirements.map(([workspaceId, items]) => [
        `/spaces/${workspaceId}`,
        items.map((requirement) => ({
          id: requirement.id,
          workspaceId: requirement.workspaceId,
          title: requirement.title,
          status: requirement.status,
          updatedAt: requirement.updatedAt,
          sortOrder: requirement.sortOrder,
          revision: requirement.revision
        }))
      ])
    )
  }
}

export function mapConversation(
  conversation: ConversationDto
): ChatSession {
  return {
    id: conversation.id,
    kind: conversation.kind,
    knowledgeScope:
      conversation.knowledgeScope ??
      (conversation.kind === 'requirement_node'
        ? { kind: 'node_configuration' }
        : conversation.kind === 'space' && conversation.workspaceId
          ? { kind: 'workspace', workspaceId: conversation.workspaceId }
          : { kind: 'none' }),
    ...(conversation.workspaceId
      ? { workspaceId: conversation.workspaceId }
      : {}),
    ...(conversation.requirementId
      ? { requirementId: conversation.requirementId }
      : {}),
    ...(conversation.nodeRunId ? { nodeRunId: conversation.nodeRunId } : {}),
    ...(conversation.folderPath ? { folderPath: conversation.folderPath } : {}),
    ...(conversation.modelProfileId
      ? { modelProfileId: conversation.modelProfileId }
      : {}),
    title: conversation.title,
    spacePath: conversation.workspaceId
      ? `/spaces/${conversation.workspaceId}`
      : '',
    messages: conversation.messages.map((message) => ({
      ...message,
      role: message.role
    })),
    sortOrder: conversation.sortOrder,
    revision: conversation.revision,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  }
}
