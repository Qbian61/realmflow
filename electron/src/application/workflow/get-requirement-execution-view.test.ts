import { describe, expect, it, vi } from 'vitest'
import type {
  NodeRunStatus,
  RequirementWorkflow
} from '../../../../domain/workflow'
import type { PersistedContextSnapshot } from '../context/context-snapshot'
import type { UnitOfWork } from '../ports/business-repositories'
import { GetRequirementExecutionViewUseCase } from './get-requirement-execution-view'

const workflow: RequirementWorkflow = {
  requirementId: 'requirement-1',
  templateVersionId: 'template-version-1',
  revision: 4,
  maxParallelism: 2,
  nodes: [
    {
      id: 'analysis',
      type: 'ai_generate',
      name: '需求分析',
      description: '',
      order: 0,
      status: 'pending',
      allowSkip: false
    },
    {
      id: 'design',
      type: 'approval',
      name: '技术方案',
      description: '',
      order: 1,
      status: 'pending',
      allowSkip: true
    },
    {
      id: 'implementation',
      type: 'tool',
      name: '开发实现',
      description: '',
      order: 2,
      status: 'ready',
      allowSkip: false
    },
    {
      id: 'testing',
      type: 'tool',
      name: '测试验证',
      description: '',
      order: 3,
      status: 'pending',
      allowSkip: false
    }
  ],
  edges: [
    {
      id: 'edge-analysis-design',
      sourceNodeId: 'analysis',
      targetNodeId: 'design'
    }
  ]
}

const contextSnapshot: PersistedContextSnapshot = {
  id: 'snapshot-1',
  requirementId: 'requirement-1',
  nodeId: 'implementation',
  nodeRunId: 'node-run-implementation',
  providerId: 'provider-1',
  modelProfileId: 'profile-1',
  modelId: 'model-1',
  modelParameters: {
    timeoutMs: 60_000,
    maxRetries: 2,
    maxConcurrency: 1
  },
  policyVersion: 3,
  content: '## Requirement\nCheckout\n\n',
  sources: [
    {
      kind: 'requirement',
      id: 'requirement-1',
      version: 3,
      characterCount: 25,
      includedCharacters: 25,
      estimatedTokens: 7,
      status: 'included',
      truncated: false,
      summarized: false,
      redacted: false,
      preview: '## Requirement\nCheckout\n\n'
    }
  ],
  plan: {
    totalTokenBudget: 7,
    allocations: { fixed: 7, knowledge: 0 }
  },
  insufficientKnowledge: false,
  characterCount: 25,
  estimatedTokens: 7,
  checksum: 'sha256:test',
  createdAt: 2
}

