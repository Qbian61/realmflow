import { describe, expect, it } from 'vitest'
import type { WorkflowNodeConfiguration } from '../../../../domain/workflow'
import type { WorkflowTemplateVersionRecord } from '../ports/business-repositories'
import { validateWorkflowTemplatePublication } from './validate-workflow-template-publication'

describe('validateWorkflowTemplatePublication', () => {
  it('rejects an empty graph', () => {
    const result = validateWorkflowTemplatePublication(version([], []))

    expect(result).toEqual({
      valid: false,
      issues: [
        {
          code: 'empty_graph',
          message: '流程模板至少需要一个节点',
          scope: 'graph'
        }
      ]
    })
  })

  it('locates invalid edge references, self loops and isolated nodes', () => {
    const nodes = [node('analysis', 0), node('review', 1), node('isolated', 2)]

    const result = validateWorkflowTemplatePublication(
      version(nodes, [
        {
          id: 'missing-target',
          sourceNodeId: nodes[0].id,
          targetNodeId: 'missing'
        },
        {
          id: 'review-loop',
          sourceNodeId: nodes[1].id,
          targetNodeId: nodes[1].id
        }
      ])
    )

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_edge_reference',
          scope: 'edge',
          edgeId: 'missing-target'
        }),
        expect.objectContaining({
          code: 'self_loop',
          scope: 'edge',
          edgeId: 'review-loop'
        }),
        expect.objectContaining({
          code: 'isolated_node',
          scope: 'node',
          nodeId: nodes[2].id
        })
      ])
    )
  })

  it('reports missing entry, terminal, cycles, unreachable nodes and dead ends', () => {
    const nodes = [
      node('entry', 0),
      node('finish', 1),
      node('cycle-a', 2),
      node('cycle-b', 3)
    ]

    const result = validateWorkflowTemplatePublication(
      version(nodes, [
        edge('entry-finish', nodes[0], nodes[1]),
        edge('cycle-a-b', nodes[2], nodes[3]),
        edge('cycle-b-a', nodes[3], nodes[2])
      ])
    )

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unreachable_node',
          nodeId: nodes[2].id
        }),
        expect.objectContaining({
          code: 'unreachable_node',
          nodeId: nodes[3].id
        }),
        expect.objectContaining({
          code: 'dead_end_node',
          nodeId: nodes[2].id
        }),
        expect.objectContaining({
          code: 'dead_end_node',
          nodeId: nodes[3].id
        }),
        expect.objectContaining({ code: 'cycle', scope: 'graph' })
      ])
    )

    const closedCycle = validateWorkflowTemplatePublication(
      version(nodes.slice(2), [
        edge('cycle-a-b', nodes[2], nodes[3]),
        edge('cycle-b-a', nodes[3], nodes[2])
      ])
    )
    expect(closedCycle.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_entry' }),
        expect.objectContaining({ code: 'missing_terminal' })
      ])
    )
  })

  it('locates missing and invalid node configurations', () => {
    const missing = { ...node('missing', 0), configuration: undefined }
    const invalid = node('invalid', 1, {
      ...completeConfiguration(),
      prompt: '   '
    })

    const result = validateWorkflowTemplatePublication(
      version([missing, invalid], [edge('missing-invalid', missing, invalid)])
    )

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_node_configuration',
          scope: 'node',
          nodeId: missing.id
        }),
        expect.objectContaining({
          code: 'invalid_node_configuration',
          scope: 'node',
          nodeId: invalid.id,
          message: expect.stringContaining('prompt is required')
        })
      ])
    )
  })

  it('accepts a configured branching DAG and a configured single-node DAG', () => {
    const nodes = [
      node('analysis', 0),
      node('design', 1),
      node('review', 2),
      node('release', 3)
    ]
    const branching = validateWorkflowTemplatePublication(
      version(nodes, [
        edge('analysis-design', nodes[0], nodes[1]),
        edge('analysis-review', nodes[0], nodes[2]),
        edge('design-release', nodes[1], nodes[3]),
        edge('review-release', nodes[2], nodes[3])
      ])
    )
    const single = validateWorkflowTemplatePublication(
      version([node('only', 0)], [])
    )

    expect(branching).toEqual({ valid: true, issues: [] })
    expect(single).toEqual({ valid: true, issues: [] })
  })
})

function version(
  nodes: WorkflowTemplateVersionRecord['nodes'],
  edges: WorkflowTemplateVersionRecord['edges']
): WorkflowTemplateVersionRecord {
  return {
    id: 'template-v1',
    templateId: 'template',
    version: 1,
    status: 'draft',
    checksum: '',
    nodes,
    edges
  }
}

function node(
  stableKey: string,
  order: number,
  configuration: WorkflowNodeConfiguration | undefined = completeConfiguration()
): WorkflowTemplateVersionRecord['nodes'][number] {
  return {
    id: `template-v1-node-${stableKey}`,
    stableKey,
    type: 'ai_generate',
    name: stableKey,
    description: '',
    order,
    allowSkip: false,
    ...(configuration ? { configuration } : {})
  }
}

function edge(
  id: string,
  source: WorkflowTemplateVersionRecord['nodes'][number],
  target: WorkflowTemplateVersionRecord['nodes'][number]
): WorkflowTemplateVersionRecord['edges'][number] {
  return {
    id,
    sourceNodeId: source.id,
    targetNodeId: target.id
  }
}

function completeConfiguration(): WorkflowNodeConfiguration {
  return {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: 'direct',
      includeSpaceKnowledge: false,
      attachments: []
    },
    prompt: 'Complete this node.',
    model: { strategy: 'inherit' },
    connectorIds: [],
    permissions: [],
    artifact: {
      required: true,
      relativePath: 'artifacts/output.md',
      kind: 'markdown'
    },
    todos: [],
    completionGate: { requireApproval: false },
    retry: { maxAttempts: 1, backoffMs: 0 },
    skip: { allowed: false, requireReason: false }
  }
}
