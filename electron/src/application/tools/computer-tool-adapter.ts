import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { ComputerPolicy } from './computer-policy'
import {
  COMPUTER_ACTIONS,
  type ComputerAction,
  type NativeComputerHealth,
  type NativeComputerHost
} from './native-computer-host'
import type {
  AdapterExecutionResult,
  AdapterPreparation,
  PreparedToolInvocation,
  ResolvedToolBinding,
  ToolAdapter,
  ToolArtifactReference,
  ToolExecutionContext,
  ToolExecutionEventSink
} from './tool-adapter'

type ComputerToolAdapterDependencies = {
  host: NativeComputerHost
  grants: {
    isApplicationAuthorized(bundleId: string): Promise<boolean>
  }
  criticalGate: {
    isApproved(input: {
      executionId: string
      bundleId: string
      semantic: 'submit' | 'send' | 'publish' | 'purchase' | 'delete'
    }): Promise<boolean>
  }
  artifacts: {
    createTemporary(input: {
      executionId: string
      mediaType: string
      bytes: Uint8Array
      expiresAt: number
    }): Promise<ToolArtifactReference>
  }
  platform?: NodeJS.Platform
  now?: () => number
  artifactTtlMs?: number
}

type ComputerRuntimeHandle = {
  definitionDigest: string
  action: ComputerAction
  actionSetVersion: string
  maxOutputBytes: number
}

type UnavailablePreparation = {
  outcome: 'unavailable'
  error: {
    code: string
    message: string
    retryable: boolean
  }
}

const ARTIFACT_TTL_MS = 15 * 60_000

export class ComputerToolAdapter implements ToolAdapter {
  readonly kind = 'computer' as const
  private readonly platform: NodeJS.Platform
  private readonly now: () => number
  private readonly artifactTtlMs: number
  private readonly policy: ComputerPolicy

  constructor(private readonly dependencies: ComputerToolAdapterDependencies) {
    this.platform = dependencies.platform ?? process.platform
    this.now = dependencies.now ?? Date.now
    this.artifactTtlMs = dependencies.artifactTtlMs ?? ARTIFACT_TTL_MS
    this.policy = new ComputerPolicy(dependencies)
  }

  async resolve(
    definition: ToolDefinition,
    _context: ToolExecutionContext
  ): Promise<ResolvedToolBinding> {
    if (definition.executor.kind !== 'computer') {
      throw new Error('Computer Tool adapter received another executor kind')
    }
    if (!isComputerAction(definition.executor.actionSet)) {
      throw new Error('Computer Tool action is unsupported')
    }
    return {
      definitionId: definition.id,
      definitionVersion: definition.version,
      definitionDigest: definition.definitionDigest,
      adapterKind: this.kind,
      bindingId: `computer-${definition.id}-${definition.definitionDigest.slice(0, 16)}`,
      opaqueRuntimeHandle: {
        definitionDigest: definition.definitionDigest,
        action: definition.executor.actionSet,
        actionSetVersion: definition.executor.actionSetVersion,
        maxOutputBytes: definition.resources.maxOutputBytes
      } satisfies ComputerRuntimeHandle
    }
  }

  async prepare(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ): Promise<AdapterPreparation> {
    if (this.platform !== 'darwin') {
      return unavailable(
        'computer_platform_unavailable',
        'Computer Use is available only on macOS'
      )
    }
    const handle = this.requireHandle(binding)
    const health = await this.dependencies.host.health()
    const permission = permissionFailure(handle.action, health)
    if (permission) return permission
    const bundleId = requireBundleId(invocation.arguments)
    const decision = await this.policy.authorizeApplication(bundleId)
    if (decision.outcome === 'deny') {
      return {
        outcome: 'denied',
        error: {
          code: decision.code,
          message: decision.message,
          retryable: false
        }
      }
    }
    return { outcome: 'ready' }
  }

