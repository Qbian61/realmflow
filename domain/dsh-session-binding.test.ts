import { describe, expect, it } from 'vitest'
import {
  advanceDshSessionProjection,
  assertDshSessionReusable,
  createDshSessionBinding,
  dshRunOwnerKey,
  resetDshSessionBinding,
  transitionDshSessionBinding
} from './dsh-session-binding'

const owner = {
  workspaceId: 'workspace-1',
  requirementId: 'requirement-1',
  nodeRunId: 'node-run-1'
}

describe('DshSessionBinding', () => {
  it('creates a canonical immutable binding for a RealmFlow run owner and DSH session', () => {
    const binding = createDshSessionBinding({
      owner,
      dshSessionId: 'dsh-session-1',
      runManifestDigest: 'a'.repeat(64),
      runtimeBuildDigest: 'b'.repeat(64),
      createdAt: 10
    })

    expect(binding).toEqual({
      owner,
      ownerKey: 'requirement-node:workspace-1:requirement-1:node-run-1',
      dshSessionId: 'dsh-session-1',
      runManifestDigest: 'a'.repeat(64),
      runtimeBuildDigest: 'b'.repeat(64),
      lastProjectedSequence: 0,
      lifecycleStatus: 'active',
      createdAt: 10,
      updatedAt: 10
    })
    expect(dshRunOwnerKey({ conversationId: 'conversation-1' })).toBe(
      'conversation:conversation-1'
    )
  })

  it('rejects cross-owner DSH session reuse while allowing the same owner to recover', () => {
    const existing = createDshSessionBinding({
      owner,
      dshSessionId: 'dsh-session-1',
      runManifestDigest: 'a'.repeat(64),
      runtimeBuildDigest: 'b'.repeat(64),
      createdAt: 10
    })

    expect(() => assertDshSessionReusable(existing, owner)).not.toThrow()
    expect(() =>
      assertDshSessionReusable(existing, {
        workspaceId: 'workspace-2',
        requirementId: 'requirement-2',
        nodeRunId: 'node-run-2'
      })
    ).toThrow(/cross-owner/)
  })

  it('advances projection sequence monotonically and transitions lifecycle status', () => {
    const binding = createDshSessionBinding({
      owner,
      dshSessionId: 'dsh-session-1',
      runManifestDigest: 'a'.repeat(64),
      runtimeBuildDigest: 'b'.repeat(64),
      createdAt: 10
    })
    const projected = advanceDshSessionProjection(binding, 8, 20)
    const paused = transitionDshSessionBinding(projected, 'paused', 30)

    expect(projected.lastProjectedSequence).toBe(8)
    expect(projected.updatedAt).toBe(20)
    expect(paused.lifecycleStatus).toBe('paused')
    expect(paused.updatedAt).toBe(30)
    expect(() => advanceDshSessionProjection(projected, 7, 31)).toThrow(
      /projection sequence/
    )
  })

  it('resets only binding runtime state while preserving owner identity for audits', () => {
    const binding = createDshSessionBinding({
      owner,
      dshSessionId: 'dsh-session-1',
      runManifestDigest: 'a'.repeat(64),
      runtimeBuildDigest: 'b'.repeat(64),
      createdAt: 10
    })

    expect(resetDshSessionBinding(advanceDshSessionProjection(binding, 4, 20), 30)).toMatchObject({
      owner,
      ownerKey: 'requirement-node:workspace-1:requirement-1:node-run-1',
      lastProjectedSequence: 0,
      lifecycleStatus: 'reset',
      updatedAt: 30
    })
  })
})
