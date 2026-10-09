import type { RequirementStageId } from './requirement'
import type { ModelCapability } from './model'
import type { ToolCapability } from './tool-definition'
import type { WorkflowExecutionStatus } from './workflow-execution'

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
  reasoning?: WorkflowReasoningPolicy
  artifact: {
    relativePath: string
    kind: string
  }
  context?: {
    attachments?: string[]
  }
  legacyStageId?: RequirementStageId
}

export type WorkflowReasoningPolicy =
  'inherit' | 'off' | 'low' | 'medium' | 'high'

export type WorkflowNodeConfiguration = {
  input: {
    includeRequirementBody: boolean
    predecessorArtifacts: 'none' | 'direct' | 'all'
    includeSpaceKnowledge: boolean
    attachments: string[]
  }
  prompt: string
  reasoning?: WorkflowReasoningPolicy
  model:
    | { strategy: 'inherit' }
    | { strategy: 'fixed'; profileId: string }
    | {
        strategy: 'capability'
        requiredCapabilities: ModelCapability[]
        minimumContextWindow: number
      }
  connectorIds: string[]
  permissions: Array<{
    capability: ToolCapability
    scope: 'requirement' | 'space'
  }>
  artifact: {
    required: boolean
    relativePath: string
    kind: string
  }
  todos: Array<{
    title: string
    required: boolean
  }>
  completionGate: {
    requireApproval: boolean
    customGateId?: string
  }
  retry: {
    maxAttempts: number
    backoffMs: number
  }
  skip: {
    allowed: boolean
    requireReason: boolean
  }
}

export type RequirementNode = {
  id: string
  type: WorkflowNodeType
  name: string
  description: string
  order: number
  status: NodeRunStatus
  allowSkip: boolean
  configuration?: WorkflowNodeConfiguration
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

export type WorkflowNodePosition = {
  x: number
  y: number
}

export type RequirementWorkflow = {
  requirementId: string
  templateVersionId: string
  revision: number
  maxParallelism: number
  nodes: RequirementNode[]
  edges: WorkflowEdge[]
}

export type WorkflowTopologyDiff = {
  addedNodeIds: string[]
  removedNodeIds: string[]
  updatedNodeIds: string[]
  reorderedNodeIds: string[]
  addedEdgeIds: string[]
  removedEdgeIds: string[]
  updatedEdgeIds: string[]
}

export type WorkflowRevisionReason =
  | 'workflow_created'
  | 'node_inserted'
  | 'node_updated'
  | 'node_removed'
  | 'edge_updated'
  | 'nodes_reordered'
  | 'node_status_changed'
  | 'node_skipped'
  | 'template_migrated'
  | 'startup_interrupted'
  | 'parallelism_changed'
  | 'workflow_rolled_back'

export type WorkflowRevisionTriggerSource = 'user' | 'system' | 'recovery'

export type WorkflowRevisionMetadata = {
  reason: WorkflowRevisionReason
  triggerSource: WorkflowRevisionTriggerSource
}

export type RequirementWorkflowRevisionRecord = WorkflowRevisionMetadata & {
  requirementId: string
  revision: number
  snapshot: RequirementWorkflow
  diff: WorkflowTopologyDiff
  createdAt: number
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

export type UpdateRequirementNodeInput = Partial<
  Pick<
    RequirementNode,
    | 'name'
    | 'description'
    | 'allowSkip'
    | 'configuration'
    | 'executor'
    | 'completionGate'
  >
>

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

const EDITABLE_NODE_STATUSES = new Set<NodeRunStatus>(['pending', 'ready'])
const ACTIVE_NODE_STATUSES = new Set<NodeRunStatus>([
  'ready',
  'running',
  'waiting_user',
  'paused',
  'blocked',
  'interrupted'
])

function compareWorkflowNodes(
  left: Pick<RequirementNode, 'id' | 'order'>,
  right: Pick<RequirementNode, 'id' | 'order'>
): number {
  return left.order - right.order || left.id.localeCompare(right.id)
}

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
    if (!EDITABLE_NODE_STATUSES.has(target.status)) {
      throw new Error('Only pending or ready workflow nodes can edit topology')
    }
  }
}

