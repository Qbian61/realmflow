import { createHash } from 'node:crypto'

export type KnowledgeNoteKind =
  | 'conversation_note'
  | 'decision'
  | 'retrospective'

export type KnowledgeNote = Readonly<{
  id: string
  workspaceId: string
  kind: KnowledgeNoteKind
  requirementId?: string
  sessionId?: string
  currentVersionId: string
  currentVersion: number
  status: 'active' | 'archived'
  revision: number
  createdAt: number
  updatedAt: number
}>

export type KnowledgeNoteVersion = Readonly<{
  id: string
  noteId: string
  version: number
  title: string
  content: string
  sourceMessageIds: readonly string[]
  checksum: string
  createdAt: number
}>

export type KnowledgeNoteMessage = Readonly<{
  id: string
  sessionId: string
  role: string
  status: string
  content: string
  sortOrder: number
}>

export function createKnowledgeNote(input: {
  id: string
  versionId: string
  workspaceId: string
  kind: KnowledgeNoteKind
  requirementId?: string
  sessionId: string
  title: string
  content: string
  sourceMessageIds: readonly string[]
  at: number
}): { note: KnowledgeNote; version: KnowledgeNoteVersion } {
  const id = requiredText(input.id, 'Knowledge Note id is required')
  const versionId = requiredText(
    input.versionId,
    'Knowledge Note version id is required'
  )
  const workspaceId = requiredText(
    input.workspaceId,
    'Knowledge Note workspace is required'
  )
  const sessionId = requiredText(
    input.sessionId,
    'Knowledge Note session is required'
  )
  const sourceMessageIds = normalizeSourceMessageIds(input.sourceMessageIds)
  validateTime(input.at)
  const version = createVersion({
    id: versionId,
    noteId: id,
    version: 1,
    title: input.title,
    content: input.content,
    sourceMessageIds,
    at: input.at
  })
  return {
    note: {
      id,
      workspaceId,
      kind: input.kind,
      ...(input.requirementId
        ? {
            requirementId: requiredText(
              input.requirementId,
              'Knowledge Note requirement is invalid'
            )
          }
        : {}),
      sessionId,
      currentVersionId: versionId,
      currentVersion: 1,
      status: 'active',
      revision: 1,
      createdAt: input.at,
      updatedAt: input.at
    },
    version
  }
}

export function editKnowledgeNote(input: {
  note: KnowledgeNote
  currentVersion: KnowledgeNoteVersion
  versionId: string
  title: string
  content: string
  at: number
}): { note: KnowledgeNote; version: KnowledgeNoteVersion } {
  if (input.note.status === 'archived') {
    throw new Error('Archived Knowledge Note cannot be edited')
  }
  if (
    input.currentVersion.noteId !== input.note.id ||
    input.currentVersion.id !== input.note.currentVersionId ||
    input.currentVersion.version !== input.note.currentVersion
  ) {
    throw new Error('Knowledge Note current version does not match')
  }
  validateTime(input.at)
  const version = createVersion({
    id: requiredText(
      input.versionId,
      'Knowledge Note version id is required'
    ),
    noteId: input.note.id,
    version: input.note.currentVersion + 1,
    title: input.title,
    content: input.content,
    sourceMessageIds: input.currentVersion.sourceMessageIds,
    at: input.at
  })
  return {
    note: {
      ...input.note,
      currentVersionId: version.id,
      currentVersion: version.version,
      revision: input.note.revision + 1,
      updatedAt: input.at
    },
    version
  }
}

export function archiveKnowledgeNote(
  note: KnowledgeNote,
  at: number
): KnowledgeNote {
  if (note.status === 'archived') {
    throw new Error('Knowledge Note is already archived')
  }
  validateTime(at)
  return {
    ...note,
    status: 'archived',
    revision: note.revision + 1,
    updatedAt: at
  }
}

export function selectKnowledgeNoteMessages(input: {
  sessionId: string
  messageIds: readonly string[]
  messages: readonly KnowledgeNoteMessage[]
}): KnowledgeNoteMessage[] {
  const sessionId = requiredText(
    input.sessionId,
    'Knowledge Note session is required'
  )
  const messageIds = normalizeSourceMessageIds(input.messageIds)
  const byId = new Map(input.messages.map((message) => [message.id, message]))
  const selected = messageIds.map((id) => {
    const message = byId.get(id)
    if (!message) throw new Error(`Knowledge Note message not found: ${id}`)
    return message
  })
  if (selected.some((message) => message.sessionId !== sessionId)) {
    throw new Error('Knowledge Note messages must belong to the same session')
  }
  if (selected.some((message) => message.status !== 'completed')) {
    throw new Error('Knowledge Note messages must be completed')
  }
  if (
    selected.some(
      (message) => message.role !== 'user' && message.role !== 'assistant'
    )
  ) {
    throw new Error(
      'Knowledge Note messages may only include user or assistant roles'
    )
  }
  if (
    selected.some(
      (message, index) =>
        index > 0 && message.sortOrder <= selected[index - 1].sortOrder
    )
  ) {
    throw new Error(
      'Knowledge Note messages must be selected in conversation order'
    )
  }
  return selected
}

function createVersion(input: {
  id: string
  noteId: string
  version: number
  title: string
  content: string
  sourceMessageIds: readonly string[]
  at: number
}): KnowledgeNoteVersion {
  const title = requiredText(input.title, 'Knowledge Note title is required')
  const content = requiredText(
    input.content,
    'Knowledge Note content is required'
  )
  const sourceMessageIds = [...input.sourceMessageIds]
  return {
    id: input.id,
    noteId: input.noteId,
    version: input.version,
    title,
    content,
    sourceMessageIds,
    checksum: checksum({ title, content, sourceMessageIds }),
    createdAt: input.at
  }
}

function normalizeSourceMessageIds(values: readonly string[]): string[] {
  if (values.length === 0) {
    throw new Error('Knowledge Note requires source messages')
  }
  const normalized = values.map((value) =>
    requiredText(value, 'Knowledge Note source message id is invalid')
  )
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Knowledge Note source messages must be unique')
  }
  return normalized
}

function requiredText(value: string, message: string): string {
  const normalized = value.trim().replace(/\r\n?/g, '\n')
  if (!normalized) throw new Error(message)
  return normalized
}

function validateTime(at: number): void {
  if (!Number.isSafeInteger(at) || at < 0) {
    throw new Error('Knowledge Note timestamp is invalid')
  }
}

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')}`
}
