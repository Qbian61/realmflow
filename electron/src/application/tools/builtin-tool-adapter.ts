import { createHash } from 'node:crypto'
import {
  createFileMutationCommand,
  type FileMutationCommand
} from '../../../../domain/file-mutation-command'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { DEFAULT_WEB_PROVIDER_CONFIGURATION, type WebProviderConfiguration } from '../../../../shared/web-provider'
import { webError } from '../web/web-response'
import type {
  AdapterEffectPlan,
  AdapterExecutionResult,
  AdapterPreparation,
  PreparedToolInvocation,
  ResolvedToolBinding,
  ToolAdapter,
  ToolExecutionContext,
  ToolExecutionEventSink
} from './tool-adapter'
import {
  planBuiltinToolEffects,
  type BuiltinToolEffectPlannerDependencies
} from './tool-effect-planner'

export type BuiltinToolHandlerInput = {
  arguments: JsonObject
  executionId?: string
  idempotencyKey?: string
  requestedBy: PreparedToolInvocation['requestedBy']
  context: ToolExecutionContext
  scopeRoots: string[]
  connectorGrants?: PreparedToolInvocation['connectorGrants']
  signal: AbortSignal
  sink: ToolExecutionEventSink
  mutation?: FileMutationCommand
  /** Trusted Main snapshot; never copied from model arguments. */
  webConfiguration?: WebProviderConfiguration
}

export type BuiltinToolHandler = {
  name: string
  version: string
  execute(input: BuiltinToolHandlerInput): Promise<JsonObject>
  health?(): Promise<
    | { status: 'ready' }
    | { status: 'degraded' | 'unavailable'; reason: string }
  >
}

type BuiltinRuntimeHandle = {
  handlerKey: string
  definitionDigest: string
  maxOutputBytes: number
  definitionId: string
  mutatesFiles: boolean
  capabilities: ToolDefinition['capabilities']
  context: ToolExecutionContext
  webConfiguration?: WebProviderConfiguration
}

export class BuiltinToolAdapter implements ToolAdapter {
  readonly kind = 'builtin' as const
  private readonly handlers = new Map<string, BuiltinToolHandler>()
  private readonly effectPlanner: typeof planBuiltinToolEffects
  private readonly webConfiguration: () => WebProviderConfiguration

  constructor(
    handlers: readonly BuiltinToolHandler[],
    options: BuiltinToolEffectPlannerDependencies & {
      planEffects?: typeof planBuiltinToolEffects
    } = {}
  ) {
    this.webConfiguration = () => options.webConfiguration?.get() ?? DEFAULT_WEB_PROVIDER_CONFIGURATION
    this.effectPlanner = options.planEffects ?? ((input) =>
      planBuiltinToolEffects(input, options))
    for (const handler of handlers) {
      const key = handlerKey(handler.name, handler.version)
      if (this.handlers.has(key)) {
        throw new Error(`Builtin Tool handler is already registered: ${key}`)
      }
      this.handlers.set(key, handler)
    }
  }

  async resolve(
    definition: ToolDefinition,
    context: ToolExecutionContext
  ): Promise<ResolvedToolBinding> {
    if (definition.executor.kind !== 'builtin') {
      throw new Error('Builtin Tool adapter received another executor kind')
    }
    const key = handlerKey(
      definition.executor.handler,
      definition.executor.handlerVersion
    )
    this.requireHandler(key)
    const webConfiguration = definition.executor.handler.startsWith('web.')
      ? Object.freeze({ ...this.webConfiguration() }) : undefined
    return {
      definitionId: definition.id,
      definitionVersion: definition.version,
      definitionDigest: definition.definitionDigest,
      adapterKind: this.kind,
      bindingId: `builtin-${createHash('sha256')
        .update(`${definition.id}@${definition.version}:${definition.definitionDigest}${webConfiguration ? JSON.stringify(webConfiguration) : ''}`)
        .digest('hex')
        .slice(0, 24)}`,
      opaqueRuntimeHandle: {
        handlerKey: key,
        definitionDigest: definition.definitionDigest,
        maxOutputBytes: definition.resources.maxOutputBytes,
        definitionId: definition.id,
        mutatesFiles: definition.capabilities.some(
          (capability) =>
            capability === 'filesystem.write' ||
            capability === 'filesystem.delete'
        ),
        capabilities: [...definition.capabilities],
        context,
        ...(webConfiguration ? { webConfiguration } : {})
      } satisfies BuiltinRuntimeHandle
    }
  }