function requireWorkflowNode(
  workflow: RequirementWorkflow,
  nodeId: string
): RequirementNode {
  const node = workflow.nodes.find((item) => item.id === nodeId)
  if (!node) throw new Error(`Workflow node not found: ${nodeId}`)
  return node
}

function assertNodeEditable(node: RequirementNode, operation: string): void {
  if (!EDITABLE_NODE_STATUSES.has(node.status)) {
    throw new Error(`Only pending or ready workflow nodes can be ${operation}`)
  }
}

function cloneNodeConfiguration(
  configuration: WorkflowNodeConfiguration
): WorkflowNodeConfiguration {
  return {
    ...configuration,
    input: {
      ...configuration.input,
      attachments: [...configuration.input.attachments]
    },
    model: { ...configuration.model },
    connectorIds: [...configuration.connectorIds],
    permissions: configuration.permissions.map((permission) => ({
      ...permission
    })),
    artifact: { ...configuration.artifact },
    todos: configuration.todos.map((todo) => ({ ...todo })),
    completionGate: { ...configuration.completionGate },
    retry: { ...configuration.retry },
    skip: { ...configuration.skip }
  }
}

function cloneNodeExecutor(
  executor: AiGenerateExecutorConfig
): AiGenerateExecutorConfig {
  return {
    ...executor,
    artifact: { ...executor.artifact },
    ...(executor.context
      ? {
          context: {
            ...executor.context,
            ...(executor.context.attachments
              ? { attachments: [...executor.context.attachments] }
              : {})
          }
        }
      : {})
  }
}

function assertValidWorkflow(workflow: RequirementWorkflow): void {
  const result = validateWorkflow(workflow)
  if (!result.valid) throw new Error(result.errors[0])
}

function recalculateEditableNodeStatuses(
  workflow: RequirementWorkflow
): RequirementWorkflow {
  const recalculationInput = {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      EDITABLE_NODE_STATUSES.has(node.status)
        ? { ...node, status: 'pending' as const }
        : node
    )
  }
  const readyNodeIds = new Set(getStableReadyNodeIds(recalculationInput))
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      EDITABLE_NODE_STATUSES.has(node.status)
        ? {
            ...node,
            status: readyNodeIds.has(node.id) ? 'ready' : 'pending'
          }
        : node
    )
  }
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
    maxParallelism: 1,
    nodes: template.nodes.map(({ stableKey: _stableKey, ...node }) => {
      const configuration = node.configuration
        ? {
            ...node.configuration,
            input: {
              ...node.configuration.input,
              attachments: [...node.configuration.input.attachments]
            },
            model: { ...node.configuration.model },
            connectorIds: [...node.configuration.connectorIds],
            permissions: node.configuration.permissions.map((permission) => ({
              ...permission
            })),
            artifact: { ...node.configuration.artifact },
            todos: node.configuration.todos.map((todo) => ({ ...todo })),
            completionGate: { ...node.configuration.completionGate },
            retry: { ...node.configuration.retry },
            skip: { ...node.configuration.skip }
          }
        : undefined
      const executor = node.executor
        ? {
            ...node.executor,
            artifact: { ...node.executor.artifact },
            ...(node.executor.context
              ? {
                  context: {
                    ...node.executor.context,
                    ...(node.executor.context.attachments
                      ? {
                          attachments: [...node.executor.context.attachments]
                        }
                      : {})
                  }
                }
              : {})
          }
        : undefined
      return {
        ...node,
        ...(configuration ? { configuration } : {}),
        ...(executor ? { executor } : {}),
        ...(node.completionGate
          ? { completionGate: { ...node.completionGate } }
          : {}),
        id: instanceNodeId.get(node.id) as string,
        status: 'pending'
      }
    }),
    edges: template.edges.map((edge) => ({
      id: `${requirementId}:${edge.id}`,
      sourceNodeId: instanceNodeId.get(edge.sourceNodeId) as string,
      targetNodeId: instanceNodeId.get(edge.targetNodeId) as string
    }))
  }
  assertValidWorkflow(workflow)
  const readyNodeIds = new Set(getStableReadyNodeIds(workflow))
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      readyNodeIds.has(node.id) ? { ...node, status: 'ready' } : node
    )
  }
}

