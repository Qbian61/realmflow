import { randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import {
  canonicalizeBackupJson,
  normalizeBackupRelativePath,
  type BackupManifestV1,
  type BackupOperation
} from '../../../../domain/backup'
import type { PendingRestoreMarker } from '../../application/backup/restore-staging-service'
import { openRealmFlowDatabase } from '../sqlite/database'
import { SqliteIndexMaintenanceRepository } from '../sqlite/index-maintenance-repository'
import { BackupBundleValidator } from './backup-bundle-validator'

export type RestoreJournalTarget = {
  kind: 'managed_file' | 'database'
  targetPath: string
  incomingPath?: string
  rollbackPath: string
  hadOriginal: boolean
  originalMoved: boolean
  incomingMoved: boolean
}

export type RestoreJournalV1 = {
  version: 1
  requestId: string
  bundleChecksum: string
  phase: 'prepared' | 'switching' | 'rolling_back' | 'committed'
  markerPath: string
  stagingDirectory: string
  operation: BackupOperation
  targets: RestoreJournalTarget[]
  cleanupPaths: string[]
}

export type StartupRestoreResult =
  | { status: 'none' }
  | { status: 'restored'; requestId: string }
  | {
      status: 'rolled_back'
      requestId: string
      errorCode: 'restore_failed'
    }
  | {
      status: 'blocked'
      requestId: string
      errorCode: 'restore_failed'
      diagnostic: string
    }

type StartupRestoreOptions = {
  userDataPath: string
  databasePath: string
  currentSchemaVersion: number
  moveFile?: (sourcePath: string, destinationPath: string) => Promise<void>
  now?: () => number
}

type ManagedTarget = {
  targetPath: string
  incomingSource?: string
  rootPath: string
}

type WorkRootRow = {
  id: string
  path: string
}

const BLOCKING_DIAGNOSTIC =
  'RealmFlow could not restore the previous data after a failed restore.'

export async function applyPendingRestore(
  options: StartupRestoreOptions
): Promise<StartupRestoreResult> {
  const journalPath = join(options.userDataPath, 'restore-journal.json')
  const markerPath = join(options.userDataPath, 'pending-restore.json')
  const moveFile = options.moveFile ?? rename
  const now = options.now ?? Date.now
  const existingJournal = await readJsonIfPresent(journalPath)

  if (existingJournal !== undefined) {
    const journal = parseJournal(existingJournal)
    if (journal.phase === 'committed') {
      await cleanupCommitted(journal, journalPath)
      return { status: 'restored', requestId: journal.requestId }
    }
    return rollBackOrBlock({
      journal,
      journalPath,
      moveFile,
      now
    })
  }

  const markerValue = await readJsonIfPresent(markerPath)
  if (markerValue === undefined) return { status: 'none' }
  const marker = parseMarker(markerValue, options.userDataPath)

  let journal: RestoreJournalV1 | undefined
  try {
    const validator = new BackupBundleValidator({
      currentSchemaVersion: options.currentSchemaVersion
    })
    const validated = await validator.validate(marker.stagingDirectory)
    if (validated.bundleChecksum !== marker.bundleChecksum) {
      throw new Error('Pending restore checksum does not match its bundle')
    }
    const manifest = parseManifest(
      JSON.parse(
        await readFile(
          join(marker.stagingDirectory, 'manifest.json'),
          'utf8'
        )
      )
    )
    const operation = readPendingOperation(
      options.databasePath,
      marker.requestId,
      marker.bundleChecksum
    )
    const targets = await prepareTargets({
      marker,
      manifest,
      databasePath: options.databasePath
    })
    journal = {
      version: 1,
      requestId: marker.requestId,
      bundleChecksum: marker.bundleChecksum,
      phase: 'prepared',
      markerPath,
      stagingDirectory: marker.stagingDirectory,
      operation,
      targets,
      cleanupPaths: cleanupPathsFor(targets, marker.stagingDirectory)
    }
    await writeJournal(journalPath, journal)
    journal.phase = 'switching'
    await writeJournal(journalPath, journal)

    for (const target of journal.targets) {
      await switchTarget(target, journal, journalPath, moveFile)
    }
    finalizeRestoredDatabase(
      options.databasePath,
      journal.operation,
      now()
    )
    journal.phase = 'committed'
    await writeJournal(journalPath, journal)
    await cleanupCommitted(journal, journalPath)
    return { status: 'restored', requestId: journal.requestId }
  } catch {
    if (!journal) {
      await markRestoreFailed(options.databasePath, marker.requestId, now())
      await rm(markerPath, { force: true }).catch(() => undefined)
      await rm(marker.stagingDirectory, {
        recursive: true,
        force: true
      }).catch(() => undefined)
      return {
        status: 'rolled_back',
        requestId: marker.requestId,
        errorCode: 'restore_failed'
      }
    }
    return rollBackOrBlock({
      journal,
      journalPath,
      moveFile,
      now
    })
  }
}

async function switchTarget(
  target: RestoreJournalTarget,
  journal: RestoreJournalV1,
  journalPath: string,
  moveFile: (sourcePath: string, destinationPath: string) => Promise<void>
): Promise<void> {
  await mkdir(dirname(target.targetPath), { recursive: true })
  if (target.hadOriginal && !target.originalMoved) {
    await mkdir(dirname(target.rollbackPath), { recursive: true })
    await moveFile(target.targetPath, target.rollbackPath)
    target.originalMoved = true
    await writeJournal(journalPath, journal)
  }
  if (target.incomingPath && !target.incomingMoved) {
    await moveFile(target.incomingPath, target.targetPath)
    target.incomingMoved = true
    await writeJournal(journalPath, journal)
  }
}

async function rollBackOrBlock(input: {
  journal: RestoreJournalV1
  journalPath: string
  moveFile: (sourcePath: string, destinationPath: string) => Promise<void>
  now: () => number
}): Promise<StartupRestoreResult> {
  const { journal, journalPath, moveFile } = input
  try {
    journal.phase = 'rolling_back'
    await writeJournal(journalPath, journal)
    for (const target of [...journal.targets].reverse()) {
      await rollBackTarget(target, journal, journalPath, moveFile)
    }
    await markRestoreFailed(
      databaseTarget(journal).targetPath,
      journal.requestId,
      input.now()
    )
    await cleanupRolledBack(journal, journalPath)
    return {
      status: 'rolled_back',
      requestId: journal.requestId,
      errorCode: 'restore_failed'
    }
  } catch {
    return {
      status: 'blocked',
      requestId: journal.requestId,
      errorCode: 'restore_failed',
      diagnostic: BLOCKING_DIAGNOSTIC
    }
  }
}

async function rollBackTarget(
  target: RestoreJournalTarget,
  journal: RestoreJournalV1,
  journalPath: string,
  moveFile: (sourcePath: string, destinationPath: string) => Promise<void>
): Promise<void> {
  const rollbackExists = await pathExists(target.rollbackPath)
  const incomingExists = target.incomingPath
    ? await pathExists(target.incomingPath)
    : false
  const targetExists = await pathExists(target.targetPath)
  const incomingAtTarget =
    target.incomingPath !== undefined &&
    targetExists &&
    !incomingExists &&
    (target.incomingMoved || rollbackExists || !target.hadOriginal)

  if (incomingAtTarget || target.incomingMoved) {
    await rm(target.targetPath, { force: true })
    target.incomingMoved = false
    await writeJournal(journalPath, journal)
  }
  if (rollbackExists) {
    if (await pathExists(target.targetPath)) {
      throw new Error('Restore rollback target is occupied')
    }
    await mkdir(dirname(target.targetPath), { recursive: true })
    await moveFile(target.rollbackPath, target.targetPath)
    target.originalMoved = false
    await writeJournal(journalPath, journal)
  } else if (target.originalMoved) {
    if (!(await pathExists(target.targetPath))) {
      throw new Error('Restore rollback source is unavailable')
    }
    target.originalMoved = false
    await writeJournal(journalPath, journal)
  }
}

async function prepareTargets(input: {
  marker: PendingRestoreMarker
  manifest: BackupManifestV1
  databasePath: string
}): Promise<RestoreJournalTarget[]> {
  const incomingDatabase = join(
    input.marker.stagingDirectory,
    'database',
    'realmflow.db'
  )
  const current = readManagedTargets(input.databasePath)
  const incomingRoots = readWorkRoots(incomingDatabase)
  const targets = new Map<string, ManagedTarget>()

  for (const target of current) targets.set(target.targetPath, target)
  for (const entry of input.manifest.entries) {
    if (entry.kind === 'database') continue
    if (!entry.workRootId || !entry.targetPath) {
      throw new Error('Managed restore entry is incomplete')
    }
    const rootPath = incomingRoots.get(entry.workRootId)
    if (!rootPath) throw new Error('Managed restore root is unavailable')
    const targetPath = resolveManagedTarget(rootPath, entry.targetPath)
    targets.set(targetPath, {
      targetPath,
      rootPath,
      incomingSource: resolve(
        input.marker.stagingDirectory,
        ...normalizeBackupRelativePath(entry.archivePath).split('/')
      )
    })
  }

  const prepared: RestoreJournalTarget[] = []
  let index = 0
  for (const target of [...targets.values()].sort((left, right) =>
    left.targetPath.localeCompare(right.targetPath)
  )) {
    const restoreRoot = join(
      target.rootPath,
      '.realmflow',
      'restore',
      input.marker.requestId
    )
    const suffix = String(index).padStart(4, '0')
    const incomingPath = target.incomingSource
      ? join(restoreRoot, 'stage', suffix)
      : undefined
    if (incomingPath && target.incomingSource) {
      await mkdir(dirname(incomingPath), { recursive: true })
      await copyFile(target.incomingSource, incomingPath)
    }
    prepared.push({
      kind: 'managed_file',
      targetPath: target.targetPath,
      ...(incomingPath ? { incomingPath } : {}),
      rollbackPath: join(restoreRoot, 'rollback', suffix),
      hadOriginal: await pathExists(target.targetPath),
      originalMoved: false,
      incomingMoved: false
    })
    index += 1
  }

  const databaseStagePath = join(
    dirname(input.databasePath),
    `.restore-${input.marker.requestId}-stage.db`
  )
  await copyFile(incomingDatabase, databaseStagePath)
  prepared.push({
    kind: 'database',
    targetPath: input.databasePath,
    incomingPath: databaseStagePath,
    rollbackPath: join(
      dirname(input.databasePath),
      `.restore-${input.marker.requestId}-rollback.db`
    ),
    hadOriginal: await pathExists(input.databasePath),
    originalMoved: false,
    incomingMoved: false
  })
  return prepared
}

function readManagedTargets(databasePath: string): ManagedTarget[] {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true
  })
  try {
    const roots = readWorkRootsFromDatabase(database)
    const targets: ManagedTarget[] = []
    for (const [id, path] of roots) {
      targets.push({
        rootPath: path,
        targetPath: resolveManagedTarget(path, '.realmflow/root.json')
      })
      void id
    }
    const spaces = database
      .prepare(
        `SELECT workspace.root_path, root.path AS work_root_path
         FROM workspaces workspace
         INNER JOIN work_roots root ON root.id = workspace.work_root_id`
      )
      .all() as Array<{ root_path: string; work_root_path: string }>
    for (const space of spaces) {
      targets.push({
        rootPath: space.work_root_path,
        targetPath: resolveManagedTarget(
          space.work_root_path,
          `${relativeTarget(
            space.work_root_path,
            space.root_path
          )}/.realmflow/space.json`
        )
      })
    }
    const requirements = database
      .prepare(
        `SELECT
           requirement.workspace_root_path,
           root.path AS work_root_path
         FROM requirements requirement
         INNER JOIN workspaces workspace
           ON workspace.id = requirement.workspace_id
         INNER JOIN work_roots root ON root.id = workspace.work_root_id`
      )
      .all() as Array<{
      workspace_root_path: string
      work_root_path: string
    }>
    for (const requirement of requirements) {
      targets.push({
        rootPath: requirement.work_root_path,
        targetPath: resolveManagedTarget(
          requirement.work_root_path,
          `${relativeTarget(
            requirement.work_root_path,
            requirement.workspace_root_path
          )}/.realmflow/requirement.json`
        )
      })
    }
    const artifacts = database
      .prepare(
        `SELECT
           requirement.workspace_root_path,
           root.path AS work_root_path,
           artifact.relative_path
         FROM artifacts artifact
         INNER JOIN requirements requirement
           ON requirement.id = artifact.requirement_id
         INNER JOIN workspaces workspace
           ON workspace.id = requirement.workspace_id
         INNER JOIN work_roots root ON root.id = workspace.work_root_id
         WHERE artifact.is_primary = 1
           AND artifact.is_valid = 1`
      )
      .all() as Array<{
      workspace_root_path: string
      work_root_path: string
      relative_path: string
    }>
    for (const artifact of artifacts) {
      targets.push({
        rootPath: artifact.work_root_path,
        targetPath: resolveManagedTarget(
          artifact.work_root_path,
          `${relativeTarget(
            artifact.work_root_path,
            artifact.workspace_root_path
          )}/${normalizeBackupRelativePath(artifact.relative_path)}`
        )
      })
    }
    return targets
  } finally {
    database.close()
  }
}

