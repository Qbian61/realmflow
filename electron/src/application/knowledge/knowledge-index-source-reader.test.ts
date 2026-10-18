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

  it('freezes managed file content from workspace rootPath and detects changes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-index-reader-'))
    const relativePath = '.realmflow/knowledge/files/source-1/notes.md'
    const path = join(directory, relativePath)
    await mkdir(join(directory, '.realmflow/knowledge/files/source-1'), {
      recursive: true
    })
    await writeFile(path, 'alpha')
    const checksum = digest('alpha')
    const contentExtractor = {
      extract: vi.fn().mockResolvedValue({
        sourceChecksum: checksum,
        format: 'md',
        extractorVersion: 'text-v1',
        units: [
          {
            key: 'content',
            title: 'Notes',
            text: 'alpha',
            checksum,
            byteSize: 5
          }
        ]
      })
    }
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
          path: '/spaces/space-1',
          rootPath: directory
        })
      } as never,
      contentExtractor
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
    expect(contentExtractor.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'notes.md',
        sourceChecksum: checksum,
        policy: expect.objectContaining({
          consumer: 'knowledge_index'
        })
      })
    )

    await writeFile(path, 'beta')
    expect(await reader.isCurrent(snapshot)).toBe(false)
    await expect(reader.readCurrentIdentity('source-1')).resolves.toEqual({
      scopeKind: 'workspace',
      scopeId: 'space-1',
      sourceKind: 'file',
      sourceId: 'source-1',
      sourceRevision: 3,
      sourceVersion: `file:${checksum}`,
      sourceChecksum: checksum
    })
  })

  it('classifies invalid UTF-8 local files as unsupported format', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-index-reader-'))
    const relativePath = '.realmflow/knowledge/files/source-1/invalid.txt'
    const path = join(directory, relativePath)
    const bytes = Uint8Array.from([0xc3, 0x28])
    await mkdir(join(directory, '.realmflow/knowledge/files/source-1'), {
      recursive: true
    })
    await writeFile(path, bytes)
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const reader = new MainKnowledgeIndexSourceReader({
      sources: {
        get: vi.fn().mockResolvedValue({
          id: 'source-1',
          workspaceId: 'space-1',
          name: 'Invalid text',
          type: 'file',
          revision: 1
        })
      },
      localFiles: {
        getLocalFileSource: vi.fn().mockResolvedValue({
          sourceId: 'source-1',
          workspaceId: 'space-1',
          storageMode: 'managed_copy',
          originalPath: '/unused/invalid.txt',
          managedRelativePath: relativePath,
          contentChecksum: checksum,
          byteSize: bytes.byteLength,
          modifiedAt: 1,
          checkedAt: 1
        })
      } as never,
      onlineDocuments: {} as never,
      repositories: {} as never,
      workspaces: {
        get: vi.fn().mockResolvedValue({
          id: 'space-1',
          path: '/spaces/space-1',
          rootPath: directory
        })
      } as never,
      contentExtractor: {
        extract: vi.fn().mockRejectedValue(
          Object.assign(new Error('Knowledge source format is unsupported'), {
            code: 'unsupported_format'
          })
        )
      }
    })

    await expect(reader.readCurrent('source-1')).rejects.toMatchObject({
      code: 'unsupported_format'
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
          contentChecksum: digest('document body'),
          documents: [
            {
              unitKey: 'page/000001',
              title: 'Page 1',
              content: 'document body',
              checksum: digest('document body'),
              byteSize: 13
            },
            {
              unitKey: 'page/000002',
              title: 'Page 2',
              content: 'second page',
              checksum: digest('second page'),
              byteSize: 11
            }
          ]
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
            },
            {
              relativePath: 'docs/brief.pdf',
              contentChecksum: digest('pdf bytes'),
              byteSize: 9
            }
          ],
          documents: [
            {
              sourcePath: 'README.md',
              unitKey: 'content',
              title: 'README.md',
              content: 'readme',
              checksum: digest('readme'),
              byteSize: 6
            },
            {
              sourcePath: 'src/index.ts',
              unitKey: 'content',
              title: 'src/index.ts',
              content: 'export {}',
              checksum: digest('export {}'),
              byteSize: 9
            },
            {
              sourcePath: 'docs/brief.pdf',
              unitKey: 'page/1',
              title: 'Page 1',
              content: 'Quarterly report',
              checksum: digest('Quarterly report'),
              byteSize: 16
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
          documentKey: 'page/000001',
          sourceEntityId: 'doc-1',
          title: 'Page 1',
          content: 'document body',
          checksum: digest('document body'),
          byteSize: 13
        },
        {
          documentKey: 'page/000002',
          sourceEntityId: 'doc-1',
          title: 'Page 2',
          content: 'second page',
          checksum: digest('second page'),
          byteSize: 11
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
        },
        {
          documentKey: 'docs/brief.pdf#page/1',
          sourceEntityId: 'repo-1',
          title: 'Page 1',
          content: 'Quarterly report',
          checksum: digest('Quarterly report'),
          byteSize: 16
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
          ],
          documents: [
            {
              sourcePath: '.env.production',
              unitKey: 'content',
              title: '.env.production',
              content: 'API_KEY=body-canary',
              checksum: digest('API_KEY=body-canary'),
              byteSize: 19
            },
            {
              sourcePath: 'src/index.ts',
              unitKey: 'content',
              title: 'src/index.ts',
              content: 'export {}',
              checksum: digest('export {}'),
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
      readSource: vi.fn().mockResolvedValue({
        bytes: new TextEncoder().encode('accepted design'),
        fileName: 'artifacts/design.md',
        mimeType: 'text/markdown'
      })
    }
    const reader = new MainKnowledgeIndexSourceReader({
      sources: {} as never,
      localFiles: {} as never,
      onlineDocuments: {} as never,
      repositories: {} as never,
      workspaces: {} as never,
      artifacts,
      contentExtractor: {
        extract: vi.fn().mockResolvedValue({
          sourceChecksum: digest('accepted design'),
          format: 'md',
          extractorVersion: 'text-v1',
          units: [
            {
              key: 'content',
              title: 'design.md',
              text: 'accepted design',
              checksum: digest('accepted design'),
              byteSize: 15
            }
          ]
        })
      }
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
          documentKey: 'content',
          sourceEntityId: 'artifact-1',
          title: 'design.md',
          content: 'accepted design',
          checksum: digest('accepted design'),
          byteSize: 15
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
