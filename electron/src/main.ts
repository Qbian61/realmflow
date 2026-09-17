import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { resolveAppIconPath } from './app-icon'
import { registerMainIpc } from './ipc/register-main-ipc'
import { NativeOverlayManager } from './overlay/native-overlay-manager'
import { SqlitePersistenceService } from './persistence/sqlite-persistence-service'
import { IPC_EVENT_CHANNELS } from '../../shared/ipc-contract'
import { SidecarManager } from './sidecar/manager'
import { TerminalManager } from './terminal/terminal-manager'
import { WebWorkbenchManager } from './workbench/web-workbench'
import { createArtifactProtocolHandler } from './workspace/artifact-protocol'
import { WorkspaceService } from './workspace/workspace-service'
import {
  CancelAiRunUseCase,
  GenerateStageArtifactUseCase
} from './ai-run/application/generate-stage-artifact'
import type { AiRunGateway } from './ai-run/application/ports'
import { RendererRunEventPublisher } from './ai-run/infrastructure/renderer-run-event-publisher'
import { WorkspaceStageContextRepository } from './ai-run/infrastructure/workspace-run-repositories'
import { AssembledNodeContextRepository } from './ai-run/infrastructure/assembled-node-context-repository'
import { SqliteArtifactRepository } from './ai-run/infrastructure/sqlite-artifact-repository'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './infrastructure/sqlite/database'
import { createSqliteRepositories } from './infrastructure/sqlite/repositories'
import { LegacyDataMigrator } from './infrastructure/sqlite/legacy-migrator'
import { RecoverInterruptedRunsUseCase } from './application/recover-interrupted-runs'
import {
  CreateSpaceUseCase,
  DeleteSpaceUseCase,
  RestoreSpaceUseCase,
  SelectWorkRootUseCase
} from './application/commands/manage-workspaces'
import {
  CreateRequirementUseCase,
  DeleteRequirementUseCase,
  RestoreRequirementUseCase
} from './application/commands/manage-requirements'
import { WorkflowRuntime } from './application/workflow/workflow-runtime'
import type { BusinessCommandHandlers } from '../../shared/business'
import {
  GetAiRunUseCase,
  ListAiRunEventsUseCase
} from './application/query-ai-runs'
import { SqliteWorkspaceMetadataStore } from './workspace/workspace-metadata-store'
import { CredentialVault } from './models/credential-vault'
import { ModelService } from './models/model-service'
import { RecoverInterruptedNodeRunsUseCase } from './application/workflow/recover-workflows'
import { SqliteNodeRunResumer } from './infrastructure/workflow/sqlite-node-run-resumer'
import { ManageNodeExecutionUseCase } from './application/workflow/manage-node-execution'
import { ExecuteWorkflowStageUseCase } from './application/workflow/execute-workflow-stage'
import { ExecuteWorkflowNodeUseCase } from './application/workflow/execute-workflow-node'
import { NodeCompletionGateEvaluator } from './application/workflow/node-completion-gate-evaluator'
import { AdvanceWorkflowUseCase } from './application/workflow/advance-workflow'
import { ReconcileWorkflowDispatchesUseCase } from './application/workflow/reconcile-workflow-dispatches'
import { ResolveNodeGateUseCase } from './application/workflow/resolve-node-gate'
import { ManageRequirementWorkflowUseCase } from './application/workflow/manage-requirement-workflow'
import { ControlWorkflowNodeUseCase } from './application/workflow/control-workflow-node'
import { SyncRequirementArtifactsUseCase } from './application/knowledge/sync-requirement-artifacts'
import { SqliteKnowledgeStore } from './infrastructure/sqlite/knowledge-store'
import { SendConversationMessageUseCase } from './application/conversation/send-conversation-message'
import { ContextAssembler } from './application/context/context-assembler'
import { SqliteContextSources } from './infrastructure/context/sqlite-context-sources'
import { NetworkGateway } from './network/network-gateway'
import {
  coordinateRepository,
  getSqliteConnectionCoordinator
} from './infrastructure/sqlite/connection-coordinator'

