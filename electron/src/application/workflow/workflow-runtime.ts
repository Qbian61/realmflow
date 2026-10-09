import {
  getStableReadyNodeIds,
  insertRequirementNode,
  removeRequirementNode,
  reorderRequirementNodes,
  updateRequirementEdge,
  type InsertRequirementNodeInput,
  type RequirementWorkflow,
  type WorkflowEdge,
  type WorkflowRevisionMetadata
} from '../../../../domain/workflow'
import { assertNodeRunTransition } from '../../../../domain/node-run'
import type { RequirementWorkflowRepository } from '../ports/business-repositories'
import type { StartedNodeProtection } from './started-node-protection'

export type NodeCompletionGates = {
  executionFinished: boolean
  requiredArtifactsValid: boolean
  requiredTodosComplete: boolean
  openRequiredQuestions: number
  approvalPassed: boolean
  customGatePassed: boolean
}

export class WorkflowRuntime {
  constructor(
    private readonly workflows: RequirementWorkflowRepository,
    private readonly nodeProtection: Pick<
      StartedNodeProtection,
      'assertUnstarted'
    > = {
      assertUnstarted: async () => {
        throw new Error('Started node protection is unavailable')
      }
    }
  ) {}

  async startNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(input, 'running')
  }

  async pauseNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(input, 'paused')
  }

  async resumeNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(input, 'ready')
  }

  async waitForUser(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(input, 'waiting_user')
  }

  async interruptNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.changeNodeStatus(input, 'interrupted', {
      reason: 'startup_interrupted',
      triggerSource: 'recovery'
    })
  }

  async finishNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
    status: 'failed' | 'cancelled'
  }): Promise<RequirementWorkflow> {
    return this.mutate(
      input.requirementId,
      input.expectedRevision,
      { reason: 'node_status_changed', triggerSource: 'system' },
      (workflow) => {
        const current = workflow.nodes.find((node) => node.id === input.nodeId)
        if (!current) throw new Error(`Workflow node not found: ${input.nodeId}`)
        assertNodeRunTransition(current.status, input.status)
        const finished: RequirementWorkflow = {
          ...workflow,
          revision: workflow.revision + 1,
          nodes: workflow.nodes.map((node) =>
            node.id === input.nodeId ? { ...node, status: input.status } : node
          )
        }
        const readyNodeIds = new Set(getStableReadyNodeIds(finished))
        return {
          ...finished,
          nodes: finished.nodes.map((node) =>
            node.status === 'pending' && readyNodeIds.has(node.id)
              ? { ...node, status: 'ready' }
              : node
          )
        }
      }
    )
  }

  async insertNode(input: {
    requirementId: string
    expectedRevision: number
    mutation: InsertRequirementNodeInput
  }): Promise<RequirementWorkflow> {
    return this.mutate(
      input.requirementId,
      input.expectedRevision,
      { reason: 'node_inserted', triggerSource: 'user' },
      (workflow) => insertRequirementNode(workflow, input.mutation),
      () =>
        [input.mutation.afterNodeId, input.mutation.beforeNodeId].filter(
          (nodeId): nodeId is string => Boolean(nodeId)
        )
    )
  }

  async removeNode(input: {
    requirementId: string
    expectedRevision: number
    nodeId: string
  }): Promise<RequirementWorkflow> {
    return this.mutate(
      input.requirementId,
      input.expectedRevision,
      { reason: 'node_removed', triggerSource: 'user' },
      (workflow) => removeRequirementNode(workflow, input.nodeId),
      () => [input.nodeId]
    )
  }

  async updateEdge(input: {
    requirementId: string
    expectedRevision: number
    edgeId: string
    edge: WorkflowEdge
  }): Promise<RequirementWorkflow> {
    return this.mutate(
      input.requirementId,
      input.expectedRevision,
      { reason: 'edge_updated', triggerSource: 'user' },
      (workflow) => updateRequirementEdge(workflow, input.edgeId, input.edge),
      (workflow) => {
        const current = workflow.edges.find((edge) => edge.id === input.edgeId)
        return [
          ...new Set(
            [
              current?.sourceNodeId,
              current?.targetNodeId,
              input.edge.sourceNodeId,
              input.edge.targetNodeId
            ].filter((nodeId): nodeId is string => Boolean(nodeId))
          )
        ]
      }
    )
  }

  async reorder(input: {
    requirementId: string
    expectedRevision: number
    orderedNodeIds: string[]
  }): Promise<RequirementWorkflow> {
    return this.mutate(
      input.requirementId,
      input.expectedRevision,
      { reason: 'nodes_reordered', triggerSource: 'user' },
      (workflow) => reorderRequirementNodes(workflow, input.orderedNodeIds),
      (workflow) => {
        const nextOrder = new Map(
          input.orderedNodeIds.map((nodeId, order) => [nodeId, order])
        )
        return workflow.nodes
          .filter((node) => nextOrder.get(node.id) !== node.order)
          .map((node) => node.id)
      }
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

    return this.mutate(
      input.requirementId,
      input.expectedRevision,
      { reason: 'node_status_changed', triggerSource: 'system' },
      (workflow) => {
        const current = workflow.nodes.find((node) => node.id === input.nodeId)
        if (!current) throw new Error(`Workflow node not found: ${input.nodeId}`)
        assertNodeRunTransition(current.status, 'completed')

        const completed: RequirementWorkflow = {
          ...workflow,
          revision: workflow.revision + 1,
          nodes: workflow.nodes.map((node) =>
            node.id === input.nodeId ? { ...node, status: 'completed' } : node
          )
        }
        const readyNodeIds = new Set(getStableReadyNodeIds(completed))
        return {
          ...completed,
          nodes: completed.nodes.map((node) => {
            if (node.status === 'pending' && readyNodeIds.has(node.id)) {
              assertNodeRunTransition(node.status, 'ready')
              return { ...node, status: 'ready' }
            }
            return node
          })
        }
      }
    )
  }

  async skipNode(input: {
    requirementId: string
    nodeId: string
    expectedRevision: number
  }): Promise<RequirementWorkflow> {
    return this.mutate(
      input.requirementId,
      input.expectedRevision,
      { reason: 'node_skipped', triggerSource: 'user' },
      (workflow) => {
        const current = workflow.nodes.find((node) => node.id === input.nodeId)
        if (!current) throw new Error(`Workflow node not found: ${input.nodeId}`)
        if (!current.allowSkip || current.configuration?.skip.allowed === false) {
          throw new Error(`Workflow node cannot be skipped: ${input.nodeId}`)
        }
        assertNodeRunTransition(current.status, 'skipped')
        const skipped: RequirementWorkflow = {
          ...workflow,
          revision: workflow.revision + 1,
          nodes: workflow.nodes.map((node) =>
            node.id === input.nodeId ? { ...node, status: 'skipped' } : node
          )
        }
        const readyNodeIds = new Set(getStableReadyNodeIds(skipped))
        return {
          ...skipped,
          nodes: skipped.nodes.map((node) => {
            if (node.status === 'pending' && readyNodeIds.has(node.id)) {
              assertNodeRunTransition(node.status, 'ready')
              return { ...node, status: 'ready' }
            }
            return node
          })
        }
      }
    )
  }

  private async mutate(
    requirementId: string,
    expectedRevision: number,
    metadata: WorkflowRevisionMetadata,
    mutation: (workflow: RequirementWorkflow) => RequirementWorkflow,
    protectedNodeIds?: (
      current: RequirementWorkflow,
      updated: RequirementWorkflow
    ) => string[]
  ): Promise<RequirementWorkflow> {
    const current = await this.workflows.get(requirementId)
    if (!current) throw new Error(`Requirement workflow not found: ${requirementId}`)
    if (current.revision !== expectedRevision) {
      throw new Error('Requirement workflow revision conflict')
    }
    const updated = mutation(current)
    if (updated.revision === current.revision) return current
    if (protectedNodeIds) {
      await this.nodeProtection.assertUnstarted(
        requirementId,
        protectedNodeIds(current, updated)
      )
    }
    const result = await this.workflows.save(
      { ...updated, revision: expectedRevision },
      expectedRevision,
      metadata
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
    status: RequirementWorkflow['nodes'][number]['status'],
    metadata: WorkflowRevisionMetadata = {
      reason: 'node_status_changed',
      triggerSource: 'system'
    }
  ): Promise<RequirementWorkflow> {
    return this.mutate(
      input.requirementId,
      input.expectedRevision,
      metadata,
      (workflow) => {
        const node = workflow.nodes.find((item) => item.id === input.nodeId)
        if (!node) throw new Error(`Workflow node not found: ${input.nodeId}`)
        assertNodeRunTransition(node.status, status)
        return {
          ...workflow,
          revision: workflow.revision + 1,
          nodes: workflow.nodes.map((item) =>
            item.id === input.nodeId ? { ...item, status } : item
          )
        }
      }
    )
  }
}
