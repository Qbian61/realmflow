import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import type { AiRunController } from '../app/hooks/use-ai-run-controller'
import RequirementDetailPage from './RequirementDetailPage'

vi.mock('../features/workbench/WorkbenchProvider', () => ({
  useWorkbench: () => ({ openRequirementArtifact: vi.fn() })
}))

describe('RequirementDetailPage AI run controls', () => {
  afterEach(() => {
    delete window.realmflow
  })

  it('starts the selected stage and displays streaming progress and content', () => {
    const start = vi.fn().mockResolvedValue('run-1')
    const aiRuns: AiRunController = {
      runs: {},
      start,
      attach: vi.fn(),
      cancel: vi.fn(),
      findRun: () => ({
        runId: 'run-1',
        requirementId: 'requirement-1',
        stageId: 'analysis',
        status: 'running',
        progress: 40,
        content: '# Scope',
        error: ''
      })
    }

    renderPage(aiRuns)

    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('# Scope')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消生成' }))
    expect(aiRuns.cancel).toHaveBeenCalledWith('run-1')
  })

  it('starts generation through the application controller', () => {
    const start = vi.fn().mockResolvedValue('run-1')
    const aiRuns: AiRunController = {
      runs: {},
      start,
      attach: vi.fn(),
      cancel: vi.fn(),
      findRun: () => undefined
    }

    renderPage(aiRuns)
    fireEvent.click(screen.getByRole('button', { name: '生成需求分析产物' }))

    expect(start).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    })
  })

  it('binds generation to the selected workflow node run', async () => {
    const start = vi.fn().mockResolvedValue('run-1')
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn()
    })

    renderPage({
      runs: {},
      start,
      attach: vi.fn(),
      cancel: vi.fn(),
      findRun: () => undefined
    })
    fireEvent.click(
      await screen.findByRole('button', { name: '生成需求分析产物' })
    )

    expect(start).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeId: 'requirement-1:analysis',
      nodeRunId: 'node-run-1'
    })
  })

  it('pauses a node through its revisioned execution record', async () => {
    const pauseWorkflowNode = vi.fn().mockResolvedValue({
      requirementId: 'requirement-1',
      templateVersionId: 'builtin-sdlc-v1',
      revision: 4,
      nodes: [
        {
          id: 'requirement-1:analysis',
          type: 'ai_generate',
          name: '需求分析',
          description: '',
          order: 0,
          status: 'paused',
          allowSkip: false
        }
      ],
      edges: []
    })
    window.realmflow = {
      business: {
        getRequirementWorkflow: vi.fn().mockResolvedValue({
          requirementId: 'requirement-1',
          templateVersionId: 'builtin-sdlc-v1',
          revision: 3,
          nodes: [
            {
              id: 'requirement-1:analysis',
              type: 'ai_generate',
              name: '需求分析',
              description: '',
              order: 0,
              status: 'ready',
              allowSkip: false
            }
          ],
          edges: []
        }),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue({
          execution: {
            id: 'requirement-1:execution:1',
            requirementId: 'requirement-1',
            status: 'created',
            currentNodeId: 'requirement-1:analysis',
            revision: 1,
            createdAt: 1,
            updatedAt: 1
          },
          nodeRun: {
            id: 'requirement-1:node-run:analysis:1',
            executionId: 'requirement-1:execution:1',
            nodeId: 'requirement-1:analysis',
            status: 'ready',
            attempt: 1,
            revision: 2,
            createdAt: 1,
            updatedAt: 1
          }
        }),
        pauseWorkflowNode
      }
    } as unknown as typeof window.realmflow

    renderPage({
      runs: {},
      start: vi.fn(),
      attach: vi.fn(),
      cancel: vi.fn(),
      findRun: () => undefined
    })

    fireEvent.click(await screen.findByRole('button', { name: '暂停节点' }))
    await waitFor(() =>
      expect(pauseWorkflowNode).toHaveBeenCalledWith({
        requirementId: 'requirement-1',
        nodeRunId: 'requirement-1:node-run:analysis:1',
        expectedWorkflowRevision: 3,
        expectedNodeRunRevision: 2
      })
    )
  })

  it('resumes a node with the selected model profile', async () => {
    const resumeWorkflowNode = vi.fn().mockResolvedValue({
      requirementId: 'requirement-1',
      templateVersionId: 'builtin-sdlc-v1',
      revision: 4,
      nodes: [],
      edges: []
    })
    window.realmflow = {
      business: {
        listModels: vi.fn().mockResolvedValue({
          providers: [],
          profiles: [
            {
              id: 'profile-1',
              displayName: 'Primary model',
              enabled: true
            }
          ]
        }),
        getRequirementWorkflow: vi.fn().mockResolvedValue({
          requirementId: 'requirement-1',
          templateVersionId: 'builtin-sdlc-v1',
          revision: 3,
          nodes: [
            {
              id: 'requirement-1:analysis',
              type: 'ai_generate',
              name: '需求分析',
              description: '',
              order: 0,
              status: 'paused',
              allowSkip: false
            }
          ],
          edges: []
        }),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue({
          execution: {
            id: 'requirement-1:execution:1',
            requirementId: 'requirement-1',
            status: 'paused',
            currentNodeId: 'requirement-1:analysis',
            revision: 1,
            createdAt: 1,
            updatedAt: 1
          },
          nodeRun: {
            id: 'node-run-1',
            executionId: 'requirement-1:execution:1',
            nodeId: 'requirement-1:analysis',
            status: 'paused',
            attempt: 1,
            revision: 2,
            createdAt: 1,
            updatedAt: 1
          }
        }),
        resumeWorkflowNode
      }
    } as unknown as typeof window.realmflow

    renderPage(emptyAiRuns())
    fireEvent.click(await screen.findByRole('button', { name: '继续节点' }))

    await waitFor(() =>
      expect(resumeWorkflowNode).toHaveBeenCalledWith({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedWorkflowRevision: 3,
        expectedNodeRunRevision: 2,
        modelProfileId: 'profile-1'
      })
    )
  })

  it('approves a gated node through the revisioned business command', async () => {
    const completedWorkflow = {
      requirementId: 'requirement-1',
      templateVersionId: 'builtin-sdlc-v1',
      revision: 4,
      nodes: [
        {
          id: 'requirement-1:release',
          type: 'approval' as const,
          name: '发布审批',
          description: '',
          order: 0,
          status: 'completed' as const,
          allowSkip: false,
          completionGate: { requireApproval: true }
        }
      ],
      edges: []
    }
    const resolveWorkflowNodeGate = vi
      .fn()
      .mockResolvedValue(completedWorkflow)
    window.realmflow = {
      business: {
        getRequirementWorkflow: vi.fn().mockResolvedValue({
          ...completedWorkflow,
          revision: 3,
          nodes: [
            {
              ...completedWorkflow.nodes[0],
              status: 'ready'
            }
          ]
        }),
        getWorkflowNodeExecution: vi.fn().mockResolvedValue({
          execution: {
            id: 'execution-1',
            requirementId: 'requirement-1',
            status: 'running',
            currentNodeId: 'requirement-1:release',
            revision: 1,
            createdAt: 1,
            updatedAt: 1
          },
          nodeRun: {
            id: 'node-run-release',
            executionId: 'execution-1',
            nodeId: 'requirement-1:release',
            status: 'ready',
            attempt: 1,
            revision: 2,
            createdAt: 1,
            updatedAt: 1
          }
        }),
        listNodeTodos: vi.fn().mockResolvedValue([]),
        listNodeQuestions: vi.fn().mockResolvedValue([]),
        resolveWorkflowNodeGate
      }
    } as unknown as typeof window.realmflow

    renderPage(emptyAiRuns())
    fireEvent.click(await screen.findByRole('button', { name: '批准节点' }))

    await waitFor(() =>
      expect(resolveWorkflowNodeGate).toHaveBeenCalledWith({
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-release',
        expectedNodeRunRevision: 2,
        gate: { kind: 'approval', result: 'approved' }
      })
    )
    expect(await screen.findByText('已完成')).toBeInTheDocument()
  })

  it('lists node todos and completes one with its revision', async () => {
    const saveNodeTodo = vi.fn().mockResolvedValue({
      id: 'todo-1',
      nodeRunId: 'node-run-1',
      title: 'Confirm acceptance criteria',
      required: true,
      status: 'completed',
      revision: 4,
      createdAt: 1,
      updatedAt: 2
    })
    installNodeInteractionApi({
      saveNodeTodo,
      answerNodeQuestion: vi.fn()
    })

    renderPage(emptyAiRuns())

    const todo = await screen.findByRole('checkbox', {
      name: 'Confirm acceptance criteria'
    })
    fireEvent.click(todo)

    await waitFor(() =>
      expect(saveNodeTodo).toHaveBeenCalledWith({
        id: 'todo-1',
        nodeRunId: 'node-run-1',
        title: 'Confirm acceptance criteria',
        required: true,
        status: 'completed',
        expectedRevision: 3,
        createdAt: 1,
        updatedAt: 1
      })
    )
    expect(todo).toBeChecked()
  })

  it('lists open node questions and submits a revisioned answer', async () => {
    const answerNodeQuestion = vi.fn().mockResolvedValue({
      id: 'question-1',
      nodeRunId: 'node-run-1',
      prompt: 'Which rollout strategy should be used?',
      required: true,
      status: 'answered',
      answer: 'Canary rollout',
      revision: 6,
      createdAt: 1,
      updatedAt: 2,
      answeredAt: 2
    })
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion
    })

    renderPage(emptyAiRuns())

    fireEvent.change(
      await screen.findByLabelText(
        '回答：Which rollout strategy should be used?'
      ),
      { target: { value: 'Canary rollout' } }
    )
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }))

    await waitFor(() =>
      expect(answerNodeQuestion).toHaveBeenCalledWith({
        id: 'question-1',
        nodeRunId: 'node-run-1',
        answer: 'Canary rollout',
        expectedRevision: 5
      })
    )
    expect(await screen.findByText('Canary rollout')).toBeInTheDocument()
  })

  it('reattaches the persisted AI run when reopening a node', async () => {
    installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      aiRunId: 'run-restored'
    })
    const aiRuns = emptyAiRuns()

    renderPage(aiRuns)

    await waitFor(() =>
      expect(aiRuns.attach).toHaveBeenCalledWith('run-restored')
    )
  })

  it('refreshes workflow and node execution after an AI run terminates', async () => {
    const business = installNodeInteractionApi({
      saveNodeTodo: vi.fn(),
      answerNodeQuestion: vi.fn(),
      aiRunId: 'run-completed'
    })
    const aiRuns = emptyAiRuns()
    const completedRun = {
      runId: 'run-completed',
      requirementId: 'requirement-1',
      nodeId: 'requirement-1:analysis',
      status: 'completed' as const,
      progress: 100,
      content: '# Complete',
      error: ''
    }
    aiRuns.runs = { 'run-completed': completedRun }
    aiRuns.findRun = () => completedRun

    renderPage(aiRuns)

    await waitFor(() => {
      expect(business.getRequirementWorkflow).toHaveBeenCalledTimes(2)
      expect(business.getWorkflowNodeExecution).toHaveBeenCalledTimes(2)
    })
  })
})