const sidecar = new SidecarManager()
const networkGateway = new NetworkGateway()
let mainWindow: BrowserWindow | null = null
let webWorkbench: WebWorkbenchManager | null = null
let terminalManager: TerminalManager | null = null
let nativeOverlayManager: NativeOverlayManager | null = null
let database: RealmFlowDatabase | null = null

const createSidecarRun: AiRunGateway['createRun'] = async (context, model) => {
  const sidecarModel = model ? networkGateway.authorize(model) : undefined
  try {
    return await sidecar.getClient().createRun(context, sidecarModel)
  } catch (error) {
    if (sidecarModel) networkGateway.revoke(sidecarModel)
    throw error
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'realmflow-artifact',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function createWindow(): void {
  const icon = resolveAppIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    cwd: process.cwd()
  })
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 920,
    minHeight: 620,
    title: 'RealmFlow',
    icon,
    backgroundColor: '#f1f1f1',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`Preload failed: ${preloadPath}`, error)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.on('closed', () => {
    nativeOverlayManager?.dispose()
    webWorkbench?.dispose()
    if (mainWindow === window) mainWindow = null
  })
  mainWindow = window

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app
  .whenReady()
  .then(async () => {
    if (process.platform === 'darwin') {
      app.dock.setIcon(
        resolveAppIconPath({
          isPackaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          cwd: process.cwd()
        })
      )
    }
    const userDataPath = app.getPath('userData')
    database = openRealmFlowDatabase(join(userDataPath, 'realmflow.db'))
    await new LegacyDataMigrator(database, {
      rendererStatePath: join(userDataPath, 'renderer-state.json'),
      bindingsPath: join(userDataPath, 'workspace-bindings.json'),
      backupDirectory: join(userDataPath, 'legacy-backups')
    }).migrate()
    const repositories = createSqliteRepositories(database)
    const sqliteCoordinator = getSqliteConnectionCoordinator(database)
    const modelService = new ModelService({
      modelPool: repositories.modelPool,
      credentials: repositories.modelCredentials,
      metrics: repositories.modelMetrics,
      vault: await CredentialVault.open(
        join(userDataPath, 'model-credentials.key')
      )
    })
    await new RecoverInterruptedRunsUseCase(repositories.aiRuns).execute()
    const workspace = new WorkspaceService(
      coordinateRepository(
        new SqliteWorkspaceMetadataStore(database),
        sqliteCoordinator
      )
    )
    const selectWorkRoot = new SelectWorkRootUseCase(
      repositories.workRoots,
      workspace
    )
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      workspace
    )
    const createRequirement = new CreateRequirementUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      repositories.nodeRuns,
      repositories.unitOfWork,
      workspace
    )
    const deleteSpace = new DeleteSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      workspace
    )
    const deleteRequirement = new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      workspace
    )
    const restoreSpace = new RestoreSpaceUseCase(
      repositories.workspaces,
      repositories.unitOfWork,
      workspace
    )
    const restoreRequirement = new RestoreRequirementUseCase(
      repositories.requirements,
      repositories.unitOfWork,
      workspace
    )
    const workflowRuntime = new WorkflowRuntime(
      repositories.requirementWorkflows
    )
    const manageRequirementWorkflow = new ManageRequirementWorkflowUseCase({
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      unitOfWork: repositories.unitOfWork
    })
    const artifactRepository = coordinateRepository(
      new SqliteArtifactRepository(database),
      sqliteCoordinator
    )
    const knowledgeStore = coordinateRepository(
      new SqliteKnowledgeStore(database),
      sqliteCoordinator
    )
    const syncRequirementArtifacts = new SyncRequirementArtifactsUseCase({
      requirements: {
        get: async (id) => {
          const requirement = await repositories.requirements.get(id)
          return requirement
            ? {
                id: requirement.id,
                workspaceId: requirement.workspaceId,
                status: requirement.status,
                syncCompletedArtifactsToKnowledge:
                  requirement.syncCompletedArtifactsToKnowledge ?? false
              }
            : undefined
        }
      },
      artifacts: artifactRepository,
      knowledge: knowledgeStore,
      jobs: knowledgeStore
    })
    const manageNodeExecution = new ManageNodeExecutionUseCase({
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      executions: repositories.workflowExecutions,
      nodeRuns: repositories.nodeRuns,
      dispatches: repositories.workflowDispatches,
      todos: repositories.nodeTodos,
      questions: repositories.nodeQuestions,
      unitOfWork: repositories.unitOfWork,
      knowledgeSync: syncRequirementArtifacts
    })
    const sendConversationMessage = new SendConversationMessageUseCase({
      sessions: repositories.chatSessions,
      gateway: {
        createRun: createSidecarRun,
        streamEvents: (runId, signal) =>
          sidecar.getClient().streamEvents(runId, signal)
      },
      models: modelService
    })
    const getWorkflowNodeExecution = async (input: {
      requirementId: string
      nodeId: string
    }) => {
      const execution =
        await repositories.workflowExecutions.getActiveByRequirement(
          input.requirementId
        )
      if (!execution) return undefined
      const nodeRun = await repositories.nodeRuns.getLatestByNode(
        execution.id,
        input.nodeId
      )
      return nodeRun ? { execution, nodeRun } : undefined
    }
    let controlWorkflowNode!: ControlWorkflowNodeUseCase
    let resolveWorkflowNodeGate!: ResolveNodeGateUseCase
    const business: BusinessCommandHandlers = {
      selectWorkRoot,
      listWorkRoots: { execute: () => repositories.workRoots.list() },
      createSpace,
      listSpaces: { execute: () => repositories.workspaces.list() },
      updateSpace: {
        execute: async (command) => {
          const current = await repositories.workspaces.get(command.id)
          if (!current) throw new Error(`Workspace not found: ${command.id}`)
          const result = await repositories.workspaces.save(
            {
              ...current,
              ...(command.label === undefined ? {} : { label: command.label }),
              ...(command.description === undefined
                ? {}
                : { description: command.description }),
              ...(command.sortOrder === undefined
                ? {}
                : { sortOrder: command.sortOrder }),
              updatedAt: Date.now()
            },
            command.expectedRevision
          )
          if (result.status === 'conflict') {
            throw new Error('Workspace revision conflict')
          }
          return result.entity
        }
      },
      deleteSpace: {
        execute: (command) => deleteSpace.execute(command)
      },
      restoreSpace: {
        execute: (command) => restoreSpace.execute(command)
      },
      createRequirement,
      listRequirements: {
        execute: ({ workspaceId }) =>
          repositories.requirements.listByWorkspace(workspaceId)
      },
      updateRequirement: {
        execute: async (command) => {
          const current = await repositories.requirements.get(command.id)
          if (!current) throw new Error(`Requirement not found: ${command.id}`)
          const result = await repositories.requirements.save(
            {
              ...current,
              ...(command.title === undefined ? {} : { title: command.title }),
              ...(command.status === undefined
                ? {}
                : { status: command.status }),
              ...(command.sortOrder === undefined
                ? {}
                : { sortOrder: command.sortOrder }),
              ...(command.syncCompletedArtifactsToKnowledge === undefined
                ? {}
                : {
                    syncCompletedArtifactsToKnowledge:
                      command.syncCompletedArtifactsToKnowledge
                  }),
              updatedAt: Date.now()
            },
            command.expectedRevision
          )
          if (result.status === 'conflict') {
            throw new Error('Requirement revision conflict')
          }
          return result.entity
        }
      },
      deleteRequirement: {
        execute: (command) => deleteRequirement.execute(command)
      },
      restoreRequirement: {
        execute: (command) => restoreRequirement.execute(command)
      },
      listWorkflowTemplates: {
        execute: () => repositories.workflowTemplates.listPublishedVersions()
      },
      getRequirementWorkflow: {
        execute: ({ requirementId }) =>
          repositories.requirementWorkflows.get(requirementId)
      },
      insertWorkflowNode: {
        execute: async (command) => {
          const result = await manageRequirementWorkflow.insertNode({
            requirementId: command.requirementId,
            expectedRevision: command.expectedRevision,
            mutation: {
              node: command.node,
              ...(command.afterNodeId
                ? { afterNodeId: command.afterNodeId }
                : {}),
              ...(command.beforeNodeId
                ? { beforeNodeId: command.beforeNodeId }
                : {})
            }
          })
          return result.workflow
        }
      },
      removeWorkflowNode: {
        execute: (command) => manageRequirementWorkflow.removeNode(command)
      },
      updateWorkflowEdge: {
        execute: (command) => workflowRuntime.updateEdge(command)
      },
      reorderWorkflowNodes: {
        execute: (command) => workflowRuntime.reorder(command)
      },
      getWorkflowNodeExecution: { execute: getWorkflowNodeExecution },
      pauseWorkflowNode: {
        execute: (command) => controlWorkflowNode.pause(command)
      },
      resumeWorkflowNode: {
        execute: (command) => controlWorkflowNode.resume(command)
      },
      resolveWorkflowNodeGate: {
        execute: (command) => resolveWorkflowNodeGate.execute(command)
      },
      listRecentConversations: {
        execute: () => repositories.chatSessions.listRecent()
      },
      listWorkspaceConversations: {
        execute: ({ workspaceId }) =>
          repositories.chatSessions.listByWorkspace(workspaceId)
      },
      getConversation: {
        execute: ({ sessionId }) => repositories.chatSessions.get(sessionId)
      },
      createConversation: {
        execute: async (command) => {
          if (command.kind === 'space' && !command.workspaceId) {
            throw new Error('Space conversations require a workspace')
          }
          if (
            command.kind === 'requirement_node' &&
            (!command.requirementId || !command.nodeRunId)
          ) {
            throw new Error(
              'Requirement node conversations require a requirement and node run'
            )
          }
          const now = Date.now()
          const result = await repositories.chatSessions.save(
            {
              id: command.id,
              kind: command.kind,
              ...(command.workspaceId
                ? { workspaceId: command.workspaceId }
                : {}),
              ...(command.requirementId
                ? { requirementId: command.requirementId }
                : {}),
              ...(command.nodeRunId ? { nodeRunId: command.nodeRunId } : {}),
              ...(command.folderPath ? { folderPath: command.folderPath } : {}),
              title: command.title,
              sortOrder: now,
              messages: [],
              createdAt: now,
              updatedAt: now
            },
            0
          )
          if (result.status === 'conflict') {
            throw new Error('Conversation already exists')
          }
          return sendConversationMessage.execute({
            sessionId: command.id,
            content: command.prompt,
            expectedRevision: result.entity.revision,
            messageId: `${command.id}:message:1`,
            ...(command.modelProfileId
              ? { modelProfileId: command.modelProfileId }
              : {})
          })
        }
      },
      appendConversationMessage: {
        execute: (command) =>
          sendConversationMessage.execute({
            sessionId: command.sessionId,
            content: command.content,
            expectedRevision: command.expectedRevision,
            messageId: command.messageId,
            ...(command.modelProfileId
              ? { modelProfileId: command.modelProfileId }
              : {})
          })
      },
      listSpaceResources: {
        execute: ({ workspaceId }) =>
          repositories.spaceResources.listByWorkspace(workspaceId)
      },
      saveSpaceResource: {
        execute: async ({ expectedRevision, ...resource }) => {
          const result = await repositories.spaceResources.save(
            resource,
            expectedRevision
          )
          if (result.status === 'conflict') {
            throw new Error('Space resource revision conflict')
          }
          return result.entity
        }
      },
      deleteSpaceResource: {
        execute: (command) =>
          repositories.spaceResources.delete(
            command.id,
            command.expectedRevision
          )
      },
      listNodeTodos: {
        execute: ({ nodeRunId }) =>
          repositories.nodeTodos.listByNodeRun(nodeRunId)
      },
      saveNodeTodo: {
        execute: async ({ expectedRevision, ...todo }) => {
          if (todo.status === 'completed') {
            await manageNodeExecution.completeTodo({
              nodeRunId: todo.nodeRunId,
              todoId: todo.id,
              expectedRevision
            })
            const saved = (
              await repositories.nodeTodos.listByNodeRun(todo.nodeRunId)
            ).find((item) => item.id === todo.id)
            if (!saved) throw new Error(`Node todo not found: ${todo.id}`)
            return saved
          }
          const result = await repositories.nodeTodos.save(
            todo,
            expectedRevision
          )
          if (result.status === 'conflict') {
            throw new Error('Node todo revision conflict')
          }
          return result.entity
        }
      },
      listNodeQuestions: {
        execute: ({ nodeRunId }) =>
          repositories.nodeQuestions.listByNodeRun(nodeRunId)
      },
      answerNodeQuestion: {
        execute: async (command) => {
          await manageNodeExecution.answerQuestion({
            nodeRunId: command.nodeRunId,
            questionId: command.id,
            expectedRevision: command.expectedRevision,
            answer: command.answer
          })
          const saved = (
            await repositories.nodeQuestions.listByNodeRun(command.nodeRunId)
          ).find((item) => item.id === command.id)
          if (!saved) throw new Error(`Node question not found: ${command.id}`)
          return saved
        }
      },
      listModels: { execute: () => modelService.listModels() },
      saveModelProvider: {
        execute: ({ expectedRevision, ...provider }) =>
          modelService.saveProvider(provider, expectedRevision)
      },
      saveModelProfile: {
        execute: ({ expectedRevision, ...profile }) =>
          modelService.saveProfile(profile, expectedRevision)
      },
      setModelCredential: {
        execute: ({ providerId, value }) =>
          modelService.setCredential(providerId, value)
      },
      listModelMetrics: {
        execute: (filters) => repositories.modelMetrics.list(filters)
      }
    }
    const persistence = coordinateRepository(
      new SqlitePersistenceService(database, (event) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(IPC_EVENT_CHANNELS.persistenceChanged, event)
        }
      }),
      sqliteCoordinator
    )
    const runs = repositories.aiRuns
    const runEvents = new RendererRunEventPublisher()
    const runGateway: AiRunGateway = {
      createRun: createSidecarRun,
      streamEvents: (runId, signal) =>
        sidecar.getClient().streamEvents(runId, signal),
      cancelRun: (runId) => sidecar.getClient().cancelRun(runId)
    }
    const legacyContexts = new WorkspaceStageContextRepository(
      persistence,
      workspace
    )
    const contextSources = coordinateRepository(
      new SqliteContextSources(database, workspace),
      sqliteCoordinator
    )
    const contextAssembler = new ContextAssembler({
      artifacts: contextSources,
      knowledge: contextSources,
      questions: {
        listByNodeRun: async (nodeRunId) =>
          (await repositories.nodeQuestions.listByNodeRun(nodeRunId)).map(
            (question) => ({ ...question, version: question.revision })
          )
      },
      todos: {
        listByNodeRun: async (nodeRunId) =>
          (await repositories.nodeTodos.listByNodeRun(nodeRunId)).map(
            (todo) => ({
              ...todo,
              version: todo.revision
            })
          )
      },
      attachments: {
        read: async (requirementId, path) => {
          const file = await workspace.readFile(requirementId, path)
          return {
            version: Math.trunc(file.modifiedAt),
            content: file.content
          }
        }
      }
    })
    const contexts = new AssembledNodeContextRepository({
      legacy: legacyContexts,
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      assembler: contextAssembler,
      workspace: {
        getBinding: (requirementId) => workspace.getBinding(requirementId),
        readRequirementBody: async (requirementId) => {
          const requirement = await repositories.requirements.get(requirementId)
          if (!requirement?.bodyRelativePath) return ''
          return (
            await workspace.readFile(
              requirementId,
              requirement.bodyRelativePath
            )
          ).content
        },
        listAttachmentPaths: async (requirementId) =>
          (
            await workspace
              .listDirectory(requirementId, 'attachments')
              .catch(() => [])
          )
            .filter((entry) => entry.type === 'file')
            .map((entry) => entry.path)
      }
    })
    const generateStageArtifact = new GenerateStageArtifactUseCase({
      runs,
      gateway: runGateway,
      contexts,
      artifacts: artifactRepository,
      publisher: runEvents,
      models: modelService
    })
    const executeWorkflowStage = new ExecuteWorkflowStageUseCase({
      generate: generateStageArtifact,
      runs,
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      manager: manageNodeExecution
    })
    const cancelAiRun = new CancelAiRunUseCase({
      runs,
      gateway: runGateway,
      publisher: runEvents
    })
    let advanceWorkflow!: AdvanceWorkflowUseCase
    const executeWorkflowNode = new ExecuteWorkflowNodeUseCase({
      generate: {
        execute: (input) => generateStageArtifact.executeNode(input)
      },
      cancel: cancelAiRun,
      runs,
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      gateEvaluator: new NodeCompletionGateEvaluator({
        artifacts: repositories.artifacts
      }),
      advance: {
        drain: () => advanceWorkflow.drain()
      },
      manager: manageNodeExecution
    })
    advanceWorkflow = new AdvanceWorkflowUseCase({
      dispatches: repositories.workflowDispatches,
      executions: repositories.workflowExecutions,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      executeNode: executeWorkflowNode
    })
    resolveWorkflowNodeGate = new ResolveNodeGateUseCase({
      requirements: repositories.requirements,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      unitOfWork: repositories.unitOfWork,
      evaluator: new NodeCompletionGateEvaluator({
        artifacts: repositories.artifacts
      }),
      manager: manageNodeExecution,
      worker: advanceWorkflow
    })
    controlWorkflowNode = new ControlWorkflowNodeUseCase({
      manager: manageNodeExecution,
      nodeRuns: repositories.nodeRuns,
      workflows: repositories.requirementWorkflows,
      cancel: cancelAiRun,
      executeNode: executeWorkflowNode
    })
    await networkGateway.start()
    await sidecar.start()
    await new RecoverInterruptedNodeRunsUseCase(
      repositories.nodeRuns,
      coordinateRepository(
        new SqliteNodeRunResumer(database, executeWorkflowNode),
        sqliteCoordinator
      )
    ).execute()
    await new ReconcileWorkflowDispatchesUseCase({
      executions: repositories.workflowExecutions,
      workflows: repositories.requirementWorkflows,
      nodeRuns: repositories.nodeRuns,
      dispatches: repositories.workflowDispatches,
      worker: advanceWorkflow
    }).execute()
    terminalManager = new TerminalManager({ workspace })
    nativeOverlayManager = new NativeOverlayManager({
      getHostWindow: () => mainWindow,
      preloadPath: join(__dirname, '../preload/native-overlay-preload.cjs'),
      rendererUrl: process.env.ELECTRON_RENDERER_URL,
      rendererFile: join(__dirname, '../renderer/index.html')
    })
    webWorkbench = new WebWorkbenchManager(() => mainWindow)
    registerMainIpc({
      sidecar,
      aiRuns: {
        executeNode: executeWorkflowNode,
        executeStage: executeWorkflowStage,
        cancel: cancelAiRun,
        getRun: new GetAiRunUseCase(runs),
        listEvents: new ListAiRunEventsUseCase(runs),
        publisher: runEvents
      },
      business,
      quitApp: () => app.quit(),
      persistence,
      workspace,
      terminalManager,
      nativeOverlayManager,
      webWorkbenchManager: webWorkbench,
      ipcMain,
      dialog,
      shell
    })
    protocol.handle(
      'realmflow-artifact',
      createArtifactProtocolHandler(workspace)
    )
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('RealmFlow initialization failed', error)
    dialog.showErrorBox(
      'RealmFlow 无法启动',
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
  })

app.on('before-quit', () => {
  nativeOverlayManager?.dispose()
  terminalManager?.dispose()
  sidecar.stop()
  void networkGateway.stop()
  database?.close()
  database = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
