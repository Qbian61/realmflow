import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import {
  createSandboxManifest,
  SandboxPolicyError,
  type SandboxManifest
} from '../../../../domain/sandbox-manifest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { SecurePathService } from '../../workspace/secure-path-service'
import type {
  AdapterExecutionResult,
  AdapterPreparation,
  PreparedToolInvocation,
  ResolvedToolBinding,
  ToolAdapter,
  ToolConnectorGrant,
  ToolExecutionContext,
  ToolExecutionEventSink,
  ToolExecutionMetrics
} from './tool-adapter'

type SandboxSidecarInput = {
  executionId: string
  manifest: SandboxManifest
  runtime: 'python' | 'process'
  packageRoot: string
  entryPath: string
  arguments: string[]
  input: JsonObject
  capabilities: ToolDefinition['capabilities']
  scopeRoots: string[]
  network: ToolConnectorGrant[]
  timeoutMs: number
  maxMemoryMb: number
  maxOutputBytes: number
}

type SandboxDependencies = {
  packages: {
    resolveRoot(packageDigest: string): Promise<string | undefined>
  }
  sidecar: {
    getHealth(): Promise<unknown>
    getSandboxCapabilities(): Promise<{
      platform: string
      processIsolation: 'sandbox-exec' | 'bwrap' | 'unavailable'
    }>
    executeTool(
      input: SandboxSidecarInput,
      signal: AbortSignal
    ): Promise<{ output: JsonObject; metrics: ToolExecutionMetrics }>
    cancelToolExecution(executionId: string): Promise<boolean>
  }
}

type SandboxRuntimeHandle = Omit<
  SandboxSidecarInput,
  | 'executionId'
  | 'manifest'
  | 'arguments'
  | 'input'
  | 'scopeRoots'
  | 'network'
> & {
  definitionDigest: string
  argumentsTemplate: string[]
  effects: ToolDefinition['effects']
  risk: ToolDefinition['risk']
}

const paths = new SecurePathService()
const TEMPLATE_VARIABLE = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g

export class SandboxToolAdapter implements ToolAdapter {
  readonly kind = 'sandbox' as const

  constructor(private readonly dependencies: SandboxDependencies) {}

  async resolve(
    definition: ToolDefinition,
    _context: ToolExecutionContext
  ): Promise<ResolvedToolBinding> {
    if (definition.executor.kind !== 'sandbox') {
      throw new Error('Sandbox Tool adapter received another executor kind')
    }
    const root = await this.dependencies.packages.resolveRoot(
      definition.package.packageDigest
    )
    if (!root) throw new Error('Sandbox Tool package is unavailable')
    let entry: Awaited<ReturnType<SecurePathService['resolveExistingPath']>>
    try {
      entry = await paths.resolveExistingPath(
        root,
        definition.executor.entryPath
      )
    } catch {
      throw new Error('Sandbox Tool entry is invalid')
    }
    return {
      definitionId: definition.id,
      definitionVersion: definition.version,
      definitionDigest: definition.definitionDigest,
      adapterKind: this.kind,
      bindingId: `sandbox-${createHash('sha256')
        .update(`${definition.id}@${definition.version}:${definition.definitionDigest}`)
        .digest('hex')
        .slice(0, 24)}`,
      sandboxProfileId: `sandbox-${definition.definitionDigest.slice(0, 16)}`,
      opaqueRuntimeHandle: {
        definitionDigest: definition.definitionDigest,
        runtime: definition.executor.runtime,
        packageRoot: entry.rootPath,
        entryPath: entry.targetPath,
        argumentsTemplate: definition.executor.argumentsTemplate ?? [],
        capabilities: [...definition.capabilities],
        effects: [...definition.effects],
        risk: definition.risk,
        timeoutMs: definition.resources.timeoutMs,
        maxMemoryMb: definition.resources.maxMemoryMb ?? 128,
        maxOutputBytes: definition.resources.maxOutputBytes
      } satisfies SandboxRuntimeHandle
    }
  }