function readWorkRoots(databasePath: string): Map<string, string> {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true
  })
  try {
    return readWorkRootsFromDatabase(database)
  } finally {
    database.close()
  }
}

function readWorkRootsFromDatabase(
  database: Database.Database
): Map<string, string> {
  const rows = database
    .prepare('SELECT id, path FROM work_roots ORDER BY id')
    .all() as WorkRootRow[]
  return new Map(rows.map((row) => [row.id, row.path]))
}

function readPendingOperation(
  databasePath: string,
  requestId: string,
  checksum: string
): BackupOperation {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true
  })
  try {
    const row = database
      .prepare(
        `SELECT
           request_id, bundle_name, bundle_checksum, format_version,
           schema_version, file_count, byte_size, created_at
         FROM backup_operations
         WHERE request_id = ? AND kind = 'restore'
           AND status = 'restore_pending'`
      )
      .get(requestId) as
      | {
          request_id: string
          bundle_name: string
          bundle_checksum: string
          format_version: number
          schema_version: number
          file_count: number
          byte_size: number
          created_at: number
        }
      | undefined
    if (!row || row.bundle_checksum !== checksum) {
      throw new Error('Pending restore operation is unavailable')
    }
    return {
      requestId: row.request_id,
      kind: 'restore',
      status: 'restore_pending',
      bundleName: row.bundle_name,
      bundleChecksum: row.bundle_checksum,
      formatVersion: row.format_version,
      schemaVersion: row.schema_version,
      fileCount: row.file_count,
      byteSize: row.byte_size,
      createdAt: row.created_at
    }
  } finally {
    database.close()
  }
}

