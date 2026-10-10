import type { AgentRuntimeRun } from '../../../../domain/agent-runtime'
import { cloneJsonObject, type JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ToolExecutionCommand } from '../tools/tool-execution-application-service'
import type { AgentRuntimeOrchestrator } from './agent-runtime-orchestrator'

/** The resolver accepts runtime or provider IDs; only the returned Main-owned ID reaches business state. */
export function createRuntimeToolBindings(dependencies: {
  orchestrator: AgentRuntimeOrchestrator
  resolveRun(id: string): Promise<AgentRuntimeRun | undefined>
  sensitive?: {
    resolveCredential(input: JsonObject): Promise<JsonObject>
    runCapabilityCommand(input: JsonObject, context: {
      runId: string
      requestId: string
    }): Promise<JsonObject>
    runGatewayCommand?(input: JsonObject, context: {
      runId: string
      requestId: string
    }): Promise<JsonObject>
    runAutomationCommand?(input: JsonObject, context: {
      runId: string
      requestId: string
    }): Promise<JsonObject>
    runMediaCommand?(input: JsonObject, context: {
      runId: string
      requestId: string
    }, signal?: AbortSignal): Promise<JsonObject>
  }
}) {
  const resolveTrustedRun = async (
    context: ToolExecutionCommand['context']
  ): Promise<AgentRuntimeRun> => {
    const run = context.parentExecutionId
      ? await dependencies.resolveRun(context.parentExecutionId) : undefined
    if (!run) throw new Error('runtime_run_unavailable')
    if (run.snapshot.conversationId !== context.conversationId) throw new Error('runtime_scope_denied')
    return run
  }
  return {
    async runAgentCommand(
      toolId: string, input: JsonObject, context: ToolExecutionCommand['context'], requestId: string, signal?: AbortSignal
    ): Promise<JsonObject> {
      const run = await resolveTrustedRun(context)
      return cloneJsonObject(
        await dependencies.orchestrator.command(run.id, requestId, toolId, input, signal), 'Runtime command result'
      )
    },
    async resolveCredential(
      input: JsonObject, context: ToolExecutionCommand['context']
    ): Promise<JsonObject> {
      await resolveTrustedRun(context)
      if (!dependencies.sensitive) throw new Error('runtime_control_unavailable')
      return cloneJsonObject(await dependencies.sensitive.resolveCredential(input), 'Credential handle result')
    },
    async runCapabilityCommand(
      input: JsonObject, context: ToolExecutionCommand['context'], requestId: string
    ): Promise<JsonObject> {
      const run = await resolveTrustedRun(context)
      if (!dependencies.sensitive) throw new Error('runtime_control_unavailable')
      return cloneJsonObject(
        await dependencies.sensitive.runCapabilityCommand(input, { runId: run.id, requestId }),
        'Capability command result'
      )
    },
    async runGatewayCommand(
      input: JsonObject, context: ToolExecutionCommand['context'], requestId: string
    ): Promise<JsonObject> {
      const run = await resolveTrustedRun(context)
      if (!dependencies.sensitive?.runGatewayCommand) {
        throw new Error('runtime_control_unavailable')
      }
      return cloneJsonObject(
        await dependencies.sensitive.runGatewayCommand(input, {
          runId: run.id,
          requestId
        }),
        'Gateway command result'
      )
    },
    async runAutomationCommand(
      input: JsonObject,
      context: ToolExecutionCommand['context'],
      requestId: string
    ): Promise<JsonObject> {
      const run = await resolveTrustedRun(context)
      if (!dependencies.sensitive?.runAutomationCommand) {
        throw new Error('runtime_control_unavailable')
      }
      return cloneJsonObject(
        await dependencies.sensitive.runAutomationCommand(input, {
          runId: run.id,
          requestId
        }),
        'Automation command result'
      )
    },
    async runMediaCommand(
      input: JsonObject,
      context: ToolExecutionCommand['context'],
      requestId: string,
      signal?: AbortSignal
    ): Promise<JsonObject> {
      const run = await resolveTrustedRun(context)
      if (!dependencies.sensitive?.runMediaCommand) {
        throw new Error('runtime_control_unavailable')
      }
      return cloneJsonObject(
        await dependencies.sensitive.runMediaCommand(input, {
          runId: run.id,
          requestId
        }, signal),
        'Media command result'
      )
    }
  }
}