export function createWorkflowTopologyDiff(
  previous: RequirementWorkflow | undefined,
  current: RequirementWorkflow
): WorkflowTopologyDiff {
  const previousNodes = new Map(
    (previous?.nodes ?? []).map((node) => [node.id, node])
  )
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]))
  const previousEdges = new Map(
    (previous?.edges ?? []).map((edge) => [edge.id, edge])
  )
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]))

  return {
    addedNodeIds: current.nodes
      .filter((node) => !previousNodes.has(node.id))
      .map((node) => node.id),
    removedNodeIds: (previous?.nodes ?? [])
      .filter((node) => !currentNodes.has(node.id))
      .map((node) => node.id),
    updatedNodeIds: current.nodes
      .filter((node) => {
        const prior = previousNodes.get(node.id)
        return prior ? nodeContentChanged(prior, node) : false
      })
      .map((node) => node.id),
    reorderedNodeIds: current.nodes
      .filter((node) => previousNodes.get(node.id)?.order !== node.order)
      .filter((node) => previousNodes.has(node.id))
      .map((node) => node.id),
    addedEdgeIds: current.edges
      .filter((edge) => !previousEdges.has(edge.id))
      .map((edge) => edge.id),
    removedEdgeIds: (previous?.edges ?? [])
      .filter((edge) => !currentEdges.has(edge.id))
      .map((edge) => edge.id),
    updatedEdgeIds: current.edges
      .filter((edge) => {
        const prior = previousEdges.get(edge.id)
        return prior
          ? prior.sourceNodeId !== edge.sourceNodeId ||
              prior.targetNodeId !== edge.targetNodeId
          : false
      })
      .map((edge) => edge.id)
  }
}

function nodeContentChanged(
  previous: RequirementNode,
  current: RequirementNode
): boolean {
  const { order: _previousOrder, ...previousContent } = previous
  const { order: _currentOrder, ...currentContent } = current
  return JSON.stringify(previousContent) !== JSON.stringify(currentContent)
}

export function insertRequirementNode(
  workflow: RequirementWorkflow,
  input: InsertRequirementNodeInput
): RequirementWorkflow {
  if (workflow.nodes.some((node) => node.id === input.node.id)) {
    throw new Error(`Workflow node already exists: ${input.node.id}`)
  }
  if (input.node.status !== 'pending') {
    throw new Error('Inserted workflow nodes must be pending')
  }
  for (const nodeId of [input.afterNodeId, input.beforeNodeId]) {
    if (nodeId) {
      assertNodeEditable(requireWorkflowNode(workflow, nodeId), 'edited')
    }
  }

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
  const node = requireWorkflowNode(workflow, nodeId)
  if (node.status !== 'pending') {
    throw new Error('Only pending workflow nodes can be removed')
  }
  const predecessors = workflow.edges
    .filter((edge) => edge.targetNodeId === nodeId)
    .map((edge) => edge.sourceNodeId)
  const successors = workflow.edges
    .filter((edge) => edge.sourceNodeId === nodeId)
    .map((edge) => edge.targetNodeId)
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

export function updateRequirementNode(
  workflow: RequirementWorkflow,
  nodeId: string,
  changes: UpdateRequirementNodeInput
): RequirementWorkflow {
  const current = requireWorkflowNode(workflow, nodeId)
  assertNodeEditable(current, 'updated')
  const name = changes.name === undefined ? current.name : changes.name.trim()
  if (!name) throw new Error('Workflow node name is required')

  const updatedNode: RequirementNode = {
    ...current,
    ...changes,
    name,
    ...(changes.configuration
      ? { configuration: cloneNodeConfiguration(changes.configuration) }
      : {}),
    ...(changes.executor
      ? { executor: cloneNodeExecutor(changes.executor) }
      : {}),
    ...(changes.completionGate
      ? { completionGate: { ...changes.completionGate } }
      : {})
  }
  const updated = {
    ...workflow,
    revision: workflow.revision + 1,
    nodes: workflow.nodes.map((node) =>
      node.id === nodeId ? updatedNode : node
    )
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
  if (
    current.sourceNodeId === edge.sourceNodeId &&
    current.targetNodeId === edge.targetNodeId
  ) {
    return workflow
  }
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
  return recalculateEditableNodeStatuses(updated)
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
      !EDITABLE_NODE_STATUSES.has(node.status) &&
      oldOrder.get(node.id) !== newOrder.get(node.id)
    ) {
      throw new Error('Only pending or ready workflow nodes can edit topology')
    }
  }
  if (
    workflow.nodes.every(
      (node) => oldOrder.get(node.id) === newOrder.get(node.id)
    )
  ) {
    return workflow
  }
  const updated = {
    ...workflow,
    revision: workflow.revision + 1,
    nodes: orderedNodeIds.map((id, order) => ({
      ...(workflow.nodes.find((node) => node.id === id) as RequirementNode),
      order
    }))
  }
  assertValidWorkflow(updated)
  return recalculateEditableNodeStatuses(updated)
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
    .sort(compareWorkflowNodes)
    .filter((node) => {
      if (node.status !== 'pending' && node.status !== 'ready') return false
      return (predecessors.get(node.id) ?? []).every((predecessorId) => {
        const status = nodesById.get(predecessorId)?.status
        return status === 'completed' || status === 'skipped'
      })
    })
    .map((node) => node.id)
}