function finalizeRestoredDatabase(
  databasePath: string,
  operation: BackupOperation,
  completedAt: number
): void {
  const database = openRealmFlowDatabase(databasePath)
  try {
    const integrity = database.pragma('integrity_check') as Array<
      Record<string, unknown>
    >
    if (
      integrity.length !== 1 ||
      Object.values(integrity[0] ?? {})[0] !== 'ok'
    ) {
      throw new Error('Restored database integrity check failed')
    }
    database.transaction(() => {
      database
        .prepare(
          `INSERT INTO backup_operations (
            request_id, kind, status, bundle_name, bundle_checksum,
            format_version, schema_version, file_count, byte_size, error_code,
            created_at, completed_at
          ) VALUES (?, 'restore', 'restored', ?, ?, ?, ?, ?, ?, NULL, ?, ?)
          ON CONFLICT(request_id) DO UPDATE SET
            status = 'restored',
            error_code = NULL,
            completed_at = excluded.completed_at`
        )
        .run(
          operation.requestId,
          operation.bundleName,
          operation.bundleChecksum,
          operation.formatVersion,
          operation.schemaVersion,
          operation.fileCount,
          operation.byteSize,
          operation.createdAt,
          completedAt
        )
      new SqliteIndexMaintenanceRepository(database).requestFullRebuild({
        requestId: operation.requestId,
        reason: 'backup_restore',
        at: completedAt
      })
    })()
  } finally {
    database.close()
  }
}

