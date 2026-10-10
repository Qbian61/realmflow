import type {
  AiRunGateway,
  RunContext,
  RunToolConfiguration
} from '../ai-run/application/ports'
import type {
  ModelCallAuditContext,
  NetworkGateway
} from './network-gateway'
import type { SidecarClient } from '../sidecar/client'
import type { ModelExecutionConfig } from '../../../domain/model'
import type {
  CheckpointMessage,
  RunCheckpoint
} from '../../../domain/agent-run-recovery'
import type {
  AgentRunScope,
  AgentRuntimeRun
} from '../../../domain/agent-runtime'

type GatewayGrantManager = Pick<
  NetworkGateway,
  'authorize' | 'bindRun' | 'cancelRun' | 'revoke'
>

type SidecarRunClient = Pick<
  SidecarClient,
  'createRun' | 'resumeRun' | 'cancelRun'
>

type RecoverableRun = Pick<AgentRuntimeRun, 'id'> & {
  snapshot: {
    scope: AgentRunScope
    executionPolicy: {
      maxTurnsPerSegment: number
      maxParallelToolsPerTurn: number
    }
    reasoningDecision?: {
      effectiveMode: 'off' | 'low' | 'medium' | 'high'
    }
  }
}

type RecoverableCheckpoint = Pick<
  RunCheckpoint,
  | 'resumeToken'
  | 'messageWindow'
  | 'pendingCalls'
  | 'remainingBudgets'
  | 'toolConfiguration'
>

export function createGatewayRunAdapter(
  gateway: GatewayGrantManager,
  getSidecarClient: () => SidecarRunClient
): Pick<AiRunGateway, 'createRun' | 'cancelRun'> & {
  resumeRun(
    run: RecoverableRun,
    checkpoint: RecoverableCheckpoint,
    model?: ModelExecutionConfig
  ): Promise<{ runId: string }>
} {
  return {
    async createRun(
      context: RunContext,
      model?: ModelExecutionConfig,
      toolConfiguration?: RunToolConfiguration
    ): Promise<{ runId: string }> {
      const sidecarModel = model
        ? gateway.authorize(model, auditContext(context))
        : undefined
      try {
        const run = toolConfiguration
          ? await getSidecarClient().createRun(
              context,
              sidecarModel,
              toolConfiguration
            )
          : await getSidecarClient().createRun(context, sidecarModel)
        if (sidecarModel) gateway.bindRun(sidecarModel, run.runId)
        return run
      } catch (error) {
        if (sidecarModel) gateway.revoke(sidecarModel)
        throw error
      }
    },

    async resumeRun(
      run: RecoverableRun,
      checkpoint: RecoverableCheckpoint,
      model?: ModelExecutionConfig
    ): Promise<{ runId: string }> {
      const sidecarModel = model
        ? gateway.authorize(model, recoveryAuditContext(run))
        : undefined
      try {
        const resumed = await getSidecarClient().resumeRun({
          ...(checkpoint.toolConfiguration?.turnGate ? { turnGate: true } : {}),
          resumeToken: checkpoint.resumeToken,
          conversationId: run.id,
          ...recoveryScope(run.snapshot.scope),
          messages: checkpoint.messageWindow
            .filter(isProviderCheckpointMessage)
            .map(({ id: _id, ...message }) => message),
          maxAgentTurns: run.snapshot.executionPolicy.maxTurnsPerSegment,
          maxParallelToolsPerTurn:
            run.snapshot.executionPolicy.maxParallelToolsPerTurn,
          ...(checkpoint.remainingBudgets.tokens > 0
            ? { maxOutputTokens: checkpoint.remainingBudgets.tokens }
            : {}),
          ...(run.snapshot.reasoningDecision
            ? {
                reasoning:
                  run.snapshot.reasoningDecision.effectiveMode
              }
            : {}),
          ...(sidecarModel ? { model: sidecarModel } : {}),
          tools: checkpoint.toolConfiguration?.tools ?? [],
          pendingToolCalls: recoverPendingToolCalls(checkpoint)
        })
        if (sidecarModel) gateway.bindRun(sidecarModel, resumed.runId)
        return resumed
      } catch (error) {
        if (sidecarModel) gateway.revoke(sidecarModel)
        throw error
      }
    },

    async cancelRun(runId: string): Promise<void> {
      gateway.cancelRun(runId)
      await getSidecarClient().cancelRun(runId)
    }
  }
}

function recoverPendingToolCalls(checkpoint: RecoverableCheckpoint) {
  const toolCalls = checkpoint.messageWindow.flatMap(
    (message) => message.toolCalls ?? []
  )
  return checkpoint.pendingCalls
    .filter((call) => call.status === 'permission_required')
    .map((pending) => {
      const call = toolCalls.find(({ id }) => id === pending.callId)
      if (!call || !pending.requestId || !pending.executionId) {
        throw new Error('Pending Tool Call recovery state is incomplete')
      }
      return {
        callId: call.id,
        index: toolCalls.indexOf(call),
        name: call.name,
        arguments: call.arguments,
        requestId: pending.requestId,
        toolExecutionId: pending.executionId
      }
    })
}

function isProviderCheckpointMessage(
  message: CheckpointMessage
): message is CheckpointMessage & {
  role: 'user' | 'assistant' | 'tool'
} {
  return message.role !== 'system'
}

function recoveryScope(
  scope: AgentRunScope
): { workspaceId?: string; folderPath?: string } {
  if (scope.kind === 'folder') return { folderPath: scope.folderPath }
  if (scope.kind === 'workspace') {
    return { workspaceId: scope.workspaceId }
  }
  if (scope.kind === 'requirement-node' || scope.kind === 'workflow') {
    return { workspaceId: scope.workspaceId }
  }
  return {}
}

function recoveryAuditContext(run: RecoverableRun): ModelCallAuditContext {
  const scope = run.snapshot.scope
  if (scope.kind === 'requirement-node') {
    return {
      owner: { type: 'node_run', id: scope.nodeRunId },
      workspaceId: scope.workspaceId,
      requirementId: scope.requirementId,
      nodeId: scope.nodeId,
      nodeRunId: scope.nodeRunId
    }
  }
  if (scope.kind === 'workflow') {
    return {
      owner: { type: 'requirement', id: scope.requirementId },
      workspaceId: scope.workspaceId,
      requirementId: scope.requirementId,
      ...(scope.nodeId ? { nodeId: scope.nodeId } : {}),
      ...(scope.nodeRunId ? { nodeRunId: scope.nodeRunId } : {})
    }
  }
  return {
    owner: { type: 'application', id: run.id },
    ...(scope.kind === 'workspace'
      ? { workspaceId: scope.workspaceId }
      : {})
  }
}

function auditContext(context: RunContext): ModelCallAuditContext {
  if ('conversationId' in context) {
    return {
      owner: { type: 'conversation', id: context.conversationId },
      ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
      conversationId: context.conversationId
    }
  }
  if ('nodeId' in context && context.nodeRunId) {
    return {
      owner: { type: 'node_run', id: context.nodeRunId },
      workspaceId: context.workspaceId,
      requirementId: context.requirementId,
      nodeId: context.nodeId,
      nodeRunId: context.nodeRunId
    }
  }
  return {
    owner: { type: 'requirement', id: context.requirementId },
    workspaceId: context.workspaceId,
    requirementId: context.requirementId
  }
}
