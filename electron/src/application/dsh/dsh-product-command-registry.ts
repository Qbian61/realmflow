import type { DshRunManifest, ProductCommandGrant } from '../../../../domain/dsh-run-manifest'
import {
  DSH_PRODUCT_COMMAND_SCHEMA_VERSION,
  digestDshProductCommandInput,
  digestDshProductCommandScope,
  normalizeDshProductCommandAdapter,
  normalizeDshProductCommandAdapterResult,
  normalizeDshProductCommandEnvelope,
  type DshProductCommandAdapter,
  type DshProductCommandAdapterRequest,
  type DshProductCommandEnvelope,
  type DshProductCommandResult
} from '../../../../shared/dsh-product-command-contract'

export type DshProductCommandAuditEvent = {
  type: 'product_command_executed'
  commandId: string
  command: string
  commandGrantId: string
  runtimeInstanceId: string
  sessionId: string
  runId: string
  idempotencyKey: string
  productVersion: string
  at: number
}

export type DshProductCommandRegistryDependencies = {
  audit?: {
    record(event: DshProductCommandAuditEvent): Promise<void> | void
  }
  now?: () => number
}

type AcceptedRunManifest = {
  runtimeInstanceId: string
  manifest: DshRunManifest
}

type IdempotentRecord = {
  fingerprint: string
  result: DshProductCommandResult
}

export class DshProductCommandRegistry {
  private readonly acceptedRuns = new Map<string, AcceptedRunManifest>()
  private readonly adapters = new Map<string, DshProductCommandAdapter>()
  private readonly idempotency = new Map<string, IdempotentRecord>()
  private readonly invocations = new Map<string, number>()
  private readonly now: () => number

  constructor(
    private readonly dependencies: DshProductCommandRegistryDependencies = {}
  ) {
    this.now = dependencies.now ?? Date.now
  }

  registerAdapter(input: DshProductCommandAdapter): void {
    const adapter = normalizeDshProductCommandAdapter(input)
    if (this.adapters.has(adapter.command)) {
      throw new Error('Product command adapter is already registered')
    }
    this.adapters.set(adapter.command, adapter)
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

  async execute(
    input: DshProductCommandEnvelope
  ): Promise<DshProductCommandResult> {
    const envelope = normalizeDshProductCommandEnvelope(input)
    const manifest = this.requireAcceptedManifest(envelope)
    const grant = requireCommandGrant(manifest, envelope.commandGrantId)
    assertScopeMatches(grant, envelope)
    assertInputDigestMatches(envelope)
    const adapter = this.requireAdapter(grant)
    const request = deepFreeze({
      ...envelope,
      command: grant.command,
      grant,
      scope: grant.scope
    } satisfies DshProductCommandAdapterRequest)
    const idempotencyKey = productCommandIdempotencyKey(envelope)
    const fingerprint = productCommandFingerprint(request)
    const existing = this.idempotency.get(idempotencyKey)
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error('Product command idempotency key conflicts')
      }
      return existing.result
    }
    this.assertInvocationBudget(grant, envelope)
    await this.assertProductVersion(adapter, request)
    const adapterResult = normalizeDshProductCommandAdapterResult(
      await adapter.execute(request)
    )
    const result = deepFreeze({
      schemaVersion: DSH_PRODUCT_COMMAND_SCHEMA_VERSION,
      commandId: envelope.commandId,
      command: grant.command,
      runtimeInstanceId: envelope.runtimeInstanceId,
      sessionId: envelope.sessionId,
      runId: envelope.runId,
      idempotencyKey: envelope.idempotencyKey,
      status: 'succeeded',
      productVersion: adapterResult.productVersion,
      output: adapterResult.output
    } satisfies DshProductCommandResult)
    this.idempotency.set(idempotencyKey, {
      fingerprint,
      result
    })
    this.invocations.set(
      invocationBudgetKey(envelope),
      (this.invocations.get(invocationBudgetKey(envelope)) ?? 0) + 1
    )
    await this.dependencies.audit?.record({
      type: 'product_command_executed',
      commandId: result.commandId,
      command: result.command,
      commandGrantId: envelope.commandGrantId,
      runtimeInstanceId: result.runtimeInstanceId,
      sessionId: result.sessionId,
      runId: result.runId,
      idempotencyKey: result.idempotencyKey,
      productVersion: result.productVersion,
      at: this.now()
    })
    return result
  }

  private requireAcceptedManifest(
    envelope: DshProductCommandEnvelope
  ): DshRunManifest {
    const accepted = this.acceptedRuns.get(acceptedRunKey(envelope))
    if (accepted === undefined) {
      throw new Error('Product command run binding is not accepted')
    }
    return accepted.manifest
  }

  private requireAdapter(grant: ProductCommandGrant): DshProductCommandAdapter {
    const adapter = this.adapters.get(grant.command)
    if (adapter === undefined) {
      throw new Error('Product command adapter is not registered')
    }
    if (adapter.inputSchemaDigest !== grant.inputSchemaDigest) {
      throw new Error('Product command adapter schema does not match run grant')
    }
    return adapter
  }

  private assertInvocationBudget(
    grant: ProductCommandGrant,
    envelope: DshProductCommandEnvelope
  ): void {
    if ((this.invocations.get(invocationBudgetKey(envelope)) ?? 0) >= grant.maxInvocations) {
      throw new Error('Product command invocation limit exceeded')
    }
  }

  private async assertProductVersion(
    adapter: DshProductCommandAdapter,
    request: DshProductCommandAdapterRequest
  ): Promise<void> {
    if (
      adapter.expectedProductVersion === 'required' &&
      request.expectedProductVersion === undefined
    ) {
      throw new Error('Product command expected product version is required')
    }
    const current = await adapter.getCurrentProductVersion?.(request)
    if (
      current !== undefined &&
      request.expectedProductVersion !== undefined &&
      current !== request.expectedProductVersion
    ) {
      throw new Error('Product command version conflict')
    }
  }
}