  async prepare(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ): Promise<AdapterPreparation> {
    try {
      const handle = this.requireHandle(binding)
      await this.dependencies.sidecar.getHealth()
      const platform =
        await this.dependencies.sidecar.getSandboxCapabilities()
      const manifest = this.createManifest(handle, invocation, platform)
      return {
        outcome: 'ready',
        sandboxAudit: {
          policyDigest: manifest.policyDigest,
          executionLevel: manifest.executionLevel,
          enforcement: manifest.enforcement,
          platformIsolation: manifest.platformIsolation,
          readOnlyRootCount: manifest.readOnlyRoots.length,
          readWriteRootCount: manifest.readWriteRoots.length,
          networkTargets: manifest.networkTargets.map(
            (target) => `${target.service}@${target.origin}`
          ),
          resources: { ...manifest.resources }
        }
      }
    } catch (error) {
      if (
        error instanceof SandboxPolicyError &&
        error.code === 'platform_isolation_required'
      ) {
        return {
          outcome: 'denied',
          error: {
            code: 'tool_sandbox_unavailable',
            message: 'OS process isolation is unavailable',
            retryable: false
          }
        }
      }
      return {
        outcome: 'unavailable',
        error: {
          code: 'sandbox_unavailable',
          message: 'Sandbox Sidecar is unavailable',
          retryable: true
        }
      }
    }
  }

  async planEffects(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ) {
    try {
      const handle = this.requireHandle(binding)
      const roots = await Promise.all(
        invocation.scopeRoots.map((root) => realpath(root))
      )
      const effects = []
      if (handle.capabilities.includes('filesystem.write')) {
        effects.push(
          ...roots.map((path) => ({
            kind: 'filesystem.write' as const,
            path
          }))
        )
      } else if (handle.capabilities.includes('filesystem.read')) {
        effects.push(
          ...roots.map((path) => ({
            kind: 'filesystem.read' as const,
            path
          }))
        )
      }
      if (
        handle.capabilities.some((capability) =>
          [
            'process.discover',
            'process.execute',
            'process.manage'
          ].includes(capability)
        )
      ) {
        const args = renderArguments(
          handle.argumentsTemplate,
          invocation.arguments
        )
        effects.push({
          kind: 'process.execute' as const,
          executableDigest: createHash('sha256')
            .update(handle.runtime)
            .digest('hex'),
          executableDisplayName: handle.runtime,
          argsFingerprint: createHash('sha256')
            .update(JSON.stringify(args))
            .digest('hex'),
          workingDirectory: handle.packageRoot
        })
      }
      if (
        handle.capabilities.includes('network.connect') ||
        handle.capabilities.includes('connector.use') ||
        handle.capabilities.includes('credential.use')
      ) {
        effects.push(
          ...invocation.connectorGrants.map((grant) => ({
            kind: 'external' as const,
            capability: 'connector.use' as const,
            resourceKey: `${grant.service}@${new URL(grant.url).origin}`
          }))
        )
      }
      if (
        effects.length === 0 &&
        handle.capabilities.some((capability) =>
          [
            'filesystem.read',
            'filesystem.write',
            'filesystem.delete',
            'process.discover',
            'process.execute',
            'process.manage',
            'network.connect',
            'connector.use',
            'credential.use'
          ].includes(capability)
        )
      ) {
        throw new Error('Sandbox Tool effects are unresolved')
      }
      return { outcome: 'planned' as const, effects }
    } catch (error) {
      return {
        outcome: 'unresolved' as const,
        error: {
          code: 'tool_effects_unresolved',
          message: 'Tool effects could not be resolved',
          retryable: false
        }
      }
    }
  }

  async execute(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation,
    _sink: ToolExecutionEventSink,
    signal: AbortSignal
  ): Promise<AdapterExecutionResult> {
    if (signal.aborted) return cancelled()
    const handle = this.requireHandle(binding)
    try {
      const platform =
        await this.dependencies.sidecar.getSandboxCapabilities()
      const result = await this.dependencies.sidecar.executeTool(
        {
          executionId: invocation.executionId,
          manifest: this.createManifest(handle, invocation, platform),
          runtime: handle.runtime,
          packageRoot: handle.packageRoot,
          entryPath: handle.entryPath,
          arguments: renderArguments(
            handle.argumentsTemplate,
            invocation.arguments
          ),
          input: invocation.arguments,
          capabilities: [...handle.capabilities],
          scopeRoots: [...invocation.scopeRoots],
          network: invocation.connectorGrants.map((grant) => ({ ...grant })),
          timeoutMs: handle.timeoutMs,
          maxMemoryMb: handle.maxMemoryMb,
          maxOutputBytes: handle.maxOutputBytes
        },
        signal
      )
      return {
        outcome: 'succeeded',
        output: result.output,
        metrics: result.metrics
      }
    } catch (error) {
      if (signal.aborted || isCancellation(error)) return cancelled()
      return {
        outcome: 'failed',
        error: {
          code: errorCode(error),
          message: 'Sandbox Tool execution failed',
          retryable: false
        },
        metrics: { durationMs: 0, outputBytes: 0 }
      }
    }
  }

