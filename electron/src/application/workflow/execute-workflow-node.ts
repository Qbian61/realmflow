import type {
  AiGenerateExecutorConfig,
  RequirementWorkflow
} from '../../../../domain/workflow'
import type { RunRepository } from '../../ai-run/application/ports'
import type {
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository
} from '../ports/business-repositories'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'
import type { NodeCompletionGateEvaluator } from './node-completion-gate-evaluator'

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
  nodeRuns: Pick<NodeRunRepository, 'get'>
  gateEvaluator: Pick<NodeCompletionGateEvaluator, 'evaluate'>
  advance: { drain: () => Promise<unknown> }
  manager: Pick<
    ManageNodeExecutionUseCase,
    'reserveNode' | 'bindAiRun' | 'completeNode' | 'waitForUser' | 'finishNode'
  >
}

export class ExecuteWorkflowNodeUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: {
    requirementId: string
    nodeId: string
    nodeRunId: string
    modelProfileId?: string
  }): Promise<{ runId: string; completion: Promise<void> }> {
    const workflow = await this.dependencies.workflows.get(input.requirementId)
    const node = workflow?.nodes.find(
      (candidate) => candidate.id === input.nodeId
    )
    if (!node) throw new Error(`Workflow node not found: ${input.nodeId}`)
    if (node.type !== 'ai_generate' || !node.executor) {
      throw new Error(`Workflow node is not AI executable: ${input.nodeId}`)
    }
    const nodeRun = await this.dependencies.nodeRuns.get(input.nodeRunId)
    if (!nodeRun || nodeRun.nodeId !== node.id) {
      throw new Error(
        `Node run does not match workflow node: ${input.nodeRunId}`
      )
    }

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
        executor: node.executor,
        ...(input.modelProfileId
          ? { modelProfileId: input.modelProfileId }
          : {})
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
      if (generated) {
        await Promise.allSettled([
          this.dependencies.cancel.execute(generated.runId),
          this.dependencies.manager.finishNode({
            requirementId: input.requirementId,
            nodeRunId: input.nodeRunId,
            status: 'failed',
            error: message
          })
        ])
      } else {
        await this.dependencies.manager.finishNode({
          requirementId: input.requirementId,
          nodeRunId: input.nodeRunId,
          status: 'failed',
          error: message
        })
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
      run = await this.dependencies.runs.get(runId)
      if (run?.status === 'completed') {
        await this.completeOrWait(input.requirementId, input.nodeRunId)
      }
    } catch (error) {
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
    const node = workflow.nodes.find(
      (candidate) => candidate.id === nodeRun.nodeId
    )
    if (!node) throw new Error(`Workflow node not found: ${nodeRun.nodeId}`)
    const gates = await this.dependencies.gateEvaluator.evaluate({
      requirementId,
      node,
      nodeRun,
      executionFinished: true
    })
    try {
      await this.dependencies.manager.completeNode({
        requirementId,
        nodeRunId,
        expectedNodeRunRevision: nodeRun.revision,
        expectedWorkflowRevision: workflow.revision,
        expectedRequirementRevision: requirement.revision,
        ...gates
      })
      await this.dependencies.advance.drain()
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Node completion gates are not satisfied'
      ) {
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
