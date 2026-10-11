import { describe, expect, it, vi } from 'vitest'
import type { RuntimeResourceLease } from '../../../../domain/runtime-resource-lease'
import { RuntimeResourceLeaseService } from './runtime-resource-lease-service'

describe('RuntimeResourceLeaseService', () => {
  it('resolves only the current active resource for the run authority', async () => {
    const repository = memoryRepository()
    const service = new RuntimeResourceLeaseService(repository, {
      now: () => 10,
      createId: () => 'lease-1'
    })
    const lease = service.acquire({
      resourceType: 'browser_session',
      resourceId: 'browser-1',
      conversationId: 'conversation-1',
      ownerRunId: 'run-1',
      authorityDigest: 'a'.repeat(64)
    })

    await expect(
      service.resolveCurrent({
        resourceType: 'browser_session',
        ownerRunId: 'run-1',
        authorityDigest: 'a'.repeat(64),
        isResourceActive: async (id) => id === 'browser-1'
      })
    ).resolves.toEqual(lease)
  })

  it('marks a lease interrupted when physical release fails', async () => {
    const repository = memoryRepository()
    const service = new RuntimeResourceLeaseService(repository, {
      now: () => 20,
      createId: () => 'lease-1'
    })
    service.acquire({
      resourceType: 'browser_session',
      resourceId: 'browser-1',
      ownerRunId: 'run-1',
      authorityDigest: 'a'.repeat(64)
    })

    await service.releaseRun('run-1', async () => {
      throw new Error('driver close failed')
    })

    expect(repository.getById('lease-1')?.status).toBe('interrupted')
  })

  it('keeps current leases while a run is waiting', async () => {
    const repository = memoryRepository()
    const service = new RuntimeResourceLeaseService(repository, {
      now: () => 20,
      createId: () => 'lease-1'
    })
    service.acquire({
      resourceType: 'browser_session',
      resourceId: 'browser-1',
      ownerRunId: 'run-1',
      authorityDigest: 'a'.repeat(64)
    })
    const release = vi.fn()

    await service.handleRunStatus('run-1', 'waiting_input', release)

    expect(release).not.toHaveBeenCalled()
    expect(repository.getById('lease-1')?.status).toBe('active')
  })
})

function memoryRepository() {
  const leases = new Map<string, RuntimeResourceLease>()
  return {
    acquire(input: Omit<RuntimeResourceLease, 'epoch' | 'status' | 'updatedAt'>) {
      const prior = [...leases.values()].filter(
        (lease) =>
          lease.ownerRunId === input.ownerRunId &&
          lease.resourceType === input.resourceType
      )
      const lease: RuntimeResourceLease = {
        ...input,
        epoch: Math.max(0, ...prior.map(({ epoch }) => epoch)) + 1,
        status: 'active',
        updatedAt: input.createdAt
      }
      leases.set(lease.id, lease)
      return lease
    },
    getCurrent(ownerRunId: string, resourceType: RuntimeResourceLease['resourceType']) {
      return [...leases.values()].find(
        (lease) =>
          lease.ownerRunId === ownerRunId &&
          lease.resourceType === resourceType &&
          lease.status === 'active'
      )
    },
    getById(id: string) {
      return leases.get(id)
    },
    listActive() {
      return [...leases.values()].filter(({ status }) => status === 'active')
    },
    transition(input: {
      id: string
      epoch: number
      status: 'released' | 'interrupted' | 'expired'
      updatedAt: number
    }) {
      const current = leases.get(input.id)!
      const next = { ...current, status: input.status, updatedAt: input.updatedAt }
      leases.set(input.id, next)
      return next
    },
    interruptAllActive(updatedAt: number) {
      let changed = 0
      for (const lease of leases.values()) {
        if (lease.status !== 'active') continue
        leases.set(lease.id, { ...lease, status: 'interrupted', updatedAt })
        changed += 1
      }
      return changed
    }
  }
}
