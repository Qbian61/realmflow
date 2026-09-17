import { describe, expect, it, vi } from 'vitest'
import type { BusinessCommandHandlers } from '../../../shared/business'
import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import { registerBusinessIpc } from './business-ipc'

describe('business IPC', () => {
  it('rejects whitespace-only space names before invoking the use case', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.spaceCreate)
    expect(() => handler?.({}, { id: 'space-1', name: '   ' })).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.spaceCreate}: command.name`
    )
    expect(handlers.createSpace.execute).not.toHaveBeenCalled()
  })

  it('registers the P0 query and command channels', () => {
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers: createHandlers(),
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    expect([...registered.keys()]).toEqual(
      expect.arrayContaining([
        IPC_INVOKE_CHANNELS.requirementList,
        IPC_INVOKE_CHANNELS.spaceRestore,
        IPC_INVOKE_CHANNELS.requirementRestore,
        IPC_INVOKE_CHANNELS.workflowTemplateList,
        IPC_INVOKE_CHANNELS.conversationListRecent,
        IPC_INVOKE_CHANNELS.conversationListByWorkspace,
        IPC_INVOKE_CHANNELS.conversationCreate,
        IPC_INVOKE_CHANNELS.conversationAppendMessage,
        IPC_INVOKE_CHANNELS.spaceResourceList,
        IPC_INVOKE_CHANNELS.spaceResourceSave,
        IPC_INVOKE_CHANNELS.spaceResourceDelete,
        IPC_INVOKE_CHANNELS.nodeTodoList,
        IPC_INVOKE_CHANNELS.nodeTodoSave,
        IPC_INVOKE_CHANNELS.nodeQuestionList,
        IPC_INVOKE_CHANNELS.nodeQuestionAnswer,
        IPC_INVOKE_CHANNELS.workflowNodeExecutionGet,
        IPC_INVOKE_CHANNELS.workflowNodeResolveGate,
        IPC_INVOKE_CHANNELS.modelList,
        IPC_INVOKE_CHANNELS.modelProviderSave,
        IPC_INVOKE_CHANNELS.modelProfileSave,
        IPC_INVOKE_CHANNELS.modelCredentialSet,
        IPC_INVOKE_CHANNELS.modelMetricList
      ])
    )
  })

  it('validates revisioned node execution commands before pausing', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.workflowNodePause)
    await handler?.(
      {},
      {
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedWorkflowRevision: 3,
        expectedNodeRunRevision: 2
      }
    )
    expect(handlers.pauseWorkflowNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 3,
      expectedNodeRunRevision: 2
    })
  })

  it('preserves explicit AI executor configuration when inserting a node', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const command = {
      requirementId: 'requirement-1',
      expectedRevision: 2,
      node: {
        id: 'custom-node',
        type: 'ai_generate',
        name: 'Security Review',
        description: '',
        order: 1,
        status: 'pending',
        allowSkip: true,
        completionGate: {
          requireApproval: true,
          customGateId: 'security-policy'
        },
        executor: {
          kind: 'ai_generate',
          prompt: 'Review predecessor artifacts for security risks.',
          artifact: {
            relativePath: 'artifacts/security-review.md',
            kind: 'markdown'
          }
        }
      },
      afterNodeId: 'node-analysis'
    }
    const handler = registered.get(
      IPC_INVOKE_CHANNELS.requirementWorkflowInsertNode
    )

    await handler?.({}, command)

    expect(handlers.insertWorkflowNode.execute).toHaveBeenCalledWith(command)
  })

  it('preserves the selected model when resuming a workflow node', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.workflowNodeResume)
    await handler?.(
      {},
      {
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedWorkflowRevision: 3,
        expectedNodeRunRevision: 2,
        modelProfileId: 'profile-1'
      }
    )

    expect(handlers.resumeWorkflowNode.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 3,
      expectedNodeRunRevision: 2,
      modelProfileId: 'profile-1'
    })
  })

  it('validates a workflow approval gate command', async () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.workflowNodeResolveGate)
    await handler?.(
      {},
      {
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        expectedNodeRunRevision: 2,
        gate: { kind: 'approval', result: 'approved' }
      }
    )

    expect(handlers.resolveWorkflowNodeGate.execute).toHaveBeenCalledWith({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 2,
      gate: { kind: 'approval', result: 'approved' }
    })
  })

  it('rejects an invalid conversation kind before invoking the use case', () => {
    const handlers = createHandlers()
    const registered = new Map<string, (...args: unknown[]) => unknown>()
    registerBusinessIpc({
      handlers,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          registered.set(channel, handler)
        }
      } as never
    })

    const handler = registered.get(IPC_INVOKE_CHANNELS.conversationCreate)
    expect(() =>
      handler?.(
        {},
        {
          id: 'conversation-1',
          kind: 'requirement',
          title: 'Invalid',
          prompt: 'Hello'
        }
      )
    ).toThrow(
      `Invalid IPC payload for ${IPC_INVOKE_CHANNELS.conversationCreate}: command.kind`
    )
    expect(handlers.createConversation.execute).not.toHaveBeenCalled()
  })
})

function createHandlers(): BusinessCommandHandlers {
  const handler = (): { execute: ReturnType<typeof vi.fn> } => ({
    execute: vi.fn()
  })
  return {
    selectWorkRoot: handler(),
    listWorkRoots: handler(),
    createSpace: handler(),
    listSpaces: handler(),
    updateSpace: handler(),
    deleteSpace: handler(),
    restoreSpace: handler(),
    createRequirement: handler(),
    updateRequirement: handler(),
    deleteRequirement: handler(),
    restoreRequirement: handler(),
    getRequirementWorkflow: handler(),
    insertWorkflowNode: handler(),
    removeWorkflowNode: handler(),
    updateWorkflowEdge: handler(),
    reorderWorkflowNodes: handler(),
    getWorkflowNodeExecution: handler(),
    pauseWorkflowNode: handler(),
    resumeWorkflowNode: handler(),
    resolveWorkflowNodeGate: handler(),
    listRequirements: handler(),
    listWorkflowTemplates: handler(),
    listRecentConversations: handler(),
    listWorkspaceConversations: handler(),
    getConversation: handler(),
    createConversation: handler(),
    appendConversationMessage: handler(),
    listSpaceResources: handler(),
    saveSpaceResource: handler(),
    deleteSpaceResource: handler(),
    listNodeTodos: handler(),
    saveNodeTodo: handler(),
    listNodeQuestions: handler(),
    answerNodeQuestion: handler(),
    listModels: handler(),
    saveModelProvider: handler(),
    saveModelProfile: handler(),
    setModelCredential: handler(),
    listModelMetrics: handler()
  } as BusinessCommandHandlers
}
