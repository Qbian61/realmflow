import { randomUUID } from 'node:crypto'
import {
  createKnowledgeSource,
  type KnowledgeSource,
  type KnowledgeSourceErrorCode,
  type KnowledgeSourceOperation,
  type KnowledgeSourceStatus
} from '../../../../domain/knowledge-source'
import type {
  LocalFileSource,
  LocalFileSourceView
} from '../../../../domain/local-file-source'
import type { WorkspaceRepository } from '../ports/business-repositories'
import type {
  LocalFileIngestionStore,
  LocalFileRefreshResult
} from './local-file-ingestion-store'

export type KnowledgeSourceTrigger = 'user' | 'ingestion' | 'recovery'

export type KnowledgeSourceEvent = {
  id: string
  sourceId: string
  operation: 'register' | KnowledgeSourceOperation
  fromStatus?: KnowledgeSourceStatus
  toStatus: KnowledgeSourceStatus
  triggerSource: KnowledgeSourceTrigger
  idempotencyKey: string
  sourceRevision: number
  errorCode?: KnowledgeSourceErrorCode
  errorMessage?: string
  occurredAt: number
}

export type KnowledgeSourceWriteResult =
  | { status: 'applied' | 'replayed'; source: KnowledgeSource }
  | { status: 'idempotency_conflict' }
  | { status: 'revision_conflict'; current: KnowledgeSource }
  | { status: 'not_found' }

export type KnowledgeSourceTransitionInput = {
  sourceId: string
  expectedRevision: number
  operation: KnowledgeSourceOperation
  eventId: string
  idempotencyKey: string
  triggerSource: KnowledgeSourceTrigger
  at: number
  errorCode?: KnowledgeSourceErrorCode
}

export interface KnowledgeSourceRepository {
  get(id: string): Promise<KnowledgeSource | undefined>
  listByWorkspace(workspaceId: string): Promise<KnowledgeSource[]>
  listEvents(sourceId: string): Promise<KnowledgeSourceEvent[]>
  register(input: {
    source: KnowledgeSource
    eventId: string
    idempotencyKey: string
    triggerSource: KnowledgeSourceTrigger
  }): Promise<KnowledgeSourceWriteResult>
  transition(
    input: KnowledgeSourceTransitionInput
  ): Promise<KnowledgeSourceWriteResult>
  recoverInterrupted(at: number): Promise<number>
}

type RegisterKnowledgeSourceCommand = {
  id: string
  workspaceId: string
  name: string
  type: KnowledgeSource['type']
  locator: string
  detail: string
  sortOrder: number
  idempotencyKey: string
}

type UserTransitionCommand = {
  id: string
  expectedRevision: number
  idempotencyKey: string
}

type IngestionTransitionCommand = UserTransitionCommand & {
  errorCode?: KnowledgeSourceErrorCode
}

type KnowledgeSourceServiceDependencies = {
  workspaces: WorkspaceRepository
  repository: KnowledgeSourceRepository
  localFiles: LocalFileIngestionStore
  now?: () => number
  createId?: () => string
}

export type RegisterLocalFilesCommand = {
  workspaceId: string
  items: Array<{
    id: string
    name: string
    detail: string
    sortOrder: number
    localFile: LocalFileSourceView
  }>
  idempotencyKey: string
  fingerprint: string
}

