import { describe, expect, it, vi } from 'vitest'
import { createKnowledgeNote } from '../../../../domain/knowledge-note'
import { KnowledgeNoteService } from './knowledge-note-service'

describe('KnowledgeNoteService', () => {
  it.each([
    ['createConversationNote', 'conversation_note'],
    ['createDecisionNote', 'decision'],
    ['createRetrospectiveNote', 'retrospective']
  ] as const)('persists and enqueues %s', async (method, kind) => {
    const dependencies = createDependencies()
    const service = new KnowledgeNoteService(dependencies)

    const result = await service[method](createCommand())

    expect(result.note.kind).toBe(kind)
    expect(dependencies.repository.create).toHaveBeenCalledWith(result)
    expect(dependencies.coordinator.enqueueSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKind: 'workspace',
        scopeId: 'workspace-1',
        sourceKind: kind,
        sourceId: 'note-1',
        sourceRevision: 1,
        sourceVersion: 'knowledge-note:1',
        sourceChecksum: result.version.checksum,
        documents: [
          {
            documentKey: 'knowledge-note.md',
            sourceEntityId: 'note-1',
            requirementId: 'requirement-1',
            sessionId: 'session-1',
            title: 'Decision',
            content: 'Use SQLite.'
          }
        ]
      }),
      'source_event'
    )
  })

  it('rejects cross-session, incomplete, out-of-order, and tool messages', async () => {
    const cases = [
      {
        messages: [message('message-1', 'user', 0, 'completed', 'session-2')],
        ids: ['message-1'],
        error: 'Knowledge Note messages must belong to the same session'
      },
      {
        messages: [message('message-1', 'assistant', 0, 'pending')],
        ids: ['message-1'],
        error: 'Knowledge Note messages must be completed'
      },
      {
        messages: [
          message('message-1', 'user', 0),
          message('message-2', 'assistant', 1)
        ],
        ids: ['message-2', 'message-1'],
        error: 'Knowledge Note messages must be selected in conversation order'
      },
      {
        messages: [message('message-1', 'tool', 0)],
        ids: ['message-1'],
        error: 'Knowledge Note messages may only include user or assistant roles'
      }
    ]

    for (const item of cases) {
      const dependencies = createDependencies(item.messages)
      const service = new KnowledgeNoteService(dependencies)
      await expect(
        service.createConversationNote({
          ...createCommand(),
          sourceMessageIds: item.ids
        })
      ).rejects.toThrow(item.error)
      expect(dependencies.repository.create).not.toHaveBeenCalled()
    }
  })

  it('creates a new version and enqueues its generation on edit', async () => {
    const dependencies = createDependencies()
    const current = aggregate()
    dependencies.repository.get.mockResolvedValue(current)
    dependencies.repository.update.mockImplementation(async (input) => ({
      status: 'applied',
      value: {
        note: input.note,
        currentVersion: input.version
      }
    }))
    const service = new KnowledgeNoteService(dependencies)

    const edited = await service.edit({
      noteId: 'note-1',
      expectedRevision: 1,
      versionId: 'version-2',
      title: 'Updated decision',
      content: 'Use SQLite and Qdrant.'
    })

    expect(edited.note).toMatchObject({ currentVersion: 2, revision: 2 })
    expect(dependencies.repository.update).toHaveBeenCalledWith(
      { note: edited.note, version: edited.currentVersion },
      1
    )
    expect(dependencies.coordinator.enqueueSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRevision: 2,
        sourceVersion: 'knowledge-note:2'
      }),
      'source_event'
    )
  })

  it('archives before hiding the current generation and is invisible on return', async () => {
    const dependencies = createDependencies()
    const current = aggregate()
    dependencies.repository.get.mockResolvedValue(current)
    dependencies.repository.archive.mockImplementation(async (note) => ({
      status: 'applied',
      value: { note, currentVersion: current.currentVersion }
    }))
    const service = new KnowledgeNoteService(dependencies)

    const archived = await service.archive({
      noteId: 'note-1',
      expectedRevision: 1
    })

    expect(archived.note.status).toBe('archived')
    expect(dependencies.visibility.hide).toHaveBeenCalledWith({
      scopeKind: 'workspace',
      scopeId: 'workspace-1',
      sourceKind: 'decision',
      sourceId: 'note-1'
    })
    expect(
      dependencies.repository.archive.mock.invocationCallOrder[0]
    ).toBeLessThan(dependencies.visibility.hide.mock.invocationCallOrder[0])
  })

  it('lists active notes for one workspace', async () => {
    const dependencies = createDependencies()
    const current = aggregate()
    dependencies.repository.listActive.mockResolvedValue([current])
    const service = new KnowledgeNoteService(dependencies)

    await expect(service.listActive('workspace-1')).resolves.toEqual([current])
    expect(dependencies.repository.listActive).toHaveBeenCalledWith(
      'workspace-1'
    )
  })
})

function createDependencies(messages = defaultMessages()) {
  return {
    sessions: {
      get: vi.fn().mockResolvedValue({
        id: 'session-1',
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        messages
      })
    },
    repository: {
      create: vi.fn().mockImplementation(async (value) => value),
      get: vi.fn(),
      listActive: vi.fn(),
      update: vi.fn(),
      archive: vi.fn()
    },
    coordinator: {
      enqueueSnapshot: vi.fn().mockResolvedValue({
        status: 'enqueued',
        job: { id: 'job-1', generationId: 'generation-1' }
      })
    },
    visibility: {
      hide: vi.fn().mockResolvedValue(undefined)
    },
    now: () => 20
  }
}

function createCommand() {
  return {
    id: 'note-1',
    versionId: 'version-1',
    workspaceId: 'workspace-1',
    sessionId: 'session-1',
    sourceMessageIds: ['message-1', 'message-2'],
    title: 'Decision',
    content: 'Use SQLite.'
  }
}

function aggregate() {
  const created = createKnowledgeNote({
    ...createCommand(),
    kind: 'decision' as const,
    at: 10
  })
  return { note: created.note, currentVersion: created.version }
}

function defaultMessages() {
  return [
    message('message-1', 'user', 0),
    message('message-2', 'assistant', 1)
  ]
}

function message(
  id: string,
  role: string,
  sortOrder: number,
  status = 'completed',
  sessionId = 'session-1'
) {
  return {
    id,
    sessionId,
    role,
    status,
    content: `${role} content`,
    sortOrder
  }
}
