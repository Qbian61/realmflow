import { describe, expect, it, vi } from 'vitest'
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
            content: 'Confirmed user and system constraints.',
            relationship: 'direct'
          },
          {
            id: 'artifact-ancestor',
            version: 1,
            name: 'Discovery',
            content: 'Inherited product discovery.',
            relationship: 'ancestor'
          }
        ]
      },
      knowledge: {
        search: async () => [
          {
            id: 'chunk-1',
            sourceId: 'source-1',
            documentKey: 'architecture.md',
            generationId: 'generation-1',
            sourceVersion: 'file:v3',
            version: 3,
            denseScore: 0.95,
            denseRank: 1,
            bm25Score: 0.85,
            bm25Rank: 1,
            fusionScore: 0.91,
            fusionRank: 1,
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
      includeRequirementBody: true,
      predecessorArtifacts: 'all',
      includeSpaceKnowledge: true,
      maxCharacters: 10_000
    })

    expect(snapshot.sources.map(({ kind }) => kind)).toEqual([
      'requirement',
      'node',
      'predecessor_artifact',
      'ancestor_artifact',
      'node_answer',
      'node_todo',
      'knowledge',
      'attachment'
    ])
    expect(snapshot.content).toContain('Confirmed user and system constraints.')
    expect(snapshot.content).toContain('Inherited product discovery.')
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
    expect(snapshot.sources[0]).toMatchObject({
      status: 'included',
      estimatedTokens: Math.ceil(
        snapshot.sources[0].includedCharacters / 4
      ),
      summarized: false,
      redacted: false
    })
    expect(snapshot.sources[0].preview).toContain('Implement resumable workflow')
    expect(snapshot.sources.find(({ kind }) => kind === 'knowledge')).toMatchObject({
      id: 'chunk-1',
      sourceId: 'source-1',
      documentKey: 'architecture.md',
      generationId: 'generation-1',
      sourceVersion: 'file:v3',
      version: 3,
      denseScore: 0.95,
      denseRank: 1,
      bm25Score: 0.85,
      bm25Rank: 1,
      fusionScore: 0.91,
      fusionRank: 1
    })
  })

  it('truncates deterministically at the character budget', async () => {
    const assembler = new ContextAssembler({
      artifacts: {
        listPredecessorArtifacts: async () => [
          {
            id: 'artifact-1',
            version: 1,
            name: 'Long artifact',
            content: 'A'.repeat(200),
            relationship: 'direct'
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
      includeRequirementBody: true,
      predecessorArtifacts: 'direct' as const,
      includeSpaceKnowledge: true,
      maxCharacters: 300
    }

    const first = await assembler.assemble(input)
    const second = await assembler.assemble(input)

    expect(first).toEqual(second)
    expect(first.content).toHaveLength(300)
    expect(first.sources.some(({ truncated }) => truncated)).toBe(true)
    expect(
      first.sources.find(({ kind }) => kind === 'predecessor_artifact')
    ).toMatchObject({
      kind: 'predecessor_artifact',
      truncated: true
    })
    expect(first.sources.at(-1)).toMatchObject({
      kind: 'attachment',
      status: 'excluded',
      exclusionReason: 'budget_exhausted'
    })
  })

  it('does not read or include disabled optional sources', async () => {
    const listPredecessorArtifacts = vi.fn().mockResolvedValue([])
    const search = vi.fn().mockResolvedValue([])
    const assembler = new ContextAssembler({
      artifacts: { listPredecessorArtifacts },
      knowledge: { search },
      questions: { listByNodeRun: async () => [] },
      todos: { listByNodeRun: async () => [] },
      attachments: {
        read: async () => {
          throw new Error('attachments should not be read')
        }
      }
    })

    const snapshot = await assembler.assemble({
      requirement: {
        id: 'requirement-1',
        version: 1,
        title: 'Visible title',
        description: 'Hidden requirement body',
        scope: '',
        acceptanceCriteria: []
      },
      node: {
        id: 'node-1',
        version: 1,
        name: 'Node',
        description: '',
        prompt: 'Do the work.',
        artifactSpecification: 'markdown: artifacts/result.md'
      },
      nodeRunId: 'node-run-1',
      knowledgeQuery: 'hidden knowledge',
      attachmentPaths: [],
      includeRequirementBody: false,
      predecessorArtifacts: 'none',
      includeSpaceKnowledge: false,
      maxCharacters: 10_000
    })

    expect(listPredecessorArtifacts).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
    expect(snapshot.content).toContain('Visible title')
    expect(snapshot.content).not.toContain('Hidden requirement body')
  })

  it('records sensitive attachments as excluded without reading their content', async () => {
    const read = vi.fn()
    const assembler = new ContextAssembler({
      artifacts: { listPredecessorArtifacts: async () => [] },
      knowledge: { search: async () => [] },
      questions: { listByNodeRun: async () => [] },
      todos: { listByNodeRun: async () => [] },
      attachments: { read }
    })

    const snapshot = await assembler.assemble({
      requirement: {
        id: 'requirement-1',
        version: 1,
        title: 'Protect credentials',
        description: '',
        scope: '',
        acceptanceCriteria: []
      },
      node: {
        id: 'node-1',
        version: 1,
        name: 'Review',
        description: '',
        prompt: 'Review safe inputs.',
        artifactSpecification: 'markdown: artifacts/review.md'
      },
      nodeRunId: 'node-run-1',
      knowledgeQuery: '',
      attachmentPaths: [
        'attachments/.env',
        'attachments/credentials/provider.json',
        'attachments/client.PEM'
      ],
      includeRequirementBody: true,
      predecessorArtifacts: 'none',
      includeSpaceKnowledge: false,
      maxCharacters: 10_000
    })

    expect(read).not.toHaveBeenCalled()
    expect(snapshot.content).not.toContain('credentials/provider.json')
    expect(snapshot.sources.filter(({ kind }) => kind === 'attachment')).toEqual(
      [
        'attachments/.env',
        'attachments/credentials/provider.json',
        'attachments/client.PEM'
      ].map((id) => ({
        kind: 'attachment',
        id,
        version: 0,
        characterCount: 0,
        includedCharacters: 0,
        estimatedTokens: 0,
        status: 'excluded',
        truncated: false,
        summarized: false,
        redacted: false,
        exclusionReason: 'sensitive_file',
        preview: ''
      }))
    )
  })

  it('prioritizes relevant knowledge and records budget and confidence exclusions', async () => {
    const assembler = new ContextAssembler({
      artifacts: {
        listPredecessorArtifacts: async () => [
          {
            id: 'artifact-low-priority',
            version: 1,
            name: 'Verbose history',
            content: 'A'.repeat(500),
            relationship: 'ancestor'
          }
        ]
      },
      knowledge: {
        search: async () => [
          {
            id: 'knowledge-low',
            version: 1,
            sourceId: 'source-low',
            documentKey: 'old.md',
            sourceVersion: 'file:v1',
            fusionScore: 0.001,
            fusionRank: 2,
            content: 'Low confidence content must not be injected.'
          },
          {
            id: 'knowledge-high',
            version: 2,
            sourceId: 'source-high',
            documentKey: 'current.md',
            sourceVersion: 'file:v2',
            fusionScore: 0.95,
            fusionRank: 1,
            content: 'High confidence checkout policy.'
          }
        ]
      },
      questions: { listByNodeRun: async () => [] },
      todos: { listByNodeRun: async () => [] },
      attachments: {
        read: async () => ({ version: 1, content: '' })
      }
    })

    const snapshot = await assembler.assemble({
      requirement: {
        id: 'requirement-1',
        version: 1,
        title: 'Checkout',
        description: 'Keep the payment flow local.',
        scope: '',
        acceptanceCriteria: []
      },
      node: {
        id: 'node-1',
        version: 1,
        name: 'Design',
        description: '',
        prompt: 'Design checkout.',
        artifactSpecification: 'markdown'
      },
      nodeRunId: 'node-run-1',
      knowledgeQuery: 'checkout policy',
      attachmentPaths: [],
      includeRequirementBody: true,
      predecessorArtifacts: 'all',
      includeSpaceKnowledge: true,
      maxCharacters: 260
    })

    expect(snapshot.content).toContain('High confidence checkout policy.')
    expect(snapshot.content).not.toContain('Low confidence content')
    expect(snapshot.sources.find(({ id }) => id === 'knowledge-low')).toMatchObject({
      status: 'excluded',
      exclusionReason: 'low_confidence'
    })
    expect(
      snapshot.sources.find(({ id }) => id === 'artifact-low-priority')
    ).toMatchObject({
      status: 'excluded',
      exclusionReason: 'budget_exhausted'
    })
    expect(snapshot).toMatchObject({
      insufficientKnowledge: false,
      plan: {
        totalTokenBudget: 65,
        allocations: expect.any(Object)
      }
    })
  })

  it('signals insufficient knowledge when every retrieved source is below confidence', async () => {
    const assembler = new ContextAssembler({
      artifacts: { listPredecessorArtifacts: async () => [] },
      knowledge: {
        search: async () => [
          {
            id: 'knowledge-low',
            version: 1,
            fusionScore: 0.001,
            content: 'Unreliable guess'
          }
        ]
      },
      questions: { listByNodeRun: async () => [] },
      todos: { listByNodeRun: async () => [] },
      attachments: {
        read: async () => ({ version: 1, content: '' })
      }
    })

    const snapshot = await assembler.assemble({
      requirement: {
        id: 'requirement-1',
        version: 1,
        title: 'Unknown behavior',
        description: '',
        scope: '',
        acceptanceCriteria: []
      },
      node: {
        id: 'node-1',
        version: 1,
        name: 'Answer',
        description: '',
        prompt: 'Answer from knowledge.',
        artifactSpecification: ''
      },
      nodeRunId: 'node-run-1',
      knowledgeQuery: 'unknown',
      attachmentPaths: [],
      includeRequirementBody: true,
      predecessorArtifacts: 'none',
      includeSpaceKnowledge: true,
      maxCharacters: 1_000
    })

    expect(snapshot).toMatchObject({ insufficientKnowledge: true })
    expect(snapshot.content).toContain('Local knowledge is insufficient')
  })
})
