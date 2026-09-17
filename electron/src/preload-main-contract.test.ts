import { vi } from 'vitest'
import type { RealmFlowApi } from '../../shared/types'
import {
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS,
  IPC_SEND_CHANNELS
} from '../../shared/ipc-contract'
import { registerMainIpc } from './ipc/register-main-ipc'
import { createRealmFlowApi } from './preload-api'

describe('preload and main IPC contract', () => {
  it('registers every channel invoked by the preload API', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const listeners = new Map<string, (...args: unknown[]) => unknown>()
    registerMainIpc({
      sidecar: { getStatus: vi.fn() },
      aiRuns: {
        generate: {
          execute: vi.fn().mockResolvedValue({
            runId: 'run-1',
            completion: Promise.resolve()
          })
        },
        cancel: { execute: vi.fn() },
        getRun: { execute: vi.fn() },
        listEvents: { execute: vi.fn() },
        publisher: { subscribe: vi.fn(), publish: vi.fn() }
      } as never,
      business: createBusinessMock() as never,
      quitApp: vi.fn(),
      persistence: {
        load: vi.fn()
      },
      workspace: createWorkspaceMock() as never,
      terminalManager: createTerminalMock() as never,
      nativeOverlayManager: createNativeOverlayMock() as never,
      webWorkbenchManager: createWebWorkbenchMock() as never,
      ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
          handlers.set(channel, handler),
        on: (channel: string, listener: (...args: unknown[]) => unknown) =>
          listeners.set(channel, listener)
      } as never,
      dialog: {} as never,
      shell: {} as never
    })

    const invoked: string[] = []
    const subscribed: string[] = []
    const api = createRealmFlowApi(
      {
        invoke: async (channel) => {
          invoked.push(channel)
          return undefined
        },
        on: (channel) => {
          subscribed.push(channel)
        },
        removeListener: vi.fn()
      },
      'darwin'
    )

    await invokeEveryApiCommand(api)
    api.nativeOverlay?.onEvent(vi.fn())
    api.aiRuns.onEvent(vi.fn())
    api.persistence.onChanged(vi.fn())
    api.webWorkbench.onStateChange(vi.fn())
    api.terminal.onEvent(vi.fn())

    expect(new Set(invoked)).toEqual(
      new Set(Object.values(IPC_INVOKE_CHANNELS))
    )
    expect(new Set(handlers.keys())).toEqual(new Set(invoked))
    expect(new Set(listeners.keys())).toEqual(
      new Set(Object.values(IPC_SEND_CHANNELS))
    )
    expect(new Set(subscribed)).toEqual(
      new Set(Object.values(IPC_EVENT_CHANNELS))
    )
  })
})

function createWorkspaceMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    [
      'openSessionFiles',
      'bindSessionDirectory',
      'bindRequirement',
      'getBinding',
      'listDirectory',
      'readFile',
      'writeFile',
      'readManifest',
      'writeManifest',
      'getPreviewUrl',
      'resolvePreviewPath'
    ].map((name) => [name, vi.fn()])
  )
}

function createBusinessMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    [
      'selectWorkRoot',
      'listWorkRoots',
      'createSpace',
      'listSpaces',
      'updateSpace',
      'deleteSpace',
      'restoreSpace',
      'createRequirement',
      'listRequirements',
      'updateRequirement',
      'deleteRequirement',
      'restoreRequirement',
      'listWorkflowTemplates',
      'getRequirementWorkflow',
      'insertWorkflowNode',
      'removeWorkflowNode',
      'updateWorkflowEdge',
      'reorderWorkflowNodes',
      'getWorkflowNodeExecution',
      'pauseWorkflowNode',
      'resumeWorkflowNode',
      'resolveWorkflowNodeGate',
      'listRecentConversations',
      'listWorkspaceConversations',
      'getConversation',
      'createConversation',
      'appendConversationMessage',
      'listSpaceResources',
      'saveSpaceResource',
      'deleteSpaceResource',
      'listNodeTodos',
      'saveNodeTodo',
      'listNodeQuestions',
      'answerNodeQuestion',
      'listModels',
      'setModelCredential',
      'listModelMetrics'
    ].map((name) => [name, vi.fn()])
  )
}

function createTerminalMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    ['create', 'write', 'resize', 'destroy', 'disposeOwner'].map((name) => [
      name,
      vi.fn()
    ])
  )
}

function createNativeOverlayMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    ['show', 'hide', 'select', 'close'].map((name) => [name, vi.fn()])
  )
}

function createWebWorkbenchMock(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    [
      'create',
      'show',
      'hideAll',
      'setBounds',
      'navigate',
      'goBack',
      'goForward',
      'reload',
      'destroy',
      'openExternal'
    ].map((name) => [name, vi.fn()])
  )
}

async function invokeEveryApiCommand(api: RealmFlowApi): Promise<void> {
  const bounds = { x: 0, y: 0, width: 300, height: 200 }
  const dimensions = { cols: 80, rows: 24 }
  const manifest = {
    version: 1 as const,
    requirementId: 'requirement-1',
    stages: {}
  }
  const business = (
    api as RealmFlowApi & { business: Record<string, Function> }
  ).business

  await Promise.all([
    api.getSidecarStatus(),
    api.aiRuns.start({
      requirementId: 'requirement-1',
      stageId: 'analysis'
    }),
    api.aiRuns.cancel('run-1'),
    api.aiRuns.get('run-1'),
    api.aiRuns.attach('run-1'),
    api.aiRuns.listEvents('run-1'),
    business.selectWorkRoot({
      id: 'root-1',
      path: '/work',
      expectedRevision: 0
    }),
    business.listWorkRoots(),
    business.createSpace({ id: 'space-1', name: 'Space' }),
    business.listSpaces(),
    business.updateSpace({
      id: 'space-1',
      expectedRevision: 1,
      label: 'Updated'
    }),
    business.deleteSpace({ id: 'space-1', expectedRevision: 1 }),
    business.restoreSpace({ id: 'space-1' }),
    business.createRequirement({
      id: 'requirement-1',
      workspaceId: 'space-1',
      title: 'Requirement',
      templateVersionId: 'builtin-sdlc-v1'
    }),
    business.listRequirements({ workspaceId: 'space-1' }),
    business.updateRequirement({
      id: 'requirement-1',
      expectedRevision: 1,
      status: 'active'
    }),
    business.deleteRequirement({
      id: 'requirement-1',
      expectedRevision: 1
    }),
    business.restoreRequirement({ id: 'requirement-1' }),
    business.listWorkflowTemplates(),
    business.getRequirementWorkflow({ requirementId: 'requirement-1' }),
    business.insertWorkflowNode({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      node: {
        id: 'node-1',
        type: 'ai_generate',
        name: 'Node',
        description: '',
        order: 1,
        status: 'pending',
        allowSkip: false
      }
    }),
    business.removeWorkflowNode({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      nodeId: 'node-1'
    }),
    business.updateWorkflowEdge({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      edgeId: 'edge-1',
      edge: {
        id: 'edge-1',
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2'
      }
    }),
    business.reorderWorkflowNodes({
      requirementId: 'requirement-1',
      expectedRevision: 1,
      orderedNodeIds: ['node-1']
    }),
    business.getWorkflowNodeExecution({
      requirementId: 'requirement-1',
      nodeId: 'node-1'
    }),
    business.pauseWorkflowNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedNodeRunRevision: 1
    }),
    business.resumeWorkflowNode({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedWorkflowRevision: 1,
      expectedNodeRunRevision: 1
    }),
    business.resolveWorkflowNodeGate({
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      expectedNodeRunRevision: 1,
      gate: { kind: 'approval', result: 'approved' }
    }),
    business.listRecentConversations(),
    business.listWorkspaceConversations({ workspaceId: 'space-1' }),
    business.getConversation({ sessionId: 'conversation-1' }),
    business.createConversation({
      id: 'conversation-1',
      kind: 'space',
      workspaceId: 'space-1',
      title: 'Conversation',
      prompt: 'Hello'
    }),
    business.appendConversationMessage({
      sessionId: 'conversation-1',
      messageId: 'message-2',
      content: 'Continue',
      expectedRevision: 1
    }),
    business.listSpaceResources({ workspaceId: 'space-1' }),
    business.saveSpaceResource({
      id: 'resource-1',
      workspaceId: 'space-1',
      name: 'Resource',
      type: 'document',
      locator: 'https://example.com',
      detail: 'example.com',
      sortOrder: 0,
      expectedRevision: 0,
      createdAt: 1,
      updatedAt: 1
    }),
    business.deleteSpaceResource({
      id: 'resource-1',
      expectedRevision: 1
    }),
    business.listNodeTodos({ nodeRunId: 'node-run-1' }),
    business.saveNodeTodo({
      id: 'todo-1',
      nodeRunId: 'node-run-1',
      title: 'Review',
      required: true,
      status: 'completed',
      expectedRevision: 1,
      createdAt: 1,
      updatedAt: 2
    }),
    business.listNodeQuestions({ nodeRunId: 'node-run-1' }),
    business.answerNodeQuestion({
      id: 'question-1',
      nodeRunId: 'node-run-1',
      answer: 'Approved',
      expectedRevision: 1
    }),
    business.listModels(),
    business.saveModelProvider({
      id: 'provider-1',
      type: 'openai_compatible',
      name: 'Example',
      baseUrl: 'https://api.example.com/v1',
      enabled: true,
      expectedRevision: 0
    }),
    business.saveModelProfile({
      id: 'profile-1',
      providerId: 'provider-1',
      modelId: 'example-model',
      displayName: 'Example Model',
      enabled: true,
      capabilities: {
        text: true,
        vision: false,
        toolCalling: true,
        structuredOutput: true
      },
      contextWindow: 128000,
      inputCostPerMillionTokens: 2,
      outputCostPerMillionTokens: 8,
      expectedRevision: 0
    }),
    business.setModelCredential({
      providerId: 'provider-1',
      value: 'secret'
    }),
    business.listModelMetrics({ workspaceId: 'space-1' }),
    api.quitApp(),
    api.nativeOverlay?.show({ kind: 'workbench-menu', anchor: bounds }),
    api.nativeOverlay?.hide('workbench-menu'),
    api.persistence.load('workspaceNavigation'),
    api.workspace.chooseFiles(),
    api.workspace.chooseFolder(),
    api.workspace.chooseDirectory('requirement-1'),
    api.workspace.getBinding('requirement-1'),
    api.workspace.listDirectory('requirement-1'),
    api.workspace.readFile('requirement-1', 'notes.md'),
    api.workspace.writeFile({
      requirementId: 'requirement-1',
      path: 'notes.md',
      content: 'content',
      expectedVersion: 'version-1'
    }),
    api.workspace.readManifest('requirement-1'),
    api.workspace.writeManifest('requirement-1', manifest),
    api.workspace.getPreviewUrl('requirement-1', 'notes.md'),
    api.workspace.showItem('requirement-1', 'notes.md'),
    api.webWorkbench.create('https://example.com'),
    api.webWorkbench.show('page-1', bounds),
    api.webWorkbench.hideAll(),
    api.webWorkbench.setBounds('page-1', bounds),
    api.webWorkbench.navigate('page-1', 'https://example.com'),
    api.webWorkbench.goBack('page-1'),
    api.webWorkbench.goForward('page-1'),
    api.webWorkbench.reload('page-1'),
    api.webWorkbench.destroy('page-1'),
    api.webWorkbench.openExternal('https://example.com'),
    api.terminal.create('requirement-1', dimensions),
    api.terminal.write('terminal-1', 'ls\r'),
    api.terminal.resize('terminal-1', dimensions),
    api.terminal.destroy('terminal-1')
  ])
}
