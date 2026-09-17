import type { RequirementStageId } from '../../../../domain/requirement'
import type { RunRepository } from '../../ai-run/application/ports'
import type { GenerateStageArtifactUseCase } from '../../ai-run/application/generate-stage-artifact'
import type {
  NodeRunRepository,
  RequirementRepository,
  RequirementWorkflowRepository
} from '../ports/business-repositories'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'

type Dependencies = {
  generate: Pick<GenerateStageArtifactUseCase, 'execute'>
  runs: Pick<RunRepository, 'get'>
  requirements: Pick<RequirementRepository, 'get'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  nodeRuns: Pick<NodeRunRepository, 'get'>
  manager: Pick<
    ManageNodeExecutionUseCase,
    'startNode' | 'completeNode' | 'waitForUser' | 'finishNode'
  >
}

export class ExecuteWorkflowStageUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: {
    requirementId: string
    stageId: RequirementStageId
    nodeRunId?: string
    modelProfileId?: string
  }): Promise<{ runId: string; completion: Promise<void> }> {
    const generated = await this.dependencies.generate.execute({
      requirementId: input.requirementId,
      stageId: input.stageId,
      ...(input.modelProfileId
        ? { modelProfileId: input.modelProfileId }
        : {})
    })
    if (!input.nodeRunId) return generated

    await this.dependencies.manager.startNode({
      requirementId: input.requirementId,
      nodeRunId: input.nodeRunId,
      aiRunId: generated.runId
    })
    return {
      runId: generated.runId,
      completion: this.settleNode(input, generated.runId, generated.completion)
    }
  }

  private async settleNode(
    input: {
      requirementId: string
      nodeRunId?: string
    },
    runId: string,
    completion: Promise<void>
  ): Promise<void> {
    if (!input.nodeRunId) return
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
    try {
      await this.dependencies.manager.completeNode({
        requirementId,
        nodeRunId,
        expectedNodeRunRevision: nodeRun.revision,
        expectedWorkflowRevision: workflow.revision,
        expectedRequirementRevision: requirement.revision,
        executionFinished: true,
        requiredArtifactsValid: true,
        approvalPassed: true,
        customGatePassed: true
      })
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
