export type ConversationKnowledgeScope =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'all_workspaces' }>
  | Readonly<{ kind: 'workspace'; workspaceId: string }>
  | Readonly<{ kind: 'node_configuration' }>

export type ConversationKnowledgeBinding = {
  kind: 'general' | 'space' | 'requirement_node'
  workspaceId?: string
  requirementId?: string
  nodeRunId?: string
  folderPath?: string
  knowledgeScope: ConversationKnowledgeScope
}

export function parseConversationKnowledgeScope(
  value: string
): ConversationKnowledgeScope {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw invalidScope()
  }
  return normalizeConversationKnowledgeScope(parsed)
}

export function serializeConversationKnowledgeScope(
  value: ConversationKnowledgeScope
): string {
  return JSON.stringify(normalizeConversationKnowledgeScope(value))
}

export function normalizeConversationKnowledgeScope(
  value: unknown
): ConversationKnowledgeScope {
  if (!isRecord(value) || typeof value.kind !== 'string') throw invalidScope()
  const keys = Object.keys(value).sort()
  if (
    (value.kind === 'none' ||
      value.kind === 'all_workspaces' ||
      value.kind === 'node_configuration') &&
    keys.length === 1 &&
    keys[0] === 'kind'
  ) {
    return { kind: value.kind }
  }
  if (
    value.kind === 'workspace' &&
    keys.length === 2 &&
    keys[0] === 'kind' &&
    keys[1] === 'workspaceId' &&
    typeof value.workspaceId === 'string' &&
    value.workspaceId.trim()
  ) {
    return { kind: 'workspace', workspaceId: value.workspaceId.trim() }
  }
  throw invalidScope()
}

export function assertConversationKnowledgeScopeBindings(
  binding: ConversationKnowledgeBinding
): void {
  const scope = normalizeConversationKnowledgeScope(binding.knowledgeScope)
  const valid =
    binding.kind === 'general'
      ? !binding.workspaceId &&
        !binding.requirementId &&
        !binding.nodeRunId &&
        (binding.folderPath ? scope.kind === 'none' : scope.kind === 'none' ||
          scope.kind === 'all_workspaces')
      : binding.kind === 'space'
        ? Boolean(binding.workspaceId) &&
          !binding.requirementId &&
          !binding.nodeRunId &&
          !binding.folderPath &&
          scope.kind === 'workspace' &&
          scope.workspaceId === binding.workspaceId
        : Boolean(
            binding.workspaceId &&
              binding.requirementId &&
              binding.nodeRunId &&
              !binding.folderPath &&
              scope.kind === 'node_configuration'
          )
  if (!valid) {
    throw new Error('Conversation knowledge scope does not match its bindings')
  }
}

function invalidScope(): Error {
  return new Error('Conversation knowledge scope is invalid')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