  async planEffects(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ) {
    const handle = this.requireHandle(binding)
    const bundleId = requireBundleId(invocation.arguments)
    return {
      outcome: 'planned' as const,
      effects: [
        {
          kind:
            handle.action === 'observe' || handle.action === 'screenshot'
              ? ('computer.observe' as const)
              : ('computer.control' as const),
          application: {
            bundleId,
            displayName: bundleId
          }
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
    if (this.platform !== 'darwin') {
      return failed(
        'computer_platform_unavailable',
        'Computer Use is available only on macOS',
        false
      )
    }
    const handle = this.requireHandle(binding)
    try {
      const health = await this.dependencies.host.health()
      const permission = permissionFailure(handle.action, health)
      if (permission) {
        return failed(
          permission.error.code,
          permission.error.message,
          false
        )
      }
      const bundleId = requireBundleId(invocation.arguments)
      const target = await this.dependencies.host.inspectTarget(bundleId)
      if (target.bundleId !== bundleId) {
        return failed(
          'computer_target_changed',
          'Computer Use target application changed',
          false
        )
      }
      const decision = await this.policy.authorizeAction({
        executionId: invocation.executionId,
        action: handle.action,
        arguments: invocation.arguments,
        target
      })
      if (decision.outcome === 'deny') {
        return failed(decision.code, decision.message, false)
      }
      const result = await this.dependencies.host.perform({
        action: handle.action,
        bundleId,
        arguments: invocation.arguments,
        signal
      })
      const output = redactSecureValues(result.output)
      const outputBytes = Buffer.byteLength(JSON.stringify(output))
      if (outputBytes > handle.maxOutputBytes) {
        return failed(
          'tool_output_too_large',
          'Computer Tool output exceeded its size limit',
          false
        )
      }
      const artifacts = result.screenshot
        ? [
            await this.dependencies.artifacts.createTemporary({
              executionId: invocation.executionId,
              mediaType: result.screenshot.mediaType,
              bytes: result.screenshot.bytes,
              expiresAt: this.now() + this.artifactTtlMs
            })
          ]
        : []
      return {
        outcome: 'succeeded',
        output,
        ...(artifacts.length ? { artifacts } : {}),
        metrics: { durationMs: 0, outputBytes }
      }
    } catch (error) {
      if (signal.aborted) return cancelled()
      return failed(
        'computer_execution_failed',
        'Computer Use action failed',
        true
      )
    }
  }

  async health() {
    if (this.platform !== 'darwin') {
      return {
        status: 'unavailable' as const,
        reason: 'Computer Use is available only on macOS'
      }
    }
    try {
      const health = await this.dependencies.host.health()
      if (!health.screenRecording || !health.accessibility) {
        return {
          status: 'degraded' as const,
          reason: 'Computer Use requires macOS permissions'
        }
      }
      return { status: 'ready' as const }
    } catch {
      return {
        status: 'unavailable' as const,
        reason: 'Computer Use native host is unavailable'
      }
    }
  }

  private requireHandle(binding: ResolvedToolBinding): ComputerRuntimeHandle {
    const handle = binding.opaqueRuntimeHandle
    if (
      binding.adapterKind !== this.kind ||
      !isRecord(handle) ||
      handle.definitionDigest !== binding.definitionDigest ||
      !isComputerAction(handle.action) ||
      typeof handle.actionSetVersion !== 'string' ||
      typeof handle.maxOutputBytes !== 'number'
    ) {
      throw new Error('Computer Tool binding is invalid')
    }
    return handle as ComputerRuntimeHandle
  }
}

function permissionFailure(
  action: ComputerAction,
  health: NativeComputerHealth
): UnavailablePreparation | undefined {
  if (
    (action === 'observe' || action === 'screenshot') &&
    !health.screenRecording
  ) {
    return unavailable(
      'computer_screen_recording_permission_required',
      'Computer Use Screen Recording permission is required'
    )
  }
  if (action !== 'screenshot' && !health.accessibility) {
    return unavailable(
      'computer_accessibility_permission_required',
      'Computer Use Accessibility permission is required'
    )
  }
  return undefined
}

function unavailable(
  code: string,
  message: string
): UnavailablePreparation {
  return {
    outcome: 'unavailable',
    error: { code, message, retryable: false }
  }
}

function failed(
  code: string,
  message: string,
  retryable: boolean
): AdapterExecutionResult {
  return {
    outcome: 'failed',
    error: { code, message, retryable },
    metrics: { durationMs: 0, outputBytes: 0 }
  }
}

function cancelled(): AdapterExecutionResult {
  return {
    outcome: 'cancelled',
    error: {
      code: 'tool_cancelled',
      message: 'Computer Use action was cancelled',
      retryable: false
    },
    metrics: { durationMs: 0, outputBytes: 0 }
  }
}

function requireBundleId(arguments_: JsonObject): string {
  const bundleId = arguments_.bundleId
  if (
    typeof bundleId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9.-]{1,199}$/.test(bundleId)
  ) {
    throw new Error('Computer Use bundle ID is invalid')
  }
  return bundleId
}

function redactSecureValues(value: JsonObject): JsonObject {
  return redact(value) as JsonObject
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (!isRecord(value)) return value
  const secure =
    value.secure === true ||
    value.isSecure === true ||
    value.role === 'AXSecureTextField'
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      secure && ['value', 'text', 'title'].includes(key)
        ? '[secure]'
        : redact(item)
    ])
  )
}

function isComputerAction(value: unknown): value is ComputerAction {
  return (
    typeof value === 'string' &&
    (COMPUTER_ACTIONS as readonly string[]).includes(value)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
