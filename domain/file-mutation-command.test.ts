import { describe, expect, it } from 'vitest'
import { createFileMutationCommand } from './file-mutation-command'

describe('createFileMutationCommand', () => {
  it('describes a session mutation with an expected revision', () => {
    expect(
      createFileMutationCommand({
        mutationId: 'execution-1',
        idempotencyKey: 'message-1:tool-1',
        toolId: 'builtin.document.replace_text',
        mode: 'preview',
        arguments: {
          sessionId: 'document-1',
          expectedRevision: 3,
          query: 'old',
          replacement: 'new'
        }
      })
    ).toEqual({
      mutationId: 'execution-1',
      idempotencyKey: 'message-1:tool-1',
      toolId: 'builtin.document.replace_text',
      mode: 'preview',
      preconditions: [
        { kind: 'revision', target: 'document-1', value: 3 }
      ],
      operations: [
        {
          kind: 'document.replace_text',
          target: 'document-1'
        }
      ]
    })
  })

  it('combines a source checksum with an absent output precondition', () => {
    expect(
      createFileMutationCommand({
        mutationId: 'execution-2',
        idempotencyKey: 'message-1:tool-2',
        toolId: 'builtin.archives.extract',
        mode: 'commit',
        arguments: {
          path: 'bundle.zip',
          expectedChecksum: 'a'.repeat(64),
          outputPath: 'bundle'
        }
      }).preconditions
    ).toEqual([
      {
        kind: 'checksum',
        target: 'bundle.zip',
        value: 'a'.repeat(64)
      },
      { kind: 'absence', target: 'bundle' }
    ])
  })

  it('records checksums for every source in a create operation', () => {
    expect(
      createFileMutationCommand({
        mutationId: 'execution-3',
        idempotencyKey: 'message-1:tool-3',
        toolId: 'builtin.archives.create',
        mode: 'commit',
        arguments: {
          outputPath: 'bundle.zip',
          sources: [
            { path: 'one.txt', expectedChecksum: '1'.repeat(64) },
            { path: 'two.txt', expectedChecksum: '2'.repeat(64) }
          ]
        }
      }).preconditions
    ).toEqual([
      {
        kind: 'checksum',
        target: 'one.txt',
        value: '1'.repeat(64)
      },
      {
        kind: 'checksum',
        target: 'two.txt',
        value: '2'.repeat(64)
      },
      { kind: 'absence', target: 'bundle.zip' }
    ])
  })

  it('rejects a write command without a version or absence precondition', () => {
    expect(() =>
      createFileMutationCommand({
        mutationId: 'execution-4',
        idempotencyKey: 'message-1:tool-4',
        toolId: 'builtin.files.trash',
        mode: 'commit',
        arguments: { path: 'notes.txt' }
      })
    ).toThrow('File mutation requires a version or absence precondition')
  })
})
