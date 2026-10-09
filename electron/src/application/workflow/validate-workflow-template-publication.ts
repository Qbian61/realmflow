import type { WorkflowTemplateVersionRecord } from '../ports/business-repositories'
import { normalizeNodeConfiguration } from './workflow-node-configuration'

export type WorkflowTemplatePublicationIssueCode =
  | 'empty_graph'
  | 'invalid_edge_reference'
  | 'self_loop'
  | 'isolated_node'
  | 'missing_entry'
  | 'missing_terminal'
  | 'unreachable_node'
  | 'dead_end_node'
  | 'cycle'
  | 'missing_node_configuration'
  | 'invalid_node_configuration'

export type WorkflowTemplatePublicationIssue = {
  code: WorkflowTemplatePublicationIssueCode
  message: string
  scope: 'graph' | 'node' | 'edge'
  nodeId?: string
  edgeId?: string
}

export type WorkflowTemplatePublicationValidationResult =
  | { valid: true; issues: [] }
  | { valid: false; issues: WorkflowTemplatePublicationIssue[] }

export class WorkflowTemplatePublicationValidationError extends Error {
  readonly name = 'WorkflowTemplatePublicationValidationError'

  constructor(
    readonly validation: Extract<
      WorkflowTemplatePublicationValidationResult,
      { valid: false }
    >
  ) {
    super('模板发布校验失败')
  }
}

export function validateWorkflowTemplatePublication(
  version: WorkflowTemplateVersionRecord
): WorkflowTemplatePublicationValidationResult {
  const issues: WorkflowTemplatePublicationIssue[] = []
  const nodes = [...version.nodes].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id)
  )
  if (nodes.length === 0) {
    return {
      valid: false,
      issues: [
        {
          code: 'empty_graph',
          message: '流程模板至少需要一个节点',
          scope: 'graph'
        }
      ]
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id))
  const validEdges: WorkflowTemplateVersionRecord['edges'] = []
  for (const edge of version.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      issues.push({
        code: 'invalid_edge_reference',
        message: `连线 ${edge.id} 引用了不存在的节点`,
        scope: 'edge',
        edgeId: edge.id
      })
      continue
    }
    if (edge.sourceNodeId === edge.targetNodeId) {
      issues.push({
        code: 'self_loop',
        message: `连线 ${edge.id} 不能连接节点自身`,
        scope: 'edge',
        edgeId: edge.id
      })
      continue
    }
    validEdges.push(edge)
  }

  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of validEdges) {
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId)
    incoming.get(edge.targetNodeId)?.push(edge.sourceNodeId)
  }

  if (nodes.length > 1) {
    for (const node of nodes) {
      if (
        incoming.get(node.id)?.length === 0 &&
        outgoing.get(node.id)?.length === 0
      ) {
        issues.push({
          code: 'isolated_node',
          message: `节点“${node.name}”未连接到流程`,
          scope: 'node',
          nodeId: node.id
        })
      }
    }
  }

  for (const node of nodes) {
    if (!node.configuration) {
      issues.push({
        code: 'missing_node_configuration',
        message: `节点“${node.name}”缺少完整配置`,
        scope: 'node',
        nodeId: node.id
      })
      continue
    }
    try {
      normalizeNodeConfiguration(node.configuration, node.type)
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : 'configuration is invalid'
      issues.push({
        code: 'invalid_node_configuration',
        message: `节点“${node.name}”配置无效：${detail}`,
        scope: 'node',
        nodeId: node.id
      })
    }
  }

  const entryIds = nodes
    .filter((node) => incoming.get(node.id)?.length === 0)
    .map((node) => node.id)
  const terminalIds = nodes
    .filter((node) => outgoing.get(node.id)?.length === 0)
    .map((node) => node.id)

  if (entryIds.length === 0) {
    issues.push({
      code: 'missing_entry',
      message: '流程模板缺少入口节点',
      scope: 'graph'
    })
  }
  if (terminalIds.length === 0) {
    issues.push({
      code: 'missing_terminal',
      message: '流程模板缺少终点节点',
      scope: 'graph'
    })
  }

  const reachable = traverse(entryIds, outgoing)
  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        code: 'unreachable_node',
        message: `节点“${node.name}”无法从入口到达`,
        scope: 'node',
        nodeId: node.id
      })
    }
  }

  const canReachTerminal = traverse(terminalIds, incoming)
  for (const node of nodes) {
    if (!canReachTerminal.has(node.id)) {
      issues.push({
        code: 'dead_end_node',
        message: `节点“${node.name}”无法到达终点`,
        scope: 'node',
        nodeId: node.id
      })
    }
  }

  if (
    hasCycle(
      nodes.map((node) => node.id),
      outgoing
    )
  ) {
    issues.push({
      code: 'cycle',
      message: '流程模板不能包含环路',
      scope: 'graph'
    })
  }

  return issues.length === 0
    ? { valid: true, issues: [] }
    : { valid: false, issues }
}

function traverse(
  initialIds: string[],
  adjacency: Map<string, string[]>
): Set<string> {
  const visited = new Set<string>()
  const queue = [...initialIds]
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    queue.push(...(adjacency.get(nodeId) ?? []))
  }
  return visited
}

function hasCycle(nodeIds: string[], outgoing: Map<string, string[]>): boolean {
  const state = new Map<string, 'visiting' | 'visited'>()

  function visit(nodeId: string): boolean {
    if (state.get(nodeId) === 'visiting') return true
    if (state.get(nodeId) === 'visited') return false
    state.set(nodeId, 'visiting')
    for (const targetId of outgoing.get(nodeId) ?? []) {
      if (visit(targetId)) return true
    }
    state.set(nodeId, 'visited')
    return false
  }

  return nodeIds.some(visit)
}
