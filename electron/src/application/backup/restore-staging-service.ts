import { randomUUID } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  canonicalizeBackupJson,
  isBackupErrorCode,
  type BackupErrorCode,
  type BackupOperation,
  type BackupSummary
} from '../../../../domain/backup'
import type { ValidatedBackupBundle } from '../../infrastructure/backup/backup-bundle-validator'
import type { BackupOperationRepository } from './backup-ports'

const PREVIEW_TTL_MS = 10 * 60 * 1_000
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHECKSUM = /^sha256:[a-f0-9]{64}$/

export type RestorePreview = Readonly<ValidatedBackupBundle & {
  previewId: string
}>

export type PendingRestoreMarker = {
  version: 1
  requestId: string
  bundleChecksum: string
  stagingDirectory: string
  createdAt: number
}

type RestoreValidator = {
  validate(bundlePath: string): Promise<ValidatedBackupBundle>
}

type RestoreStagingDependencies = {
  repository: BackupOperationRepository
  validator: RestoreValidator
  userDataPath: string
  now?: () => number
  createId?: () => string
}

type StoredPreview = {
  bundlePath: string
  inspectedAt: number
  result: ValidatedBackupBundle
}

export class RestoreStagingServiceError extends Error {
  readonly name = 'RestoreStagingServiceError'

  constructor(readonly code: 'bundle_changed' | 'storage_unavailable') {
    super(code)
  }
}

export class RestoreStagingService {
  private readonly previews = new Map<string, StoredPreview>()
  private readonly requests = new Map<string, Promise<BackupOperation>>()
  private readonly now: () => number
  private readonly createId: () => string

  constructor(private readonly dependencies: RestoreStagingDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createId = dependencies.createId ?? randomUUID
  }