export function getStableReadyNodeId(
  workflow: RequirementWorkflow
): string | undefined {
  if (
    workflow.nodes.some(
      (node) => ACTIVE_NODE_STATUSES.has(node.status) && node.status !== 'ready'
    )
  ) {
    return undefined
  }

  return getStableReadyNodeIds({
    ...workflow,
    maxParallelism: 1
  })[0]
}

export function getStableReadyNodeIds(workflow: RequirementWorkflow): string[] {
  const activeNodes = [...workflow.nodes]
    .filter((node) => ACTIVE_NODE_STATUSES.has(node.status))
    .sort(compareWorkflowNodes)
  const availableSlots = Math.max(
    0,
    workflow.maxParallelism - activeNodes.length
  )
  if (availableSlots === 0) {
    return activeNodes.map((node) => node.id)
  }

  const activeNodeIds = new Set(activeNodes.map((node) => node.id))
  const candidates = getReadyNodeIds(workflow)
    .filter((nodeId) => !activeNodeIds.has(nodeId))
    .slice(0, availableSlots)

  return [...activeNodes.map((node) => node.id), ...candidates]
}

export function setWorkflowParallelism(
  workflow: RequirementWorkflow,
  maxParallelism: number
): RequirementWorkflow {
  if (
    !Number.isSafeInteger(maxParallelism) ||
    maxParallelism < 1 ||
    maxParallelism > 8
  ) {
    throw new Error('Workflow parallelism must be an integer from 1 to 8')
  }
  if (workflow.maxParallelism === maxParallelism) return workflow

  return {
    ...workflow,
    revision: workflow.revision + 1,
    maxParallelism
  }
}

export type WorkflowExecutionProjection = {
  activeNodeIds: string[]
  focusedNodeId?: string
  status: WorkflowExecutionStatus
}

export function getWorkflowExecutionProjection(
  workflow: RequirementWorkflow
): WorkflowExecutionProjection {
  const orderedNodes = [...workflow.nodes].sort(compareWorkflowNodes)
  const activeNodes = orderedNodes.filter((node) =>
    ACTIVE_NODE_STATUSES.has(node.status)
  )
  const focusedNode =
    activeNodes[0] ??
    orderedNodes.find(
      (node) => node.status !== 'completed' && node.status !== 'skipped'
    )

  let status: WorkflowExecutionStatus
  if (
    orderedNodes.every(
      (node) => node.status === 'completed' || node.status === 'skipped'
    )
  ) {
    status = 'completed'
  } else if (
    activeNodes.some(
      (node) => node.status === 'ready' || node.status === 'running'
    ) ||
    getReadyNodeIds(workflow).some((nodeId) => {
      const node = requireWorkflowNode(workflow, nodeId)
      return node.status === 'pending'
    })
  ) {
    status = 'running'
  } else if (
    activeNodes.some(
      (node) => node.status === 'waiting_user' || node.status === 'blocked'
    )
  ) {
    status = 'waiting_user'
  } else if (
    activeNodes.length > 0 &&
    activeNodes.every((node) => node.status === 'paused')
  ) {
    status = 'paused'
  } else if (activeNodes.some((node) => node.status === 'interrupted')) {
    status = 'interrupted'
  } else {
    status = 'failed'
  }

  return {
    activeNodeIds: activeNodes.map((node) => node.id),
    ...(focusedNode ? { focusedNodeId: focusedNode.id } : {}),
    status
  }
}
