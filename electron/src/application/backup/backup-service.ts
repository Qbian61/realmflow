import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  isBackupErrorCode,
  type BackupErrorCode,
  type BackupManifestV1,
  type BackupOperation
} from '../../../../domain/backup'
import type { BackupOperationRepository, BackupSnapshot } from './backup-ports'
import type { ManagedBackupCatalogResult } from './managed-backup-catalog'

type BackupCoordinator = {
  run<T>(operation: () => T | Promise<T>): Promise<T>
}

type BackupCatalogReader = {
  read(databasePath: string): Promise<ManagedBackupCatalogResult>
}

type BackupBundleCreator = {
  create(input: {
    destinationPath: string
    applicationVersion: string
    schemaVersion: number
    createdAt: string
    catalog: ManagedBackupCatalogResult
  }): Promise<BackupManifestV1>
}

type RemovePath = typeof rm

type BackupServiceDependencies = {
  repository: BackupOperationRepository
  coordinator: BackupCoordinator
  snapshot: BackupSnapshot
  catalog: BackupCatalogReader
  bundle: BackupBundleCreator
  applicationVersion: () => string
  now?: () => number
  removePath?: RemovePath
}

export class BackupServiceError extends Error {
  readonly name = 'BackupServiceError'

  constructor(readonly code: 'storage_unavailable') {
    super(code)
  }
}

export class BackupService {
  private readonly requests = new Map<
    string,
    Promise<BackupOperation>
  >()
  private readonly now: () => number
  private readonly removePath: RemovePath

  constructor(private readonly dependencies: BackupServiceDependencies) {
    this.now = dependencies.now ?? Date.now
    this.removePath = dependencies.removePath ?? rm
  }

  create(input: {
    requestId: string
    destinationPath: string
  }): Promise<BackupOperation> {
    try {
      requireBackupRequestId(input.requestId)
    } catch (error) {
      return Promise.reject(error)
    }
    const inFlight = this.requests.get(input.requestId)
    if (inFlight) return inFlight
    const request = this.performCreate(input).finally(() => {
      if (this.requests.get(input.requestId) === request) {
        this.requests.delete(input.requestId)
      }
    })
    this.requests.set(input.requestId, request)
    return request
  }

  private async performCreate(input: {
    requestId: string
    destinationPath: string
  }): Promise<BackupOperation> {
    const existing = await this.dependencies.repository.getByRequestId(
      input.requestId
    )
    if (existing) return existing

    const createdAt = this.now()
    let manifest: BackupManifestV1
    try {
      manifest = await this.dependencies.coordinator.run(async () => {
        const temporaryDirectory = await mkdtemp(
          join(dirname(input.destinationPath), '.realmflow-backup-snapshot-')
        )
        try {
          const snapshotPath = join(temporaryDirectory, 'realmflow.db')
          const snapshot = await this.dependencies.snapshot.create(
            snapshotPath
          )
          const catalog = await this.dependencies.catalog.read(snapshotPath)
          return await this.dependencies.bundle.create({
            destinationPath: input.destinationPath,
            applicationVersion: this.dependencies.applicationVersion(),
            schemaVersion: snapshot.schemaVersion,
            createdAt: new Date(createdAt).toISOString(),
            catalog
          })
        } finally {
          await this.removePath(temporaryDirectory, {
            recursive: true,
            force: true
          }).catch(() => undefined)
        }
      })
    } catch (error) {
      const failure: BackupOperation = {
        requestId: input.requestId,
        kind: 'backup',
        status: 'failed',
        bundleName: basename(input.destinationPath),
        fileCount: 0,
        byteSize: 0,
        errorCode: backupErrorCode(error),
        createdAt,
        completedAt: this.now()
      }
      try {
        await this.dependencies.repository.saveFinal(failure)
      } catch {
        throw new BackupServiceError('storage_unavailable')
      }
      return failure
    }

    const operation: BackupOperation = {
      requestId: input.requestId,
      kind: 'backup',
      status: 'succeeded',
      bundleName: basename(input.destinationPath),
      bundleChecksum: manifest.checksum,
      formatVersion: manifest.formatVersion,
      schemaVersion: manifest.schemaVersion,
      fileCount: manifest.summary.fileCount,
      byteSize: manifest.summary.byteSize,
      createdAt,
      completedAt: this.now()
    }
    try {
      await this.dependencies.repository.saveFinal(operation)
    } catch {
      await this.removePath(input.destinationPath, {
        recursive: true,
        force: true
      }).catch(() => undefined)
      throw new BackupServiceError('storage_unavailable')
    }
    return operation
  }
}

function requireBackupRequestId(requestId: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId
    )
  ) {
    throw new Error('Backup request ID is invalid')
  }
}

function backupErrorCode(error: unknown): BackupErrorCode {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined
  if (
    isBackupErrorCode(code) &&
    code !== 'restore_failed' &&
    code !== 'bundle_changed'
  ) {
    return code
  }
  return 'storage_unavailable'
}
