import {
  insertRequirementNode,
  removeRequirementNode,
  updateRequirementNode,
  type InsertRequirementNodeInput,
  type RequirementWorkflow,
  type UpdateRequirementNodeInput
} from '../../../../domain/workflow'
import type {
  NodeRunRecord,
  NodeRunRepository,
  NodeTodoRepository,
  RequirementWorkflowRepository,
  Revisioned,
  UnitOfWork,
  WorkflowExecutionRepository
} from '../ports/business-repositories'
import { initializeConfiguredNodeTodos } from './manage-node-todos'
import type { StartedNodeProtection } from './started-node-protection'

type Dependencies = {
  workflows: RequirementWorkflowRepository
  executions: Pick<WorkflowExecutionRepository, 'getActiveByRequirement'>
  nodeRuns: Pick<
    NodeRunRepository,
    | 'get'
    | 'getLatestByNode'
    | 'interruptRunning'
    | 'listInterrupted'
    | 'save'
    | 'deleteByNode'
  >
  todos: Pick<NodeTodoRepository, 'save'>
  nodeProtection: Pick<StartedNodeProtection, 'assertUnstarted'>
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
      await this.dependencies.nodeProtection.assertUnstarted(
        input.requirementId,
        [input.mutation.afterNodeId, input.mutation.beforeNodeId].filter(
          (nodeId): nodeId is string => Boolean(nodeId)
        )
      )
      const workflowResult = await this.dependencies.workflows.save(
        nextWorkflow,
        input.expectedRevision,
        { reason: 'node_inserted', triggerSource: 'user' }
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
      await initializeConfiguredNodeTodos(this.dependencies.todos, {
        nodeRunId: nodeRunResult.entity.id,
        configuredTodos: input.mutation.node.configuration?.todos,
        timestamp
      })
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
      await this.dependencies.nodeProtection.assertUnstarted(
        input.requirementId,
        [input.nodeId]
      )
      await this.dependencies.nodeRuns.deleteByNode(execution.id, input.nodeId)
      const result = await this.dependencies.workflows.save(
        nextWorkflow,
        input.expectedRevision,
        { reason: 'node_removed', triggerSource: 'user' }
      )
      if (result.status === 'conflict') {
        throw new Error('Requirement workflow revision conflict')
      }
      return result.entity
    })
  }

  async updateNode(input: {
    requirementId: string
    expectedRevision: number
    nodeId: string
    changes: UpdateRequirementNodeInput
  }): Promise<RequirementWorkflow> {
    return this.dependencies.unitOfWork.execute(async () => {
      const workflow = await this.requireWorkflow(input.requirementId)
      const nextWorkflow = updateRequirementNode(
        workflow,
        input.nodeId,
        input.changes
      )
      await this.dependencies.nodeProtection.assertUnstarted(
        input.requirementId,
        [input.nodeId]
      )
      const result = await this.dependencies.workflows.save(
        nextWorkflow,
        input.expectedRevision,
        { reason: 'node_updated', triggerSource: 'user' }
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
