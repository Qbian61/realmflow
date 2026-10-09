import { describe, expect, it } from 'vitest'
import {
  archiveKnowledgeNote,
  createKnowledgeNote,
  editKnowledgeNote,
  selectKnowledgeNoteMessages
} from './knowledge-note'

describe('Knowledge Note', () => {
  it.each([
    'conversation_note',
    'decision',
    'retrospective'
  ] as const)('creates an active %s at version one', (kind) => {
    const result = createKnowledgeNote({
      id: `note-${kind}`,
      versionId: `version-${kind}-1`,
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      sessionId: 'session-1',
      kind,
      title: '  Confirmed direction  ',
      content: '  Keep all knowledge local.\r\n  ',
      sourceMessageIds: ['message-1', 'message-2'],
      at: 10
    })

    expect(result.note).toEqual({
      id: `note-${kind}`,
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      sessionId: 'session-1',
      kind,
      currentVersionId: `version-${kind}-1`,
      currentVersion: 1,
      status: 'active',
      revision: 1,
      createdAt: 10,
      updatedAt: 10
    })
    expect(result.version).toMatchObject({
      id: `version-${kind}-1`,
      noteId: `note-${kind}`,
      version: 1,
      title: 'Confirmed direction',
      content: 'Keep all knowledge local.',
      sourceMessageIds: ['message-1', 'message-2'],
      createdAt: 10
    })
    expect(result.version.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('selects completed user and assistant messages from one session in order', () => {
    const messages = [
      message('message-1', 'session-1', 'user', 'Question', 0),
      message('message-2', 'session-1', 'assistant', 'Answer', 1)
    ]

    expect(
      selectKnowledgeNoteMessages({
        sessionId: 'session-1',
        messageIds: ['message-1', 'message-2'],
        messages
      })
    ).toEqual(messages)
  })

  it('rejects messages from another session', () => {
    expect(() =>
      selectKnowledgeNoteMessages({
        sessionId: 'session-1',
        messageIds: ['message-1'],
        messages: [message('message-1', 'session-2', 'user', 'Question', 0)]
      })
    ).toThrow('Knowledge Note messages must belong to the same session')
  })

  it('rejects incomplete messages and out-of-order selections', () => {
    expect(() =>
      selectKnowledgeNoteMessages({
        sessionId: 'session-1',
        messageIds: ['message-1'],
        messages: [
          { ...message('message-1', 'session-1', 'assistant', '', 0), status: 'pending' }
        ]
      })
    ).toThrow('Knowledge Note messages must be completed')

    expect(() =>
      selectKnowledgeNoteMessages({
        sessionId: 'session-1',
        messageIds: ['message-2', 'message-1'],
        messages: [
          message('message-1', 'session-1', 'user', 'Question', 0),
          message('message-2', 'session-1', 'assistant', 'Answer', 1)
        ]
      })
    ).toThrow('Knowledge Note messages must be selected in conversation order')
  })

  it.each(['tool', 'system', 'hidden_prompt'])(
    'rejects the excluded %s role',
    (role) => {
      expect(() =>
        selectKnowledgeNoteMessages({
          sessionId: 'session-1',
          messageIds: ['message-1'],
          messages: [
            message('message-1', 'session-1', role, 'Internal context', 0)
          ]
        })
      ).toThrow('Knowledge Note messages may only include user or assistant roles')
    }
  )

  it('edits an active note by creating an immutable next version', () => {
    const created = createKnowledgeNote({
      id: 'note-1',
      versionId: 'version-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      kind: 'decision',
      title: 'Direction',
      content: 'Use SQLite.',
      sourceMessageIds: ['message-1'],
      at: 10
    })

    const edited = editKnowledgeNote({
      note: created.note,
      currentVersion: created.version,
      versionId: 'version-2',
      title: 'Direction',
      content: 'Use SQLite as the source of truth.',
      at: 20
    })

    expect(edited.note).toMatchObject({
      currentVersionId: 'version-2',
      currentVersion: 2,
      revision: 2,
      updatedAt: 20
    })
    expect(edited.version).toMatchObject({
      id: 'version-2',
      noteId: 'note-1',
      version: 2,
      sourceMessageIds: ['message-1']
    })
    expect(created.version.content).toBe('Use SQLite.')
  })

  it('archives an active note and blocks further edits', () => {
    const created = createKnowledgeNote({
      id: 'note-1',
      versionId: 'version-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      kind: 'retrospective',
      title: 'Lesson',
      content: 'Validate ordering.',
      sourceMessageIds: ['message-1'],
      at: 10
    })
    const archived = archiveKnowledgeNote(created.note, 20)

    expect(archived).toMatchObject({
      status: 'archived',
      revision: 2,
      updatedAt: 20
    })
    expect(() =>
      editKnowledgeNote({
        note: archived,
        currentVersion: created.version,
        versionId: 'version-2',
        title: 'Lesson',
        content: 'Changed',
        at: 30
      })
    ).toThrow('Archived Knowledge Note cannot be edited')
  })
})

function message(
  id: string,
  sessionId: string,
  role: string,
  content: string,
  sortOrder: number
) {
  return {
    id,
    sessionId,
    role,
    status: 'completed' as const,
    content,
    sortOrder
  }
}
