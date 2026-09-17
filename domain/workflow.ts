import type { RequirementStageId } from './requirement'

export type WorkflowNodeType =
  'ai_generate' | 'human_input' | 'tool' | 'approval'

export type NodeRunStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'waiting_user'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'interrupted'

export type AiGenerateExecutorConfig = {
  kind: 'ai_generate'
  prompt: string
  artifact: {
    relativePath: string
    kind: string
  }
  context?: {
    attachments?: string[]
  }
  legacyStageId?: RequirementStageId
}

export type RequirementNode = {
  id: string
  type: WorkflowNodeType
  name: string
  description: string
  order: number
  status: NodeRunStatus
  allowSkip: boolean
  executor?: AiGenerateExecutorConfig
  completionGate?: {
    requireApproval?: boolean
    customGateId?: string
  }
}

export type WorkflowEdge = {
  id: string
  sourceNodeId: string
  targetNodeId: string
}

export type RequirementWorkflow = {
  requirementId: string
  templateVersionId: string
  revision: number
  nodes: RequirementNode[]
  edges: WorkflowEdge[]
}

export type WorkflowValidationResult = {
  valid: boolean
  errors: string[]
}

export type InsertRequirementNodeInput = {
  node: RequirementNode
  afterNodeId?: string
  beforeNodeId?: string
}

export type WorkflowTemplateSnapshot = {
  id: string
  nodes: Array<
    Omit<RequirementNode, 'id' | 'status'> & {
      id: string
      stableKey: string
    }
  >
  edges: WorkflowEdge[]
}

const IMMUTABLE_TOPOLOGY_STATUSES = new Set<NodeRunStatus>([
  'running',
  'completed',
  'skipped'
])

function edgeId(sourceNodeId: string, targetNodeId: string): string {
  return `${sourceNodeId}--${targetNodeId}`
}

function normalizedNodes(nodes: RequirementNode[]): RequirementNode[] {
  return [...nodes]
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id)
    )
    .map((item, order) => ({ ...item, order }))
}

function assertTopologyMutable(
  workflow: RequirementWorkflow,
  nodeIds: Array<string | undefined>
): void {
  for (const nodeId of nodeIds) {
    if (!nodeId) continue
    const target = workflow.nodes.find((item) => item.id === nodeId)
    if (!target) throw new Error(`Workflow node not found: ${nodeId}`)
    if (IMMUTABLE_TOPOLOGY_STATUSES.has(target.status)) {
      throw new Error('Completed workflow nodes are immutable')
    }
  }
}

function assertValidWorkflow(workflow: RequirementWorkflow): void {
  const result = validateWorkflow(workflow)
  if (!result.valid) throw new Error(result.errors[0])
}

export function validateWorkflow(
  workflow: Pick<RequirementWorkflow, 'nodes' | 'edges'>
): WorkflowValidationResult {
  const errors: string[] = []
  const nodeIds = new Set(workflow.nodes.map((node) => node.id))

  if (nodeIds.size !== workflow.nodes.length) {
    errors.push('Workflow node IDs must be unique')
  }

  const validEdges = workflow.edges.filter((edge) => {
    const valid =
      edge.sourceNodeId !== edge.targetNodeId &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId)
    if (!valid)
      errors.push(`Workflow edge references an invalid node: ${edge.id}`)
    return valid
  })

  const outgoing = new Map<string, string[]>()
  const incomingCount = new Map<string, number>(
    workflow.nodes.map((node): [string, number] => [node.id, 0])
  )
  for (const edge of validEdges) {
    outgoing.set(edge.sourceNodeId, [
      ...(outgoing.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId
    ])
    incomingCount.set(
      edge.targetNodeId,
      (incomingCount.get(edge.targetNodeId) ?? 0) + 1
    )
  }

  const queue = [...incomingCount.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
  const reachable = new Set<string>()
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]
    reachable.add(id)
    for (const targetId of outgoing.get(id) ?? []) {
      const nextCount = (incomingCount.get(targetId) ?? 0) - 1
      incomingCount.set(targetId, nextCount)
      if (nextCount === 0) queue.push(targetId)
    }
  }

  if (reachable.size !== workflow.nodes.length) {
    errors.push('Workflow must be acyclic')
  }

  if (
    workflow.nodes.length > 0 &&
    workflow.nodes.every((node) => (outgoing.get(node.id) ?? []).length > 0)
  ) {
    errors.push('Workflow must contain a terminal node')
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export function instantiateRequirementWorkflow(
  template: WorkflowTemplateSnapshot,
  requirementId: string
): RequirementWorkflow {
  const instanceNodeId = new Map(
    template.nodes.map((node) => [
      node.id,
      `${requirementId}:${node.stableKey}`
    ])
  )
  const workflow: RequirementWorkflow = {
    requirementId,
    templateVersionId: template.id,
    revision: 0,
    nodes: template.nodes.map(({ stableKey: _stableKey, ...node }) => ({
      ...node,
      id: instanceNodeId.get(node.id) as string,
      status: 'pending'
    })),
    edges: template.edges.map((edge) => ({
      id: `${requirementId}:${edge.id}`,
      sourceNodeId: instanceNodeId.get(edge.sourceNodeId) as string,
      targetNodeId: instanceNodeId.get(edge.targetNodeId) as string
    }))
  }
  assertValidWorkflow(workflow)
  const firstReadyNodeId = getReadyNodeIds(workflow)[0]
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      node.id === firstReadyNodeId ? { ...node, status: 'ready' } : node
    )
  }
}

