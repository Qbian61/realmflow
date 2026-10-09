import { describe, expect, it, vi } from 'vitest'
import type { RepositorySyncResult } from './repository-ingestion-store'
import { runRepositoryIngestionWithIndexDispatch } from './repository-index-dispatch'

describe('runRepositoryIngestionWithIndexDispatch', () => {
  it('enqueues and wakes the worker after a successful repository snapshot', async () => {
    const result = repositoryResult('indexed', true)
    const enqueue = vi.fn().mockResolvedValue({
      status: 'enqueued',
      job: { id: 'job-1', generationId: 'generation-1' }
    })
    const scheduleDrain = vi.fn()

    await expect(
      runRepositoryIngestionWithIndexDispatch({
        ingest: vi.fn().mockResolvedValue(result),
        enqueue,
        scheduleDrain
      })
    ).resolves.toBe(result)

    expect(enqueue).toHaveBeenCalledWith({
      sourceId: 'repository-1',
      triggerSource: 'source_event'
    })
    expect(scheduleDrain).toHaveBeenCalledOnce()
  })

  it('does not enqueue when repository synchronization failed', async () => {
    const result = repositoryResult('failed', false)
    const enqueue = vi.fn()
    const scheduleDrain = vi.fn()

    await expect(
      runRepositoryIngestionWithIndexDispatch({
        ingest: vi.fn().mockResolvedValue(result),
        enqueue,
        scheduleDrain
      })
    ).resolves.toBe(result)

    expect(enqueue).not.toHaveBeenCalled()
    expect(scheduleDrain).not.toHaveBeenCalled()
  })

  it('does not enqueue when ingestion rejects before committing a snapshot', async () => {
    const enqueue = vi.fn()
    const scheduleDrain = vi.fn()

    await expect(
      runRepositoryIngestionWithIndexDispatch({
        ingest: vi.fn().mockRejectedValue(new Error('scan failed')),
        enqueue,
        scheduleDrain
      })
    ).rejects.toThrow('scan failed')

    expect(enqueue).not.toHaveBeenCalled()
    expect(scheduleDrain).not.toHaveBeenCalled()
  })
})

function repositoryResult(
  status: 'indexed' | 'failed',
  withSnapshot: boolean
): RepositorySyncResult {
  return {
    source: {
      id: 'repository-1',
      workspaceId: 'space-1',
      name: 'Repository',
      type: 'repository',
      locator: 'local-repository:repository-1',
      detail: '1 file',
      status,
      sortOrder: 0,
      revision: 3,
      createdAt: 1,
      updatedAt: 2
    },
    ...(withSnapshot
      ? {
          snapshot: {
            id: 'snapshot-1',
            sourceId: 'repository-1',
            version: 1,
            branch: 'main',
            revisionLabel: 'main@abc',
            manifestChecksum: `sha256:${'a'.repeat(64)}`,
            fileCount: 1,
            totalBytes: 8,
            files: [
              {
                relativePath: 'README.md',
                content: '# Readme',
                contentChecksum: `sha256:${'b'.repeat(64)}`,
                byteSize: 8
              }
            ],
            scannedAt: 2
          }
        }
      : {})
  }
}
