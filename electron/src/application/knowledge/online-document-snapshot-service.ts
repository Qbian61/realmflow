import { createHash, randomUUID } from 'node:crypto'
import { createKnowledgeSource } from '../../../../domain/knowledge-source'
import {
  createOnlineDocumentSnapshot,
  createOnlineDocumentSource,
  type OnlineDocumentSnapshot,
  type OnlineDocumentSource
} from '../../../../domain/online-document'
import type { ConnectorResponse } from '../../network/network-gateway'
import type { WorkspaceRepository } from '../ports/business-repositories'
import type {
  ConnectorRecord
} from '../connectors/connector-store'
import type {
  InvokeConnectorCommand
} from '../connectors/connector-service'
import type {
  OnlineDocumentBeginResult,
  OnlineDocumentCompletionResult,
  OnlineDocumentStore,
  OnlineDocumentSyncResult
} from './online-document-store'

type ConnectorPort = {
  get(id: string): Promise<ConnectorRecord>
  invoke(command: InvokeConnectorCommand): Promise<ConnectorResponse>
}

type OnlineDocumentSnapshotServiceDependencies = {
  workspaces: Pick<WorkspaceRepository, 'get'>
  connectors: ConnectorPort
  store: OnlineDocumentStore
  now?: () => number
  createId?: (kind: 'event' | 'snapshot') => string
}

export type CreateOnlineDocumentCommand = {
  id: string
  workspaceId: string
  name: string
  connectorId: string
  path: string
  sortOrder: number
  idempotencyKey: string
}

export type SyncOnlineDocumentCommand = {
  sourceId: string
  expectedRevision: number
  idempotencyKey: string
}

type InFlight = {
  fingerprint: string
  promise: Promise<OnlineDocumentSyncResult>
}

export class OnlineDocumentSnapshotService {
  private readonly now: () => number
  private readonly createId: (kind: 'event' | 'snapshot') => string
  private readonly inFlight = new Map<string, InFlight>()
  private readonly probedResponses = new Map<
    string,
    { idempotencyKey: string; response: ConnectorResponse }
  >()

  constructor(
    private readonly dependencies: OnlineDocumentSnapshotServiceDependencies
  ) {
    this.now = dependencies.now ?? Date.now
    this.createId =
      dependencies.createId ??
      ((kind) => `online-document-${kind}-${randomUUID()}`)
  }

  async create(
    command: CreateOnlineDocumentCommand
  ): Promise<OnlineDocumentSyncResult> {
    validateId(command.id, 'Online document id')
    validateId(command.workspaceId, 'Workspace id')
    validateId(command.connectorId, 'Connector id')
    validateIdempotencyKey(command.idempotencyKey)
    const name = command.name.trim()
    if (!name) throw new Error('Online document name is required')
    if (!Number.isSafeInteger(command.sortOrder)) {
      throw new Error('Online document sort order is invalid')
    }
    const at = this.now()
    const document = createOnlineDocumentSource({
      sourceId: command.id,
      workspaceId: command.workspaceId,
      connectorId: command.connectorId,
      path: command.path,
      at
    })
    if (!(await this.dependencies.workspaces.get(command.workspaceId))) {
      throw new Error(`Workspace not found: ${command.workspaceId}`)
    }
    await this.requireAvailableConnector(command.connectorId)
    const fingerprint = hashCommand({
      kind: 'create_online_document',
      id: command.id,
      workspaceId: command.workspaceId,
      name,
      connectorId: command.connectorId,
      path: document.path,
      sortOrder: command.sortOrder
    })
    return this.singleFlight(command.idempotencyKey, fingerprint, async () => {
      const begin = await this.dependencies.store.beginOnlineDocumentCreate({
        source: createKnowledgeSource({
          id: command.id,
          workspaceId: command.workspaceId,
          name,
          type: 'document',
          locator: document.locator,
          detail: command.connectorId,
          sortOrder: command.sortOrder,
          at
        }),
        document,
        registerEventId: this.createId('event'),
        startEventId: this.createId('event'),
        idempotencyKey: command.idempotencyKey,
        fingerprint,
        at
      })
      return this.continueSync(begin, command.idempotencyKey)
    })
  }

