import { describe, expect, it } from 'vitest'
import {
  toRepositorySnapshotViewDto,
  toRepositorySyncResultDto
} from './repository-ingestion-dto'

describe('repository ingestion DTO mapping', () => {
  const repository = {
    sourceId: 'repository-1',
    workspaceId: 'space-1',
    mode: 'local' as const,
    localPath: '/Users/private/source',
    locator: 'local-repository:repository-1',
    currentVersion: 1,
    revisionLabel: 'main@abc123',
    fileCount: 1,
    totalBytes: 8,
    lastScannedAt: 20,
    createdAt: 10,
    updatedAt: 20
  }
  const snapshot = {
    id: 'snapshot-1',
    sourceId: 'repository-1',
    version: 1,
    revisionLabel: 'main@abc123',
    manifestChecksum: 'manifest-checksum',
    fileCount: 1,
    totalBytes: 8,
    files: [
      {
        relativePath: 'README.md',
        content: '# Secret',
        contentChecksum: 'content-checksum',
        byteSize: 8
      }
    ],
    scannedAt: 20
  }

  it('omits local paths and file contents from snapshot views', () => {
    const dto = toRepositorySnapshotViewDto({ repository, snapshot })

    expect(dto).toEqual({
      repository: {
        sourceId: 'repository-1',
        workspaceId: 'space-1',
        mode: 'local',
        locator: 'local-repository:repository-1',
        currentVersion: 1,
        revisionLabel: 'main@abc123',
        fileCount: 1,
        totalBytes: 8,
        lastScannedAt: 20,
        createdAt: 10,
        updatedAt: 20
      },
      snapshot: {
        id: 'snapshot-1',
        sourceId: 'repository-1',
        version: 1,
        revisionLabel: 'main@abc123',
        manifestChecksum: 'manifest-checksum',
        fileCount: 1,
        totalBytes: 8,
        files: [
          {
            relativePath: 'README.md',
            contentChecksum: 'content-checksum',
            byteSize: 8
          }
        ],
        scannedAt: 20
      }
    })
    expect(JSON.stringify(dto)).not.toContain('/Users/private/source')
    expect(JSON.stringify(dto)).not.toContain('# Secret')
  })

  it('adds the knowledge-source summary to synchronization results', () => {
    const source = {
      id: 'repository-1',
      workspaceId: 'space-1',
      name: 'RealmFlow',
      type: 'repository' as const,
      locator: 'local-repository:repository-1',
      detail: 'Local Git repository',
      sortOrder: 0,
      status: 'indexed' as const,
      indexedAt: 20,
      revision: 2,
      createdAt: 10,
      updatedAt: 20
    }

    expect(
      toRepositorySyncResultDto(source, { repository, snapshot })
    ).toMatchObject({
      source,
      repository: { sourceId: 'repository-1' },
      snapshot: { version: 1 }
    })
  })
})