  async prepare(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ): Promise<AdapterPreparation> {
    try {
      const handle = this.requireHandle(binding)
      this.requireHandler(handle.handlerKey)
      this.assertWebConfiguration(handle)
      return {
        outcome: 'ready',
        ...(handle.mutatesFiles
          ? {
              preview: createFileMutationCommand({
                mutationId: invocation.executionId,
                idempotencyKey: invocation.idempotencyKey,
                toolId: handle.definitionId,
                mode: 'preview',
                arguments: invocation.arguments
              })
            }
          : {})
      }
    } catch (error) {
      return {
        outcome: 'unavailable',
        error: {
          code: error instanceof Error && error.message === 'web_configuration_changed'
            ? 'web_configuration_changed' : 'binding_invalid',
          message: error instanceof Error && error.message === 'web_configuration_changed'
            ? 'Web configuration changed; request authorization again' : 'Builtin Tool binding is invalid',
          retryable: false
        }
      }
    }
  }

  async planEffects(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ): Promise<AdapterEffectPlan> {
    const handle = this.requireHandle(binding)
    return this.effectPlanner({
      handlerName: handle.handlerKey.slice(
        0,
        handle.handlerKey.lastIndexOf('@')
      ),
      capabilities: handle.capabilities,
      arguments: invocation.arguments,
      scopeRoots: invocation.scopeRoots,
      ...(handle.webConfiguration ? { webConfiguration: handle.webConfiguration } : {})
    })
  }

