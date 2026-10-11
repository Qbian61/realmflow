export type RuntimeResourceType =
  | 'browser_session'
  | 'process'
  | 'terminal'
  | 'computer_session'

export type RuntimeResourceLeaseStatus =
  | 'active'
  | 'released'
  | 'interrupted'
  | 'expired'

export type RuntimeResourceLease = Readonly<{
  id: string
  resourceType: RuntimeResourceType
  resourceId: string
  conversationId?: string
  ownerScopeDigest?: string
  ownerRunId: string
  epoch: number
  authorityDigest: string
  status: RuntimeResourceLeaseStatus
  createdAt: number
  updatedAt: number
}>

export class RuntimeResourceStaleError extends Error {
  readonly code = 'runtime_resource_stale'
  readonly retryable = true

  constructor() {
    super('Runtime resource is stale for the current run')
    this.name = 'RuntimeResourceStaleError'
  }
}

export function assertRuntimeResourceLeaseCurrent(
  lease: RuntimeResourceLease,
  expected: Readonly<{
    ownerRunId: string
    epoch: number
    authorityDigest: string
    resourceActive: boolean
  }>
): void {
  if (
    lease.status !== 'active' ||
    lease.ownerRunId !== expected.ownerRunId ||
    lease.epoch !== expected.epoch ||
    lease.authorityDigest !== expected.authorityDigest ||
    !expected.resourceActive
  ) {
    throw new RuntimeResourceStaleError()
  }
}

const TRANSITIONS: Record<
  RuntimeResourceLeaseStatus,
  readonly RuntimeResourceLeaseStatus[]
> = {
  active: ['released', 'interrupted', 'expired'],
  released: [],
  interrupted: [],
  expired: []
}

export function transitionRuntimeResourceLease(
  lease: RuntimeResourceLease,
  status: RuntimeResourceLeaseStatus,
  updatedAt: number
): RuntimeResourceLease {
  if (lease.status === status) return lease
  if (!TRANSITIONS[lease.status].includes(status)) {
    throw new Error(
      `Illegal runtime resource lease transition: ${lease.status} -> ${status}`
    )
  }
  return { ...lease, status, updatedAt }
}