async function markRestoreFailed(
  databasePath: string,
  requestId: string,
  completedAt: number
): Promise<void> {
  if (!(await pathExists(databasePath))) return
  const database = new Database(databasePath)
  try {
    database
      .prepare(
        `UPDATE backup_operations
         SET status = 'failed', error_code = 'restore_failed',
             completed_at = ?
         WHERE request_id = ? AND kind = 'restore'
           AND status = 'restore_pending'`
      )
      .run(completedAt, requestId)
  } finally {
    database.close()
  }
}

async function cleanupCommitted(
  journal: RestoreJournalV1,
  journalPath: string
): Promise<void> {
  await cleanupPaths(journal.cleanupPaths)
  await rm(journal.markerPath, { force: true })
  await rm(journal.stagingDirectory, { recursive: true, force: true })
  await rm(journalPath, { force: true })
}

async function cleanupRolledBack(
  journal: RestoreJournalV1,
  journalPath: string
): Promise<void> {
  await cleanupPaths(journal.cleanupPaths)
  await rm(journal.markerPath, { force: true })
  await rm(journal.stagingDirectory, { recursive: true, force: true })
  await rm(journalPath, { force: true })
}

async function cleanupPaths(paths: string[]): Promise<void> {
  for (const path of [...new Set(paths)].reverse()) {
    await rm(path, { recursive: true, force: true })
  }
}

