import { describe, expect, it } from 'vitest'
import { ContextAssembler } from './context-assembler'

describe('ContextAssembler', () => {
  it('assembles model context from ordered requirement and node sources', async () => {
    const assembler = new ContextAssembler({
      artifacts: {
        listPredecessorArtifacts: async () => [
          {
            id: 'artifact-1',
            version: 2,
            name: 'Analysis',
            content: 'Confirmed user and system constraints.'
          }
        ]
      },
      knowledge: {
        search: async () => [
          {
            id: 'chunk-1',
            version: 3,
            score: 0.91,
            content: 'The workspace uses a local-first architecture.'
          }
        ]
      },
      questions: {
        listByNodeRun: async () => [
          {
            id: 'question-1',
            version: 1,
            prompt: 'Which platform?',
            answer: 'macOS and Windows',
            status: 'answered'
          },
          {
            id: 'question-2',
            version: 1,
            prompt: 'Dismissed question',
            status: 'dismissed'
          }
        ]
      },
      todos: {
        listByNodeRun: async () => [
          {
            id: 'todo-1',
            version: 1,
            title: 'Verify migration rollback',
            status: 'pending'
          },
          {
            id: 'todo-2',
            version: 1,
            title: 'Already done',
            status: 'completed'
          }
        ]
      },
      attachments: {
        read: async (_requirementId, path) => ({
          version: 4,
          content: `Attachment content from ${path}`
        })
      }
    })

    const snapshot = await assembler.assemble({
      requirement: {
        id: 'requirement-1',
        version: 5,
        title: 'Implement resumable workflow',
        description: 'Resume interrupted work after restart.',
        scope: 'Electron Main and Sidecar',
        acceptanceCriteria: ['Interrupted runs resume automatically.']
      },
      node: {
        id: 'node-design',
        version: 2,
        name: 'Design',
        description: 'Produce the technical design.',
        prompt: 'Write an implementation-ready design.',
        artifactSpecification: 'Markdown design document'
      },
      nodeRunId: 'node-run-1',
      knowledgeQuery: 'resumable workflow architecture',
      attachmentPaths: ['/tmp/notes.md'],
      maxCharacters: 10_000
    })

    expect(snapshot.sources.map(({ kind }) => kind)).toEqual([
      'requirement',
      'node',
      'predecessor_artifact',
      'node_answer',
      'node_todo',
      'knowledge',
      'attachment'
    ])
    expect(snapshot.content).toContain('Confirmed user and system constraints.')
    expect(snapshot.content).toContain('Which platform?: macOS and Windows')
    expect(snapshot.content).not.toContain('Dismissed question')
    expect(snapshot.content).toContain('[pending] Verify migration rollback')
    expect(snapshot.content).not.toContain('Already done')
    expect(snapshot.content).toContain(
      'The workspace uses a local-first architecture.'
    )
    expect(snapshot.content).toContain('Attachment content from /tmp/notes.md')
    expect(snapshot.characterCount).toBe(snapshot.content.length)
    expect(snapshot.estimatedTokens).toBe(Math.ceil(snapshot.content.length / 4))
    expect(snapshot.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('truncates deterministically at the character budget', async () => {
    const assembler = new ContextAssembler({
      artifacts: {
        listPredecessorArtifacts: async () => [
          {
            id: 'artifact-1',
            version: 1,
            name: 'Long artifact',
            content: 'A'.repeat(200)
          }
        ]
      },
      knowledge: { search: async () => [] },
      questions: { listByNodeRun: async () => [] },
      todos: { listByNodeRun: async () => [] },
      attachments: {
        read: async () => ({ version: 1, content: 'B'.repeat(200) })
      }
    })
    const input = {
      requirement: {
        id: 'requirement-1',
        version: 1,
        title: 'Short title',
        description: 'Short description',
        scope: 'Short scope',
        acceptanceCriteria: ['Short criterion']
      },
      node: {
        id: 'node-1',
        version: 1,
        name: 'Node',
        description: 'Node description',
        prompt: 'Node prompt',
        artifactSpecification: 'Node output'
      },
      nodeRunId: 'node-run-1',
      knowledgeQuery: 'query',
      attachmentPaths: ['/tmp/attachment.md'],
      maxCharacters: 300
    }

    const first = await assembler.assemble(input)
    const second = await assembler.assemble(input)

    expect(first).toEqual(second)
    expect(first.content).toHaveLength(300)
    expect(first.sources.some(({ truncated }) => truncated)).toBe(true)
    expect(first.sources.at(-1)).toMatchObject({
      kind: 'predecessor_artifact',
      truncated: true
    })
  })
})
