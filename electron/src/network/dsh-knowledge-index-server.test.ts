import { describe, expect, it, vi } from 'vitest'
import { createDshRunManifest } from '../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import { DshKnowledgeIndexLeaseService } from '../application/dsh/dsh-knowledge-index-lease-service'
import { DshKnowledgeIndexServer } from './dsh-knowledge-index-server'

describe('DshKnowledgeIndexServer', () => {
  it('authorizes lease-bound bounded reads and rejects mismatched vector profiles', async () => {
    const manifest = createDshRunManifest()
    const leaseService = new DshKnowledgeIndexLeaseService({
      now: () => 1_000,
      createToken: () => 'lease-token-1'
    })
    leaseService.publish(manifest)
    const index = {
      search: vi.fn(async () => ({
        dense: [match('point-1', 0.9)],
        bm25: [match('point-1', 0.7)],
        fusion: [match('point-1', 0.95)]
      }))
    }
    const server = new DshKnowledgeIndexServer({
      leases: leaseService,
      index,
      now: () => 1_500
    })

    await expect(
      server.search({
        token: 'lease-token-1',
        query: 'realmflow',
        dense: [1, ...Array(767).fill(0)],
        profile: manifest.knowledge.embeddingProfile,
        workspaceIds: ['workspace-1'],
        generationIds: ['generation-1'],
        sourceKinds: ['document'],
        topK: 4
      })
    ).resolves.toEqual({
      dense: [match('point-1', 0.9)],
      bm25: [match('point-1', 0.7)],
      fusion: [match('point-1', 0.95)]
    })
    expect(index.search).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'realmflow-workspace-1',
        workspaceIds: ['workspace-1'],
        generationIds: ['generation-1'],
        sourceKinds: ['document'],
        topK: 4
      })
    )
    await expect(
      server.search({
        token: 'lease-token-1',
        query: 'realmflow',
        dense: [1, ...Array(767).fill(0)],
        profile: {
          ...manifest.knowledge.embeddingProfile,
          profileDigest: '9'.repeat(64)
        },
        workspaceIds: ['workspace-1'],
        generationIds: ['generation-1'],
        sourceKinds: ['document'],
        topK: 4
      })
    ).rejects.toThrow(/vector profile/i)
  })
})

function match(id: string, score: number) {
  return {
    id,
    score,
    payload: {
      schemaVersion: 1 as const,
      profileId: 'realmflow-vector-index-v1',
      workspaceId: 'workspace-1',
      generationId: 'generation-1',
      sourceKind: 'document' as const,
      sourceId: 'source-1',
      sourceVersion: 'v1',
      documentId: 'document-1',
      documentKey: 'docs/realmflow.md',
      title: 'RealmFlow',
      content: 'RealmFlow is local first.',
      chunkId: 'chunk-1',
      chunkOrdinal: 0,
      startOffset: 0,
      endOffset: 25,
      startLine: 1,
      endLine: 1,
      checksum: 'sha256:dummy',
      createdAt: 1_000
    }
  }
}
