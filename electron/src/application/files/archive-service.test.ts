import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  ArchiveAdapter,
  ArchiveListing,
  ArchiveSourceEntry
} from './archive-adapter'
import {
  ArchiveService,
  type ArchiveStorage
} from './archive-service'

describe('ArchiveService', () => {
  it('lists from memory without allocating staging', async () => {
    const storage = memoryStorage()
    const adapter = archiveAdapter()

    const result = await new ArchiveService({ adapter, storage }).list({
      sourceCanonicalPath: '/workspace/bundle.zip',
      sourceRelativePath: 'bundle.zip',
      format: 'zip',
      signal: signal()
    })

    expect(result).toMatchObject({
      sourcePath: 'bundle.zip',
      sourceChecksum: sha256(ARCHIVE_BYTES),
      format: 'zip',
      fileCount: 1
    })
    expect(storage.createStagingDirectory).not.toHaveBeenCalled()
  })

  it('removes staging and preserves the destination when extraction fails', async () => {
    const storage = memoryStorage({
      directories: ['/workspace/output']
    })
    const adapter = archiveAdapter()
    adapter.extract.mockRejectedValueOnce(new Error('invalid archive'))

    await expect(
      new ArchiveService({ adapter, storage }).extract({
        sourceCanonicalPath: '/workspace/bundle.zip',
        sourceRelativePath: 'bundle.zip',
        expectedSourceChecksum: sha256(ARCHIVE_BYTES),
        outputCanonicalPath: '/workspace/output',
        outputRelativePath: 'output',
        format: 'zip',
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'archive_output_conflict' })
    expect(adapter.extract).not.toHaveBeenCalled()
    expect(storage.readDirectory('/workspace/output')).toBe(true)
  })

  it('commits only a complete staging directory and returns relative paths', async () => {
    const storage = memoryStorage()
    const adapter = archiveAdapter()

    const result = await new ArchiveService({ adapter, storage }).extract({
      sourceCanonicalPath: '/workspace/bundle.zip',
      sourceRelativePath: 'bundle.zip',
      expectedSourceChecksum: sha256(ARCHIVE_BYTES),
      outputCanonicalPath: '/workspace/output',
      outputRelativePath: 'output',
      format: 'zip',
      signal: signal()
    })

    const stagingPath = storage.createStagingDirectory.mock.results[0].value
    expect(adapter.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationPath: await stagingPath,
        content: ARCHIVE_BYTES
      })
    )
    expect(storage.commitDirectory).toHaveBeenCalledWith({
      stagingPath: await stagingPath,
      outputCanonicalPath: '/workspace/output'
    })
    expect(result).toMatchObject({
      sourcePath: 'bundle.zip',
      outputPath: 'output',
      fileCount: 1
    })
  })

  it('removes staging when the source changes before commit', async () => {
    const storage = memoryStorage()
    storage.checksum
      .mockResolvedValueOnce(sha256(ARCHIVE_BYTES))
      .mockResolvedValueOnce(sha256(Buffer.from('changed')))

    await expect(
      new ArchiveService({ adapter: archiveAdapter(), storage }).extract({
        sourceCanonicalPath: '/workspace/bundle.zip',
        sourceRelativePath: 'bundle.zip',
        expectedSourceChecksum: sha256(ARCHIVE_BYTES),
        outputCanonicalPath: '/workspace/output',
        outputRelativePath: 'output',
        format: 'zip',
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'file_conflict' })
    expect(storage.remove).toHaveBeenCalledWith(
      await storage.createStagingDirectory.mock.results[0].value
    )
    expect(storage.commitDirectory).not.toHaveBeenCalled()
  })

  it('does not commit a cancelled extraction', async () => {
    const storage = memoryStorage()
    const adapter = archiveAdapter()
    const controller = new AbortController()
    adapter.extract.mockImplementationOnce(async () => {
      controller.abort()
      return LISTING
    })

    await expect(
      new ArchiveService({ adapter, storage }).extract({
        sourceCanonicalPath: '/workspace/bundle.zip',
        sourceRelativePath: 'bundle.zip',
        expectedSourceChecksum: sha256(ARCHIVE_BYTES),
        outputCanonicalPath: '/workspace/output',
        outputRelativePath: 'output',
        format: 'zip',
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(storage.remove).toHaveBeenCalled()
    expect(storage.commitDirectory).not.toHaveBeenCalled()
  })

  it('creates a new archive without replacing an existing target', async () => {
    const storage = memoryStorage({ files: ['/workspace/existing.zip'] })
    const entries: ArchiveSourceEntry[] = [
      {
        path: 'report.txt',
        canonicalPath: '/workspace/report.txt',
        type: 'file'
      }
    ]
    const service = new ArchiveService({
      adapter: archiveAdapter(),
      storage
    })

    await expect(
      service.create({
        outputCanonicalPath: '/workspace/existing.zip',
        outputRelativePath: 'existing.zip',
        format: 'zip',
        entries,
        sourceChecksums: [
          {
            canonicalPath: '/workspace/report.txt',
            expectedChecksum: sha256(SOURCE_BYTES)
          }
        ],
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'archive_output_conflict' })
    expect(storage.commitNew).not.toHaveBeenCalled()

    const result = await service.create({
      outputCanonicalPath: '/workspace/new.zip',
      outputRelativePath: 'new.zip',
      format: 'zip',
      entries,
      sourceChecksums: [
        {
          canonicalPath: '/workspace/report.txt',
          expectedChecksum: sha256(SOURCE_BYTES)
        }
      ],
      signal: signal()
    })

    expect(storage.commitNew).toHaveBeenCalledWith({
      canonicalPath: '/workspace/new.zip',
      content: CANDIDATE_BYTES
    })
    expect(result).toMatchObject({
      outputPath: 'new.zip',
      outputChecksum: sha256(CANDIDATE_BYTES),
      entryCount: 1
    })
  })
})

const ARCHIVE_BYTES = Buffer.from('archive')
const CANDIDATE_BYTES = Buffer.from('candidate')
const SOURCE_BYTES = Buffer.from('report')
const LISTING: ArchiveListing = {
  format: 'zip',
  entries: [
    {
      path: 'report.txt',
      type: 'file',
      size: 6,
      compressedSize: 4
    }
  ],
  entryCount: 1,
  fileCount: 1,
  expandedBytes: 6,
  compressedBytes: ARCHIVE_BYTES.byteLength
}

function archiveAdapter() {
  return {
    list: vi.fn().mockResolvedValue(LISTING),
    extract: vi.fn().mockResolvedValue(LISTING),
    create: vi.fn().mockResolvedValue(CANDIDATE_BYTES)
  } satisfies Pick<ArchiveAdapter, 'list' | 'extract' | 'create'>
}

function memoryStorage(options: {
  files?: string[]
  directories?: string[]
} = {}): ArchiveStorage & {
  checksum: ReturnType<typeof vi.fn>
  commitDirectory: ReturnType<typeof vi.fn>
  commitNew: ReturnType<typeof vi.fn>
  createStagingDirectory: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  readDirectory(path: string): boolean
} {
  const files = new Map<string, Buffer>([
    ['/workspace/bundle.zip', ARCHIVE_BYTES],
    ['/workspace/report.txt', SOURCE_BYTES],
    ...(options.files ?? []).map(
      (path) => [path, Buffer.from('existing')] as const
    )
  ])
  const directories = new Set(options.directories ?? [])
  let stagingIndex = 0
  const createStagingDirectory = vi.fn(async () => {
    const path = `/tmp/archive-staging-${++stagingIndex}`
    directories.add(path)
    return path
  })
  return {
    read: vi.fn(async (path) => {
      const content = files.get(path)
      if (!content) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return Buffer.from(content)
    }),
    checksum: vi.fn(async (path) => {
      const content = files.get(path)
      if (!content) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return sha256(content)
    }),
    exists: vi.fn(async (path) => files.has(path) || directories.has(path)),
    createStagingDirectory,
    commitDirectory: vi.fn(
      async ({ stagingPath, outputCanonicalPath }) => {
        if (directories.has(outputCanonicalPath)) {
          throw Object.assign(new Error('exists'), { code: 'EEXIST' })
        }
        directories.delete(stagingPath)
        directories.add(outputCanonicalPath)
      }
    ),
    commitNew: vi.fn(async ({ canonicalPath, content }) => {
      if (files.has(canonicalPath)) {
        throw Object.assign(new Error('exists'), { code: 'EEXIST' })
      }
      files.set(canonicalPath, Buffer.from(content))
    }),
    remove: vi.fn(async (path) => {
      files.delete(path)
      directories.delete(path)
    }),
    readDirectory: (path) => directories.has(path)
  }
}

function signal(): AbortSignal {
  return new AbortController().signal
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
