import type {
  NodeRunRepository,
  RequirementWorkflowRepository
} from '../ports/business-repositories'
import type { CancelAiRunUseCase } from '../../ai-run/application/generate-stage-artifact'
import type { ExecuteWorkflowNodeUseCase } from './execute-workflow-node'
import type { ManageNodeExecutionUseCase } from './manage-node-execution'

type NodeCommand = {
  requirementId: string
  nodeRunId: string
  expectedWorkflowRevision: number
  expectedNodeRunRevision: number
}

type Dependencies = {
  manager: Pick<ManageNodeExecutionUseCase, 'pauseNode' | 'resumeNode'>
  nodeRuns: Pick<NodeRunRepository, 'get'>
  workflows: Pick<RequirementWorkflowRepository, 'get'>
  cancel: Pick<CancelAiRunUseCase, 'execute'>
  executeNode: Pick<ExecuteWorkflowNodeUseCase, 'execute'>
}

export class ControlWorkflowNodeUseCase {
  constructor(private readonly dependencies: Dependencies) {}

  async pause(command: NodeCommand) {
    const nodeRun = await this.getNodeRun(command.nodeRunId)
    await this.dependencies.manager.pauseNode(command)
    if (nodeRun.aiRunId) {
      await this.dependencies.cancel.execute(nodeRun.aiRunId)
    }
    return this.getWorkflow(command.requirementId)
  }

  async resume(command: NodeCommand & { modelProfileId?: string }) {
    const nodeRun = await this.getNodeRun(command.nodeRunId)
    const { modelProfileId, ...executionCommand } = command
    await this.dependencies.manager.resumeNode(executionCommand)
    await this.dependencies.executeNode.execute({
      requirementId: command.requirementId,
      nodeId: nodeRun.nodeId,
      nodeRunId: command.nodeRunId,
      ...(modelProfileId ? { modelProfileId } : {})
    })
    return this.getWorkflow(command.requirementId)
  }

  private async getNodeRun(nodeRunId: string) {
    const nodeRun = await this.dependencies.nodeRuns.get(nodeRunId)
    if (!nodeRun) throw new Error(`Node run not found: ${nodeRunId}`)
    return nodeRun
  }

  private async getWorkflow(requirementId: string) {
    const workflow = await this.dependencies.workflows.get(requirementId)
    if (!workflow) throw new Error('Requirement workflow not found')
    return workflow
  }
}
