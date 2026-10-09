import { randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import { posix } from 'node:path'
import type { KnowledgeSource } from '../../../../domain/knowledge-source'
import {
  createRepositorySource,
  normalizeRepositoryBranch,
  parseRemoteRepositoryManifest,
  type RepositoryBranch,
  type RemoteRepositorySource,
  type RepositorySnapshot,
  type RepositorySource
} from '../../../../domain/repository-source'
import type { WorkspaceBinding } from '../../../../shared/workspace'
import { SecurePathService } from '../../workspace/secure-path-service'
import type { ConnectorRecord } from '../connectors/connector-store'
import type { InvokeConnectorCommand } from '../connectors/connector-service'
import type { WorkspaceRepository } from '../ports/business-repositories'
import type { ConnectorResponse } from '../../network/network-gateway'
import type {
  RepositoryBeginResult,
  RepositoryCompletionResult,
  RepositoryIngestionStore,
  RepositorySyncResult
} from './repository-ingestion-store'
import {
  createRepositoryKnowledgeSource,
  errorCodeForRepositoryFailure,
  repositoryFingerprint,
  unwrapRepositoryBegin,
  unwrapRepositoryCompletion,
  validateRepositoryCreateCommand,
  validateRepositoryId,
  validateRepositoryIdempotencyKey,
  validateRepositoryRevision
} from './repository-ingestion-support'
import {
  RepositoryMaterializer,
  type PreparedRepositoryMaterialization
} from './repository-materializer'
import { RepositoryScanner } from './repository-scanner'

type ConnectorPort = {
  get(id: string): Promise<ConnectorRecord>
  invoke(command: InvokeConnectorCommand): Promise<ConnectorResponse>
}

type KnowledgeSourceRemovalPort = {
  remove(command: {
    id: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<KnowledgeSource>
}

type RepositoryIngestionServiceDependencies = {
  workspaces: Pick<WorkspaceRepository, 'get' | 'list'>
  workspaceFiles: {
    getSessionDirectoryBinding(
      selectionId: string
    ): Promise<WorkspaceBinding | null>
  }
  connectors: ConnectorPort
  store: RepositoryIngestionStore
  knowledgeSources: KnowledgeSourceRemovalPort
  scanner?: RepositoryScanner
  materializer?: RepositoryMaterializer
  securePaths?: SecurePathService
  now?: () => number
  createId?: (kind: 'event' | 'snapshot') => string
}

export type IngestLocalRepositoryCommand = {
  id: string
  workspaceId: string
  selectionId: string
  selectedBranch: string
  name: string
  sortOrder: number
  idempotencyKey: string
}

export type IngestRemoteRepositoryCommand = {
  id: string
  workspaceId: string
  name: string
  connectorId: string
  path: string
  selectedBranch: string
  sortOrder: number
  idempotencyKey: string
}

export type RefreshRepositoryCommand = {
  sourceId: string
  expectedRevision: number
  idempotencyKey: string
}

export type ListRepositoryBranchesCommand =
  | { sourceId: string }
  | { mode: 'local'; selectionId: string }
  | { mode: 'remote'; connectorId: string; path: string; workspaceId: string }

export type UpdateRepositoryBranchCommand = RefreshRepositoryCommand & {
  branch: string
}

type InFlight = {
  fingerprint: string
  promise: Promise<RepositorySyncResult>
}

export class RepositoryIngestionService {
  private readonly scanner: RepositoryScanner
  private readonly materializer: RepositoryMaterializer
  private readonly securePaths: SecurePathService
  private readonly now: () => number
  private readonly createId: (kind: 'event' | 'snapshot') => string
  private readonly inFlight = new Map<string, InFlight>()
  private readonly probedResponses = new Map<
    string,
    { idempotencyKey: string; response: ConnectorResponse }
  >()

  constructor(
    private readonly dependencies: RepositoryIngestionServiceDependencies
  ) {
    this.scanner = dependencies.scanner ?? new RepositoryScanner()
    this.materializer =
      dependencies.materializer ?? new RepositoryMaterializer()
    this.securePaths = dependencies.securePaths ?? new SecurePathService()
    this.now = dependencies.now ?? Date.now
    this.createId =
      dependencies.createId ??
      ((kind) => `repository-${kind}-${randomUUID()}`)
  }

  ingestLocal(
    command: IngestLocalRepositoryCommand
  ): Promise<RepositorySyncResult> {
    validateRepositoryCreateCommand(command)
    validateRepositoryId(command.selectionId, 'Repository selection id')
    const normalized = { ...command, name: command.name.trim() }
    return this.singleFlight(
      command.idempotencyKey,
      repositoryFingerprint({ kind: 'ingest_local_repository', ...normalized }),
      async () => {
        await this.requireWorkspace(command.workspaceId)
        const binding =
          await this.dependencies.workspaceFiles.getSessionDirectoryBinding(
            command.selectionId
          )
        if (!binding) {
          throw new Error('Repository selection is no longer available')
        }
        await this.scanner.validate(binding.rootPath)
        const at = this.now()
        const repository = createRepositorySource({
          sourceId: command.id,
          workspaceId: command.workspaceId,
          mode: 'local',
          localPath: binding.rootPath,
          selectedBranch: command.selectedBranch,
          at
        })
        const begin = await this.dependencies.store.beginRepositoryCreate({
          source: createRepositoryKnowledgeSource(
            repository,
            normalized.name,
            command.sortOrder,
            at
          ),
          repository,
          registerEventId: this.createId('event'),
          startEventId: this.createId('event'),
          idempotencyKey: command.idempotencyKey,
          fingerprint: repositoryFingerprint({
            kind: 'ingest_local_repository',
            id: command.id,
            workspaceId: command.workspaceId,
            localPath: binding.rootPath,
            name: normalized.name,
            sortOrder: command.sortOrder
          }),
          at
        })
        return this.continueSync(begin, command.idempotencyKey)
      }
    )
  }

  ingestRemote(
    command: IngestRemoteRepositoryCommand
  ): Promise<RepositorySyncResult> {
    validateRepositoryCreateCommand(command)
    validateRepositoryId(command.connectorId, 'Connector id')
    const at = this.now()
    const createdRepository = createRepositorySource({
      sourceId: command.id,
      workspaceId: command.workspaceId,
      mode: 'remote',
      connectorId: command.connectorId,
      path: command.path,
      selectedBranch: command.selectedBranch,
      managedRelativePath: posix.join(
        '.realmflow',
        'knowledge',
        'repositories',
        command.id
      ),
      at
    })
    if (createdRepository.mode !== 'remote') {
      throw new Error('Remote repository configuration is invalid')
    }
    const repository = createdRepository
    const normalized = {
      ...command,
      name: command.name.trim(),
      path: repository.path
    }
    return this.singleFlight(
      command.idempotencyKey,
      repositoryFingerprint({ kind: 'ingest_remote_repository', ...normalized }),
      async () => {
        await this.requireWorkspace(command.workspaceId)
        await this.requireAvailableConnector(command.connectorId)
        const begin = await this.dependencies.store.beginRepositoryCreate({
          source: createRepositoryKnowledgeSource(
            repository,
            normalized.name,
            command.sortOrder,
            at
          ),
          repository,
          registerEventId: this.createId('event'),
          startEventId: this.createId('event'),
          idempotencyKey: command.idempotencyKey,
          fingerprint: repositoryFingerprint({
            kind: 'ingest_remote_repository',
            id: command.id,
            workspaceId: command.workspaceId,
            name: normalized.name,
            connectorId: command.connectorId,
            path: repository.path,
            sortOrder: command.sortOrder
          }),
          at
        })
        return this.continueSync(begin, command.idempotencyKey)
      }
    )
  }

  refresh(command: RefreshRepositoryCommand): Promise<RepositorySyncResult> {
    validateRepositoryId(command.sourceId, 'Repository source id')
    validateRepositoryRevision(command.expectedRevision)
    validateRepositoryIdempotencyKey(command.idempotencyKey)
    const commandFingerprint = repositoryFingerprint({
      kind: 'refresh_repository',
      ...command
    })
    return this.singleFlight(
      command.idempotencyKey,
      commandFingerprint,
      async () => {
        const repository = await this.dependencies.store.getRepositorySource(
          command.sourceId
        )
        if (!repository) throw new Error('Repository source not found')
        await this.requireWorkspace(repository.workspaceId)
        const begin = await this.dependencies.store.beginRepositorySync({
          sourceId: command.sourceId,
          expectedRevision: command.expectedRevision,
          eventId: this.createId('event'),
          idempotencyKey: command.idempotencyKey,
          fingerprint: commandFingerprint,
          at: this.now()
        })
        return this.continueSync(begin, command.idempotencyKey)
      }
    )
  }

  async listBranches(
    command: ListRepositoryBranchesCommand
  ): Promise<RepositoryBranch[]> {
    if ('sourceId' in command) {
      validateRepositoryId(command.sourceId, 'Repository source id')
      const repository =
        await this.dependencies.store.getRepositorySource(command.sourceId)
      if (!repository) throw new Error('Repository source not found')
      if (repository.mode === 'local') {
        return this.scanner.listBranches(repository.localPath)
      }
      return this.listRemoteBranches({
        connectorId: repository.connectorId,
        path: repository.path,
        workspaceId: repository.workspaceId
      })
    }
    if (command.mode === 'local') {
      validateRepositoryId(command.selectionId, 'Repository selection id')
      const binding =
        await this.dependencies.workspaceFiles.getSessionDirectoryBinding(
          command.selectionId
        )
      if (!binding) {
        throw new Error('Repository selection is no longer available')
      }
      return this.scanner.listBranches(binding.rootPath)
    }
    return this.listRemoteBranches(command)
  }

  private async listRemoteBranches(command: {
    connectorId: string
    path: string
    workspaceId: string
  }): Promise<RepositoryBranch[]> {
    validateRepositoryId(command.connectorId, 'Connector id')
    await this.requireWorkspace(command.workspaceId)
    await this.requireAvailableConnector(command.connectorId)
    const response = await this.dependencies.connectors.invoke({
      connectorId: command.connectorId,
      allowedConnectorIds: [command.connectorId],
      purpose: 'remote_repository',
      path: command.path,
      method: 'GET',
      headers: {
        Accept: 'application/vnd.realmflow.repository-branches+json'
      },
      workspaceId: command.workspaceId,
      idempotencyKey: `repository-branches:${command.connectorId}:${command.path}`,
      owner: { type: 'workspace', id: command.workspaceId }
    })
    return parseRemoteBranches(response)
  }

  updateBranch(
    command: UpdateRepositoryBranchCommand
  ): Promise<RepositorySyncResult> {
    validateRepositoryId(command.sourceId, 'Repository source id')
    validateRepositoryRevision(command.expectedRevision)
    validateRepositoryIdempotencyKey(command.idempotencyKey)
    const branch = normalizeRepositoryBranch(command.branch)
    const fingerprint = repositoryFingerprint({
      kind: 'update_repository_branch',
      ...command,
      branch
    })
    return this.singleFlight(command.idempotencyKey, fingerprint, async () => {
      const repository =
        await this.dependencies.store.getRepositorySource(command.sourceId)
      if (!repository) throw new Error('Repository source not found')
      await this.requireWorkspace(repository.workspaceId)
      const begin = await this.dependencies.store.beginRepositorySync({
        sourceId: command.sourceId,
        expectedRevision: command.expectedRevision,
        eventId: this.createId('event'),
        idempotencyKey: command.idempotencyKey,
        fingerprint,
        at: this.now()
      })
      return this.continueSync(begin, command.idempotencyKey, branch)
    })
  }

  async probe(
    sourceId: string,
    idempotencyKey: string
  ): Promise<
    { status: 'unchanged'; checksum: string } | { status: 'changed' }
  > {
    validateRepositoryId(sourceId, 'Repository source id')
    validateRepositoryIdempotencyKey(idempotencyKey)
    const repository =
      await this.dependencies.store.getRepositorySource(sourceId)
    if (!repository) throw new Error('Repository source not found')
    const current =
      await this.dependencies.store.getCurrentRepositorySnapshot(sourceId)
    if (!current) return { status: 'changed' }
    if (repository.mode === 'local') {
      const probe = await this.scanner.probe(repository.localPath)
      return probe.clean && probe.revisionLabel === current.revisionLabel
        ? { status: 'unchanged', checksum: current.manifestChecksum }
        : { status: 'changed' }
    }
    await this.requireWorkspace(repository.workspaceId)
    await this.requireAvailableConnector(repository.connectorId)
    const response = await this.dependencies.connectors.invoke({
      connectorId: repository.connectorId,
      allowedConnectorIds: [repository.connectorId],
      purpose: 'remote_repository',
      path: repository.path,
      method: 'GET',
      workspaceId: repository.workspaceId,
      idempotencyKey: `${idempotencyKey}:probe`,
      owner: { type: 'knowledge_source', id: repository.sourceId }
    })
    const manifest = parseRemoteRepositoryManifest({
      mediaType: response.headers['content-type'] ?? '',
      body: response.body
    })
    if (manifest.revision === current.revisionLabel) {
      this.probedResponses.delete(sourceId)
      return { status: 'unchanged', checksum: current.manifestChecksum }
    }
    this.probedResponses.set(sourceId, { idempotencyKey, response })
    return { status: 'changed' }
  }

  async get(sourceId: string): Promise<{
    repository: RepositorySource
    snapshot?: RepositorySyncResult['snapshot']
  }> {
    validateRepositoryId(sourceId, 'Repository source id')
    const repository =
      await this.dependencies.store.getRepositorySource(sourceId)
    if (!repository) throw new Error('Repository source not found')
    const snapshot =
      await this.dependencies.store.getCurrentRepositorySnapshot(sourceId)
    return { repository, ...(snapshot ? { snapshot } : {}) }
  }

  async remove(command: {
    sourceId: string
    expectedRevision: number
    idempotencyKey: string
  }): Promise<KnowledgeSource> {
    validateRepositoryId(command.sourceId, 'Repository source id')
    validateRepositoryRevision(command.expectedRevision)
    validateRepositoryIdempotencyKey(command.idempotencyKey)
    const repository =
      await this.dependencies.store.getRepositorySource(command.sourceId)
    if (!repository) throw new Error('Repository source not found')
    const removed = await this.dependencies.knowledgeSources.remove({
      id: command.sourceId,
      expectedRevision: command.expectedRevision,
      idempotencyKey: command.idempotencyKey
    })
    if (repository.mode === 'remote') {
      const workspace = await this.requireWorkspace(repository.workspaceId)
      const managedPath = (
        await this.securePaths.resolvePathForCreation(
          workspace.path,
          repository.managedRelativePath
        )
      ).targetPath
      await rm(managedPath, { recursive: true, force: true })
    }
    return removed
  }

  async recover(): Promise<number> {
    const repositories = await this.dependencies.store.listRepositorySources()
    const referenced = new Map<string, Set<string>>()
    for (const repository of repositories) {
      if (repository.mode !== 'remote') continue
      const ids = referenced.get(repository.workspaceId) ?? new Set<string>()
      ids.add(repository.sourceId)
      referenced.set(repository.workspaceId, ids)
    }

    let removedCount = 0
    for (const workspace of await this.dependencies.workspaces.list()) {
      let workspacePath: string
      try {
        workspacePath = await this.securePaths.canonicalizeDirectory(
          workspace.path
        )
      } catch {
        continue
      }
      const workspaceRepositories = repositories.filter(
        (repository): repository is RemoteRepositorySource =>
          repository.mode === 'remote' &&
          repository.workspaceId === workspace.id
      )
      if (
        await this.materializer.recoverWorkspace({
          workspacePath,
          repositories: workspaceRepositories
        })
      ) {
        removedCount += 1
      }
      const managedRoot = (
        await this.securePaths.resolvePathForCreation(
          workspacePath,
          '.realmflow/knowledge/repositories'
        )
      ).targetPath
      let entries
      try {
        entries = await readdir(managedRoot, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      const workspaceReferences = referenced.get(workspace.id) ?? new Set()
      for (const entry of entries) {
        if (!entry.isDirectory() || workspaceReferences.has(entry.name)) continue
        const orphanPath = (
          await this.securePaths.resolveExistingPath(managedRoot, entry.name)
        ).targetPath
        await rm(orphanPath, { recursive: true, force: true })
        removedCount += 1
      }
    }
    return removedCount
  }

  private async continueSync(
    begin: RepositoryBeginResult,
    idempotencyKey: string,
    branchOverride?: string
  ): Promise<RepositorySyncResult> {
    if (begin.status !== 'started') return unwrapRepositoryBegin(begin)
    if (begin.repository.mode === 'local') {
      try {
        const selectedBranch =
          branchOverride ?? begin.repository.selectedBranch
        const branch = selectedBranch === 'HEAD' ? undefined : selectedBranch
        const snapshot = branch
          ? await this.scanner.scanBranch(begin.repository.localPath, {
              sourceId: begin.source.id,
              version: begin.nextVersion,
              branch
            })
          : await this.scanner.scan(begin.repository.localPath, {
              sourceId: begin.source.id,
              version: begin.nextVersion
            })
        return unwrapRepositoryCompletion(
          await this.dependencies.store.completeRepositorySync({
            sourceId: begin.source.id,
            expectedRevision: begin.source.revision,
            snapshot,
            eventId: this.createId('event'),
            idempotencyKey,
            at: this.now()
          })
        )
      } catch (error) {
        return this.failStartedSync(begin, idempotencyKey, error)
      }
    }
    return this.syncRemote(begin, idempotencyKey, branchOverride)
  }

  private async syncRemote(
    begin: Extract<RepositoryBeginResult, { status: 'started' }>,
    idempotencyKey: string,
    branchOverride?: string
  ): Promise<RepositorySyncResult> {
    const repository = begin.repository as RemoteRepositorySource
    const selectedBranch = branchOverride ?? repository.selectedBranch
    const branch = selectedBranch === 'HEAD' ? undefined : selectedBranch
    let response: ConnectorResponse
    try {
      await this.requireAvailableConnector(repository.connectorId)
      const probed = this.probedResponses.get(repository.sourceId)
      if (probed?.idempotencyKey === idempotencyKey) {
        this.probedResponses.delete(repository.sourceId)
        response = probed.response
      } else {
        response = await this.dependencies.connectors.invoke({
          connectorId: repository.connectorId,
          allowedConnectorIds: [repository.connectorId],
          purpose: 'remote_repository',
          path: repository.path,
          method: 'GET',
          ...(branch
            ? { headers: { 'X-RealmFlow-Repository-Branch': branch } }
            : {}),
          workspaceId: repository.workspaceId,
          idempotencyKey: `${idempotencyKey}:fetch`,
          owner: { type: 'knowledge_source', id: repository.sourceId }
        })
      }
    } catch {
      return this.fail(
        begin,
        idempotencyKey,
        'connector_unavailable'
      )
    }

    let manifest
    try {
      manifest = parseRemoteRepositoryManifest({
        mediaType: response.headers['content-type'] ?? '',
        body: response.body
      })
    } catch {
      return this.fail(begin, idempotencyKey, 'unsupported_format')
    }

    const workspace = await this.requireWorkspace(repository.workspaceId)
    let prepared: PreparedRepositoryMaterialization | undefined
    let snapshot: RepositorySnapshot | undefined
    try {
      prepared = await this.materializer.prepare({
        workspacePath: workspace.path,
        repository,
        manifest
      })
      snapshot = await this.scanner.scan(prepared.stagingPath, {
        sourceId: repository.sourceId,
        version: begin.nextVersion,
        revisionLabel: manifest.revision,
        ...(branch ? { branch } : {})
      })
    } catch (error) {
      await prepared?.discard()
      return this.failStartedSync(begin, idempotencyKey, error)
    }
    if (!prepared || !snapshot) {
      throw new Error('Repository preparation did not complete')
    }

    let committed
    try {
      committed = await prepared.commit()
    } catch (error) {
      await prepared.discard()
      return this.failStartedSync(begin, idempotencyKey, error)
    }
    let result: RepositorySyncResult
    try {
      result = unwrapRepositoryCompletion(
        await this.dependencies.store.completeRepositorySync({
          sourceId: begin.source.id,
          expectedRevision: begin.source.revision,
          snapshot,
          eventId: this.createId('event'),
          idempotencyKey,
          at: this.now()
        })
      )
    } catch (error) {
      await committed.rollback()
      throw error
    }
    await committed.finalize()
    return result
  }

  private failStartedSync(
    begin: Extract<RepositoryBeginResult, { status: 'started' }>,
    idempotencyKey: string,
    error: unknown
  ): Promise<RepositorySyncResult> {
    return this.fail(
      begin,
      idempotencyKey,
      errorCodeForRepositoryFailure(error)
    )
  }

  private async fail(
    begin: Extract<RepositoryBeginResult, { status: 'started' }>,
    idempotencyKey: string,
    errorCode:
      | 'source_unavailable'
      | 'permission_denied'
      | 'unsupported_format'
      | 'connector_unavailable'
      | 'indexing_failed'
  ): Promise<RepositorySyncResult> {
    return unwrapRepositoryCompletion(
      await this.dependencies.store.failRepositorySync({
        sourceId: begin.source.id,
        expectedRevision: begin.source.revision,
        errorCode,
        eventId: this.createId('event'),
        idempotencyKey,
        at: this.now()
      })
    )
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await this.dependencies.workspaces.get(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    return workspace
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
    commandFingerprint: string,
    execute: () => Promise<RepositorySyncResult>
  ): Promise<RepositorySyncResult> {
    validateRepositoryIdempotencyKey(idempotencyKey)
    const current = this.inFlight.get(idempotencyKey)
    if (current) {
      if (current.fingerprint !== commandFingerprint) {
        return Promise.reject(new Error('Repository idempotency conflict'))
      }
      return current.promise
    }
    const promise = execute().finally(() => {
      if (this.inFlight.get(idempotencyKey)?.promise === promise) {
        this.inFlight.delete(idempotencyKey)
      }
    })
    this.inFlight.set(idempotencyKey, {
      fingerprint: commandFingerprint,
      promise
    })
    return promise
  }
}

function parseRemoteBranches(response: ConnectorResponse): RepositoryBranch[] {
  const mediaType =
    response.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/vnd.realmflow.repository-branches+json') {
    throw new Error('Remote repository branch list is invalid')
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body))
  } catch {
    throw new Error('Remote repository branch list is invalid')
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('branches' in value) ||
    !Array.isArray(value.branches)
  ) {
    throw new Error('Remote repository branch list is invalid')
  }
  const branches = value.branches.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      Object.keys(item).sort().join(',') !== 'current,name' ||
      !('name' in item) ||
      !('current' in item) ||
      typeof item.name !== 'string' ||
      typeof item.current !== 'boolean'
    ) {
      throw new Error('Remote repository branch list is invalid')
    }
    return {
      name: normalizeRepositoryBranch(item.name),
      current: item.current
    }
  })
  return branches.sort((left, right) => left.name.localeCompare(right.name))
}
