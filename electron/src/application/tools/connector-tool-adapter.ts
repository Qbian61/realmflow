import { createHash } from 'node:crypto'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type {
  ConnectorGateway,
  ConnectorGatewayResult,
  EffectiveConnectorSnapshot
} from '../connectors/connector-gateway'
import type {
  AdapterExecutionResult,
  AdapterPreparation,
  PreparedToolInvocation,
  ResolvedToolBinding,
  ToolAdapter,
  ToolExecutionContext,
  ToolExecutionEventSink
} from './tool-adapter'

type ConnectorRuntimeHandle = {
  definitionDigest: string
  snapshot: EffectiveConnectorSnapshot
  context: ToolExecutionContext
}

type ConnectorToolAdapterDependencies = {
  snapshots: {
    resolve(
      definition: ToolDefinition,
      context: ToolExecutionContext
    ): Promise<EffectiveConnectorSnapshot | undefined>
  }
  gateway: Pick<ConnectorGateway, 'execute'>
}

export class ConnectorToolAdapter implements ToolAdapter {
  readonly kind = 'connector' as const

  constructor(private readonly dependencies: ConnectorToolAdapterDependencies) {}

  async resolve(
    definition: ToolDefinition,
    context: ToolExecutionContext
  ): Promise<ResolvedToolBinding> {
    if (definition.executor.kind !== 'connector') {
      throw new Error('Connector Tool adapter received another executor kind')
    }
    const snapshot = await this.dependencies.snapshots.resolve(
      definition,
      context
    )
    if (
      !snapshot ||
      snapshot.capabilityId !== definition.executor.capabilityId ||
      snapshot.capabilityVersion !== definition.executor.capabilityVersion ||
      snapshot.capabilityDigest !== definition.executor.capabilityDigest ||
      snapshot.action.id !== definition.executor.actionId
    ) {
      throw new Error('Connector capability snapshot is unavailable')
    }
    return {
      definitionId: definition.id,
      definitionVersion: definition.version,
      definitionDigest: definition.definitionDigest,
      adapterKind: this.kind,
      bindingId: `connector-${createHash('sha256')
        .update(
          `${snapshot.installationId}:${snapshot.capabilityDigest}:${snapshot.action.id}`
        )
        .digest('hex')
        .slice(0, 24)}`,
      opaqueRuntimeHandle: {
        definitionDigest: definition.definitionDigest,
        snapshot,
        context
      } satisfies ConnectorRuntimeHandle
    }
  }

  async prepare(
    binding: ResolvedToolBinding,
    _invocation: PreparedToolInvocation
  ): Promise<AdapterPreparation> {
    this.requireHandle(binding)
    return { outcome: 'ready' }
  }

  async planEffects(
    binding: ResolvedToolBinding,
    _invocation: PreparedToolInvocation
  ) {
    const snapshot = this.requireHandle(binding).snapshot
    return {
      outcome: 'planned' as const,
      effects: [
        {
          kind: 'external' as const,
          capability: 'connector.use' as const,
          resourceKey: `${snapshot.installationId}:${snapshot.action.id}`
        }
      ]
    }
  }

  async execute(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation,
    _sink: ToolExecutionEventSink,
    signal: AbortSignal
  ): Promise<AdapterExecutionResult> {
    if (signal.aborted) return cancelled()
    const startedAt = Date.now()
    const handle = this.requireHandle(binding)
    const result = await this.dependencies.gateway.execute({
      snapshot: handle.snapshot,
      arguments: invocation.arguments,
      idempotencyKey: invocation.executionId,
      permissionGranted: true,
      correlationId: handle.context.correlationId,
      causationId: handle.context.causationId,
      signal
    })
    if (signal.aborted) return cancelled()
    return mapResult(result, Date.now() - startedAt)
  }

  async health() {
    return { status: 'ready' as const }
  }

  private requireHandle(binding: ResolvedToolBinding): ConnectorRuntimeHandle {
    const handle = binding.opaqueRuntimeHandle as Partial<ConnectorRuntimeHandle>
    if (
      binding.adapterKind !== this.kind ||
      handle.definitionDigest !== binding.definitionDigest ||
      !handle.snapshot ||
      !handle.context
    ) {
      throw new Error('Connector Tool binding is invalid')
    }
    return handle as ConnectorRuntimeHandle
  }
}

function mapResult(
  result: ConnectorGatewayResult,
  durationMs: number
): AdapterExecutionResult {
  if (result.outcome === 'succeeded') {
    return {
      outcome: 'succeeded',
      output: result.output,
      metrics: {
        durationMs,
        outputBytes: Buffer.byteLength(JSON.stringify(result.output))
      }
    }
  }
  if (result.outcome === 'permission_required') {
    return failed(
      'connector_permission_required',
      'Connector permission is required',
      false,
      durationMs
    )
  }
  if (result.outcome === 'outcome_unknown') {
    return {
      outcome: 'interrupted',
      error: result.error,
      metrics: { durationMs, outputBytes: 0 }
    }
  }
  return failed(
    result.error.code,
    result.error.message,
    result.error.retryable,
    durationMs
  )
}

function failed(
  code: string,
  message: string,
  retryable: boolean,
  durationMs: number
): AdapterExecutionResult {
  return {
    outcome: 'failed',
    error: { code, message, retryable },
    metrics: { durationMs, outputBytes: 0 }
  }
}

function cancelled(): AdapterExecutionResult {
  return {
    outcome: 'cancelled',
    error: {
      code: 'tool_cancelled',
      message: 'Tool execution was cancelled',
      retryable: false
    },
    metrics: { durationMs: 0, outputBytes: 0 }
  }
}