  async sync(
    command: SyncOnlineDocumentCommand
  ): Promise<OnlineDocumentSyncResult> {
    validateId(command.sourceId, 'Online document id')
    validateRevision(command.expectedRevision)
    validateIdempotencyKey(command.idempotencyKey)
    const document = await this.dependencies.store.getOnlineDocumentSource(
      command.sourceId
    )
    if (!document) throw new Error('Online document not found')
    if (!(await this.dependencies.workspaces.get(document.workspaceId))) {
      throw new Error(`Workspace not found: ${document.workspaceId}`)
    }
    await this.requireAvailableConnector(document.connectorId)
    const fingerprint = hashCommand({
      kind: 'sync_online_document',
      sourceId: command.sourceId,
      expectedRevision: command.expectedRevision
    })
    return this.singleFlight(command.idempotencyKey, fingerprint, async () => {
      const begin = await this.dependencies.store.beginOnlineDocumentSync({
        sourceId: command.sourceId,
        expectedRevision: command.expectedRevision,
        eventId: this.createId('event'),
        idempotencyKey: command.idempotencyKey,
        fingerprint,
        at: this.now()
      })
      return this.continueSync(begin, command.idempotencyKey)
    })
  }

  async probe(
    sourceId: string,
    idempotencyKey: string
  ): Promise<
    { status: 'unchanged'; checksum: string } | { status: 'changed' }
  > {
    validateId(sourceId, 'Online document id')
    validateIdempotencyKey(idempotencyKey)
    const document =
      await this.dependencies.store.getOnlineDocumentSource(sourceId)
    if (!document) throw new Error('Online document not found')
    const current =
      await this.dependencies.store.getCurrentOnlineDocumentSnapshot(sourceId)
    if (!current) return { status: 'changed' }
    if (!(await this.dependencies.workspaces.get(document.workspaceId))) {
      throw new Error(`Workspace not found: ${document.workspaceId}`)
    }
    await this.requireAvailableConnector(document.connectorId)
    const headers = {
      ...(current.etag ? { 'If-None-Match': current.etag } : {}),
      ...(current.lastModified
        ? { 'If-Modified-Since': current.lastModified }
        : {})
    }
    const response = await this.dependencies.connectors.invoke({
      connectorId: document.connectorId,
      allowedConnectorIds: [document.connectorId],
      purpose: 'online_document',
      path: document.path,
      method: 'GET',
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      acceptedStatuses: [304],
      workspaceId: document.workspaceId,
      idempotencyKey: `${idempotencyKey}:probe`,
      owner: { type: 'knowledge_source', id: document.sourceId }
    })
    if (response.status === 304) {
      this.probedResponses.delete(sourceId)
      return { status: 'unchanged', checksum: current.contentChecksum }
    }
    const candidate = createOnlineDocumentSnapshot({
      id: this.createId('snapshot'),
      sourceId,
      version: current.version + 1,
      body: response.body,
      mediaType: response.headers['content-type'] ?? '',
      ...(response.headers.etag ? { etag: response.headers.etag } : {}),
      ...(response.headers['last-modified']
        ? { lastModified: response.headers['last-modified'] }
        : {}),
      fetchedAt: this.now()
    })
    if (candidate.contentChecksum === current.contentChecksum) {
      this.probedResponses.delete(sourceId)
      return { status: 'unchanged', checksum: current.contentChecksum }
    }
    this.probedResponses.set(sourceId, { idempotencyKey, response })
    return { status: 'changed' }
  }

  async get(sourceId: string): Promise<{
    document: OnlineDocumentSource
    snapshot?: OnlineDocumentSnapshot
  }> {
    validateId(sourceId, 'Online document id')
    const document = await this.dependencies.store.getOnlineDocumentSource(
      sourceId
    )
    if (!document) throw new Error('Online document not found')
    const snapshot =
      await this.dependencies.store.getCurrentOnlineDocumentSnapshot(sourceId)
    return { document, ...(snapshot ? { snapshot } : {}) }
  }

