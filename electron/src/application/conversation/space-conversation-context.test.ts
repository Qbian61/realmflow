import { describe, expect, it, vi } from 'vitest'
import { SpaceConversationContextAssembler } from './space-conversation-context'

describe('SpaceConversationContextAssembler', () => {
  it('formats at most eight ranked chunks within the character budget', async () => {
    const search = vi.fn().mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        id: `chunk-${index + 1}`,
        schemaVersion: 1 as const,
        profileId: 'realmflow-vector-index-v1',
        workspaceId: 'workspace-1',
        workspaceName: 'Workspace One',
        generationId: 'generation-1',
        sourceId: `source-${index + 1}`,
        sourceKind: 'file' as const,
        sourceVersion: 'file:v1',
        documentId: `document-${index + 1}`,
        documentKey: `docs/${index + 1}.md`,
        title: `Source ${index + 1}`,
        content: `knowledge-${index + 1}`,
        chunkId: `chunk-${index + 1}`,
        chunkOrdinal: index,
        startOffset: 0,
        endOffset: 10,
        startLine: 1,
        endLine: 1,
        checksum: `sha256:${'a'.repeat(64)}`,
        createdAt: 1,
        denseScore: 1,
        denseRank: index + 1,
        bm25Score: 1,
        bm25Rank: index + 1,
        fusionScore: 1 - index / 10,
        fusionRank: index + 1
      }))
    )
    const assembler = new SpaceConversationContextAssembler(
      { search },
      420
    )

    const result = await assembler.assemble('workspace-1', 'checkout retry')

    expect(search).toHaveBeenCalledWith({
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      query: 'checkout retry',
      topK: 8
    })
    expect(result).toBeDefined()
    expect(result).toContain(
      '## Space knowledge: Source 1 / docs/1.md / chunk 1\nknowledge-1\n\n'
    )
    expect(result).toContain('## Space knowledge: Source 5 / docs/5.md / chunk 5\n')
    expect(result?.length).toBeLessThanOrEqual(420)
    expect(result).not.toContain('chunk-9')
  })

  it('signals insufficient context when no local knowledge matches', async () => {
    const assembler = new SpaceConversationContextAssembler({
      search: vi.fn().mockResolvedValue([])
    })

    await expect(
      assembler.assemble('workspace-1', 'unmatched')
    ).resolves.toContain('Local knowledge is insufficient')
  })

  it('labels each all-workspaces result with its source workspace', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        workspaceName: 'Payments',
        title: 'Runbook',
        documentKey: 'release.md',
        chunkOrdinal: 0,
        content: 'Rollback procedure'
      }
    ])
    const assembler = new SpaceConversationContextAssembler({ search })

    await expect(
      assembler.assembleScope({ kind: 'all_workspaces' }, 'rollback')
    ).resolves.toContain(
      '## Space knowledge / Payments: Runbook / release.md / chunk 1'
    )
    expect(search).toHaveBeenCalledWith({
      scope: { kind: 'all_workspaces' },
      query: 'rollback',
      topK: 8
    })
  })

  it('maps local knowledge failures to a safe retryable message', async () => {
    const assembler = new SpaceConversationContextAssembler({
      search: vi
        .fn()
        .mockRejectedValue(new Error('SQL /private/workspace secret'))
    })

    await expect(
      assembler.assemble('workspace-1', 'checkout')
    ).rejects.toThrow('读取空间知识失败，请重试')
  })

  it('uses the full Processor query plan instead of discarding provenance', async () => {
    const searchPlan = vi.fn().mockResolvedValue([])
    const assembler = new SpaceConversationContextAssembler({
      search: vi.fn(),
      searchPlan
    } as never)
    const queries = [
      {
        kind: 'original' as const,
        query: 'checkout retry policy',
        sourceMessageId: 'message-1',
        processorVersion: '1.0.0',
        reason: 'original'
      },
      {
        kind: 'keyword' as const,
        query: 'checkout retry',
        sourceMessageId: 'message-1',
        processorVersion: '1.0.0',
        reason: 'keyword'
      },
      {
        kind: 'semantic' as const,
        query: 'resilient checkout',
        sourceMessageId: 'message-1',
        processorVersion: '1.0.0',
        reason: 'semantic'
      }
    ]
    const assemblePlan = assembler as unknown as {
      assembleScope(
        scope: { kind: 'workspace'; workspaceId: string },
        query: typeof queries
      ): Promise<string | undefined>
    }

    await assemblePlan.assembleScope(
      { kind: 'workspace', workspaceId: 'workspace-1' },
      queries
    )

    expect(searchPlan).toHaveBeenCalledWith({
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      queries,
      topK: 8
    })
  })
})
