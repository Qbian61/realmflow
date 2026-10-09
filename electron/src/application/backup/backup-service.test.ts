import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BackupManifestV1,
  BackupOperation
} from '../../../../domain/backup'
import type { ManagedBackupCatalogResult } from './managed-backup-catalog'
import { BackupBundleError } from '../../infrastructure/backup/backup-bundle'
import { BackupService, BackupServiceError } from './backup-service'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-backup-service-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('BackupService', () => {
  it('creates a coordinated snapshot and persists final metadata', async () => {
    const harness = createHarness()
    const destinationPath = join(directory, 'daily.realmflow-backup')

    await expect(
      harness.service.create({ requestId: REQUEST_ID, destinationPath })
    ).resolves.toEqual({
      requestId: REQUEST_ID,
      kind: 'backup',
      status: 'succeeded',
      bundleName: 'daily.realmflow-backup',
      bundleChecksum: manifest().checksum,
      formatVersion: 1,
      schemaVersion: 44,
      fileCount: 2,
      byteSize: 34,
      createdAt: 100,
      completedAt: 200
    })

    expect(harness.events).toEqual([
      'repository:get',
      'coordinator:begin',
      'snapshot:create',
      'catalog:read',
      'bundle:create',
      'coordinator:end',
      'repository:save'
    ])
    expect(harness.bundle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationPath,
        applicationVersion: '0.1.0',
        schemaVersion: 44,
        createdAt: '1970-01-01T00:00:00.100Z'
      })
    )
    expect(JSON.stringify(harness.records)).not.toContain(directory)
  })

  it('shares one in-flight Promise for duplicate request IDs', async () => {
    const pending = deferred<{ schemaVersion: number }>()
    const harness = createHarness()
    harness.snapshot.create.mockReturnValue(pending.promise)
    const input = {
      requestId: REQUEST_ID,
      destinationPath: join(directory, 'daily.realmflow-backup')
    }

    const first = harness.service.create(input)
    const duplicate = harness.service.create(input)
    expect(duplicate).toBe(first)
    pending.resolve({ schemaVersion: 44 })

    await expect(Promise.all([first, duplicate])).resolves.toHaveLength(2)
    expect(harness.snapshot.create).toHaveBeenCalledOnce()
    expect(harness.bundle.create).toHaveBeenCalledOnce()
    expect(harness.repository.saveFinal).toHaveBeenCalledOnce()
  })

  it('replays a persisted request without creating another snapshot', async () => {
    const existing = succeededOperation()
    const harness = createHarness({ records: [existing] })

    await expect(
      harness.service.create({
        requestId: REQUEST_ID,
        destinationPath: join(directory, 'different.realmflow-backup')
      })
    ).resolves.toEqual(existing)
    expect(harness.coordinator.run).not.toHaveBeenCalled()
    expect(harness.snapshot.create).not.toHaveBeenCalled()
    expect(harness.bundle.create).not.toHaveBeenCalled()
    expect(harness.repository.saveFinal).not.toHaveBeenCalled()
  })

  it.each([
    [
      new BackupBundleError(
        'destination_conflict',
        'private destination details'
      ),
      'destination_conflict'
    ],
    [
      new BackupBundleError('source_changed', 'private source details'),
      'source_changed'
    ],
    [new Error('private sqlite failure'), 'storage_unavailable']
  ] as const)(
    'persists a stable failure for %s',
    async (failure, errorCode) => {
      const harness = createHarness()
      harness.snapshot.create.mockRejectedValue(failure)

      await expect(
        harness.service.create({
          requestId: REQUEST_ID,
          destinationPath: join(directory, 'daily.realmflow-backup')
        })
      ).resolves.toMatchObject({
        requestId: REQUEST_ID,
        kind: 'backup',
        status: 'failed',
        errorCode,
        createdAt: 100,
        completedAt: 200
      })
      expect(harness.records).toHaveLength(1)
      expect(JSON.stringify(harness.records)).not.toMatch(
        /private|sqlite failure/
      )
    }
  )

  it('removes a completed bundle when success persistence fails', async () => {
    const harness = createHarness()
    harness.repository.saveFinal.mockRejectedValue(
      new Error('database unavailable')
    )
    const destinationPath = join(directory, 'daily.realmflow-backup')

    await expect(
      harness.service.create({ requestId: REQUEST_ID, destinationPath })
    ).rejects.toEqual(
      expect.objectContaining<Partial<BackupServiceError>>({
        code: 'storage_unavailable'
      })
    )
    expect(harness.removePath).toHaveBeenCalledWith(destinationPath, {
      recursive: true,
      force: true
    })
  })

  it.each([
    'not-a-uuid',
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-4111-7111-111111111111'
  ])('rejects invalid request ID %s before side effects', async (requestId) => {
    const harness = createHarness()

    await expect(
      harness.service.create({
        requestId,
        destinationPath: join(directory, 'daily.realmflow-backup')
      })
    ).rejects.toThrow('Backup request ID is invalid')
    expect(harness.repository.getByRequestId).not.toHaveBeenCalled()
    expect(harness.coordinator.run).not.toHaveBeenCalled()
  })
})