  async canRestart(): Promise<boolean> {
    const markerPath = join(
      this.dependencies.userDataPath,
      'pending-restore.json'
    )
    try {
      const marker = JSON.parse(
        await readFile(markerPath, 'utf8')
      ) as Partial<PendingRestoreMarker>
      if (
        marker.version !== 1 ||
        typeof marker.requestId !== 'string' ||
        !UUID.test(marker.requestId) ||
        typeof marker.bundleChecksum !== 'string' ||
        !CHECKSUM.test(marker.bundleChecksum) ||
        !Number.isSafeInteger(marker.createdAt) ||
        marker.stagingDirectory !==
          join(
            this.dependencies.userDataPath,
            'restore-staging',
            marker.requestId
          )
      ) {
        return false
      }
      const metadata = await lstat(marker.stagingDirectory)
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) return false
      const validated = await this.dependencies.validator.validate(
        marker.stagingDirectory
      )
      return validated.bundleChecksum === marker.bundleChecksum
    } catch {
      return false
    }
  }

  async inspect(bundlePath: string): Promise<RestorePreview> {
    const result = await this.dependencies.validator.validate(bundlePath)
    const previewId = this.createId()
    this.previews.set(previewId, {
      bundlePath,
      inspectedAt: this.now(),
      result
    })
    return Object.freeze({
      previewId,
      ...result,
      summary: Object.freeze({ ...result.summary })
    })
  }

  prepare(input: {
    requestId: string
    previewId: string
    expectedChecksum: string
  }): Promise<BackupOperation> {
    try {
      validatePrepareInput(input)
    } catch (error) {
      return Promise.reject(error)
    }
    const inFlight = this.requests.get(input.requestId)
    if (inFlight) return inFlight
    const request = this.performPrepare(input).finally(() => {
      if (this.requests.get(input.requestId) === request) {
        this.requests.delete(input.requestId)
      }
    })
    this.requests.set(input.requestId, request)
    return request
  }

  private async performPrepare(input: {
    requestId: string
    previewId: string
    expectedChecksum: string
  }): Promise<BackupOperation> {
    const existing = await this.dependencies.repository.getByRequestId(
      input.requestId
    )
    if (existing) return existing

    const preview = this.previews.get(input.previewId)
    if (
      !preview ||
      this.now() - preview.inspectedAt > PREVIEW_TTL_MS ||
      preview.result.bundleChecksum !== input.expectedChecksum
    ) {
      this.previews.delete(input.previewId)
      throw new RestoreStagingServiceError('bundle_changed')
    }

    const createdAt = this.now()
    let confirmed: ValidatedBackupBundle
    try {
      confirmed = await this.dependencies.validator.validate(
        preview.bundlePath
      )
      if (confirmed.bundleChecksum !== input.expectedChecksum) {
        throw new RestoreStagingServiceError('bundle_changed')
      }
    } catch (error) {
      return this.persistFailure({
        input,
        preview,
        createdAt,
        error
      })
    }

    const stagingRoot = join(
      this.dependencies.userDataPath,
      'restore-staging'
    )
    const stagingPath = join(stagingRoot, input.requestId)
    const temporaryPath = join(
      stagingRoot,
      `.${input.requestId}.${randomUUID()}.tmp`
    )
    const markerPath = join(
      this.dependencies.userDataPath,
      'pending-restore.json'
    )
    const temporaryMarkerPath = join(
      this.dependencies.userDataPath,
      `.pending-restore.${randomUUID()}.tmp`
    )
    let ownsFinalStaging = false
    let ownsMarker = false
    try {
      await mkdir(stagingRoot, { recursive: true })
      if (
        (await pathExists(stagingPath)) ||
        (await pathExists(markerPath))
      ) {
        throw new RestoreStagingServiceError('storage_unavailable')
      }
      await cp(preview.bundlePath, temporaryPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true
      })
      const staged = await this.dependencies.validator.validate(temporaryPath)
      if (staged.bundleChecksum !== input.expectedChecksum) {
        throw new RestoreStagingServiceError('bundle_changed')
      }
      await rename(temporaryPath, stagingPath)
      ownsFinalStaging = true

      const marker: PendingRestoreMarker = {
        version: 1,
        requestId: input.requestId,
        bundleChecksum: input.expectedChecksum,
        stagingDirectory: stagingPath,
        createdAt
      }
      await writeFile(
        temporaryMarkerPath,
        canonicalizeBackupJson(marker),
        { encoding: 'utf8', flag: 'wx' }
      )
      await rename(temporaryMarkerPath, markerPath)
      ownsMarker = true

      const operation = pendingOperation({
        requestId: input.requestId,
        bundleName: basename(preview.bundlePath),
        result: confirmed,
        createdAt
      })
      await this.dependencies.repository.saveFinal(operation)
      this.previews.delete(input.previewId)
      return operation
    } catch (error) {
      await rm(temporaryPath, { recursive: true, force: true }).catch(
        () => undefined
      )
      await rm(temporaryMarkerPath, { force: true }).catch(() => undefined)
      if (ownsMarker) {
        await rm(markerPath, { force: true }).catch(() => undefined)
      }
      if (ownsFinalStaging) {
        await rm(stagingPath, { recursive: true, force: true }).catch(
          () => undefined
        )
      }
      return this.persistFailure({
        input,
        preview,
        createdAt,
        error
      })
    }
  }

  private async persistFailure(input: {
    input: {
      requestId: string
      previewId: string
      expectedChecksum: string
    }
    preview: StoredPreview
    createdAt: number
    error: unknown
  }): Promise<BackupOperation> {
    const failure: BackupOperation = {
      requestId: input.input.requestId,
      kind: 'restore',
      status: 'failed',
      bundleName: basename(input.preview.bundlePath),
      fileCount: 0,
      byteSize: 0,
      errorCode: restoreErrorCode(input.error),
      createdAt: input.createdAt,
      completedAt: this.now()
    }
    try {
      await this.dependencies.repository.saveFinal(failure)
      this.previews.delete(input.input.previewId)
      return failure
    } catch {
      throw new RestoreStagingServiceError('storage_unavailable')
    }
  }
}

function pendingOperation(input: {
  requestId: string
  bundleName: string
  result: ValidatedBackupBundle
  createdAt: number
}): BackupOperation {
  return {
    requestId: input.requestId,
    kind: 'restore',
    status: 'restore_pending',
    bundleName: input.bundleName,
    bundleChecksum: input.result.bundleChecksum,
    formatVersion: input.result.formatVersion,
    schemaVersion: input.result.schemaVersion,
    fileCount: input.result.summary.fileCount,
    byteSize: input.result.summary.byteSize,
    createdAt: input.createdAt
  }
}

function validatePrepareInput(input: {
  requestId: string
  previewId: string
  expectedChecksum: string
}): void {
  if (
    !UUID.test(input.requestId) ||
    input.previewId.length === 0 ||
    !CHECKSUM.test(input.expectedChecksum)
  ) {
    throw new Error('Restore staging request is invalid')
  }
}

function restoreErrorCode(error: unknown): BackupErrorCode {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined
  return isBackupErrorCode(code) ? code : 'storage_unavailable'
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
