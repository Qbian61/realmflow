import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ArchiveService } from '../files/archive-service'
import { createArchiveToolHandlers } from './builtin-archive-tool-handlers'

describe('builtin archive Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let archives: {
    list: ReturnType<typeof vi.fn>
    extract: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-archive-tool-'))
    rootPath = join(temporaryDirectory, 'scope')
    await mkdir(join(rootPath, 'source', 'nested'), { recursive: true })
    await writeFile(join(rootPath, 'bundle.zip'), ZIP_HEADER)
    await writeFile(join(rootPath, 'source', 'report.txt'), 'report')
    await writeFile(join(rootPath, 'source', 'nested', 'data.json'), '{}')
    await writeFile(join(rootPath, 'unsupported.rar'), Buffer.from('RAR!'))
    archives = {
      list: vi.fn().mockResolvedValue(result()),
      extract: vi.fn().mockResolvedValue({
        ...result(),
        outputPath: 'output'
      }),
      create: vi.fn().mockResolvedValue({
        ...result(),
        outputPath: 'created.zip',
        outputChecksum: 'b'.repeat(64)
      })
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('registers exactly three supported archive handlers', () => {
    expect(
      createArchiveToolHandlers({ archives }).map(({ name }) => name)
    ).toEqual(['archives.list', 'archives.extract', 'archives.create'])
  })

  it('lists an authorized archive for a model request', async () => {
    await run('archives.list', { path: 'bundle.zip' })

    expect(archives.list).toHaveBeenCalledWith({
      sourceCanonicalPath: expect.stringMatching(/bundle\.zip$/),
      sourceRelativePath: 'bundle.zip',
      format: 'zip',
      signal: expect.any(AbortSignal)
    })
  })

  it('extracts only into an authorized new destination', async () => {
    await run('archives.extract', {
      path: 'bundle.zip',
      expectedChecksum: sha256(ZIP_HEADER),
      outputPath: 'output',
      expectedAbsent: true
    })
    const canonicalRoot = await realpath(rootPath)

    expect(archives.extract).toHaveBeenCalledWith({
      sourceCanonicalPath: expect.stringMatching(/bundle\.zip$/),
      sourceRelativePath: 'bundle.zip',
      expectedSourceChecksum: sha256(ZIP_HEADER),
      outputCanonicalPath: join(canonicalRoot, 'output'),
      outputRelativePath: 'output',
      format: 'zip',
      signal: expect.any(AbortSignal)
    })
  })

  it('recursively maps authorized sources into a new archive', async () => {
    await run('archives.create', {
      outputPath: 'created.zip',
      sources: [
        {
          path: 'source',
          expectedChecksum: await directoryChecksum(join(rootPath, 'source'))
        }
      ],
      expectedAbsent: true
    })
    const canonicalRoot = await realpath(rootPath)

    expect(archives.create).toHaveBeenCalledWith({
      outputCanonicalPath: join(canonicalRoot, 'created.zip'),
      outputRelativePath: 'created.zip',
      format: 'zip',
      sourceChecksums: [
        {
          canonicalPath: join(canonicalRoot, 'source'),
          expectedChecksum: await directoryChecksum(join(rootPath, 'source'))
        }
      ],
      entries: expect.arrayContaining([
        expect.objectContaining({ path: 'source', type: 'directory' }),
        expect.objectContaining({
          path: 'source/report.txt',
          type: 'file'
        }),
        expect.objectContaining({
          path: 'source/nested/data.json',
          type: 'file'
        })
      ]),
      signal: expect.any(AbortSignal)
    })
  })

  it('rejects escaped paths and unsupported archive formats before delegation', async () => {
    await expect(
      run('archives.extract', {
        path: 'bundle.zip',
        expectedChecksum: sha256(ZIP_HEADER),
        outputPath: '../outside',
        expectedAbsent: true
      })
    ).rejects.toThrow('Path is outside the bound workspace')
    await expect(
      run('archives.list', { path: 'unsupported.rar' })
    ).rejects.toThrow('Archive format is not supported')
    await expect(
      run('archives.create', {
        outputPath: 'created.rar',
        sources: [
          {
            path: 'source/report.txt',
            expectedChecksum: sha256('report')
          }
        ],
        expectedAbsent: true
      })
    ).rejects.toThrow('Archive format is not supported')
    expect(archives.extract).not.toHaveBeenCalled()
    expect(archives.list).not.toHaveBeenCalled()
    expect(archives.create).not.toHaveBeenCalled()
  })

  it('rejects malformed source arrays and GZ directories', async () => {
    await expect(
      run('archives.create', {
        outputPath: 'created.zip',
        sources: [],
        expectedAbsent: true
      })
    ).rejects.toThrow('Archive Tool sources is invalid')
    await expect(
      run('archives.create', {
        outputPath: 'created.gz',
        sources: [
          {
            path: 'source',
            expectedChecksum: await directoryChecksum(join(rootPath, 'source'))
          }
        ],
        expectedAbsent: true
      })
    ).rejects.toThrow('GZ creation requires exactly one regular file')
    expect(archives.create).not.toHaveBeenCalled()
  })

  async function run(name: string, arguments_: JsonObject) {
    const handler = createArchiveToolHandlers({
      archives: archives as unknown as Pick<
        ArchiveService,
        'list' | 'extract' | 'create'
      >
    }).find((candidate) => candidate.name === name)
    if (!handler) throw new Error(`Missing ${name}`)
    return handler.execute({
      arguments: arguments_,
      requestedBy: { type: 'model', id: 'model-1' },
      context: {
        owner: { type: 'conversation', id: 'conversation-1' },
        correlationId: 'correlation-1',
        causationId: 'command-1'
      },
      scopeRoots: [rootPath],
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }
})

const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04])

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

async function directoryChecksum(path: string): Promise<string> {
  const { checksumPath } = await import('./builtin-file-tool-support')
  return checksumPath(path)
}

function result() {
  return {
    sourcePath: 'bundle.zip',
    sourceChecksum: 'a'.repeat(64),
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
    compressedBytes: 4
  }
}
