import {
  getReadyNodeIds,
  insertRequirementNode,
  removeRequirementNode,
  reorderRequirementNodes,
  updateRequirementEdge,
  type InsertRequirementNodeInput,
  type RequirementWorkflow,
  type WorkflowEdge
} from '../../../../domain/workflow'
import type { RequirementWorkflowRepository } from '../ports/business-repositories'

export type NodeCompletionGates = {
  executionFinished: boolean
  requiredArtifactsValid: boolean
  requiredTodosComplete: boolean
  openRequiredQuestions: number
  approvalPassed: boolean
  customGatePassed: boolean
}

export class WorkflowRuntime {
  constructor(private readonly workflows: RequirementWorkflowRepository) {}

  async startNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(
      input,
      ['ready', 'interrupted', 'failed', 'cancelled'],
      'running'
    )
  }

  async pauseNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(input, ['running', 'ready'], 'paused')
  }

  async resumeNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(input, ['paused'], 'ready')
  }

  async waitForUser(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(input, ['running'], 'waiting_user')
  }

  async finishNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
    status: 'failed' | 'cancelled'
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(
      input,
      ['ready', 'running', 'waiting_user', 'interrupted'],
      input.status
    )
  }

  async insertNode(input: {
    requirementId: string
    expectedRevision: number
    mutation: InsertRequirementNodeInput
  }): Promise<RequirementWorkflow> {
    return this.mutate(input.requirementId, input.expectedRevision, (workflow) =>
      insertRequirementNode(workflow, input.mutation)
    )
  }

  async removeNode(input: {
    requirementId: string
    expectedRevision: number
    nodeId: string
  }): Promise<RequirementWorkflow> {
    return this.mutate(input.requirementId, input.expectedRevision, (workflow) =>
      removeRequirementNode(workflow, input.nodeId)
    )
  }

  async updateEdge(input: {
    requirementId: string
    expectedRevision: number
    edgeId: string
    edge: WorkflowEdge
  }): Promise<RequirementWorkflow> {
    return this.mutate(input.requirementId, input.expectedRevision, (workflow) =>
      updateRequirementEdge(workflow, input.edgeId, input.edge)
    )
  }

  async reorder(input: {
    requirementId: string
    expectedRevision: number
    orderedNodeIds: string[]
  }): Promise<RequirementWorkflow> {
    return this.mutate(input.requirementId, input.expectedRevision, (workflow) =>
      reorderRequirementNodes(workflow, input.orderedNodeIds)
    )
  }

  async completeNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
    gates: NodeCompletionGates
  }): Promise<RequirementWorkflow> {
    if (
      !input.gates.executionFinished ||
      !input.gates.requiredArtifactsValid ||
      !input.gates.requiredTodosComplete ||
      input.gates.openRequiredQuestions > 0 ||
      !input.gates.approvalPassed ||
      !input.gates.customGatePassed
    ) {
      throw new Error('Node completion gates are not satisfied')
    }

    return this.mutate(input.requirementId, input.expectedRevision, (workflow) => {
      const current = workflow.nodes.find((node) => node.id === input.nodeId)
      if (!current) throw new Error(`Workflow node not found: ${input.nodeId}`)
      if (
        current.status !== 'running' &&
        current.status !== 'waiting_user' &&
        current.status !== 'ready'
      ) {
        throw new Error(`Workflow node cannot be completed from ${current.status}`)
      }

      const completed: RequirementWorkflow = {
        ...workflow,
        revision: workflow.revision + 1,
        nodes: workflow.nodes.map((node) =>
          node.id === input.nodeId ? { ...node, status: 'completed' } : node
        )
      }
      const nextNodeId = getReadyNodeIds(completed)[0]
      return {
        ...completed,
        nodes: completed.nodes.map((node) => {
          if (node.id === nextNodeId) return { ...node, status: 'ready' }
          if (node.status === 'ready') return { ...node, status: 'pending' }
          return node
        })
      }
    })
  }

  private async mutate(
    requirementId: string,
    expectedRevision: number,
    mutation: (workflow: RequirementWorkflow) => RequirementWorkflow
  ): Promise<RequirementWorkflow> {
    const current = await this.workflows.get(requirementId)
    if (!current) throw new Error(`Requirement workflow not found: ${requirementId}`)
    if (current.revision !== expectedRevision) {
      throw new Error('Requirement workflow revision conflict')
    }
    const updated = mutation(current)
    const result = await this.workflows.save(
      { ...updated, revision: expectedRevision },
      expectedRevision
    )
    if (result.status === 'conflict') {
      throw new Error('Requirement workflow revision conflict')
    }
    return result.entity
  }

  private async changeNodeStatus(
    input: {
      requirementId: string
      nodeId: string
      expectedRevision: number
    },
    allowedStatuses: RequirementWorkflow['nodes'][number]['status'][],
    status: RequirementWorkflow['nodes'][number]['status']
  ): Promise<RequirementWorkflow> {
    return this.mutate(input.requirementId, input.expectedRevision, (workflow) => {
      const node = workflow.nodes.find((item) => item.id === input.nodeId)
      if (!node) throw new Error(`Workflow node not found: ${input.nodeId}`)
      if (!allowedStatuses.includes(node.status)) {
        throw new Error(`Workflow node cannot transition from ${node.status}`)
      }
      return {
        ...workflow,
        revision: workflow.revision + 1,
        nodes: workflow.nodes.map((item) =>
          item.id === input.nodeId ? { ...item, status } : item
        )
      }
    })
  }
}