function emptyAiRuns(): AiRunController {
  return {
    runs: {},
    start: vi.fn(),
    attach: vi.fn(),
    cancel: vi.fn(),
    findRun: () => undefined
  }
}

function installNodeInteractionApi(input: {
  saveNodeTodo: ReturnType<typeof vi.fn>
  answerNodeQuestion: ReturnType<typeof vi.fn>
  aiRunId?: string
}) {
  const getRequirementWorkflow = vi.fn().mockResolvedValue({
    requirementId: 'requirement-1',
    templateVersionId: 'builtin-sdlc-v1',
    revision: 3,
    nodes: [
      {
        id: 'requirement-1:analysis',
        type: 'ai_generate',
        name: '需求分析',
        description: '',
        order: 0,
        status: 'ready',
        allowSkip: false,
        executor: {
          kind: 'ai_generate',
          prompt: 'Analyze the requirement.',
          artifact: {
            relativePath: 'analysis/analysis.md',
            kind: 'analysis'
          },
          legacyStageId: 'analysis'
        }
      }
    ],
    edges: []
  })
  const getWorkflowNodeExecution = vi.fn().mockResolvedValue({
    execution: {
      id: 'requirement-1:execution:1',
      requirementId: 'requirement-1',
      status: 'created',
      currentNodeId: 'requirement-1:analysis',
      revision: 1,
      createdAt: 1,
      updatedAt: 1
    },
    nodeRun: {
      id: 'node-run-1',
      executionId: 'requirement-1:execution:1',
      nodeId: 'requirement-1:analysis',
      ...(input.aiRunId ? { aiRunId: input.aiRunId } : {}),
      status: 'ready',
      attempt: 1,
      revision: 2,
      createdAt: 1,
      updatedAt: 1
    }
  })
  window.realmflow = {
    business: {
      getRequirementWorkflow,
      getWorkflowNodeExecution,
      listNodeTodos: vi.fn().mockResolvedValue([
        {
          id: 'todo-1',
          nodeRunId: 'node-run-1',
          title: 'Confirm acceptance criteria',
          required: true,
          status: 'pending',
          revision: 3,
          createdAt: 1,
          updatedAt: 1
        }
      ]),
      saveNodeTodo: input.saveNodeTodo,
      listNodeQuestions: vi.fn().mockResolvedValue([
        {
          id: 'question-1',
          nodeRunId: 'node-run-1',
          prompt: 'Which rollout strategy should be used?',
          required: true,
          status: 'open',
          revision: 5,
          createdAt: 1,
          updatedAt: 1
        }
      ]),
      answerNodeQuestion: input.answerNodeQuestion
    }
  } as unknown as typeof window.realmflow
  return { getRequirementWorkflow, getWorkflowNodeExecution }
}

function renderPage(aiRuns: AiRunController): void {
  render(
    <MemoryRouter
      initialEntries={['/spaces/space-1/requirements/requirement-1']}
    >
      <Routes>
        <Route
          path="/spaces/:spaceId/requirements/:requirementId"
          element={
            <RequirementDetailPage
              spaces={[
                {
                  path: '/spaces/space-1',
                  label: 'Store',
                  description: 'Store workspace'
                }
              ]}
              requirementsBySpace={{
                '/spaces/space-1': [{ id: 'requirement-1', title: 'Checkout' }]
              }}
              aiRuns={aiRuns}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  )
}
