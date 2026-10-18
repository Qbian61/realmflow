import type { DshRunManifest } from '../../../../domain/dsh-run-manifest'
import {
  DSH_CREDENTIAL_BROKER_SCHEMA_VERSION,
  DSH_CREDENTIAL_OPERATIONS_BY_PURPOSE,
  normalizeDshCredentialLeaseExchangeRequest,
  normalizeDshCredentialLeaseRequest,
  normalizeDshCredentialMaterial,
  redactDshCredentialText,
  redactDshCredentialValue,
  type DshCredentialLease,
  type DshCredentialLeaseExchangeRequest,
  type DshCredentialLeaseRequest,
  type DshCredentialLeaseRevocation,
  type DshCredentialMaterial,
  type DshCredentialPurpose
} from '../../../../shared/dsh-credential-broker-contract'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export type DshCredentialResolutionRequest = Omit<
  DshCredentialLeaseRequest,
  'schemaVersion' | 'requestedTtlMs'
> & {
  leaseId: string
  issuedAt: number
  expiresAt: number
}

export type DshCredentialResolver = {
  resolve(request: DshCredentialResolutionRequest): Promise<JsonObject>
}

export type DshCredentialBrokerAuditEvent = {
  type:
    | 'credential_lease_issued'
    | 'credential_lease_exchanged'
    | 'credential_lease_exchange_failed'
    | 'credential_lease_revoked'
  leaseId?: string
  runtimeInstanceId?: string
  sessionId?: string
  runId?: string
  credentialRef?: string
  purpose?: DshCredentialPurpose
  operation?: string
  reason?: string
  at: number
}

export type DshCredentialBrokerDependencies = {
  resolver: DshCredentialResolver
  audit?: {
    record(event: DshCredentialBrokerAuditEvent): Promise<void> | void
  }
  now?: () => number
  createLeaseId?: () => string
  createExchangeToken?: () => string
  maxLeaseTtlMs?: number
}

type AcceptedRunManifest = {
  runtimeInstanceId: string
  manifest: DshRunManifest
}

type LeaseRecord = {
  lease: DshCredentialLease
  status: 'active' | 'consumed' | 'revoked'
  revokedReason?: DshCredentialLeaseRevocation['reason']
}

const DEFAULT_MAX_LEASE_TTL_MS = 60_000

export class DshCredentialBroker {
  private readonly acceptedRuns = new Map<string, AcceptedRunManifest>()
  private readonly leases = new Map<string, LeaseRecord>()
  private readonly now: () => number
  private readonly createLeaseId: () => string
  private readonly createExchangeToken: () => string
  private readonly maxLeaseTtlMs: number

  constructor(private readonly dependencies: DshCredentialBrokerDependencies) {
    this.now = dependencies.now ?? Date.now
    this.createLeaseId =
      dependencies.createLeaseId ??
      (() => `credential-lease-${Math.random().toString(36).slice(2)}`)
    this.createExchangeToken =
      dependencies.createExchangeToken ??
      (() => `credential-exchange-${Math.random().toString(36).slice(2)}`)
    this.maxLeaseTtlMs =
      dependencies.maxLeaseTtlMs ?? DEFAULT_MAX_LEASE_TTL_MS
  }

  acceptRunManifest(input: {
    runtimeInstanceId: string
    manifest: DshRunManifest
  }): void {
    this.acceptedRuns.set(
      acceptedRunKey({
        runtimeInstanceId: input.runtimeInstanceId,
        sessionId: input.manifest.sessionId,
        runId: input.manifest.runId,
        manifestDigest: input.manifest.digest
      }),
      {
        runtimeInstanceId: input.runtimeInstanceId,
        manifest: input.manifest
      }
    )
  }

