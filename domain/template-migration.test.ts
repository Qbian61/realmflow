import { describe, expect, it } from 'vitest'
import type {
  RequirementNode,
  RequirementWorkflow,
  WorkflowTemplateSnapshot
} from './workflow'
import { createTemplateMigrationDiff } from './template-migration'

function node(
  id: string,
  order: number,
  overrides: Partial<RequirementNode> = {}
): RequirementNode {
  return {
    id,
    type: 'ai_generate',
    name: id,
    description: '',
    order,
    status: order === 0 ? 'ready' : 'pending',
    allowSkip: false,
    ...overrides
  }
}

function currentWorkflow(): RequirementWorkflow {
  return {
    requirementId: 'requirement-1',
    templateVersionId: 'template-v1',
    revision: 4,
    maxParallelism: 1,
    nodes: [
      node('requirement-1:analysis', 0, {
        name: 'Custom analysis',
        description: 'Requirement override',
        allowSkip: true
      }),
      node('requirement-1:delivery', 1, { name: 'Delivery' }),
      node('requirement-1:custom', 2, { name: 'Local custom node' })
    ],
    edges: [
      {
        id: 'requirement-1:analysis-delivery',
        sourceNodeId: 'requirement-1:analysis',
        targetNodeId: 'requirement-1:delivery'
      },
      {
        id: 'requirement-1:delivery-custom',
        sourceNodeId: 'requirement-1:delivery',
        targetNodeId: 'requirement-1:custom'
      }
    ]
  }
}

function targetTemplate(): WorkflowTemplateSnapshot {
  return {
    id: 'template-v2',
    nodes: [
      {
        id: 'template-delivery-v2',
        stableKey: 'delivery',
        type: 'ai_generate',
        name: 'Delivery',
        description: '',
        order: 0,
        allowSkip: false
      },
      {
        id: 'template-analysis-v2',
        stableKey: 'analysis',
        type: 'ai_generate',
        name: 'Analysis',
        description: 'Template description',
        order: 1,
        allowSkip: false
      },
      {
        id: 'template-review-v2',
        stableKey: 'review',
        type: 'approval',
        name: 'Review',
        description: '',
        order: 2,
        allowSkip: false,
        completionGate: { requireApproval: true }
      }
    ],
    edges: [
      {
        id: 'delivery-analysis',
        sourceNodeId: 'template-delivery-v2',
        targetNodeId: 'template-analysis-v2'
      },
      {
        id: 'analysis-review',
        sourceNodeId: 'template-analysis-v2',
        targetNodeId: 'template-review-v2'
      }
    ]
  }
}

describe('template migration diff', () => {
  it('compares the current instance with target stable node identities', () => {
    const result = createTemplateMigrationDiff(
      currentWorkflow(),
      targetTemplate()
    )

    expect(result.addedNodes).toEqual([
      { id: 'requirement-1:review', name: 'Review' }
    ])
    expect(result.removedNodes).toEqual([
      { id: 'requirement-1:custom', name: 'Local custom node' }
    ])
    expect(result.updatedNodes).toEqual([
      {
        id: 'requirement-1:analysis',
        sourceName: 'Custom analysis',
        targetName: 'Analysis',
        changedFields: ['name', 'description', 'allowSkip']
      }
    ])
    expect(result.reorderedNodes).toEqual([
      { id: 'requirement-1:delivery', from: 1, to: 0 },
      { id: 'requirement-1:analysis', from: 0, to: 1 }
    ])
    expect(result.addedEdges).toEqual([
      'requirement-1:delivery-analysis',
      'requirement-1:analysis-review'
    ])
    expect(result.removedEdges).toEqual([
      'requirement-1:analysis-delivery',
      'requirement-1:delivery-custom'
    ])
  })

  it('returns a valid target snapshot with fresh pending and ready states', () => {
    const result = createTemplateMigrationDiff(
      currentWorkflow(),
      targetTemplate()
    )

    expect(result.targetWorkflow).toMatchObject({
      requirementId: 'requirement-1',
      templateVersionId: 'template-v2',
      revision: 4
    })
    expect(
      result.targetWorkflow.nodes.map(({ id, status }) => ({ id, status }))
    ).toEqual([
      { id: 'requirement-1:delivery', status: 'ready' },
      { id: 'requirement-1:analysis', status: 'pending' },
      { id: 'requirement-1:review', status: 'pending' }
    ])
  })

  it('does not share nested connector configuration references', () => {
    const target = targetTemplate()
    target.nodes[0].configuration = {
      input: { prompt: 'Deliver', attachments: ['brief.md'] },
      model: {},
      connectorIds: ['connector-1'],
      permissions: [{ capability: 'filesystem.read', scope: 'requirement' }],
      artifact: { relativePath: 'delivery.md', kind: 'markdown' },
      todos: [{ title: 'Review delivery', required: true }],
      completionGate: {},
      retry: { maxAttempts: 1, backoffMs: 0 },
      skip: { allowed: false, requireReason: false }
    }

    const result = createTemplateMigrationDiff(currentWorkflow(), target)
    result.targetWorkflow.nodes[0].configuration!.connectorIds.push(
      'connector-2'
    )

    expect(target.nodes[0].configuration?.connectorIds).toEqual([
      'connector-1'
    ])
  })
})
