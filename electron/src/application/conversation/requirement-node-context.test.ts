import { describe, expect, it, vi } from 'vitest'
import { RequirementNodeConversationContextAssembler } from './requirement-node-context'

function createHarness(options: {
  currentNodeId?: string
  nodeRunStatus?: 'ready' | 'running' | 'waiting_user' | 'completed'
} = {}) {
  const assemble = vi.fn().mockResolvedValue({
    content: '## Requirement\nCheckout\n\n## Current node\nBuild\n',
    sources: [],
    plan: {
      totalTokenBudget: 12,
      allocations: { fixed: 12, knowledge: 0 }
    },
    insufficientKnowledge: false,
    characterCount: 48,
    estimatedTokens: 12,
    checksum: 'sha256:node',
    policyVersion: 3
  })
  const service = new RequirementNodeConversationContextAssembler({
    requirements: {
      get: vi.fn().mockResolvedValue({
        id: 'requirement-1',
        workspaceId: 'workspace-1',
        title: 'Checkout',
        bodyRelativePath: 'requirement.md',
        status: 'active',
        sortOrder: 0,
        revision: 3,
        createdAt: 1,
        updatedAt: 1
      })
    },
    workflows: {
      get: vi.fn().mockResolvedValue({
        requirementId: 'requirement-1',
        templateVersionId: 'template-v1',
        revision: 4,
        maxParallelism: 1,
        nodes: [
          {
            id: 'node-1',
            type: 'ai_generate',
            name: 'Build',
            description: 'Implement checkout',
            order: 0,
            status: 'waiting_user',
            allowSkip: false,
            configuration: {
              input: {
                includeRequirementBody: true,
                predecessorArtifacts: 'direct',
                includeSpaceKnowledge: true,
                attachments: []
              },
              prompt: 'Implement it',
              model: { strategy: 'inherit' },
              connectorIds: [],
              permissions: [],
              artifact: {
                required: true,
                relativePath: 'artifacts/build.md',
                kind: 'markdown'
              },
              todos: [],
              completionGate: { requireApproval: false },
              retry: { maxAttempts: 1, backoffMs: 0 },
              skip: { allowed: false, requireReason: false }
            }
          }
        ],
        edges: []
      })
    },
    executions: {
      getLatestByRequirement: vi.fn().mockResolvedValue({
        id: 'execution-1',
        requirementId: 'requirement-1',
        status: 'waiting_user',
        currentNodeId: options.currentNodeId ?? 'node-1',
        revision: 5,
        createdAt: 1,
        updatedAt: 2
      })
    },
    nodeRuns: {
      get: vi.fn().mockResolvedValue({
        id: 'node-run-1',
        executionId: 'execution-1',
        nodeId: 'node-1',
        status: options.nodeRunStatus ?? 'waiting_user',
        attempt: 1,
        revision: 6,
        createdAt: 1,
        updatedAt: 2
      })
    },
    assembler: { assemble },
    workspace: {
      readRequirementBody: vi.fn().mockResolvedValue('# Checkout body')
    }
  })
  return { assemble, service }
}

describe('RequirementNodeConversationContextAssembler', () => {
  it('assembles the current node through the C07 source policy', async () => {
    const { assemble, service } = createHarness()

    await expect(
      service.assemble({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        query: 'Canary'
      })
    ).resolves.toMatchObject({
      context: '## Requirement\nCheckout\n\n## Current node\nBuild\n',
      workspaceId: 'workspace-1',
      nodeId: 'node-1'
    })
    expect(assemble).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeRunId: 'node-run-1',
        knowledgeQuery: 'Canary',
        includeRequirementBody: true,
        predecessorArtifacts: 'direct',
        includeSpaceKnowledge: true
      })
    )
  })

  it('includes the selected open question and pending answer in ephemeral context', async () => {
    const { service } = createHarness()

    const result = await service.assemble({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      query: 'Canary',
      pendingQuestion: {
        prompt: 'Which rollout strategy?',
        answer: 'Canary'
      }
    })

    expect(result.context).toContain('Which rollout strategy?')
    expect(result.context).toContain('Canary')
  })

  it.each([
    [{ currentNodeId: 'node-2' }, '当前节点不支持继续对话'],
    [{ nodeRunStatus: 'completed' as const }, '当前节点不支持继续对话']
  ])('rejects non-current or terminal node runs %#', async (options, message) => {
    const { assemble, service } = createHarness(options)

    await expect(
      service.assemble({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        query: 'Hello'
      })
    ).rejects.toThrow(message)
    expect(assemble).not.toHaveBeenCalled()
  })
})