  async issueLease(
    input: DshCredentialLeaseRequest
  ): Promise<DshCredentialLease> {
    const request = normalizeDshCredentialLeaseRequest(input)
    const manifest = this.requireAcceptedManifest(request)
    assertCredentialRequestAuthorized(manifest, request)
    const issuedAt = this.now()
    const lease = deepFreeze({
      ...request,
      leaseId: this.createLeaseId(),
      exchangeToken: this.createExchangeToken(),
      issuedAt,
      expiresAt:
        issuedAt +
        Math.min(request.requestedTtlMs ?? this.maxLeaseTtlMs, this.maxLeaseTtlMs),
      renewable: false
    } satisfies DshCredentialLease)
    this.leases.set(lease.leaseId, {
      lease,
      status: 'active'
    })
    await this.audit({
      type: 'credential_lease_issued',
      leaseId: lease.leaseId,
      runtimeInstanceId: lease.runtimeInstanceId,
      sessionId: lease.sessionId,
      runId: lease.runId,
      credentialRef: lease.credentialRef,
      purpose: lease.purpose,
      operation: lease.operation,
      at: issuedAt
    })
    return lease
  }

  async exchangeLease(
    input: DshCredentialLeaseExchangeRequest
  ): Promise<DshCredentialMaterial> {
    const request = normalizeDshCredentialLeaseExchangeRequest(input)
    const record = this.requireActiveLease(request)
    const lease = record.lease
    try {
      const material = normalizeDshCredentialMaterial(
        await this.dependencies.resolver.resolve({
          runtimeInstanceId: lease.runtimeInstanceId,
          sessionId: lease.sessionId,
          runId: lease.runId,
          manifestDigest: lease.manifestDigest,
          credentialRef: lease.credentialRef,
          purpose: lease.purpose,
          capabilityId: lease.capabilityId,
          operation: lease.operation,
          scopeDigest: lease.scopeDigest,
          effectDigest: lease.effectDigest,
          leaseId: lease.leaseId,
          issuedAt: lease.issuedAt,
          expiresAt: lease.expiresAt
        })
      )
      record.status = 'consumed'
      await this.audit({
        type: 'credential_lease_exchanged',
        leaseId: lease.leaseId,
        runtimeInstanceId: lease.runtimeInstanceId,
        sessionId: lease.sessionId,
        runId: lease.runId,
        credentialRef: lease.credentialRef,
        purpose: lease.purpose,
        operation: lease.operation,
        at: this.now()
      })
      return deepFreeze({
        schemaVersion: DSH_CREDENTIAL_BROKER_SCHEMA_VERSION,
        leaseId: lease.leaseId,
        credentialRef: lease.credentialRef,
        purpose: lease.purpose,
        operation: lease.operation,
        material,
        expiresAt: lease.expiresAt
      } satisfies DshCredentialMaterial)
    } catch (error) {
      const message = redactDshCredentialText(errorMessage(error))
      await this.audit({
        type: 'credential_lease_exchange_failed',
        leaseId: lease.leaseId,
        runtimeInstanceId: lease.runtimeInstanceId,
        sessionId: lease.sessionId,
        runId: lease.runId,
        credentialRef: lease.credentialRef,
        purpose: lease.purpose,
        operation: lease.operation,
        reason: message,
        at: this.now()
      })
      throw new Error(`Credential lease exchange failed: ${message}`)
    }
  }

  revokeLeases(scope: DshCredentialLeaseRevocation): number {
    let revoked = 0
    for (const record of this.leases.values()) {
      if (record.status !== 'active') continue
      const lease = record.lease
      if (
        scope.runtimeInstanceId !== undefined &&
        scope.runtimeInstanceId !== lease.runtimeInstanceId
      ) {
        continue
      }
      if (scope.sessionId !== undefined && scope.sessionId !== lease.sessionId) {
        continue
      }
      if (scope.runId !== undefined && scope.runId !== lease.runId) {
        continue
      }
      if (
        scope.credentialRef !== undefined &&
        scope.credentialRef !== lease.credentialRef
      ) {
        continue
      }
      record.status = 'revoked'
      record.revokedReason = scope.reason
      revoked += 1
      void this.audit({
        type: 'credential_lease_revoked',
        leaseId: lease.leaseId,
        runtimeInstanceId: lease.runtimeInstanceId,
        sessionId: lease.sessionId,
        runId: lease.runId,
        credentialRef: lease.credentialRef,
        purpose: lease.purpose,
        operation: lease.operation,
        reason: scope.reason,
        at: this.now()
      }).catch(() => undefined)
    }
    return revoked
  }

  private requireAcceptedManifest(
    request: DshCredentialLeaseRequest
  ): DshRunManifest {
    const accepted = this.acceptedRuns.get(acceptedRunKey(request))
    if (accepted === undefined) {
      throw new Error('Credential broker run binding is not accepted')
    }
    return accepted.manifest
  }

