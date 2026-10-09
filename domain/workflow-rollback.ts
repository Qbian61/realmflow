import type { RequirementWorkflow } from './workflow'

const ACTIVE_NODE_STATUSES = new Set([
  'ready',
  'running',
  'waiting_user',
  'paused',
  'blocked',
  'interrupted'
])

export type WorkflowRollbackInput = {
  workflow: RequirementWorkflow
  targetNodeId: string
  unresolvedTargetNodeIds?: readonly string[]
}

export type WorkflowRollbackAttempt = {
  nodeId: string
  status: 'ready' | 'pending'
}

export type WorkflowRollbackPlan = {
  targetNodeId: string
  affectedNodeIds: string[]
  retainedNodeIds: string[]
  retainedNodes: RequirementWorkflow['nodes']
  readyNodeIds: string[]
  pendingNodeIds: string[]
  attempts: WorkflowRollbackAttempt[]
}

export function planWorkflowRollback(
  input: WorkflowRollbackInput
): WorkflowRollbackPlan {
  const { workflow, targetNodeId } = input
  const target = workflow.nodes.find((node) => node.id === targetNodeId)
  if (!target) {
    throw new Error(`Workflow rollback target not found: ${targetNodeId}`)
  }
  if (target.status === 'pending' || target.status === 'ready') {
    throw new Error('Workflow rollback would produce no state change')
  }
  if (input.unresolvedTargetNodeIds?.includes(targetNodeId)) {
    throw new Error(
      'Workflow rollback target already has an unresolved operation'
    )
  }

  const successors = new Map<string, string[]>()
  for (const edge of workflow.edges) {
    successors.set(edge.sourceNodeId, [
      ...(successors.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId
    ])
  }

  const affected = new Set<string>()
  const remaining = [targetNodeId]
  while (remaining.length > 0) {
    const nodeId = remaining.pop() as string
    if (affected.has(nodeId)) continue
    affected.add(nodeId)
    remaining.push(...(successors.get(nodeId) ?? []))
  }

  const orderedNodes = [...workflow.nodes].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id)
  )
  const affectedNodes = orderedNodes.filter((node) => affected.has(node.id))
  const retainedNodes = orderedNodes.filter((node) => !affected.has(node.id))
  const occupiedSlots = retainedNodes.filter((node) =>
    ACTIVE_NODE_STATUSES.has(node.status)
  ).length
  const targetStatus =
    occupiedSlots < workflow.maxParallelism ? 'ready' : 'pending'
  const attempts: WorkflowRollbackAttempt[] = affectedNodes.map((node) => ({
    nodeId: node.id,
    status: node.id === targetNodeId ? targetStatus : 'pending'
  }))

  return {
    targetNodeId,
    affectedNodeIds: affectedNodes.map((node) => node.id),
    retainedNodeIds: retainedNodes.map((node) => node.id),
    retainedNodes,
    readyNodeIds: attempts
      .filter((attempt) => attempt.status === 'ready')
      .map((attempt) => attempt.nodeId),
    pendingNodeIds: attempts
      .filter((attempt) => attempt.status === 'pending')
      .map((attempt) => attempt.nodeId),
    attempts
  }
}
