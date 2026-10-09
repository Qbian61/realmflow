import {
  archiveKnowledgeNote,
  createKnowledgeNote,
  editKnowledgeNote,
  selectKnowledgeNoteMessages,
  type KnowledgeNote,
  type KnowledgeNoteKind,
  type KnowledgeNoteMessage,
  type KnowledgeNoteVersion
} from '../../../../domain/knowledge-note'
import type {
  FrozenKnowledgeSourceSnapshot,
  KnowledgeIndexEnqueueResult
} from './knowledge-index-coordinator'

type KnowledgeNoteAggregate = Readonly<{
  note: KnowledgeNote
  currentVersion: KnowledgeNoteVersion
}>

type KnowledgeNoteWriteResult =
  | Readonly<{ status: 'applied'; value: KnowledgeNoteAggregate }>
  | Readonly<{ status: 'conflict'; current: KnowledgeNoteAggregate }>
  | Readonly<{ status: 'not_found' }>

export type KnowledgeNoteServiceDependencies = {
  sessions: {
    get(id: string): Promise<
      | {
          id: string
          workspaceId?: string
          requirementId?: string
          messages: ReadonlyArray<
            Omit<KnowledgeNoteMessage, 'sessionId'> & { sessionId?: string }
          >
        }
      | undefined
    >
  }
  repository: {
    create(input: {
      note: KnowledgeNote
      version: KnowledgeNoteVersion
    }): Promise<unknown>
    get(id: string): Promise<KnowledgeNoteAggregate | undefined>
    listActive(workspaceId: string): Promise<KnowledgeNoteAggregate[]>
    update(
      input: { note: KnowledgeNote; version: KnowledgeNoteVersion },
      expectedRevision: number
    ): Promise<KnowledgeNoteWriteResult>
    archive(
      note: KnowledgeNote,
      expectedRevision: number
    ): Promise<KnowledgeNoteWriteResult>
  }
  coordinator: {
    enqueueSnapshot(
      snapshot: FrozenKnowledgeSourceSnapshot,
      triggerSource: 'source_event'
    ): Promise<KnowledgeIndexEnqueueResult>
  }
  visibility: {
    hide(input: {
      scopeKind: 'workspace'
      scopeId: string
      sourceKind: KnowledgeNoteKind
      sourceId: string
    }): Promise<void>
  }
  now?: () => number
}

type CreateKnowledgeNoteCommand = {
  id: string
  versionId: string
  workspaceId: string
  sessionId: string
  sourceMessageIds: readonly string[]
  title: string
  content: string
}

export class KnowledgeNoteService {
  private readonly now: () => number

  constructor(private readonly dependencies: KnowledgeNoteServiceDependencies) {
    this.now = dependencies.now ?? Date.now
  }

  createConversationNote(command: CreateKnowledgeNoteCommand) {
    return this.create(command, 'conversation_note')
  }

  createDecisionNote(command: CreateKnowledgeNoteCommand) {
    return this.create(command, 'decision')
  }

  createRetrospectiveNote(command: CreateKnowledgeNoteCommand) {
    return this.create(command, 'retrospective')
  }

  listActive(workspaceId: string): Promise<KnowledgeNoteAggregate[]> {
    return this.dependencies.repository.listActive(workspaceId)
  }

  async edit(command: {
    noteId: string
    expectedRevision: number
    versionId: string
    title: string
    content: string
  }): Promise<KnowledgeNoteAggregate> {
    const current = await this.requireNote(command.noteId)
    assertRevision(current.note, command.expectedRevision)
    const edited = editKnowledgeNote({
      note: current.note,
      currentVersion: current.currentVersion,
      versionId: command.versionId,
      title: command.title,
      content: command.content,
      at: this.now()
    })
    const result = await this.dependencies.repository.update(
      edited,
      command.expectedRevision
    )
    const aggregate = unwrapWrite(result)
    await this.enqueue(aggregate)
    return aggregate
  }

  async archive(command: {
    noteId: string
    expectedRevision: number
  }): Promise<KnowledgeNoteAggregate> {
    const current = await this.requireNote(command.noteId)
    assertRevision(current.note, command.expectedRevision)
    const archived = archiveKnowledgeNote(current.note, this.now())
    const result = await this.dependencies.repository.archive(
      archived,
      command.expectedRevision
    )
    const aggregate = unwrapWrite(result)
    await this.dependencies.visibility.hide({
      scopeKind: 'workspace',
      scopeId: aggregate.note.workspaceId,
      sourceKind: aggregate.note.kind,
      sourceId: aggregate.note.id
    })
    return aggregate
  }

  private async create(
    command: CreateKnowledgeNoteCommand,
    kind: KnowledgeNoteKind
  ): Promise<{ note: KnowledgeNote; version: KnowledgeNoteVersion }> {
    const session = await this.dependencies.sessions.get(command.sessionId)
    if (!session) throw new Error('Knowledge Note session not found')
    if (session.id !== command.sessionId) {
      throw new Error('Knowledge Note session identity does not match')
    }
    if (session.workspaceId && session.workspaceId !== command.workspaceId) {
      throw new Error('Knowledge Note workspace does not match its session')
    }
    selectKnowledgeNoteMessages({
      sessionId: command.sessionId,
      messageIds: command.sourceMessageIds,
      messages: session.messages.map((message) => ({
        ...message,
        sessionId: message.sessionId ?? session.id
      }))
    })
    const created = createKnowledgeNote({
      ...command,
      kind,
      ...(session.requirementId
        ? { requirementId: session.requirementId }
        : {}),
      at: this.now()
    })
    await this.dependencies.repository.create(created)
    await this.enqueue({
      note: created.note,
      currentVersion: created.version
    })
    return created
  }

  private async requireNote(noteId: string): Promise<KnowledgeNoteAggregate> {
    const current = await this.dependencies.repository.get(noteId)
    if (!current) throw new Error('Knowledge Note not found')
    return current
  }

  private enqueue(
    aggregate: KnowledgeNoteAggregate
  ): Promise<KnowledgeIndexEnqueueResult> {
    return this.dependencies.coordinator.enqueueSnapshot(
      toSnapshot(aggregate),
      'source_event'
    )
  }
}

function toSnapshot(
  aggregate: KnowledgeNoteAggregate
): FrozenKnowledgeSourceSnapshot {
  return {
    scopeKind: 'workspace',
    scopeId: aggregate.note.workspaceId,
    sourceKind: aggregate.note.kind,
    sourceId: aggregate.note.id,
    sourceRevision: aggregate.note.revision,
    sourceVersion: `knowledge-note:${aggregate.currentVersion.version}`,
    sourceChecksum: aggregate.currentVersion.checksum,
    documents: [
      {
        documentKey: 'knowledge-note.md',
        sourceEntityId: aggregate.note.id,
        ...(aggregate.note.requirementId
          ? { requirementId: aggregate.note.requirementId }
          : {}),
        ...(aggregate.note.sessionId
          ? { sessionId: aggregate.note.sessionId }
          : {}),
        title: aggregate.currentVersion.title,
        content: aggregate.currentVersion.content
      }
    ]
  }
}

function assertRevision(note: KnowledgeNote, expectedRevision: number): void {
  if (note.revision !== expectedRevision) {
    throw new Error('Knowledge Note revision conflict')
  }
}

function unwrapWrite(result: KnowledgeNoteWriteResult): KnowledgeNoteAggregate {
  if (result.status === 'applied') return result.value
  if (result.status === 'conflict') {
    throw new Error('Knowledge Note revision conflict')
  }
  throw new Error('Knowledge Note not found')
}
