import type { ToolDefinition } from '../../../../domain/tool-definition'
import type {
  AdapterEffectPlan,
  AdapterExecutionResult,
  AdapterPreparation,
  PreparedToolInvocation,
  ResolvedToolBinding,
  ToolAdapter,
  ToolAdapterHealth,
  ToolAdapterKind,
  ToolExecutionContext,
  ToolExecutionEventSink
} from './tool-adapter'

export class ToolAdapterRegistry {
  private readonly adapters = new Map<ToolAdapterKind, ToolAdapter>()

  constructor(adapters: readonly ToolAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter)
  }

  register(adapter: ToolAdapter): void {
    if (this.adapters.has(adapter.kind)) {
      throw new Error(
        `Tool adapter kind is already registered: ${adapter.kind}`
      )
    }
    this.adapters.set(adapter.kind, adapter)
  }

  async resolve(
    definition: ToolDefinition,
    context: ToolExecutionContext
  ): Promise<ResolvedToolBinding> {
    return this.require(definition.executor.kind).resolve(definition, context)
  }

  async prepare(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ): Promise<AdapterPreparation> {
    return this.require(binding.adapterKind).prepare(binding, invocation)
  }

  async planEffects(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation
  ): Promise<AdapterEffectPlan> {
    const adapter = this.require(binding.adapterKind)
    if (!adapter.planEffects) {
      return {
        outcome: 'unresolved',
        error: {
          code: 'tool_effects_unresolved',
          message: 'Tool effects could not be resolved',
          retryable: false
        }
      }
    }
    return adapter.planEffects(binding, invocation)
  }

  async execute(
    binding: ResolvedToolBinding,
    invocation: PreparedToolInvocation,
    sink: ToolExecutionEventSink,
    signal: AbortSignal
  ): Promise<AdapterExecutionResult> {
    return this.require(binding.adapterKind).execute(
      binding,
      invocation,
      sink,
      signal
    )
  }

  async cancel(
    binding: ResolvedToolBinding,
    attemptId: string
  ): Promise<boolean> {
    const adapter = this.require(binding.adapterKind)
    if (!adapter.cancel) return false
    await adapter.cancel(binding, attemptId)
    return true
  }

  async health(kind: ToolAdapterKind): Promise<ToolAdapterHealth> {
    return this.require(kind).health()
  }

  has(kind: ToolAdapterKind): boolean {
    return this.adapters.has(kind)
  }

  async close(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.adapters.values()].map((adapter) => adapter.close?.())
    )
    const failed = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected'
    )
    if (failed) throw failed.reason
  }

  private require(kind: ToolAdapterKind): ToolAdapter {
    const adapter = this.adapters.get(kind)
    if (!adapter) {
      throw new Error(`Tool adapter is not registered: ${kind}`)
    }
    return adapter
  }
}