describe('GetRequirementExecutionViewUseCase', () => {
  it('returns one authoritative snapshot for workflow progress and selected-node details', async () => {
    const harness = createHarness()

    const view = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'implementation'
    })

    expect(view.progress).toEqual({
      completedNodes: 2,
      totalNodes: 4,
      percent: 50
    })
    expect(view.execution).toMatchObject({
      id: 'execution-1',
      status: 'running',
      currentNodeId: 'implementation'
    })
    expect(view).toMatchObject({
      maxParallelism: 2,
      activeNodeIds: ['implementation', 'testing'],
      focusedNodeId: 'implementation'
    })
    expect(view.nodes).toEqual([
      expect.objectContaining({
        id: 'analysis',
        status: 'completed',
        active: false,
        focused: false
      }),
      expect.objectContaining({
        id: 'design',
        status: 'skipped',
        active: false,
        focused: false
      }),
      expect.objectContaining({
        id: 'implementation',
        status: 'running',
        current: true,
        active: true,
        focused: true,
        nodeRunId: 'node-run-implementation'
      }),
      expect.objectContaining({
        id: 'testing',
        status: 'ready',
        active: true,
        focused: false,
        nodeRunId: 'node-run-testing'
      })
    ])
    expect(view.workflow.nodes.map((node) => node.status)).toEqual([
      'completed',
      'skipped',
      'running',
      'ready'
    ])
    expect(view.selectedNode).toMatchObject({
      id: 'implementation',
      nodeRun: {
        id: 'node-run-implementation',
        status: 'running'
      },
      contextSources: [
        {
          kind: 'requirement',
          id: 'requirement-1',
          version: 3,
          characterCount: 25,
          includedCharacters: 25,
          estimatedTokens: 7,
          status: 'included',
          truncated: false,
          summarized: false,
          redacted: false,
          preview: '## Requirement\nCheckout\n\n'
        }
      ],
      contextSnapshot: expect.objectContaining({
        id: 'snapshot-1',
        modelId: 'model-1',
        providerId: 'provider-1',
        characterCount: 25,
        estimatedTokens: 7,
        checksum: 'sha256:test',
        content: '## Requirement\nCheckout\n\n'
      }),
      todos: [expect.objectContaining({ id: 'todo-1' })],
      questions: [expect.objectContaining({ id: 'question-1' })],
      conversation: expect.objectContaining({
        id: 'conversation-node',
        kind: 'requirement_node',
        nodeRunId: 'node-run-implementation'
      }),
      approval: expect.objectContaining({ result: 'approved' }),
      artifacts: [
        expect.objectContaining({
          id: 'artifact-primary',
          relativePath: 'artifacts/implementation.md',
          version: 2,
          isPrimary: true
        })
      ]
    })
    expect(harness.executeSpy).toHaveBeenCalledTimes(1)
  })

  it('uses the latest terminal execution and returns empty detail when no node run exists', async () => {
    const harness = createHarness({
      execution: {
        id: 'execution-1',
        requirementId: 'requirement-1',
        status: 'completed',
        currentNodeId: 'testing',
        revision: 8,
        createdAt: 1,
        updatedAt: 9,
        completedAt: 9
      },
      nodeRuns: new Map()
    })

    const view = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'testing'
    })

    expect(view.execution?.status).toBe('completed')
    expect(view.selectedNode).toMatchObject({
      id: 'testing',
      contextSources: [],
      todos: [],
      questions: [],
      artifacts: []
    })
    expect(view.selectedNode.nodeRun).toBeUndefined()
    expect(view.selectedNode.conversation).toBeUndefined()
  })

  it('summarizes every latest node run and its completion state without exposing unsafe errors', async () => {
    const implementationRun = createNodeRun(
      'implementation',
      {},
      'failed',
      {
        attempt: 2,
        revision: 7,
        createdAt: 10,
        updatedAt: 20,
        completedAt: 20,
        error:
          'token=secret-value failed at /Users/local/private/project/file.ts'
      }
    )
    const harness = createHarness({
      nodeRuns: new Map([
        ['analysis', createNodeRun('analysis', {}, 'completed')],
        ['design', createNodeRun('design', {}, 'skipped')],
        ['implementation', implementationRun],
        ['testing', createNodeRun('testing', {}, 'ready')]
      ])
    })
    harness.todos.listByNodeRun.mockImplementation(async (nodeRunId) =>
      nodeRunId === implementationRun.id
        ? [
            createTodo(nodeRunId, 'required-complete', true, 'completed'),
            createTodo(nodeRunId, 'required-open', true, 'in_progress'),
            createTodo(nodeRunId, 'optional-complete', false, 'completed')
          ]
        : []
    )
    harness.questions.listByNodeRun.mockImplementation(async (nodeRunId) =>
      nodeRunId === implementationRun.id
        ? [
            createQuestion(nodeRunId, 'open-question', 'open'),
            createQuestion(nodeRunId, 'answered-question', 'answered')
          ]
        : []
    )
    harness.approvals.getByNodeRun.mockImplementation(async (nodeRunId) =>
      nodeRunId === implementationRun.id
        ? {
            nodeRunId,
            result: 'rejected',
            actorType: 'local_user',
            actorId: 'local-user',
            decisionId: 'decision-rejected',
            revision: 2,
            createdAt: 10,
            updatedAt: 20,
            decidedAt: 20
          }
        : undefined
    )

    const view = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'implementation'
    })

    expect(
      view.nodes.find((node) => node.id === 'implementation')
    ).toMatchObject({
      nodeRunId: 'node-run-implementation',
      nodeRunRevision: 7,
      attempt: 2,
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
      errorSummary:
        'token=[redacted] failed at [redacted-path]',
      todoCounts: {
        required: { completed: 1, total: 2 },
        optional: { completed: 1, total: 1 }
      },
      openQuestionCount: 1,
      approvalStatus: 'rejected',
      artifactCount: 1
    })
    expect(harness.todos.listByNodeRun).toHaveBeenCalledTimes(4)
    expect(harness.questions.listByNodeRun).toHaveBeenCalledTimes(4)
    expect(harness.approvals.getByNodeRun).toHaveBeenCalledTimes(4)
  })

  it('projects the actual model, user, and system execution roles for every node', async () => {
    const harness = createHarness({
      contextSnapshots: new Map([
        [
          'node-run-analysis',
          {
            ...contextSnapshot,
            id: 'snapshot-analysis',
            nodeId: 'analysis',
            nodeRunId: 'node-run-analysis',
            modelProfileId: 'profile-deepseek',
            modelId: 'deepseek-v4-pro'
          }
        ]
      ]),
      modelProfiles: new Map([
        [
          'profile-deepseek',
          {
            id: 'profile-deepseek',
            displayName: 'DeepSeek V4 Pro'
          }
        ]
      ])
    })

    const view = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'implementation'
    })

    expect(view.nodes.map(({ id, executionRole }) => [id, executionRole])).toEqual([
      [
        'analysis',
        { kind: 'model', label: 'DeepSeek V4 Pro' }
      ],
      ['design', { kind: 'user' }],
      ['implementation', { kind: 'system' }],
      ['testing', { kind: 'system' }]
    ])
    expect(harness.contextSnapshots.getByNodeRun).toHaveBeenCalledTimes(4)
    expect(harness.models.getProfile).toHaveBeenCalledWith(
      'profile-deepseek'
    )
  })

  it('falls back to the snapshot model id when its profile no longer exists', async () => {
    const harness = createHarness({
      contextSnapshots: new Map([
        [
          'node-run-analysis',
          {
            ...contextSnapshot,
            nodeId: 'analysis',
            nodeRunId: 'node-run-analysis',
            modelProfileId: 'missing-profile',
            modelId: 'deepseek-v4-pro'
          }
        ]
      ]),
      modelProfiles: new Map()
    })

    const view = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'analysis'
    })

    expect(view.nodes.find(({ id }) => id === 'analysis')?.executionRole).toEqual({
      kind: 'model',
      label: 'deepseek-v4-pro'
    })
  })

  it('projects retry, skip, delete, and rollback capabilities with stable reason codes', async () => {
    const failedAnalysis = createNodeRun('analysis', {}, 'failed', {
      attempt: 2
    })
    const pendingDesign = createNodeRun('design', undefined, 'pending')
    const harness = createHarness({
      workflow: {
        ...workflow,
        nodes: workflow.nodes.map((node) =>
          node.id === 'analysis'
            ? {
                ...node,
                executor: {
                  kind: 'ai_generate',
                  prompt: 'Analyze',
                  artifact: {
                    relativePath: 'artifacts/analysis.md',
                    kind: 'markdown'
                  }
                },
                configuration: {
                  input: {
                    includeRequirementBody: true,
                    predecessorArtifacts: 'none',
                    includeSpaceKnowledge: false,
                    attachments: []
                  },
                  prompt: 'Analyze',
                  model: { strategy: 'inherit' },
                  connectorIds: [],
                  permissions: [],
                  artifact: {
                    required: true,
                    relativePath: 'artifacts/analysis.md',
                    kind: 'markdown'
                  },
                  todos: [],
                  completionGate: { requireApproval: false },
                  retry: { maxAttempts: 3, backoffMs: 0 },
                  skip: { allowed: false, requireReason: false }
                }
              }
            : node
        )
      },
      nodeRuns: new Map([
        ['analysis', failedAnalysis],
        ['design', pendingDesign]
      ])
    })

    const view = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'analysis'
    })

    expect(view.nodes.find((node) => node.id === 'analysis')?.capabilities).toEqual(
      {
        retry: { enabled: true },
        skip: { enabled: false, reasonCode: 'invalid_state' },
        delete: { enabled: false, reasonCode: 'invalid_state' },
        rollback: { enabled: true }
      }
    )
    expect(view.nodes.find((node) => node.id === 'design')?.capabilities).toEqual(
      {
        retry: { enabled: false, reasonCode: 'invalid_state' },
        skip: { enabled: true },
        delete: { enabled: true },
        rollback: { enabled: false, reasonCode: 'no_execution_history' }
      }
    )
    expect(
      view.nodes.find((node) => node.id === 'implementation')?.capabilities
    ).toEqual({
      retry: { enabled: false, reasonCode: 'node_run_missing' },
      skip: { enabled: false, reasonCode: 'node_run_missing' },
      delete: { enabled: false, reasonCode: 'invalid_state' },
      rollback: { enabled: false, reasonCode: 'no_execution_history' }
    })
  })

  it('does not expose malformed checkpoint content when no snapshot exists', async () => {
    const harness = createHarness({
      checkpoint: {
        contextSnapshot: {
          sources: [
            { kind: 'requirement', id: 42 },
            {
              kind: 'attachment',
              id: 'notes.md',
              version: 1,
              characterCount: 40,
              includedCharacters: 20,
              truncated: true
            }
          ]
        }
      },
      contextSnapshot: null
    })

    const view = await harness.useCase.execute({
      requirementId: 'requirement-1',
      nodeId: 'implementation'
    })

    expect(view.selectedNode.contextSources).toEqual([])
    expect(view.selectedNode.contextSnapshot).toBeUndefined()
  })

  it('rejects a node that does not belong to the requirement workflow', async () => {
    const harness = createHarness()

    await expect(
      harness.useCase.execute({
        requirementId: 'requirement-1',
        nodeId: 'foreign-node'
      })
    ).rejects.toThrow('Workflow node was not found')
    expect(harness.todos.listByNodeRun).not.toHaveBeenCalled()
  })
})