function createHarness(input: { records?: BackupOperation[] } = {}) {
  const events: string[] = []
  const records = [...(input.records ?? [])]
  const repository = {
    getByRequestId: vi.fn(async (requestId: string) => {
      events.push('repository:get')
      return records.find((record) => record.requestId === requestId)
    }),
    getLatestByKind: vi.fn(),
    saveFinal: vi.fn(async (operation: BackupOperation) => {
      events.push('repository:save')
      records.push(operation)
      return 'saved' as const
    })
  }
  const coordinatorRun = vi.fn(async (operation: () => unknown) => {
    events.push('coordinator:begin')
    const result = await operation()
    events.push('coordinator:end')
    return result
  })
  const serviceCoordinator = {
    run: coordinatorRun as <T>(
      operation: () => T | Promise<T>
    ) => Promise<T>
  }
  const snapshot = {
    create: vi.fn(async () => {
      events.push('snapshot:create')
      return { schemaVersion: 44 }
    })
  }
  const catalog = {
    read: vi.fn(async () => {
      events.push('catalog:read')
      return catalogResult()
    })
  }
  const bundle = {
    create: vi.fn(async () => {
      events.push('bundle:create')
      return manifest()
    })
  }
  const removePath = vi.fn(async () => undefined)
  const times = [100, 200]
  const service = new BackupService({
    repository,
    coordinator: serviceCoordinator,
    snapshot,
    catalog,
    bundle,
    applicationVersion: () => '0.1.0',
    now: () => times.shift() ?? 200,
    removePath
  })
  return {
    service,
    repository,
    coordinator: { run: coordinatorRun },
    snapshot,
    catalog,
    bundle,
    removePath,
    records,
    events
  }
}

function catalogResult(): ManagedBackupCatalogResult {
  return {
    entries: [
      {
        kind: 'database',
        archivePath: 'database/realmflow.db',
        sourcePath: '/internal/snapshot.db',
        sourceSize: 17,
        sourceMtimeMs: 100
      },
      {
        kind: 'formal_artifact',
        archivePath: 'files/root-1/artifact.md',
        sourcePath: '/internal/artifact.md',
        sourceSize: 17,
        sourceMtimeMs: 100,
        workRootId: 'root-1',
        targetPath: 'artifact.md'
      }
    ],
    summary: {
      workRootCount: 1,
      spaceCount: 1,
      requirementCount: 1,
      formalArtifactCount: 1,
      fileCount: 2,
      byteSize: 34
    }
  }
}

function manifest(): BackupManifestV1 {
  return {
    formatVersion: 1,
    applicationVersion: '0.1.0',
    schemaVersion: 44,
    createdAt: '1970-01-01T00:00:00.100Z',
    entries: [],
    summary: catalogResult().summary,
    checksum: `sha256:${'a'.repeat(64)}`
  }
}

function succeededOperation(): BackupOperation {
  return {
    requestId: REQUEST_ID,
    kind: 'backup',
    status: 'succeeded',
    bundleName: 'daily.realmflow-backup',
    bundleChecksum: manifest().checksum,
    formatVersion: 1,
    schemaVersion: 44,
    fileCount: 2,
    byteSize: 34,
    createdAt: 100,
    completedAt: 200
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