  private requireActiveLease(
    request: DshCredentialLeaseExchangeRequest
  ): LeaseRecord {
    const record = this.leases.get(request.leaseId)
    if (record === undefined) {
      throw new Error('Credential lease is not declared')
    }
    assertLeaseMatchesRequest(record.lease, request)
    if (record.status === 'consumed') {
      throw new Error('Credential lease was already consumed')
    }
    if (record.status === 'revoked') {
      throw new Error('Credential lease was revoked')
    }
    if (this.now() > record.lease.expiresAt) {
      throw new Error('Credential lease expired')
    }
    return record
  }

  private async audit(event: DshCredentialBrokerAuditEvent): Promise<void> {
    await this.dependencies.audit?.record(
      redactDshCredentialValue(event) as DshCredentialBrokerAuditEvent
    )
  }
}

function assertCredentialRequestAuthorized(
  manifest: DshRunManifest,
  request: DshCredentialLeaseRequest
): void {
  if (
    !manifest.credentialReferences.some(
      (reference) =>
        reference.ref === request.credentialRef &&
        reference.purpose === request.purpose
    )
  ) {
    throw new Error('Credential reference is not declared in the run manifest')
  }
  const allowedOperations = DSH_CREDENTIAL_OPERATIONS_BY_PURPOSE[request.purpose]
  if (!allowedOperations.includes(request.operation as never)) {
    throw new Error('Credential operation is not allowed for this purpose')
  }
  if (!isCapabilityAuthorizedForCredential(manifest, request)) {
    throw new Error('Credential capability is not authorized for this reference')
  }
}

function isCapabilityAuthorizedForCredential(
  manifest: DshRunManifest,
  request: DshCredentialLeaseRequest
): boolean {
  switch (request.purpose) {
    case 'model':
      return (
        manifest.model.credentialRef === request.credentialRef &&
        new Set([
          manifest.model.providerId,
          `model:${manifest.model.providerId}`,
          manifest.model.profileId,
          `model:${manifest.model.profileId}`
        ]).has(request.capabilityId)
      )
    case 'mcp':
      return manifest.mcpServers.some(
        (server) =>
          server.id === request.capabilityId &&
          server.credentialRefs.includes(request.credentialRef)
      )
    case 'connector':
      return manifest.connectors.some(
        (connector) =>
          connector.id === request.capabilityId &&
          connector.authentication.kind === 'credential-reference' &&
          connector.authentication.ref === request.credentialRef
      )
    case 'web':
      return manifest.tools.some(
        (tool) =>
          tool.id === request.capabilityId &&
          tool.capabilities.includes('credential.use')
      )
    case 'product-command':
      return manifest.productCommands.some(
        (command) =>
          command.command === request.capabilityId ||
          command.grantId === request.capabilityId
      )
    case 'product-service':
      return (
        manifest.tools.some(
          (tool) =>
            tool.id === request.capabilityId &&
            tool.capabilities.includes('credential.use')
        ) ||
        manifest.productCommands.some(
          (command) =>
            command.command === request.capabilityId ||
            command.grantId === request.capabilityId
        )
      )
    case 'embedding':
      return (
        request.capabilityId === 'embedding' ||
        request.capabilityId ===
          `embedding:${manifest.knowledge.embeddingProfile.model}`
      )
  }
}

function assertLeaseMatchesRequest(
  lease: DshCredentialLease,
  request: DshCredentialLeaseExchangeRequest
): void {
  const fields: Array<keyof DshCredentialLeaseExchangeRequest> = [
    'runtimeInstanceId',
    'sessionId',
    'runId',
    'manifestDigest',
    'leaseId',
    'exchangeToken',
    'credentialRef',
    'purpose',
    'capabilityId',
    'operation',
    'scopeDigest',
    'effectDigest'
  ]
  for (const field of fields) {
    if (lease[field] !== request[field]) {
      throw new Error('Credential lease binding does not match request')
    }
  }
}

function acceptedRunKey(input: {
  runtimeInstanceId: string
  sessionId: string
  runId: string
  manifestDigest: string
}): string {
  return [
    input.runtimeInstanceId,
    input.sessionId,
    input.runId,
    input.manifestDigest
  ].join(':')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }
  return value
}