function createHarness(input: {
  workflow?: RequirementWorkflow
  execution?: {
    id: string
    requirementId: string
    status:
      | 'created'
      | 'running'
      | 'waiting_user'
      | 'paused'
      | 'completed'
      | 'failed'
      | 'cancelled'
      | 'interrupted'
    currentNodeId?: string
    revision: number
    createdAt: number
    updatedAt: number
    completedAt?: number
  }
  nodeRuns?: Map<string, ReturnType<typeof createNodeRun>>
  checkpoint?: Record<string, unknown>
  contextSnapshot?: PersistedContextSnapshot | null
  contextSnapshots?: Map<string, PersistedContextSnapshot>
  modelProfiles?: Map<string, { id: string; displayName: string }>
} = {}) {
  const implementationRun = createNodeRun(
    'implementation',
    input.checkpoint ?? {
      contextSnapshotId: 'snapshot-1'
    }
  )
  const nodeRuns =
    input.nodeRuns ??
    new Map([
      ['analysis', createNodeRun('analysis', {}, 'completed')],
      ['design', createNodeRun('design', {}, 'skipped')],
      ['implementation', implementationRun],
      ['testing', createNodeRun('testing', {}, 'ready')]
    ])
  const executeSpy = vi.fn()
  const unitOfWork: UnitOfWork = {
    async execute<T>(operation: () => T | Promise<T>): Promise<T> {
      executeSpy()
      return operation()
    }
  }
  const todos = {
    listByNodeRun: vi.fn().mockResolvedValue([
      {
        id: 'todo-1',
        nodeRunId: implementationRun.id,
        title: '补充测试',
        required: true,
        status: 'pending',
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ])
  }
  const questions = {
    listByNodeRun: vi.fn().mockResolvedValue([
      {
        id: 'question-1',
        nodeRunId: implementationRun.id,
        prompt: '是否发布？',
        required: true,
        status: 'answered',
        answer: '是',
        revision: 2,
        createdAt: 1,
        updatedAt: 2,
        answeredAt: 2
      }
    ])
  }
  const approvals = {
    getByNodeRun: vi.fn().mockResolvedValue({
      nodeRunId: implementationRun.id,
      result: 'approved',
      actorType: 'local_user' as const,
      actorId: 'local-user',
      decisionId: 'decision-1',
      revision: 1,
      createdAt: 1,
      updatedAt: 2,
      decidedAt: 2
    })
  }
  const contextSnapshots = {
    getByNodeRun: vi.fn(async (nodeRunId: string) => {
      if (input.contextSnapshots) return input.contextSnapshots.get(nodeRunId)
      return input.contextSnapshot === null
        ? undefined
        : (input.contextSnapshot ?? contextSnapshot)
    })
  }
  const models = {
    getProfile: vi.fn(async (profileId: string) => {
      const profile = input.modelProfiles?.get(profileId)
      return profile ? { ...profile, revision: 1 } : undefined
    })
  }
  const useCase = new GetRequirementExecutionViewUseCase({
    workflows: { get: vi.fn().mockResolvedValue(input.workflow ?? workflow) },
    executions: {
      getLatestByRequirement: vi.fn().mockResolvedValue(
        input.execution ?? {
          id: 'execution-1',
          requirementId: 'requirement-1',
          status: 'running',
          currentNodeId: 'implementation',
          revision: 3,
          createdAt: 1,
          updatedAt: 3
        }
      )
    },
    nodeRuns: {
      getLatestByNode: vi.fn(
        async (_executionId: string, nodeId: string) => nodeRuns.get(nodeId)
      )
    },
    todos,
    questions,
    approvals,
    artifacts: {
      listByRequirement: vi.fn().mockResolvedValue([
        {
          id: 'artifact-old',
          requirementId: 'requirement-1',
          stageId: 'implementation',
          nodeId: 'implementation',
          relativePath: 'artifacts/old.md',
          kind: 'markdown',
          checksum: 'sha256:old',
          version: 1,
          byteSize: 10,
          isPrimary: false,
          revision: 2,
          createdAt: 1,
          updatedAt: 1
        },
        {
          id: 'artifact-primary',
          requirementId: 'requirement-1',
          stageId: 'implementation',
          nodeId: 'implementation',
          relativePath: 'artifacts/implementation.md',
          kind: 'markdown',
          checksum: 'sha256:new',
          version: 2,
          byteSize: 20,
          isPrimary: true,
          revision: 1,
          createdAt: 2,
          updatedAt: 2
        },
        {
          id: 'artifact-other-node',
          requirementId: 'requirement-1',
          stageId: 'analysis',
          nodeId: 'analysis',
          relativePath: 'artifacts/analysis.md',
          kind: 'markdown',
          checksum: 'sha256:analysis',
          version: 1,
          byteSize: 30,
          isPrimary: true,
          revision: 1,
          createdAt: 1,
          updatedAt: 1
        }
      ])
    },
    contextSnapshots,
    models,
    conversations: {
      listByNodeRun: vi.fn(async (nodeRunId: string) =>
        nodeRunId === implementationRun.id
          ? [
              {
                id: 'conversation-node',
                kind: 'requirement_node' as const,
                workspaceId: 'workspace-1',
                requirementId: 'requirement-1',
                nodeRunId,
                title: 'Implementation',
                sortOrder: 1,
                messages: [],
                revision: 2,
                createdAt: 1,
                updatedAt: 2
              }
            ]
          : []
      )
    },
    unitOfWork
  })
  return {
    useCase,
    executeSpy,
    todos,
    questions,
    approvals,
    contextSnapshots,
    models
  }
}

function createNodeRun(
  nodeId: string,
  checkpoint: Record<string, unknown> | undefined,
  status: NodeRunStatus = 'running',
  overrides: Partial<{
    attempt: number
    revision: number
    createdAt: number
    updatedAt: number
    completedAt: number
    error: string
  }> = {}
) {
  return {
    id: `node-run-${nodeId}`,
    executionId: 'execution-1',
    nodeId,
    status,
    attempt: 1,
    ...(checkpoint ? { checkpoint } : {}),
    revision: 2,
    createdAt: 1,
    updatedAt: 2,
    ...(status === 'completed' || status === 'skipped'
      ? { completedAt: 2 }
      : {}),
    ...overrides
  }
}

function createTodo(
  nodeRunId: string,
  id: string,
  required: boolean,
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
) {
  return {
    id,
    nodeRunId,
    title: id,
    required,
    status,
    revision: 1,
    createdAt: 1,
    updatedAt: 1
  }
}

function createQuestion(
  nodeRunId: string,
  id: string,
  status: 'open' | 'answered' | 'dismissed'
) {
  return {
    id,
    nodeRunId,
    prompt: id,
    required: false,
    status,
    revision: 1,
    createdAt: 1,
    updatedAt: 1
  }
}
