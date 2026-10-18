import { describe, expect, it } from 'vitest'
import { createDshRunManifest } from '../../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import { DshKnowledgeIndexLeaseService } from './dsh-knowledge-index-lease-service'

describe('DshKnowledgeIndexLeaseService', () => {
  it('publishes immutable run-bound leases and rejects reads outside frozen limits', () => {
    const manifest = createDshRunManifest()
    const service = new DshKnowledgeIndexLeaseService({
      now: () => 1_000,
      createToken: () => 'lease-token-1'
    })

    const lease = service.publish(manifest)

    expect(Object.isFrozen(lease)).toBe(true)
    expect(lease).toMatchObject({
      token: 'lease-token-1',
      leaseId: 'lease-1',
      runId: 'run-1',
      sessionId: 'session-1',
      collection: 'realmflow-workspace-1',
      workspaceIds: ['workspace-1'],
      generationIds: ['generation-1'],
      sourceKinds: ['document'],
      expiresAt: 2_000,
      limits: manifest.knowledge.limits
    })
    expect(
      service.authorizeQuery({
        token: 'lease-token-1',
        workspaceIds: ['workspace-1'],
        generationIds: ['generation-1'],
        sourceKinds: ['document'],
        topK: 4,
        returnedChunks: 4,
        now: 1_500
      })
    ).toBe(lease)
    expect(() =>
      service.authorizeQuery({
        token: 'lease-token-1',
        workspaceIds: ['workspace-2'],
        generationIds: ['generation-1'],
        sourceKinds: ['document'],
        topK: 4,
        returnedChunks: 4,
        now: 1_500
      })
    ).toThrow(/workspace/i)
    expect(() =>
      service.authorizeQuery({
        token: 'lease-token-1',
        workspaceIds: ['workspace-1'],
        generationIds: ['generation-2'],
        sourceKinds: ['document'],
        topK: 4,
        returnedChunks: 4,
        now: 1_500
      })
    ).toThrow(/generation/i)
    expect(() =>
      service.authorizeQuery({
        token: 'lease-token-1',
        workspaceIds: ['workspace-1'],
        generationIds: ['generation-1'],
        sourceKinds: ['document'],
        topK: manifest.knowledge.limits.topKPerQuery + 1,
        returnedChunks: 4,
        now: 1_500
      })
    ).toThrow(/topK/i)
    expect(() =>
      service.authorizeQuery({
        token: 'lease-token-1',
        workspaceIds: ['workspace-1'],
        generationIds: ['generation-1'],
        sourceKinds: ['document'],
        topK: 4,
        returnedChunks: 4,
        now: 2_001
      })
    ).toThrow(/expired/i)
  })

  it('binds successful authorizations to the lease query-count budget', () => {
    const base = createDshRunManifest()
    const manifest = createDshRunManifest({
      knowledge: {
        ...base.knowledge,
        limits: {
          ...base.knowledge.limits,
          maxQueries: 2
        }
      }
    })
    const service = new DshKnowledgeIndexLeaseService({
      now: () => 1_000,
      createToken: () => 'lease-token-queries'
    })
    service.publish(manifest)
    const request = {
      token: 'lease-token-queries',
      workspaceIds: ['workspace-1'],
      generationIds: ['generation-1'],
      sourceKinds: ['document'],
      topK: 1,
      returnedChunks: 1,
      now: 1_500
    }

    expect(() =>
      service.authorizeQuery({
        ...request,
        topK: manifest.knowledge.limits.topKPerQuery + 1
      })
    ).toThrow(/topK/i)
    expect(() => service.authorizeQuery(request)).not.toThrow()
    expect(() => service.authorizeQuery(request)).not.toThrow()
    expect(() => service.authorizeQuery(request)).toThrow(/query budget/i)
  })
})