  private async continueSync(
    begin: OnlineDocumentBeginResult,
    idempotencyKey: string
  ): Promise<OnlineDocumentSyncResult> {
    if (begin.status !== 'started') return unwrapBegin(begin)
    let response: ConnectorResponse
    try {
      const probed = this.probedResponses.get(begin.source.id)
      if (probed?.idempotencyKey === idempotencyKey) {
        this.probedResponses.delete(begin.source.id)
        response = probed.response
      } else {
        response = await this.dependencies.connectors.invoke({
          connectorId: begin.document.connectorId,
          allowedConnectorIds: [begin.document.connectorId],
          purpose: 'online_document',
          path: begin.document.path,
          method: 'GET',
          workspaceId: begin.document.workspaceId,
          idempotencyKey: `${idempotencyKey}:fetch`,
          owner: { type: 'knowledge_source', id: begin.source.id }
        })
      }
    } catch {
      return this.fail(
        begin.source.id,
        begin.source.revision,
        idempotencyKey,
        'connector_unavailable'
      )
    }

    let snapshot
    try {
      snapshot = createOnlineDocumentSnapshot({
        id: this.createId('snapshot'),
        sourceId: begin.source.id,
        version: begin.nextVersion,
        body: response.body,
        mediaType: response.headers['content-type'] ?? '',
        ...(response.headers.etag ? { etag: response.headers.etag } : {}),
        ...(response.headers['last-modified']
          ? { lastModified: response.headers['last-modified'] }
          : {}),
        fetchedAt: this.now()
      })
    } catch {
      return this.fail(
        begin.source.id,
        begin.source.revision,
        idempotencyKey,
        'unsupported_format'
      )
    }
    return unwrapCompletion(
      await this.dependencies.store.completeOnlineDocumentSync({
        sourceId: begin.source.id,
        expectedRevision: begin.source.revision,
        snapshot,
        eventId: this.createId('event'),
        idempotencyKey,
        at: this.now()
      })
    )
  }

  private async fail(
    sourceId: string,
    expectedRevision: number,
    idempotencyKey: string,
    errorCode: 'connector_unavailable' | 'unsupported_format'
  ): Promise<OnlineDocumentSyncResult> {
    return unwrapCompletion(
      await this.dependencies.store.failOnlineDocumentSync({
        sourceId,
        expectedRevision,
        errorCode,
        eventId: this.createId('event'),
        idempotencyKey,
        at: this.now()
      })
    )
  }

  private async requireAvailableConnector(id: string): Promise<ConnectorRecord> {
    const record = await this.dependencies.connectors.get(id)
    if (!record.connector.enabled) throw new Error('Connector is disabled')
    if (
      record.connector.authentication.type !== 'none' &&
      !record.hasCredential
    ) {
      throw new Error('Connector credential is unavailable')
    }
    return record
  }

  private singleFlight(
    idempotencyKey: string,
    fingerprint: string,
    execute: () => Promise<OnlineDocumentSyncResult>
  ): Promise<OnlineDocumentSyncResult> {
    const current = this.inFlight.get(idempotencyKey)
    if (current) {
      if (current.fingerprint !== fingerprint) {
        return Promise.reject(new Error('Online document idempotency conflict'))
      }
      return current.promise
    }
    const promise = execute().finally(() => {
      if (this.inFlight.get(idempotencyKey)?.promise === promise) {
        this.inFlight.delete(idempotencyKey)
      }
    })
    this.inFlight.set(idempotencyKey, { fingerprint, promise })
    return promise
  }
}

function unwrapBegin(
  result: Exclude<OnlineDocumentBeginResult, { status: 'started' }>
): OnlineDocumentSyncResult {
  if (result.status === 'replayed') return result.result
  if (result.status === 'revision_conflict') {
    throw new Error('Online document revision conflict')
  }
  if (result.status === 'not_found') {
    throw new Error('Online document not found')
  }
  throw new Error('Online document idempotency conflict')
}

function unwrapCompletion(
  result: OnlineDocumentCompletionResult
): OnlineDocumentSyncResult {
  if (result.status === 'applied' || result.status === 'replayed') {
    return result.result
  }
  if (result.status === 'revision_conflict') {
    throw new Error('Online document revision conflict')
  }
  if (result.status === 'not_found') {
    throw new Error('Online document not found')
  }
  throw new Error('Online document idempotency conflict')
}

function validateId(value: string, label: string): void {
  if (!value.trim() || value.length > 200) throw new Error(`${label} is invalid`)
}

function validateIdempotencyKey(value: string): void {
  if (!value.trim() || value.length > 200) {
    throw new Error('Idempotency key is invalid')
  }
}

function validateRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Online document revision is invalid')
  }
}

function hashCommand(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
