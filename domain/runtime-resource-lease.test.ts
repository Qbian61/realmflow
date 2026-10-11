import { describe, expect, it } from 'vitest'
import {
  RuntimeResourceStaleError,
  assertRuntimeResourceLeaseCurrent,
  transitionRuntimeResourceLease,
  type RuntimeResourceLease
} from './runtime-resource-lease'

describe('RuntimeResourceLease', () => {
  it('accepts only an active lease owned by the current run and authority', () => {
    expect(() =>
      assertRuntimeResourceLeaseCurrent(lease(), {
        ownerRunId: 'run-1',
        epoch: 1,
        authorityDigest: 'authority-1',
        resourceActive: true
      })
    ).not.toThrow()
  })

  it.each([
    ['run mismatch', { ownerRunId: 'run-2' }],
    ['epoch mismatch', { epoch: 2 }],
    ['authority mismatch', { authorityDigest: 'authority-2' }],
    ['driver inactive', { resourceActive: false }]
  ])('rejects %s as a stale resource', (_name, override) => {
    expect(() =>
      assertRuntimeResourceLeaseCurrent(lease(), {
        ownerRunId: 'run-1',
        epoch: 1,
        authorityDigest: 'authority-1',
        resourceActive: true,
        ...override
      })
    ).toThrowError(
      expect.objectContaining({
        name: 'RuntimeResourceStaleError',
        code: 'runtime_resource_stale',
        retryable: true
      })
    )
  })

  it('rejects a released lease and forbids reactivation', () => {
    const released = transitionRuntimeResourceLease(
      lease(),
      'released',
      20
    )
    expect(() =>
      assertRuntimeResourceLeaseCurrent(released, {
        ownerRunId: 'run-1',
        epoch: 1,
        authorityDigest: 'authority-1',
        resourceActive: true
      })
    ).toThrow(RuntimeResourceStaleError)
    expect(() =>
      transitionRuntimeResourceLease(released, 'active', 21)
    ).toThrow('Illegal runtime resource lease transition')
  })
})

function lease(): RuntimeResourceLease {
  return {
    id: 'lease-1',
    resourceType: 'browser_session',
    resourceId: 'browser-1',
    conversationId: 'conversation-1',
    ownerRunId: 'run-1',
    epoch: 1,
    authorityDigest: 'authority-1',
    status: 'active',
    createdAt: 10,
    updatedAt: 10
  }
}
