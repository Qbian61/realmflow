import { describe, expect, it, vi } from 'vitest'
import { createLocalFileSource } from '../../../../domain/local-file-source'
import type { WorkspaceRepository } from '../ports/business-repositories'
import type { LocalFileIngestionStore } from './local-file-ingestion-store'
import {
  KnowledgeSourceService,
  type KnowledgeSourceRepository
} from './knowledge-source-service'

function dependencies(options?: {
  workspaceExists?: boolean
  result?: Awaited<ReturnType<KnowledgeSourceRepository['transition']>>
}) {
  const workspaces = {
    get: vi.fn(async () =>
      options?.workspaceExists === false
        ? undefined
        : ({ id: 'space-1', revision: 1 } as never)
    )
  } as unknown as WorkspaceRepository
  const source = {
    id: 'source-1',
    workspaceId: 'space-1',
    name: 'Architecture',
    type: 'document' as const,
    locator: 'https://example.com/architecture',
    detail: 'example.com',
    sortOrder: 0,
    status: 'failed' as const,
    errorCode: 'source_unavailable' as const,
    errorMessage: '无法读取知识源',
    revision: 2,
    createdAt: 10,
    updatedAt: 20
  }
  const repository = {
    get: vi.fn<KnowledgeSourceRepository['get']>(async () => source),
    listByWorkspace: vi.fn<KnowledgeSourceRepository['listByWorkspace']>(
      async () => [source]
    ),
    listEvents: vi.fn<KnowledgeSourceRepository['listEvents']>(async () => []),
    register: vi.fn<KnowledgeSourceRepository['register']>(
      async ({ source: next }) => ({
      status: 'applied' as const,
      source: next
      })
    ),
    transition: vi.fn<KnowledgeSourceRepository['transition']>(async () =>
      options?.result ?? {
        status: 'applied' as const,
        source: { ...source, status: 'syncing' as const, revision: 3 }
      }
    ),
    recoverInterrupted: vi.fn<KnowledgeSourceRepository['recoverInterrupted']>(
      async () => 1
    )
  } satisfies KnowledgeSourceRepository
  const localFiles = {
    registerLocalFileBatch: vi.fn<
      LocalFileIngestionStore['registerLocalFileBatch']
    >(async ({ items }) => ({
      status: 'applied',
      sources: items.map(({ source: itemSource }) => itemSource)
    })),
    getLocalFileSource: vi.fn<
      LocalFileIngestionStore['getLocalFileSource']
    >(),
    listLocalFileSources: vi.fn<
      LocalFileIngestionStore['listLocalFileSources']
    >(async () => []),
    refreshLocalFile: vi.fn<LocalFileIngestionStore['refreshLocalFile']>(
      async () => ({
        status: 'applied',
        source,
        contentChanged: true
      })
    )
  } satisfies LocalFileIngestionStore
  let sequence = 0
  return {
    workspaces,
    repository,
    localFiles,
    service: new KnowledgeSourceService({
      workspaces,
      repository,
      localFiles,
      now: () => 100,
      createId: () => `event-${++sequence}`
    })
  }
}

const registration = {
  id: 'source-1',
  workspaceId: 'space-1',
  name: '  Architecture  ',
  type: 'document' as const,
  locator: '  https://example.com/architecture  ',
  detail: '  example.com  ',
  sortOrder: 0,
  idempotencyKey: 'register-source-1'
}

describe('KnowledgeSourceService', () => {
  it('normalizes and registers a source owned by an existing workspace', async () => {
    const { service, repository } = dependencies()

    await expect(service.register(registration)).resolves.toMatchObject({
      name: 'Architecture',
      locator: 'https://example.com/architecture',
      detail: 'example.com',
      status: 'registered',
      revision: 1
    })
    expect(repository.register).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-1',
        idempotencyKey: 'register-source-1',
        triggerSource: 'user',
        source: expect.objectContaining({
          createdAt: 100,
          updatedAt: 100
        })
      })
    )
  })

  it('rejects a missing workspace before registration', async () => {
    const { service, repository } = dependencies({ workspaceExists: false })

    await expect(service.register(registration)).rejects.toThrow(
      'Workspace not found: space-1'
    )
    expect(repository.register).not.toHaveBeenCalled()
  })

  it('rejects invalid registration fields before repository mutation', async () => {
    const { service, repository } = dependencies()

    await expect(
      service.register({ ...registration, name: '  ' })
    ).rejects.toThrow('Knowledge source name is required')
    expect(repository.register).not.toHaveBeenCalled()
  })

  it('turns repository idempotency conflicts into a stable error', async () => {
    const { service, repository } = dependencies()
    vi.mocked(repository.register).mockResolvedValue({
      status: 'idempotency_conflict'
    })

    await expect(service.register(registration)).rejects.toThrow(
      'Knowledge source idempotency conflict'
    )
  })

  it('submits retry intent without precomputing a stale state', async () => {
    const { service, repository } = dependencies()

    await service.retry({
      id: 'source-1',
      expectedRevision: 2,
      idempotencyKey: 'retry-source-1'
    })

    expect(repository.transition).toHaveBeenCalledWith({
      sourceId: 'source-1',
      expectedRevision: 2,
      operation: 'retry_sync',
      eventId: 'event-1',
      idempotencyKey: 'retry-source-1',
      triggerSource: 'user',
      at: 100
    })
  })

  it('creates local file sources through the atomic ingestion boundary', async () => {
    const { service, localFiles } = dependencies()
    const localFile = createLocalFileSource({
      sourceId: 'file-source-1',
      workspaceId: 'space-1',
      storageMode: 'external_reference',
      originalPath: '/selected/file.md',
      contentChecksum: `sha256:${'a'.repeat(64)}`,
      byteSize: 4,
      modifiedAt: 10,
      checkedAt: 10
    })

    await expect(
      service.registerLocalFiles({
        workspaceId: 'space-1',
        items: [
          {
            id: 'file-source-1',
            name: 'file.md',
            detail: '外部引用',
            sortOrder: 0,
            localFile
          }
        ],
        idempotencyKey: 'ingest-local-1',
        fingerprint: 'fingerprint-1'
      })
    ).resolves.toMatchObject([
      { id: 'file-source-1', type: 'file', status: 'registered' }
    ])
    expect(localFiles.registerLocalFileBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            eventId: 'event-1',
            source: expect.objectContaining({
              locator: 'external:file-source-1'
            })
          })
        ]
      })
    )
  })

  it('does not hide revision conflicts', async () => {
    const current = {
      ...(await dependencies().repository.get('source-1'))!,
      revision: 3
    }
    const { service } = dependencies({
      result: { status: 'revision_conflict', current }
    })

    await expect(
      service.remove({
        id: 'source-1',
        expectedRevision: 2,
        idempotencyKey: 'remove-source-1'
      })
    ).rejects.toThrow('Knowledge source revision conflict')
  })

  it('exposes read models and delegates startup recovery', async () => {
    const { service, repository } = dependencies()

    await expect(service.list({ workspaceId: 'space-1' })).resolves.toHaveLength(
      1
    )
    await expect(service.listEvents({ sourceId: 'source-1' })).resolves.toEqual(
      []
    )
    await expect(service.recoverInterrupted()).resolves.toBe(1)
    expect(repository.recoverInterrupted).toHaveBeenCalledWith(100)
  })
})
