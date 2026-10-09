import { createHash } from 'node:crypto'
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKnowledgeSource } from '../../../../domain/knowledge-source'
import { createLocalFileSource } from '../../../../domain/local-file-source'
import type { WorkspaceRepository } from '../ports/business-repositories'
import {
  LocalFileIngestionService,
  type LocalFileKnowledgeSourcePort
} from './local-file-ingestion-service'

describe('LocalFileIngestionService', () => {
  let directory: string
  let workspacePath: string
  let selectedPath: string
  let sequence: number
  let knowledgeSources: LocalFileKnowledgeSourcePort

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-local-file-'))
    workspacePath = join(directory, 'space')
    selectedPath = join(directory, 'selected', 'architecture.md')
    await mkdir(join(workspacePath, '.realmflow', 'tmp'), { recursive: true })
    await mkdir(join(directory, 'selected'), { recursive: true })
    await writeFile(selectedPath, '# Architecture')
    sequence = 0
    knowledgeSources = {
      registerLocalFiles: vi.fn<
        LocalFileKnowledgeSourcePort['registerLocalFiles']
      >(async (command) =>
        command.items.map((item) =>
          createKnowledgeSource({
            id: item.id,
            workspaceId: command.workspaceId,
            name: item.name,
            type: 'file',
            locator: item.localFile.locator,
            detail: item.detail,
            sortOrder: item.sortOrder,
            at: 100
          })
        )
      ),
      getLocalFileSource: vi.fn(),
      listLocalFileSources: vi.fn(async () => []),
      refreshLocalFile: vi.fn(async ({ localFile }) => ({
        source: source('stale', 4),
        contentChanged: true,
        localFile
      })),
      remove: vi.fn(async () => source('removed', 2))
    }
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('copies an authorized file into its managed source directory', async () => {
    const service = createService()

    const result = await service.ingest({
      workspaceId: 'space-1',
      selectionId: 'selection-1',
      filePaths: ['architecture.md'],
      storageMode: 'managed_copy',
      idempotencyKey: 'ingest-1'
    })

    expect(result).toMatchObject([
      { id: 'source-1', status: 'registered', name: 'architecture.md' }
    ])
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1',
      'architecture.md'
    )
    await expect(readFile(managedPath, 'utf8')).resolves.toBe('# Architecture')
    expect(knowledgeSources.registerLocalFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'space-1',
        idempotencyKey: 'ingest-1',
        items: [
          expect.objectContaining({
            id: 'source-1',
            localFile: expect.objectContaining({
              originalPath: selectedPath,
              managedRelativePath:
                '.realmflow/knowledge/files/source-1/architecture.md'
            })
          })
        ]
      })
    )
  })

  it('persists an external reference without copying the original file', async () => {
    const service = createService()

    const result = await service.ingest({
      workspaceId: 'space-1',
      selectionId: 'selection-1',
      filePaths: ['architecture.md'],
      storageMode: 'external_reference',
      idempotencyKey: 'ingest-2'
    })

    expect(result[0].locator).toBe('external:source-1')
    await expect(
      stat(join(workspacePath, '.realmflow', 'knowledge'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects duplicate selected paths before resolving files', async () => {
    const resolveSelectedFile = vi.fn(async () => selectedPath)
    const service = createService(resolveSelectedFile)

    await expect(
      service.ingest({
        workspaceId: 'space-1',
        selectionId: 'selection-1',
        filePaths: ['architecture.md', 'architecture.md'],
        storageMode: 'managed_copy',
        idempotencyKey: 'ingest-3'
      })
    ).rejects.toThrow('Selected file paths must be unique')
    expect(resolveSelectedFile).not.toHaveBeenCalled()
  })

  it('removes managed files when aggregate persistence fails', async () => {
    vi.mocked(knowledgeSources.registerLocalFiles).mockRejectedValue(
      new Error('database unavailable')
    )
    const service = createService()

    await expect(
      service.ingest({
        workspaceId: 'space-1',
        selectionId: 'selection-1',
        filePaths: ['architecture.md'],
        storageMode: 'managed_copy',
        idempotencyKey: 'ingest-4'
      })
    ).rejects.toThrow('database unavailable')
    await expect(
      stat(
        join(
          workspacePath,
          '.realmflow',
          'knowledge',
          'files',
          'source-1'
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('opens a persisted managed copy through a new restricted workspace', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1',
      'architecture.md'
    )
    await mkdir(join(managedPath, '..'), { recursive: true })
    await writeFile(managedPath, '# Managed')
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('managed_copy')
    )
    const openSessionFiles = vi.fn(async () => ({ opened: true }) as never)
    const service = createService(undefined, openSessionFiles)

    await expect(service.open({ sourceId: 'source-1' })).resolves.toEqual({
      opened: true
    })
    expect(openSessionFiles).toHaveBeenCalledWith([await realpath(managedPath)])
  })

  it('refreshes a changed managed copy before marking the source stale', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1',
      'architecture.md'
    )
    await mkdir(join(managedPath, '..'), { recursive: true })
    await writeFile(managedPath, '# Old')
    await writeFile(selectedPath, '# Changed')
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('managed_copy')
    )
    const service = createService()

    await expect(
      service.refresh({
        sourceId: 'source-1',
        expectedRevision: 3,
        idempotencyKey: 'refresh-1'
      })
    ).resolves.toMatchObject({ status: 'stale', revision: 4 })
    await expect(readFile(managedPath, 'utf8')).resolves.toBe('# Changed')
    expect(knowledgeSources.refreshLocalFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'source-1',
        expectedRevision: 3,
        localFile: expect.objectContaining({
          contentChecksum: expect.stringMatching(/^sha256:/),
          byteSize: 9
        })
      })
    )
  })

  it('short-circuits an unchanged file by persisted size and modified time', async () => {
    const metadata = await stat(selectedPath)
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      createLocalFileSource({
        sourceId: 'source-1',
        workspaceId: 'space-1',
        storageMode: 'external_reference',
        originalPath: selectedPath,
        contentChecksum: `sha256:${createHash('sha256')
          .update('# Architecture')
          .digest('hex')}`,
        byteSize: metadata.size,
        modifiedAt: metadata.mtimeMs,
        checkedAt: 1
      })
    )
    const service = createService()

    await expect(service.probe('source-1')).resolves.toEqual({
      status: 'unchanged',
      checksum: expect.stringMatching(/^sha256:/)
    })

    expect(knowledgeSources.refreshLocalFile).not.toHaveBeenCalled()
  })

  it('requires checksum confirmation when file metadata changed', async () => {
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('external_reference')
    )
    const service = createService()

    await expect(service.probe('source-1')).resolves.toEqual({
      status: 'changed'
    })
  })

  it('restores the previous managed copy when refresh persistence fails', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1',
      'architecture.md'
    )
    await mkdir(join(managedPath, '..'), { recursive: true })
    await writeFile(managedPath, '# Old')
    await writeFile(selectedPath, '# Changed')
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('managed_copy')
    )
    vi.mocked(knowledgeSources.refreshLocalFile).mockRejectedValue(
      new Error('database unavailable')
    )
    const service = createService()

    await expect(
      service.refresh({
        sourceId: 'source-1',
        expectedRevision: 3,
        idempotencyKey: 'refresh-2'
      })
    ).rejects.toThrow('database unavailable')
    await expect(readFile(managedPath, 'utf8')).resolves.toBe('# Old')
  })

  it('preserves the old managed copy when the original file was deleted', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1',
      'architecture.md'
    )
    await mkdir(join(managedPath, '..'), { recursive: true })
    await writeFile(managedPath, '# Old')
    await rm(selectedPath)
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('managed_copy')
    )
    const service = createService()

    await expect(
      service.refresh({
        sourceId: 'source-1',
        expectedRevision: 3,
        idempotencyKey: 'refresh-deleted'
      })
    ).rejects.toMatchObject({ code: 'ENOENT' })

    await expect(readFile(managedPath, 'utf8')).resolves.toBe('# Old')
    expect(knowledgeSources.refreshLocalFile).not.toHaveBeenCalled()
  })

  it('refreshes from a file replaced at the original path', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1',
      'architecture.md'
    )
    await mkdir(join(managedPath, '..'), { recursive: true })
    await writeFile(managedPath, '# Old')
    await rename(selectedPath, `${selectedPath}.replaced`)
    await writeFile(selectedPath, '# Replacement')
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('managed_copy')
    )
    const service = createService()

    await expect(
      service.refresh({
        sourceId: 'source-1',
        expectedRevision: 3,
        idempotencyKey: 'refresh-replaced'
      })
    ).resolves.toMatchObject({ status: 'stale' })

    await expect(readFile(managedPath, 'utf8')).resolves.toBe('# Replacement')
    expect(knowledgeSources.refreshLocalFile).toHaveBeenCalledWith(
      expect.objectContaining({
        localFile: expect.objectContaining({
          contentChecksum: checksum('# Replacement'),
          byteSize: 13
        })
      })
    )
  })

  it('preserves the old managed copy when read permission is revoked', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1',
      'architecture.md'
    )
    await mkdir(join(managedPath, '..'), { recursive: true })
    await writeFile(managedPath, '# Old')
    await chmod(selectedPath, 0o000)
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('managed_copy')
    )
    const service = createService()

    await expect(
      service.refresh({
        sourceId: 'source-1',
        expectedRevision: 3,
        idempotencyKey: 'refresh-permission'
      })
    ).rejects.toMatchObject({ code: 'EACCES' })

    await chmod(selectedPath, 0o600)
    await expect(readFile(managedPath, 'utf8')).resolves.toBe('# Old')
    expect(knowledgeSources.refreshLocalFile).not.toHaveBeenCalled()
  })

  it('rejects a file that changes while its content is being read', async () => {
    const managedPath = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1',
      'architecture.md'
    )
    await mkdir(join(managedPath, '..'), { recursive: true })
    await writeFile(managedPath, '# Old')
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('managed_copy')
    )
    let reads = 0
    const service = createService(
      undefined,
      undefined,
      async (path) => {
        const content = await readFile(path)
        reads += 1
        if (reads === 1) {
          await writeFile(selectedPath, '# Changed while reading')
        }
        return content
      }
    )

    await expect(
      service.refresh({
        sourceId: 'source-1',
        expectedRevision: 3,
        idempotencyKey: 'refresh-read-race'
      })
    ).rejects.toThrow('Local file changed during ingestion')

    await expect(readFile(managedPath, 'utf8')).resolves.toBe('# Old')
    expect(reads).toBe(1)
    expect(knowledgeSources.refreshLocalFile).not.toHaveBeenCalled()
  })

  it('removes only the managed copy after logical source removal succeeds', async () => {
    const managedDirectory = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1'
    )
    await mkdir(managedDirectory, { recursive: true })
    await writeFile(join(managedDirectory, 'architecture.md'), '# Managed')
    vi.mocked(knowledgeSources.getLocalFileSource).mockResolvedValue(
      localFileSource('managed_copy')
    )
    const service = createService()

    await service.remove({
      id: 'source-1',
      expectedRevision: 1,
      idempotencyKey: 'remove-1'
    })

    await expect(stat(managedDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(selectedPath, 'utf8')).resolves.toBe('# Architecture')
  })

  it('cleans only private temporary and orphaned managed directories on startup', async () => {
    const temporaryIngestion = join(
      workspacePath,
      '.realmflow',
      'tmp',
      'local-file-ingestion',
      'abandoned'
    )
    const keptDirectory = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-1'
    )
    const orphanDirectory = join(
      workspacePath,
      '.realmflow',
      'knowledge',
      'files',
      'source-orphan'
    )
    await mkdir(temporaryIngestion, { recursive: true })
    await mkdir(keptDirectory, { recursive: true })
    await mkdir(orphanDirectory, { recursive: true })
    vi.mocked(knowledgeSources.listLocalFileSources).mockResolvedValue([
      localFileSource('managed_copy')
    ])
    const service = createService()

    await expect(service.recover()).resolves.toBe(2)

    await expect(stat(temporaryIngestion)).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expect(stat(orphanDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(keptDirectory)).resolves.toMatchObject({})
    await expect(readFile(selectedPath, 'utf8')).resolves.toBe('# Architecture')
  })

  function createService(
    resolveSelectedFile = vi.fn(async () => selectedPath),
    openSessionFiles = vi.fn(),
    readBytes: (path: string) => Promise<Uint8Array> = async (path) =>
      readFile(path)
  ): LocalFileIngestionService {
    const workspaces = {
      get: vi.fn(async () => ({
        id: 'space-1',
        path: workspacePath,
        label: 'Space',
        description: '',
        sortOrder: 0,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      })),
      list: vi.fn(async () => [
        {
          id: 'space-1',
          path: workspacePath,
          label: 'Space',
          description: '',
          sortOrder: 0,
          revision: 1,
          createdAt: 1,
          updatedAt: 1
        }
      ])
    } as unknown as WorkspaceRepository
    const dependencies = {
      workspaces,
      workspaceFiles: {
        resolveSelectedFile,
        openSessionFiles
      },
      knowledgeSources,
      readBytes,
      now: () => 100,
      createId: () => `source-${++sequence}`
    }
    return new LocalFileIngestionService(dependencies)
  }

  function localFileSource(storageMode: 'managed_copy' | 'external_reference') {
    return createLocalFileSource({
      sourceId: 'source-1',
      workspaceId: 'space-1',
      storageMode,
      originalPath: selectedPath,
      ...(storageMode === 'managed_copy'
        ? {
            managedRelativePath:
              '.realmflow/knowledge/files/source-1/architecture.md'
          }
        : {}),
      contentChecksum: `sha256:${'a'.repeat(64)}`,
      byteSize: 5,
      modifiedAt: 1,
      checkedAt: 1
    })
  }
})

function source(
  status: 'stale' | 'removed',
  revision: number
) {
  return {
    id: 'source-1',
    workspaceId: 'space-1',
    name: 'architecture.md',
    type: 'file' as const,
    locator: 'managed:.realmflow/knowledge/files/source-1/architecture.md',
    detail: '受管副本',
    sortOrder: 0,
    status,
    revision,
    createdAt: 1,
    updatedAt: 2
  }
}

function checksum(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}
