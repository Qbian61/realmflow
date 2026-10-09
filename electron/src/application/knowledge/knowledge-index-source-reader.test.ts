import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainKnowledgeIndexSourceReader } from './knowledge-index-source-reader'

describe('MainKnowledgeIndexSourceReader', () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('freezes the current D02 managed file content and detects changes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-index-reader-'))
    const relativePath = '.realmflow/knowledge/files/source-1/notes.md'
    const path = join(directory, relativePath)
    await mkdir(join(directory, '.realmflow/knowledge/files/source-1'), {
      recursive: true
    })
    await writeFile(path, 'alpha')
    const checksum = digest('alpha')
    const reader = new MainKnowledgeIndexSourceReader({
      sources: {
        get: vi.fn().mockResolvedValue({
          id: 'source-1',
          workspaceId: 'space-1',
          name: 'Notes',
          type: 'file',
          revision: 3
        })
      },
      localFiles: {
        getLocalFileSource: vi.fn().mockResolvedValue({
          sourceId: 'source-1',
          workspaceId: 'space-1',
          storageMode: 'managed_copy',
          originalPath: '/unused/notes.md',
          managedRelativePath: relativePath,
          contentChecksum: checksum,
          byteSize: 5,
          modifiedAt: 1,
          checkedAt: 1
        })
      } as never,
      onlineDocuments: {} as never,
      repositories: {} as never,
      workspaces: {
        get: vi.fn().mockResolvedValue({
          id: 'space-1',
          path: directory
        })
      } as never
    })

    const snapshot = await reader.readCurrent('source-1')
    expect(snapshot).toMatchObject({
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'file',
      sourceId: 'source-1',
      sourceRevision: 3,
      sourceVersion: `file:${checksum}`,
      documents: [
        {
          documentKey: 'content',
          sourceEntityId: 'source-1',
          title: 'Notes',
          content: 'alpha'
        }
      ]
    })
    expect(await reader.isCurrent(snapshot)).toBe(true)

    await writeFile(path, 'beta')
    expect(await reader.isCurrent(snapshot)).toBe(false)
    await expect(reader.readCurrentIdentity('source-1')).resolves.toEqual({
      sourceKind: 'file',
      sourceId: 'source-1',
      sourceRevision: 3,
      sourceVersion: `file:${checksum}`,
      sourceChecksum: checksum
    })
  })

  it('adapts current D03 and D04 snapshots without merging repository files', async () => {
    const sources = {
      get: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'doc-1',
          workspaceId: 'space-1',
          name: 'Design',
          type: 'document',
          revision: 4
        })
        .mockResolvedValueOnce({
          id: 'repo-1',
          workspaceId: 'space-1',
          name: 'Repository',
          type: 'repository',
          revision: 5
        })
    }
    const reader = new MainKnowledgeIndexSourceReader({
      sources,
      localFiles: {} as never,
      onlineDocuments: {
        getCurrentOnlineDocumentSnapshot: vi.fn().mockResolvedValue({
          version: 2,
          content: 'document body',
          contentChecksum: digest('document body')
        })
      } as never,
      repositories: {
        getCurrentRepositorySnapshot: vi.fn().mockResolvedValue({
          version: 7,
          manifestChecksum: digest('manifest'),
          files: [
            {
              relativePath: 'README.md',
              content: 'readme',
              contentChecksum: digest('readme'),
              byteSize: 6
            },
            {
              relativePath: 'src/index.ts',
              content: 'export {}',
              contentChecksum: digest('export {}'),
              byteSize: 9
            }
          ]
        })
      } as never,
      workspaces: {} as never
    })

    await expect(reader.readCurrent('doc-1')).resolves.toMatchObject({
      scopeId: 'space-1',
      sourceKind: 'document',
      sourceVersion: 'document:2',
      documents: [
        {
          documentKey: 'content',
          sourceEntityId: 'doc-1',
          title: 'Design',
          content: 'document body'
        }
      ]
    })
    await expect(reader.readCurrent('repo-1')).resolves.toMatchObject({
      scopeId: 'space-1',
      sourceKind: 'repository',
      sourceVersion: 'repository:7',
      documents: [
        {
          documentKey: 'README.md',
          sourceEntityId: 'repo-1',
          title: 'README.md',
          content: 'readme',
          checksum: digest('readme'),
          byteSize: 6
        },
        {
          documentKey: 'src/index.ts',
          sourceEntityId: 'repo-1',
          title: 'src/index.ts',
          content: 'export {}',
          checksum: digest('export {}'),
          byteSize: 9
        }
      ]
    })
  })

  it('removes sensitive repository paths from persisted snapshots before indexing', async () => {
    const reader = new MainKnowledgeIndexSourceReader({
      sources: {
        get: vi.fn().mockResolvedValue({
          id: 'repo-1',
          workspaceId: 'space-1',
          name: 'Repository',
          type: 'repository',
          revision: 5
        })
      },
      localFiles: {} as never,
      onlineDocuments: {} as never,
      repositories: {
        getCurrentRepositorySnapshot: vi.fn().mockResolvedValue({
          version: 7,
          manifestChecksum: digest('manifest'),
          files: [
            {
              relativePath: '.env.production',
              content: 'API_KEY=body-canary',
              contentChecksum: digest('API_KEY=body-canary'),
              byteSize: 19
            },
            {
              relativePath: 'src/index.ts',
              content: 'export {}',
              contentChecksum: digest('export {}'),
              byteSize: 9
            }
          ]
        })
      } as never,
      workspaces: {} as never
    })

    const snapshot = await reader.readCurrent('repo-1')

    expect(snapshot.documents).toEqual([
      expect.objectContaining({
        documentKey: 'src/index.ts',
        content: 'export {}'
      })
    ])
    expect(JSON.stringify(snapshot)).not.toContain('body-canary')
  })

  it('reloads a current formal artifact by id for durable worker recovery', async () => {
    const artifacts = {
      getKnowledgeArtifact: vi.fn().mockResolvedValue({
        artifact: {
          id: 'artifact-1',
          requirementId: 'requirement-1',
          nodeId: 'node-1',
          relativePath: 'artifacts/design.md',
          checksum: digest('accepted design'),
          version: 2,
          formal: true
        },
        workspaceId: 'space-1'
      }),
      readContent: vi.fn().mockResolvedValue('accepted design')
    }
    const reader = new MainKnowledgeIndexSourceReader({
      sources: {} as never,
      localFiles: {} as never,
      onlineDocuments: {} as never,
      repositories: {} as never,
      workspaces: {} as never,
      artifacts
    })

    const snapshot = await reader.readFrozen({
      sourceKind: 'artifact',
      sourceId: 'artifact-1'
    })

    expect(snapshot).toEqual({
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'artifact',
      sourceId: 'artifact-1',
      sourceRevision: 2,
      sourceVersion: 'artifact:2',
      sourceChecksum: digest('accepted design'),
      documents: [
        {
          documentKey: 'artifacts/design.md',
          sourceEntityId: 'artifact-1',
          title: 'artifacts/design.md',
          content: 'accepted design'
        }
      ]
    })
    await expect(reader.isCurrent(snapshot)).resolves.toBe(true)
  })

  it('reloads current Requirement Memory and Knowledge Note projections', async () => {
    const reader = new MainKnowledgeIndexSourceReader({
      sources: {} as never,
      localFiles: {} as never,
      onlineDocuments: {} as never,
      repositories: {} as never,
      workspaces: {} as never,
      requirementMemories: {
        getCurrent: vi.fn().mockResolvedValue({
          requirementId: 'requirement-1',
          workspaceId: 'space-1',
          completionVersion: 2,
          title: 'Requirement',
          content: 'Requirement memory',
          checksum: digest('Requirement memory')
        })
      },
      knowledgeNotes: {
        get: vi.fn().mockResolvedValue({
          note: {
            id: 'note-1',
            workspaceId: 'space-1',
            kind: 'decision',
            requirementId: 'requirement-1',
            sessionId: 'session-1',
            currentVersion: 3,
            revision: 4,
            status: 'active'
          },
          currentVersion: {
            version: 3,
            title: 'Decision',
            content: 'Use local vectors',
            checksum: digest('Use local vectors')
          }
        })
      }
    })

    await expect(
      reader.readFrozen({
        sourceKind: 'requirement_memory',
        sourceId: 'requirement-1'
      })
    ).resolves.toMatchObject({
      scopeId: 'space-1',
      sourceKind: 'requirement_memory',
      sourceRevision: 2,
      sourceVersion: 'requirement-memory:2',
      documents: [
        expect.objectContaining({ requirementId: 'requirement-1' })
      ]
    })
    const note = await reader.readFrozen({
      sourceKind: 'decision',
      sourceId: 'note-1'
    })
    expect(note).toMatchObject({
      scopeId: 'space-1',
      sourceKind: 'decision',
      sourceRevision: 4,
      sourceVersion: 'knowledge-note:3',
      documents: [
        expect.objectContaining({
          requirementId: 'requirement-1',
          sessionId: 'session-1'
        })
      ]
    })
    await expect(reader.isCurrent(note)).resolves.toBe(true)
  })

  it('rejects archived Knowledge Notes during recovery', async () => {
    const reader = new MainKnowledgeIndexSourceReader({
      sources: {} as never,
      localFiles: {} as never,
      onlineDocuments: {} as never,
      repositories: {} as never,
      workspaces: {} as never,
      knowledgeNotes: {
        get: vi.fn().mockResolvedValue({
          note: {
            id: 'note-1',
            workspaceId: 'space-1',
            kind: 'conversation_note',
            currentVersion: 1,
            revision: 2,
            status: 'archived'
          },
          currentVersion: {
            version: 1,
            title: 'Archived',
            content: 'Old content',
            checksum: digest('Old content')
          }
        })
      }
    })

    await expect(
      reader.readFrozen({
        sourceKind: 'conversation_note',
        sourceId: 'note-1'
      })
    ).rejects.toThrow('Knowledge Note is not current')
  })
})

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
