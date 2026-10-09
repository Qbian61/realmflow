import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupOperation } from '../../../../domain/backup'
import type { ValidatedBackupBundle } from '../../infrastructure/backup/backup-bundle-validator'
import type { BackupOperationRepository } from './backup-ports'
import {
  RestoreStagingService,
  type PendingRestoreMarker
} from './restore-staging-service'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const CHECKSUM_A = `sha256:${'a'.repeat(64)}`
const CHECKSUM_B = `sha256:${'b'.repeat(64)}`

let directory: string
let userDataPath: string
let bundlePath: string
let repository: MemoryOperationRepository
let now: number

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-restore-staging-'))
  userDataPath = join(directory, 'user-data')
  bundlePath = join(directory, 'selected.realmflow-backup')
  await mkdir(join(bundlePath, 'files'), { recursive: true })
  await mkdir(userDataPath)
  await writeFile(join(bundlePath, 'manifest.json'), '{"formatVersion":1}')
  await writeFile(join(bundlePath, 'files', 'artifact.md'), '# snapshot')
  repository = new MemoryOperationRepository()
  now = 1_000
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('RestoreStagingService', () => {
  it('allows restart only while a valid staged marker and bundle exist', async () => {
    const validate = vi.fn(async () => inspection())
    const service = createService(validate)

    await expect(service.canRestart()).resolves.toBe(false)
    const preview = await service.inspect(bundlePath)
    await service.prepare({
      requestId: REQUEST_ID,
      previewId: preview.previewId,
      expectedChecksum: preview.bundleChecksum
    })
    await expect(service.canRestart()).resolves.toBe(true)

    await writeFile(
      join(userDataPath, 'pending-restore.json'),
      JSON.stringify({
        version: 1,
        requestId: REQUEST_ID,
        bundleChecksum: CHECKSUM_A,
        stagingDirectory: '/renderer-controlled',
        createdAt: 1_000
      })
    )
    await expect(service.canRestart()).resolves.toBe(false)
  })

  it('previews without filesystem side effects or Renderer-visible paths', async () => {
    const validate = vi.fn(async () => inspection())
    const service = createService(validate)
    const before = await readdir(userDataPath)

    const preview = await service.inspect(bundlePath)

    expect(preview).toEqual({
      previewId: 'preview-id',
      applicationVersion: '0.1.0',
      bundleChecksum: CHECKSUM_A,
      createdAt: '2026-09-28T05:00:00.000Z',
      formatVersion: 1,
      schemaVersion: 44,
      summary: inspection().summary
    })
    expect(JSON.stringify(preview)).not.toContain(bundlePath)
    expect(Object.keys(preview).some((key) => /path/i.test(key))).toBe(false)
    expect(await readdir(userDataPath)).toEqual(before)
    expect(repository.operations).toEqual([])
  })

  it('rejects an expired preview before validating or copying', async () => {
    const validate = vi.fn(async () => inspection())
    const service = createService(validate)
    const preview = await service.inspect(bundlePath)
    now += 10 * 60 * 1_000 + 1

    await expect(
      service.prepare({
        requestId: REQUEST_ID,
        previewId: preview.previewId,
        expectedChecksum: preview.bundleChecksum
      })
    ).rejects.toMatchObject({ code: 'bundle_changed' })
    expect(validate).toHaveBeenCalledTimes(1)
    expect(repository.operations).toEqual([])
  })

  it('records bundle_changed when the selected source differs at confirmation', async () => {
    const validate = vi
      .fn()
      .mockResolvedValueOnce(inspection())
      .mockResolvedValueOnce(inspection(CHECKSUM_B))
    const service = createService(validate)
    const preview = await service.inspect(bundlePath)

    await expect(
      service.prepare({
        requestId: REQUEST_ID,
        previewId: preview.previewId,
        expectedChecksum: preview.bundleChecksum
      })
    ).resolves.toMatchObject({
      kind: 'restore',
      status: 'failed',
      errorCode: 'bundle_changed'
    })
    await expect(readPendingMarker()).resolves.toBeUndefined()
    expect(repository.operations).toHaveLength(1)
  })

  it('copies into isolated staging and publishes the marker only after revalidation', async () => {
    const validate = vi.fn(async (_bundlePath: string) => inspection())
    const service = createService(validate)
    const preview = await service.inspect(bundlePath)

    const operation = await service.prepare({
      requestId: REQUEST_ID,
      previewId: preview.previewId,
      expectedChecksum: preview.bundleChecksum
    })

    const stagingPath = join(userDataPath, 'restore-staging', REQUEST_ID)
    expect(operation).toEqual({
      requestId: REQUEST_ID,
      kind: 'restore',
      status: 'restore_pending',
      bundleName: 'selected.realmflow-backup',
      bundleChecksum: CHECKSUM_A,
      formatVersion: 1,
      schemaVersion: 44,
      fileCount: 5,
      byteSize: 4096,
      createdAt: 1_000
    })
    expect(
      await readFile(join(stagingPath, 'files', 'artifact.md'), 'utf8')
    ).toBe('# snapshot')
    expect(validate.mock.calls.map(([path]) => path)).toEqual([
      bundlePath,
      bundlePath,
      expect.stringContaining(`.${REQUEST_ID}.`)
    ])
    await expect(readPendingMarker()).resolves.toEqual({
      version: 1,
      requestId: REQUEST_ID,
      bundleChecksum: CHECKSUM_A,
      stagingDirectory: stagingPath,
      createdAt: 1_000
    })
  })

  it('does not publish a marker when the staged copy fails validation', async () => {
    const validate = vi
      .fn()
      .mockResolvedValueOnce(inspection())
      .mockResolvedValueOnce(inspection())
      .mockRejectedValueOnce(
        Object.assign(new Error('copy changed'), {
          code: 'bundle_corrupt'
        })
      )
    const service = createService(validate)
    const preview = await service.inspect(bundlePath)

    await expect(
      service.prepare({
        requestId: REQUEST_ID,
        previewId: preview.previewId,
        expectedChecksum: preview.bundleChecksum
      })
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'bundle_corrupt'
    })
    await expect(readPendingMarker()).resolves.toBeUndefined()
    await expect(
      readdir(join(userDataPath, 'restore-staging'))
    ).resolves.toEqual([])
  })

  it('shares one in-flight confirmation promise for a duplicate request', async () => {
    let releaseValidation: (() => void) | undefined
    const validate = vi.fn(
      () =>
        new Promise<ValidatedBackupBundle>((resolve) => {
          if (validate.mock.calls.length !== 2) {
            resolve(inspection())
            return
          }
          releaseValidation = () => resolve(inspection())
        })
    )
    const service = createService(validate)
    const preview = await service.inspect(bundlePath)
    const input = {
      requestId: REQUEST_ID,
      previewId: preview.previewId,
      expectedChecksum: preview.bundleChecksum
    }

    const first = service.prepare(input)
    const second = service.prepare(input)

    expect(first).toBe(second)
    await vi.waitFor(() => expect(validate).toHaveBeenCalledTimes(2))
    releaseValidation?.()
    await expect(first).resolves.toMatchObject({ status: 'restore_pending' })
    expect(repository.operations).toHaveLength(1)
  })

  it('replays a persisted request without requiring the old preview', async () => {
    const existing: BackupOperation = {
      requestId: REQUEST_ID,
      kind: 'restore',
      status: 'restore_pending',
      bundleName: 'selected.realmflow-backup',
      bundleChecksum: CHECKSUM_A,
      formatVersion: 1,
      schemaVersion: 44,
      fileCount: 5,
      byteSize: 4096,
      createdAt: 500
    }
    repository.operations.push(existing)
    const validate = vi.fn(async () => inspection())
    const service = createService(validate)

    await expect(
      service.prepare({
        requestId: REQUEST_ID,
        previewId: 'no-longer-present',
        expectedChecksum: CHECKSUM_A
      })
    ).resolves.toEqual(existing)
    expect(validate).not.toHaveBeenCalled()
  })
})