function cleanupPathsFor(
  targets: RestoreJournalTarget[],
  stagingDirectory: string
): string[] {
  const paths = new Set<string>([stagingDirectory])
  for (const target of targets) {
    if (target.kind === 'database') {
      if (target.incomingPath) paths.add(target.incomingPath)
      paths.add(target.rollbackPath)
      continue
    }
    paths.add(dirname(dirname(target.rollbackPath)))
  }
  return [...paths]
}

function databaseTarget(journal: RestoreJournalV1): RestoreJournalTarget {
  const target = journal.targets.find((item) => item.kind === 'database')
  if (!target) throw new Error('Restore journal database target is missing')
  return target
}

async function writeJournal(
  journalPath: string,
  journal: RestoreJournalV1
): Promise<void> {
  const temporaryPath = `${journalPath}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, canonicalizeBackupJson(journal), {
    encoding: 'utf8',
    flag: 'wx'
  })
  try {
    await rename(temporaryPath, journalPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function readJsonIfPresent(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function parseMarker(
  value: unknown,
  userDataPath: string
): PendingRestoreMarker {
  if (!isRecord(value)) throw new Error('Pending restore marker is invalid')
  const keys = Object.keys(value).sort()
  if (
    keys.join(',') !==
      'bundleChecksum,createdAt,requestId,stagingDirectory,version' ||
    value.version !== 1 ||
    typeof value.requestId !== 'string' ||
    typeof value.bundleChecksum !== 'string' ||
    typeof value.stagingDirectory !== 'string' ||
    !Number.isSafeInteger(value.createdAt)
  ) {
    throw new Error('Pending restore marker is invalid')
  }
  const stagingRoot = resolve(userDataPath, 'restore-staging')
  const stagingDirectory = resolve(value.stagingDirectory)
  assertContained(stagingRoot, stagingDirectory)
  if (stagingDirectory !== join(stagingRoot, value.requestId)) {
    throw new Error('Pending restore staging directory is invalid')
  }
  return value as PendingRestoreMarker
}

function parseJournal(value: unknown): RestoreJournalV1 {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.requestId !== 'string' ||
    typeof value.bundleChecksum !== 'string' ||
    !['prepared', 'switching', 'rolling_back', 'committed'].includes(
      String(value.phase)
    ) ||
    typeof value.markerPath !== 'string' ||
    typeof value.stagingDirectory !== 'string' ||
    !Array.isArray(value.targets) ||
    !Array.isArray(value.cleanupPaths) ||
    !isRecord(value.operation)
  ) {
    throw new Error('Restore journal is invalid')
  }
  return value as RestoreJournalV1
}

function parseManifest(value: unknown): BackupManifestV1 {
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    typeof value.checksum !== 'string' ||
    !Array.isArray(value.entries)
  ) {
    throw new Error('Restore manifest is invalid')
  }
  return value as BackupManifestV1
}

function resolveManagedTarget(rootPath: string, targetPath: string): string {
  const normalized = normalizeBackupRelativePath(targetPath)
  const result = resolve(rootPath, ...normalized.split('/'))
  assertContained(resolve(rootPath), result)
  return result
}

function relativeTarget(rootPath: string, targetPath: string): string {
  const result = relative(resolve(rootPath), resolve(targetPath))
    .split(sep)
    .join('/')
  return normalizeBackupRelativePath(result)
}

function assertContained(rootPath: string, targetPath: string): void {
  const relation = relative(resolve(rootPath), resolve(targetPath))
  if (
    relation.length === 0 ||
    relation === '..' ||
    relation.startsWith(`..${sep}`) ||
    resolve(relation) === relation
  ) {
    throw new Error('Restore path escapes its managed root')
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