  async execute(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation,
    sink: ToolExecutionEventSink,
    signal: AbortSignal
  ): Promise<AdapterExecutionResult> {
    const startedAt = performance.now()
    if (signal.aborted) return cancelled(startedAt)
    const preparation = await this.prepare(binding, invocation)
    if (preparation.outcome !== 'ready') {
      return {
        outcome: 'failed',
        error: preparation.error,
        metrics: metrics(startedAt, 0)
      }
    }
    const handle = this.requireHandle(binding)
    try {
      this.assertWebConfiguration(handle)
      const mutation = handle.mutatesFiles
        ? createFileMutationCommand({
            mutationId: invocation.executionId,
            idempotencyKey: invocation.idempotencyKey,
            toolId: handle.definitionId,
            mode: 'commit',
            arguments: invocation.arguments
          })
        : undefined
      const output = normalizeOutput(
        await this.requireHandler(handle.handlerKey).execute({
          arguments: invocation.arguments,
          executionId: invocation.executionId,
          idempotencyKey: invocation.idempotencyKey,
          requestedBy: invocation.requestedBy,
          context: handle.context,
          scopeRoots: [...invocation.scopeRoots],
          connectorGrants: invocation.connectorGrants.map((grant) => ({
            ...grant
          })),
          signal,
          sink,
          ...(mutation ? { mutation } : {}),
          ...(handle.webConfiguration ? { webConfiguration: handle.webConfiguration } : {})
        })
      )
      const result = mutation ? { ...output, mutation } : output
      if (signal.aborted) return cancelled(startedAt)
      const outputBytes = Buffer.byteLength(JSON.stringify(result))
      if (outputBytes > handle.maxOutputBytes) {
        return {
          outcome: 'failed',
          error: {
            code: 'tool_output_limit',
            message: 'Builtin Tool output limit exceeded',
            retryable: false
          },
          metrics: metrics(startedAt, outputBytes)
        }
      }
      return {
        outcome: 'succeeded',
        output: result,
        metrics: metrics(startedAt, outputBytes)
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return cancelled(startedAt)
      return {
        outcome: 'failed',
        error: {
          code: safeErrorCode(error),
          message: safeErrorMessage(error),
          retryable: false
        },
        metrics: metrics(startedAt, 0)
      }
    }
  }

  async health() {
    const states = await Promise.all(
      [...this.handlers.values()]
        .filter((handler) => handler.health)
        .map((handler) => handler.health!())
    )
    const unavailable = states.find(({ status }) => status === 'unavailable')
    if (unavailable) return unavailable
    const degraded = states.find(({ status }) => status === 'degraded')
    return degraded ?? { status: 'ready' as const }
  }

  assertDefinitions(definitions: readonly ToolDefinition[]): void {
    for (const definition of definitions) {
      if (definition.executor.kind !== 'builtin') continue
      this.requireHandler(
        handlerKey(
          definition.executor.handler,
          definition.executor.handlerVersion
        )
      )
    }
  }

  private assertWebConfiguration(handle: BuiltinRuntimeHandle): void {
    if (handle.webConfiguration &&
        JSON.stringify(handle.webConfiguration) !== JSON.stringify(this.webConfiguration())) {
      throw webError('web_configuration_changed')
    }
  }

  private requireHandler(key: string): BuiltinToolHandler {
    const handler = this.handlers.get(key)
    if (!handler) {
      throw new Error(`Builtin Tool handler is unavailable: ${key}`)
    }
    return handler
  }

  private requireHandle(binding: ResolvedToolBinding): BuiltinRuntimeHandle {
    if (
      binding.adapterKind !== this.kind ||
      !isRecord(binding.opaqueRuntimeHandle)
    ) {
      throw new Error('Builtin Tool binding is invalid')
    }
    const handle = binding.opaqueRuntimeHandle
    if (
      typeof handle.handlerKey !== 'string' ||
      typeof handle.definitionDigest !== 'string' ||
      handle.definitionDigest !== binding.definitionDigest ||
      !Number.isSafeInteger(handle.maxOutputBytes) ||
      (handle.maxOutputBytes as number) < 1 ||
      typeof handle.definitionId !== 'string' ||
      typeof handle.mutatesFiles !== 'boolean' ||
      !Array.isArray(handle.capabilities) ||
      !isExecutionContext(handle.context)
    ) {
      throw new Error('Builtin Tool binding is invalid')
    }
    return handle as BuiltinRuntimeHandle
  }
}

function handlerKey(name: string, version: string): string {
  return `${name}@${version}`
}

function normalizeOutput(value: unknown): JsonObject {
  if (!isRecord(value)) {
    throw new Error('Builtin Tool returned a non-object output')
  }
  try {
    const serialized = JSON.stringify(value)
    const output = JSON.parse(serialized) as unknown
    if (!isRecord(output)) throw new Error()
    return output as JsonObject
  } catch {
    throw new Error('Builtin Tool returned an invalid JSON output')
  }
}

function metrics(startedAt: number, outputBytes: number) {
  return {
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    outputBytes
  }
}

function cancelled(startedAt: number): AdapterExecutionResult {
  return {
    outcome: 'cancelled',
    error: {
      code: 'tool_cancelled',
      message: 'Builtin Tool execution was cancelled',
      retryable: false
    },
    metrics: metrics(startedAt, 0)
  }
}

function safeErrorCode(error: unknown): string {
  return (
    isRecord(error) &&
    typeof error.code === 'string' &&
    /^(?:tool|file|image|archive|artifact|document|fixed_layout|office|legacy_office|word|spreadsheet|presentation|pdf|process|web|browser)_[a-z0-9_]+$/.test(
      error.code
    )
  )
    ? error.code
    : 'builtin_execution_failed'
}

function safeErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.message &&
    !error.message.includes('/') &&
    !error.message.includes('\\')
  ) {
    return error.message.slice(0, 500)
  }
  return 'Builtin Tool execution failed'
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function isExecutionContext(value: unknown): value is ToolExecutionContext {
  return (
    isRecord(value) &&
    isRecord(value.owner) &&
    typeof value.owner.type === 'string' &&
    typeof value.owner.id === 'string' &&
    typeof value.correlationId === 'string' &&
    typeof value.causationId === 'string'
  )
}
