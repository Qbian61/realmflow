import {
  insertRequirementNode,
  removeRequirementNode,
  type InsertRequirementNodeInput,
  type RequirementWorkflow
} from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  NodeRunRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkflowExecutionRepository
} from '../ports/business-repositories'

type Dependencies = {
  workflows: RequirementWorkflowRepository
  executions: WorkflowExecutionRepository
  nodeRuns: NodeRunRepository
  unitOfWork: UnitOfWork
}

export class ManageRequirementWorkflowUseCase {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => number = Date.now,
    private readonly createNodeRunId: () => string = () =>
      globalThis.crypto.randomUUID()
  ) {}

  async insertNode(input: {
    requirementId: string
    expectedRevision: number
    mutation: InsertRequirementNodeInput
  }): Promise<{
    workflow: RequirementWorkflow
    nodeRun: Revisioned<NodeRunRecord>
  }> {
    return this.dependencies.unitOfWork.execute(async () => {
      const [workflow, execution] = await Promise.all([
        this.requireWorkflow(input.requirementId),
        this.requireExecution(input.requirementId)
      ])
      const nextWorkflow = insertRequirementNode(workflow, input.mutation)
      const workflowResult = await this.dependencies.workflows.save(
        nextWorkflow,
        input.expectedRevision
      )
      if (workflowResult.status === 'conflict') {
        throw new Error('Requirement workflow revision conflict')
      }

      const timestamp = this.now()
      const nodeRunResult = await this.dependencies.nodeRuns.save(
        {
          id: this.createNodeRunId(),
          executionId: execution.id,
          nodeId: input.mutation.node.id,
          status: input.mutation.node.status,
          attempt: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        0
      )
      if (nodeRunResult.status === 'conflict') {
        throw new Error('Requirement node run already exists')
      }
      return {
        workflow: workflowResult.entity,
        nodeRun: nodeRunResult.entity
      }
    })
  }

  async removeNode(input: {
    requirementId: string
    expectedRevision: number
    nodeId: string
  }): Promise<RequirementWorkflow> {
    return this.dependencies.unitOfWork.execute(async () => {
      const [workflow, execution] = await Promise.all([
        this.requireWorkflow(input.requirementId),
        this.requireExecution(input.requirementId)
      ])
      const nextWorkflow = removeRequirementNode(workflow, input.nodeId)
      await this.dependencies.nodeRuns.deleteByNode(execution.id, input.nodeId)
      const result = await this.dependencies.workflows.save(
        nextWorkflow,
        input.expectedRevision
      )
      if (result.status === 'conflict') {
        throw new Error('Requirement workflow revision conflict')
      }
      return result.entity
    })
  }

  private async requireWorkflow(
    requirementId: string
  ): Promise<RequirementWorkflow> {
    const workflow = await this.dependencies.workflows.get(requirementId)
    if (!workflow) {
      throw new Error(`Requirement workflow not found: ${requirementId}`)
    }
    return workflow
  }

  private async requireExecution(requirementId: string) {
    const execution =
      await this.dependencies.executions.getActiveByRequirement(requirementId)
    if (!execution) {
      throw new Error(`Active workflow execution not found: ${requirementId}`)
    }
    return execution
  }
}