  async cancel(
    _binding: ResolvedToolBinding,
    executionId: string
  ): Promise<void> {
    await this.dependencies.sidecar.cancelToolExecution(executionId)
  }

  async health() {
    try {
      await this.dependencies.sidecar.getHealth()
      return { status: 'ready' as const }
    } catch {
      return {
        status: 'unavailable' as const,
        reason: 'Sandbox Sidecar is unavailable'
      }
    }
  }

  private requireHandle(
    binding: ResolvedToolBinding
  ): SandboxRuntimeHandle {
    const handle = binding.opaqueRuntimeHandle
    if (
      binding.adapterKind !== this.kind ||
      !isRecord(handle) ||
      handle.definitionDigest !== binding.definitionDigest ||
      (handle.runtime !== 'python' && handle.runtime !== 'process') ||
      typeof handle.packageRoot !== 'string' ||
      typeof handle.entryPath !== 'string' ||
      !Array.isArray(handle.argumentsTemplate) ||
      !Array.isArray(handle.capabilities) ||
      !Array.isArray(handle.effects) ||
      typeof handle.risk !== 'string' ||
      !['low', 'medium', 'high', 'critical'].includes(handle.risk) ||
      !isPositiveInteger(handle.timeoutMs) ||
      !isPositiveInteger(handle.maxMemoryMb) ||
      !isPositiveInteger(handle.maxOutputBytes)
    ) {
      throw new Error('Sandbox Tool binding is invalid')
    }
    return handle as SandboxRuntimeHandle
  }

  private createManifest(
    handle: SandboxRuntimeHandle,
    invocation: PreparedToolInvocation,
    platform: {
      platform: string
      processIsolation: 'sandbox-exec' | 'bwrap' | 'unavailable'
    }
  ): SandboxManifest {
    return createSandboxManifest({
      executionId: invocation.executionId,
      runtime: handle.runtime,
      capabilities: [...handle.capabilities],
      effects: [...handle.effects],
      risk: handle.risk,
      packageRoot: handle.packageRoot,
      scopeRoots: [...invocation.scopeRoots],
      connectorGrants: invocation.connectorGrants.map((grant) => ({
        ...grant
      })),
      resources: {
        timeoutMs: handle.timeoutMs,
        maxMemoryMb: handle.maxMemoryMb,
        maxOutputBytes: handle.maxOutputBytes
      },
      platform: {
        name: platform.platform as NodeJS.Platform,
        processIsolation: platform.processIsolation
      }
    })
  }
}

function renderArguments(
  template: string[],
  input: JsonObject
): string[] {
  return template.map((argument) =>
    argument.replace(TEMPLATE_VARIABLE, (_match, name: string) => {
      const value = input[name]
      if (
        value === undefined ||
        (typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean')
      ) {
        throw new Error(`Sandbox Tool argument is unavailable: ${name}`)
      }
      return String(value)
    })
  )
}

function cancelled(): AdapterExecutionResult {
  return {
    outcome: 'cancelled',
    error: {
      code: 'tool_cancelled',
      message: 'Sandbox Tool execution was cancelled',
      retryable: false
    },
    metrics: { durationMs: 0, outputBytes: 0 }
  }
}

function errorCode(error: unknown): string {
  return (
    isRecord(error) &&
    typeof error.code === 'string' &&
    error.code.startsWith('tool_')
  )
    ? error.code
    : 'sandbox_execution_failed'
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      ('code' in error && error.code === 'tool_cancelled'))
  )
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