export class KnowledgeSourceService {
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly dependencies: KnowledgeSourceServiceDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId =
      dependencies.createId ??
      (() => `knowledge-source-event-${randomUUID()}`)
  }

  async register(
    command: RegisterKnowledgeSourceCommand
  ): Promise<KnowledgeSource> {
    validateStableId(command.id, 'Knowledge source id')
    validateStableId(command.workspaceId, 'Workspace id')
    validateIdempotencyKey(command.idempotencyKey)
    const name = command.name.trim()
    if (!name) throw new Error('Knowledge source name is required')
    const locator = command.locator.trim()
    if (!locator) throw new Error('Knowledge source locator is required')
    if (!(await this.dependencies.workspaces.get(command.workspaceId))) {
      throw new Error(`Workspace not found: ${command.workspaceId}`)
    }
    const at = this.now()
    return unwrapWriteResult(
      await this.dependencies.repository.register({
        source: createKnowledgeSource({
          id: command.id,
          workspaceId: command.workspaceId,
          name,
          type: command.type,
          locator,
          detail: command.detail.trim(),
          sortOrder: command.sortOrder,
          at
        }),
        eventId: this.createId(),
        idempotencyKey: command.idempotencyKey,
        triggerSource: 'user'
      })
    )
  }

  retry(command: UserTransitionCommand): Promise<KnowledgeSource> {
    return this.transition(command, 'retry_sync', 'user')
  }

  async registerLocalFiles(
    command: RegisterLocalFilesCommand
  ): Promise<KnowledgeSource[]> {
    validateStableId(command.workspaceId, 'Workspace id')
    validateIdempotencyKey(command.idempotencyKey)
    if (!(await this.dependencies.workspaces.get(command.workspaceId))) {
      throw new Error(`Workspace not found: ${command.workspaceId}`)
    }
    const at = this.now()
    const result = await this.dependencies.localFiles.registerLocalFileBatch({
      items: command.items.map((item) => {
        validateStableId(item.id, 'Knowledge source id')
        if (
          item.localFile.sourceId !== item.id ||
          item.localFile.workspaceId !== command.workspaceId
        ) {
          throw new Error('Local file source identity does not match')
        }
        return {
          source: createKnowledgeSource({
            id: item.id,
            workspaceId: command.workspaceId,
            name: item.name,
            type: 'file',
            locator: item.localFile.locator,
            detail: item.detail,
            sortOrder: item.sortOrder,
            at
          }),
          localFile: item.localFile,
          eventId: this.createId()
        }
      }),
      idempotencyKey: command.idempotencyKey,
      fingerprint: command.fingerprint,
      at
    })
    if (result.status === 'idempotency_conflict') {
      throw new Error('Knowledge source idempotency conflict')
    }
    return result.sources
  }

  getLocalFileSource(sourceId: string): Promise<LocalFileSource | undefined> {
    validateStableId(sourceId, 'Knowledge source id')
    return this.dependencies.localFiles.getLocalFileSource(sourceId)
  }

  listLocalFileSources(): Promise<LocalFileSource[]> {
    return this.dependencies.localFiles.listLocalFileSources()
  }

  async refreshLocalFile(command: {
    sourceId: string
    expectedRevision: number
    localFile: LocalFileSource
    idempotencyKey: string
  }): Promise<{ source: KnowledgeSource; contentChanged: boolean }> {
    validateStableId(command.sourceId, 'Knowledge source id')
    validateIdempotencyKey(command.idempotencyKey)
    if (
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 1
    ) {
      throw new Error('Knowledge source revision is invalid')
    }
    return unwrapLocalFileRefresh(
      await this.dependencies.localFiles.refreshLocalFile({
        ...command,
        eventId: this.createId(),
        at: this.now()
      })
    )
  }

  remove(command: UserTransitionCommand): Promise<KnowledgeSource> {
    return this.transition(command, 'remove', 'user')
  }

  startSync(command: UserTransitionCommand): Promise<KnowledgeSource> {
    return this.transition(command, 'start_sync', 'ingestion')
  }

  completeIndex(command: UserTransitionCommand): Promise<KnowledgeSource> {
    return this.transition(command, 'complete_index', 'ingestion')
  }

  markStale(command: UserTransitionCommand): Promise<KnowledgeSource> {
    return this.transition(command, 'mark_stale', 'ingestion')
  }

  failSync(command: IngestionTransitionCommand): Promise<KnowledgeSource> {
    return this.transition(
      command,
      'fail_sync',
      'ingestion',
      command.errorCode
    )
  }

  list(query: { workspaceId: string }): Promise<KnowledgeSource[]> {
    validateStableId(query.workspaceId, 'Workspace id')
    return this.dependencies.repository.listByWorkspace(query.workspaceId)
  }

  listEvents(query: { sourceId: string }): Promise<KnowledgeSourceEvent[]> {
    validateStableId(query.sourceId, 'Knowledge source id')
    return this.dependencies.repository.listEvents(query.sourceId)
  }

  recoverInterrupted(): Promise<number> {
    return this.dependencies.repository.recoverInterrupted(this.now())
  }

  private async transition(
    command: UserTransitionCommand,
    operation: KnowledgeSourceOperation,
    triggerSource: KnowledgeSourceTrigger,
    errorCode?: KnowledgeSourceErrorCode
  ): Promise<KnowledgeSource> {
    validateStableId(command.id, 'Knowledge source id')
    validateIdempotencyKey(command.idempotencyKey)
    if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 1) {
      throw new Error('Knowledge source revision is invalid')
    }
    return unwrapWriteResult(
      await this.dependencies.repository.transition({
        sourceId: command.id,
        expectedRevision: command.expectedRevision,
        operation,
        eventId: this.createId(),
        idempotencyKey: command.idempotencyKey,
        triggerSource,
        at: this.now(),
        ...(errorCode ? { errorCode } : {})
      })
    )
  }
}

function unwrapLocalFileRefresh(
  result: LocalFileRefreshResult
): { source: KnowledgeSource; contentChanged: boolean } {
  if (result.status === 'applied' || result.status === 'replayed') {
    return {
      source: result.source,
      contentChanged: result.contentChanged
    }
  }
  if (result.status === 'revision_conflict') {
    throw new Error('Knowledge source revision conflict')
  }
  if (result.status === 'not_found') {
    throw new Error('Knowledge source not found')
  }
  throw new Error('Knowledge source idempotency conflict')
}

function unwrapWriteResult(result: KnowledgeSourceWriteResult): KnowledgeSource {
  if (result.status === 'applied' || result.status === 'replayed') {
    return result.source
  }
  if (result.status === 'revision_conflict') {
    throw new Error('Knowledge source revision conflict')
  }
  if (result.status === 'not_found') {
    throw new Error('Knowledge source not found')
  }
  throw new Error('Knowledge source idempotency conflict')
}

function validateStableId(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error(`${label} is invalid`)
  }
}

function validateIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error('Knowledge source idempotency key is invalid')
  }
}