export function insertRequirementNode(
  workflow: RequirementWorkflow,
  input: InsertRequirementNodeInput
): RequirementWorkflow {
  if (workflow.nodes.some((node) => node.id === input.node.id)) {
    throw new Error(`Workflow node already exists: ${input.node.id}`)
  }
  assertTopologyMutable(workflow, [input.afterNodeId, input.beforeNodeId])

  let edges = [...workflow.edges]
  if (input.afterNodeId && input.beforeNodeId) {
    edges = edges.filter(
      (edge) =>
        !(
          edge.sourceNodeId === input.afterNodeId &&
          edge.targetNodeId === input.beforeNodeId
        )
    )
  }
  if (input.afterNodeId) {
    edges.push({
      id: edgeId(input.afterNodeId, input.node.id),
      sourceNodeId: input.afterNodeId,
      targetNodeId: input.node.id
    })
  }
  if (input.beforeNodeId) {
    edges.push({
      id: edgeId(input.node.id, input.beforeNodeId),
      sourceNodeId: input.node.id,
      targetNodeId: input.beforeNodeId
    })
  }

  const insertionOrder = input.beforeNodeId
    ? (workflow.nodes.find((item) => item.id === input.beforeNodeId)?.order ??
      workflow.nodes.length)
    : input.afterNodeId
      ? (workflow.nodes.find((item) => item.id === input.afterNodeId)?.order ??
          -1) + 1
      : workflow.nodes.length
  const nodes = normalizedNodes([
    ...workflow.nodes.map((item) =>
      item.order >= insertionOrder ? { ...item, order: item.order + 1 } : item
    ),
    { ...input.node, order: insertionOrder }
  ])
  const updated = {
    ...workflow,
    revision: workflow.revision + 1,
    nodes,
    edges
  }
  assertValidWorkflow(updated)
  return updated
}

export function removeRequirementNode(
  workflow: RequirementWorkflow,
  nodeId: string
): RequirementWorkflow {
  assertTopologyMutable(workflow, [nodeId])
  const predecessors = workflow.edges
    .filter((edge) => edge.targetNodeId === nodeId)
    .map((edge) => edge.sourceNodeId)
  const successors = workflow.edges
    .filter((edge) => edge.sourceNodeId === nodeId)
    .map((edge) => edge.targetNodeId)
  assertTopologyMutable(workflow, [...predecessors, ...successors])

  const retainedEdges = workflow.edges.filter(
    (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
  )
  const existingPairs = new Set(
    retainedEdges.map((edge) => edgeId(edge.sourceNodeId, edge.targetNodeId))
  )
  const reconnectingEdges: WorkflowEdge[] = []
  for (const sourceNodeId of predecessors) {
    for (const targetNodeId of successors) {
      const id = edgeId(sourceNodeId, targetNodeId)
      if (!existingPairs.has(id)) {
        reconnectingEdges.push({ id, sourceNodeId, targetNodeId })
        existingPairs.add(id)
      }
    }
  }

  const updated = {
    ...workflow,
    revision: workflow.revision + 1,
    nodes: normalizedNodes(workflow.nodes.filter((node) => node.id !== nodeId)),
    edges: [...retainedEdges, ...reconnectingEdges]
  }
  assertValidWorkflow(updated)
  return updated
}

export function updateRequirementEdge(
  workflow: RequirementWorkflow,
  edgeIdToReplace: string,
  edge: WorkflowEdge
): RequirementWorkflow {
  const current = workflow.edges.find((item) => item.id === edgeIdToReplace)
  if (!current) throw new Error(`Workflow edge not found: ${edgeIdToReplace}`)
  assertTopologyMutable(workflow, [
    current.sourceNodeId,
    current.targetNodeId,
    edge.sourceNodeId,
    edge.targetNodeId
  ])
  const updated = {
    ...workflow,
    revision: workflow.revision + 1,
    edges: workflow.edges.map((item) =>
      item.id === edgeIdToReplace ? { ...edge, id: edgeIdToReplace } : item
    )
  }
  assertValidWorkflow(updated)
  return updated
}

export function reorderRequirementNodes(
  workflow: RequirementWorkflow,
  orderedNodeIds: string[]
): RequirementWorkflow {
  if (
    orderedNodeIds.length !== workflow.nodes.length ||
    new Set(orderedNodeIds).size !== workflow.nodes.length ||
    orderedNodeIds.some(
      (id) => !workflow.nodes.some((workflowNode) => workflowNode.id === id)
    )
  ) {
    throw new Error('Workflow order must include every node exactly once')
  }
  const oldOrder = new Map(workflow.nodes.map((node) => [node.id, node.order]))
  const newOrder = new Map(orderedNodeIds.map((id, order) => [id, order]))
  for (const node of workflow.nodes) {
    if (
      IMMUTABLE_TOPOLOGY_STATUSES.has(node.status) &&
      oldOrder.get(node.id) !== newOrder.get(node.id)
    ) {
      throw new Error('Completed workflow nodes are immutable')
    }
  }
  return {
    ...workflow,
    revision: workflow.revision + 1,
    nodes: orderedNodeIds.map((id, order) => ({
      ...(workflow.nodes.find((node) => node.id === id) as RequirementNode),
      order
    }))
  }
}

export function getReadyNodeIds(workflow: RequirementWorkflow): string[] {
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]))
  const predecessors = new Map<string, string[]>()
  for (const edge of workflow.edges) {
    predecessors.set(edge.targetNodeId, [
      ...(predecessors.get(edge.targetNodeId) ?? []),
      edge.sourceNodeId
    ])
  }

  return [...workflow.nodes]
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id)
    )
    .filter((node) => {
      if (node.status !== 'pending' && node.status !== 'ready') return false
      return (predecessors.get(node.id) ?? []).every((predecessorId) => {
        const status = nodesById.get(predecessorId)?.status
        return status === 'completed' || status === 'skipped'
      })
    })
    .map((node) => node.id)
}
