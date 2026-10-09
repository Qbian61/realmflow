import { describe, expect, it } from 'vitest'
import {
  BACKUP_ENTRY_KINDS,
  BACKUP_ERROR_CODES,
  BACKUP_FORMAT_VERSION,
  BACKUP_OPERATION_STATUSES,
  calculateBackupChecksum,
  isBackupEntryKind,
  isBackupErrorCode,
  isBackupOperationStatus,
  isBackupSchemaCompatible,
  normalizeBackupRelativePath,
  type BackupManifestContentV1
} from './backup'

function createManifestContent(
  override: Partial<BackupManifestContentV1> = {}
): BackupManifestContentV1 {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    applicationVersion: '0.1.0',
    schemaVersion: 44,
    createdAt: '2026-09-28T05:00:00.000Z',
    entries: [
      {
        kind: 'database',
        archivePath: 'database/realmflow.db',
        byteSize: 1024,
        checksum: `sha256:${'a'.repeat(64)}`
      },
      {
        kind: 'formal_artifact',
        archivePath: 'files/root-1/artifact.md',
        workRootId: 'root-1',
        targetPath: 'spaces/space-1/requirements/requirement-1/artifact.md',
        byteSize: 128,
        checksum: `sha256:${'b'.repeat(64)}`
      }
    ],
    summary: {
      workRootCount: 1,
      spaceCount: 1,
      requirementCount: 1,
      formalArtifactCount: 1,
      fileCount: 2,
      byteSize: 1152
    },
    ...override
  }
}

describe('backup domain', () => {
  it.each([
    ['database/realmflow.db', 'database/realmflow.db'],
    ['files/root/a.md', 'files/root/a.md'],
    ['manifest.json', 'manifest.json']
  ])('normalizes safe backup path %s', (value, expected) => {
    expect(normalizeBackupRelativePath(value)).toBe(expected)
  })

  it.each([
    '',
    '.',
    '..',
    '../a.md',
    'files/../a.md',
    '/tmp/a.md',
    'C:/tmp/a.md',
    'files\\root\\a.md',
    'files//a.md',
    'files/./a.md',
    ' files/a.md',
    'files/a.md ',
    'files/\0a.md'
  ])('rejects unsafe or non-canonical backup path %j', (value) => {
    expect(() => normalizeBackupRelativePath(value)).toThrow(
      'Backup relative path is invalid'
    )
  })

  it.each([
    [43, 44, true],
    [44, 44, true],
    [45, 44, false]
  ])(
    'checks backup schema %i against current schema %i',
    (backup, current, expected) => {
      expect(isBackupSchemaCompatible({ backup, current })).toBe(expected)
    }
  )

  it.each([
    { backup: -1, current: 44 },
    { backup: 44.5, current: 44 },
    { backup: 44, current: Number.NaN }
  ])('rejects invalid schema versions %#', (input) => {
    expect(() => isBackupSchemaCompatible(input)).toThrow(
      'Backup schema version is invalid'
    )
  })

  it('calculates a stable checksum independent of object key order', () => {
    const manifest = createManifestContent()
    const reordered = {
      summary: {
        byteSize: 1152,
        fileCount: 2,
        formalArtifactCount: 1,
        requirementCount: 1,
        spaceCount: 1,
        workRootCount: 1
      },
      entries: manifest.entries.map((entry) => ({
        checksum: entry.checksum,
        byteSize: entry.byteSize,
        ...(entry.targetPath ? { targetPath: entry.targetPath } : {}),
        ...(entry.workRootId ? { workRootId: entry.workRootId } : {}),
        archivePath: entry.archivePath,
        kind: entry.kind
      })),
      createdAt: manifest.createdAt,
      schemaVersion: manifest.schemaVersion,
      applicationVersion: manifest.applicationVersion,
      formatVersion: manifest.formatVersion
    } as BackupManifestContentV1

    expect(calculateBackupChecksum(manifest)).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(calculateBackupChecksum(reordered)).toBe(
      calculateBackupChecksum(manifest)
    )
  })

  it('changes the checksum when manifest content changes', () => {
    const manifest = createManifestContent()
    const changed = createManifestContent({
      summary: { ...manifest.summary, byteSize: 1153 }
    })

    expect(calculateBackupChecksum(changed)).not.toBe(
      calculateBackupChecksum(manifest)
    )
  })

  it('exposes fixed entry kinds, operation statuses and stable errors', () => {
    expect(BACKUP_ENTRY_KINDS).toEqual([
      'database',
      'root_manifest',
      'space_manifest',
      'requirement_manifest',
      'formal_artifact'
    ])
    expect(BACKUP_OPERATION_STATUSES).toEqual([
      'succeeded',
      'failed',
      'restore_pending',
      'restored'
    ])
    expect(BACKUP_ERROR_CODES).toEqual([
      'destination_conflict',
      'source_changed',
      'bundle_corrupt',
      'unsafe_bundle',
      'schema_too_new',
      'root_unavailable',
      'bundle_changed',
      'storage_unavailable',
      'restore_failed'
    ])

    expect(isBackupEntryKind('formal_artifact')).toBe(true)
    expect(isBackupEntryKind('attachment')).toBe(false)
    expect(isBackupOperationStatus('restore_pending')).toBe(true)
    expect(isBackupOperationStatus('pending')).toBe(false)
    expect(isBackupErrorCode('bundle_corrupt')).toBe(true)
    expect(isBackupErrorCode('raw_exception')).toBe(false)
  })
})