function createService(
  validate: (bundlePath: string) => Promise<ValidatedBackupBundle>
): RestoreStagingService {
  return new RestoreStagingService({
    repository,
    validator: { validate },
    userDataPath,
    now: () => now,
    createId: () => 'preview-id'
  })
}

function inspection(
  bundleChecksum = CHECKSUM_A
): ValidatedBackupBundle {
  return Object.freeze({
    formatVersion: 1,
    applicationVersion: '0.1.0',
    schemaVersion: 44,
    createdAt: '2026-09-28T05:00:00.000Z',
    bundleChecksum,
    summary: Object.freeze({
      workRootCount: 1,
      spaceCount: 1,
      requirementCount: 1,
      formalArtifactCount: 1,
      fileCount: 5,
      byteSize: 4096
    })
  })
}

async function readPendingMarker(): Promise<
  PendingRestoreMarker | undefined
> {
  try {
    return JSON.parse(
      await readFile(join(userDataPath, 'pending-restore.json'), 'utf8')
    ) as PendingRestoreMarker
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

class MemoryOperationRepository implements BackupOperationRepository {
  readonly operations: BackupOperation[] = []

  async getByRequestId(
    requestId: string
  ): Promise<BackupOperation | undefined> {
    return this.operations.find(
      (operation) => operation.requestId === requestId
    )
  }

  async getLatestByKind(
    kind: BackupOperation['kind']
  ): Promise<BackupOperation | undefined> {
    return [...this.operations]
      .reverse()
      .find((operation) => operation.kind === kind)
  }

  async saveFinal(
    operation: BackupOperation
  ): Promise<'saved' | 'unchanged'> {
    const existing = await this.getByRequestId(operation.requestId)
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(operation)) {
        return 'unchanged'
      }
      throw new Error('conflicting operation')
    }
    this.operations.push(operation)
    return 'saved'
  }
}