function requireCommandGrant(
  manifest: DshRunManifest,
  commandGrantId: string
): ProductCommandGrant {
  const grant = manifest.productCommands.find(
    (candidate) => candidate.grantId === commandGrantId
  )
  if (grant === undefined) {
    throw new Error('Product command grant is not declared in the run manifest')
  }
  return grant
}

function assertScopeMatches(
  grant: ProductCommandGrant,
  envelope: DshProductCommandEnvelope
): void {
  if (digestDshProductCommandScope(grant.scope) !== envelope.scopeDigest) {
    throw new Error('Product command scope digest mismatch')
  }
}

function assertInputDigestMatches(envelope: DshProductCommandEnvelope): void {
  if (digestDshProductCommandInput(envelope.payload) !== envelope.inputDigest) {
    throw new Error('Product command input digest mismatch')
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

function productCommandIdempotencyKey(
  envelope: DshProductCommandEnvelope
): string {
  return [
    envelope.runtimeInstanceId,
    envelope.sessionId,
    envelope.runId,
    envelope.commandGrantId,
    envelope.idempotencyKey
  ].join(':')
}

function invocationBudgetKey(envelope: DshProductCommandEnvelope): string {
  return [
    envelope.runtimeInstanceId,
    envelope.sessionId,
    envelope.runId,
    envelope.commandGrantId
  ].join(':')
}

function productCommandFingerprint(
  request: DshProductCommandAdapterRequest
): string {
  return digestDshProductCommandInput({
    runtimeInstanceId: request.runtimeInstanceId,
    sessionId: request.sessionId,
    runId: request.runId,
    manifestDigest: request.manifestDigest,
    commandId: request.commandId,
    commandGrantId: request.commandGrantId,
    command: request.command,
    scopeDigest: request.scopeDigest,
    inputDigest: request.inputDigest,
    expectedProductVersion: request.expectedProductVersion ?? null,
    payload: request.payload
  })
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
