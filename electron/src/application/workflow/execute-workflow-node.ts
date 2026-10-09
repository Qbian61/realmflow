import type {
  AiGenerateExecutorConfig,
  RequirementNode,
  RequirementWorkflow,
  WorkflowNodeConfiguration
} from '../../../../domain/workflow'
import {
  ModelRoutingError,
  type ModelRouteRequest,
  type ModelRouteResult
} from '../../../../domain/model'
import type { RunRepository } from '../../ai-run/application/ports'
import type {
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository
} from '../ports/business-repositories'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'
import { NodeCompletionGateError } from './node-completion-gate-evaluator'

type Dependencies = {
  generate: {
    execute: (input: {
      requirementId: string
      nodeId: string
      nodeRunId: string
      executor: AiGenerateExecutorConfig
      modelProfileId?: string
    }) => Promise<{ runId: string; completion: Promise<void> }>
  }
  cancel: { execute: (runId: string) => Promise<void> }
  runs: Pick<RunRepository, 'get'>
  requirements: Pick<RequirementRepository, 'get'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'get' | 'getLatestByNode'> & {
    getLatestByNode: NonNullable<NodeRunRepository['getLatestByNode']>
  }
  models: {
    routeModel: (request: ModelRouteRequest) => Promise<ModelRouteResult>
  }
  advance: { drain: () => Promise<unknown> }
  manager: Pick<
    ManageNodeExecutionUseCase,
    | 'reserveNode'
    | 'bindAiRun'
    | 'completeNode'
    | 'waitForUser'
    | 'finishNode'
    | 'failRecovery'
  >
}

export class ExecuteWorkflowNodeUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: {
    requirementId: string
    nodeId: string
    nodeRunId: string
    modelProfileId?: string
    recovery?: boolean
  }): Promise<{ runId: string; completion: Promise<void> }> {
    const workflow = await this.dependencies.workflows.get(input.requirementId)
    const node = workflow?.nodes.find(
      (candidate) => candidate.id === input.nodeId
    )
    if (!node) throw new Error(`Workflow node not found: ${input.nodeId}`)
    const executor =
      node.type === 'ai_generate' || node.type === 'tool'
        ? node.executor
        : undefined
    if (!executor) {
      throw new Error(`Workflow node is not AI executable: ${input.nodeId}`)
    }
    const nodeRun = await this.dependencies.nodeRuns.get(input.nodeRunId)
    if (!nodeRun || nodeRun.nodeId !== node.id) {
      throw new Error(
        `Node run does not match workflow node: ${input.nodeRunId}`
      )
    }
    const route = await this.dependencies.models.routeModel(
      routeRequest(node.configuration?.model, nodeRun.checkpoint, input.modelProfileId)
    )
    if (route.outcome === 'unavailable') {
      throw new ModelRoutingError(route.code, route.message)
    }
    const modelProfileId = route.profile.id

    await this.dependencies.manager.reserveNode({
      requirementId: input.requirementId,
      nodeRunId: input.nodeRunId
    })
    let generated: { runId: string; completion: Promise<void> } | undefined
    try {
      generated = await this.dependencies.generate.execute({
        requirementId: input.requirementId,
        nodeId: input.nodeId,
        nodeRunId: input.nodeRunId,
        executor,
        modelProfileId
      })
      const latestNodeRun = await this.dependencies.nodeRuns.get(
        input.nodeRunId
      )
      if (!latestNodeRun) {
        throw new Error(`Node run not found: ${input.nodeRunId}`)
      }
      await this.dependencies.manager.bindAiRun({
        nodeRunId: input.nodeRunId,
        aiRunId: generated.runId,
        expectedNodeRunRevision: latestNodeRun.revision
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const settleFailure = () =>
        input.recovery
          ? this.dependencies.manager.failRecovery({
              requirementId: input.requirementId,
              nodeRunId: input.nodeRunId,
              error: message
            })
          : this.dependencies.manager.finishNode({
              requirementId: input.requirementId,
              nodeRunId: input.nodeRunId,
              status: 'failed',
              error: message
            })
      if (generated) {
        await Promise.allSettled([
          this.dependencies.cancel.execute(generated.runId),
          settleFailure()
        ])
      } else {
        await settleFailure()
      }
      throw error
    }
    if (!generated) throw new Error('AI run was not created')
    return {
      runId: generated.runId,
      completion: this.settleNode(input, generated.runId, generated.completion)
    }
  }

  private async settleNode(
    input: {
      requirementId: string
      nodeRunId: string
    },
    runId: string,
    completion: Promise<void>
  ): Promise<void> {
    let run
    try {
      await completion
      if (!(await this.isCurrentBinding(input.nodeRunId, runId))) return
      run = await this.dependencies.runs.get(runId)
      if (run?.status === 'completed') {
        await this.completeOrWait(input.requirementId, input.nodeRunId)
      }
    } catch (error) {
      if (!(await this.isCurrentBinding(input.nodeRunId, runId))) return
      await this.dependencies.manager.finishNode({
        requirementId: input.requirementId,
        nodeRunId: input.nodeRunId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
      return
    }
    if (!run || run.status === 'running' || run.status === 'created') return
    if (run.status === 'failed' || run.status === 'cancelled') {
      await this.dependencies.manager.finishNode({
        requirementId: input.requirementId,
        nodeRunId: input.nodeRunId,
        status: run.status,
        ...(run.error ? { error: run.error } : {})
      })
    }
  }

  private async isCurrentBinding(
    nodeRunId: string,
    runId: string
  ): Promise<boolean> {
    const nodeRun = await this.dependencies.nodeRuns.get(nodeRunId)
    if (!nodeRun || nodeRun.aiRunId !== runId) return false
    const latest = await this.dependencies.nodeRuns.getLatestByNode(
      nodeRun.executionId,
      nodeRun.nodeId
    )
    return latest?.id === nodeRun.id && latest.aiRunId === runId
  }

  private async completeOrWait(
    requirementId: string,
    nodeRunId: string
  ): Promise<void> {
    const [requirement, workflow, nodeRun] = await Promise.all([
      this.dependencies.requirements.get(requirementId),
      this.dependencies.workflows.get(requirementId),
      this.dependencies.nodeRuns.get(nodeRunId)
    ])
    if (!requirement || !workflow || !nodeRun) {
      throw new Error('Workflow execution state is incomplete')
    }
    try {
      await this.dependencies.manager.completeNode({
        requirementId,
        nodeRunId,
        expectedNodeRunRevision: nodeRun.revision,
        expectedWorkflowRevision: workflow.revision,
        expectedRequirementRevision: requirement.revision,
        executionFinished: true
      })
      await this.dependencies.advance.drain()
    } catch (error) {
      if (error instanceof NodeCompletionGateError) {
        await this.dependencies.manager.waitForUser({
          requirementId,
          nodeRunId
        })
        return
      }
      throw error
    }
  }
}

export function isWorkflowNodeExecutable(
  node: RequirementNode | undefined
): node is RequirementNode {
  return Boolean(
    node &&
      (
        (node.type === 'ai_generate' || node.type === 'tool') &&
        node.executor
      )
  )
}

function routeRequest(
  strategy: WorkflowNodeConfiguration['model'] | undefined,
  checkpoint: Record<string, unknown> | undefined,
  inheritedProfileId: string | undefined
): ModelRouteRequest {
  const checkpointProfileId =
    typeof checkpoint?.modelProfileId === 'string'
      ? checkpoint.modelProfileId
      : undefined
  if (checkpointProfileId) {
    return { strategy: 'fixed', profileId: checkpointProfileId }
  }
  if (strategy?.strategy === 'fixed') return strategy
  if (strategy?.strategy === 'capability') return strategy
  if (inheritedProfileId) {
    return { strategy: 'fixed', profileId: inheritedProfileId }
  }
  return {
    strategy: 'capability',
    requiredCapabilities: ['text'],
    minimumContextWindow: 1
  }
}
