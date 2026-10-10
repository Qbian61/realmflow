import {
  IPC_COMMAND_CHANNELS,
  IPC_EVENT_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../shared/ipc-contract'
import type { RealmFlowApi } from '../../shared/types'

type IpcRendererBridge = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (
    channel: string,
    listener: (event: unknown, payload: unknown) => void
  ) => void
  removeListener: (
    channel: string,
    listener: (event: unknown, payload: unknown) => void
  ) => void
}

export function createRealmFlowApi(
  ipcRenderer: IpcRendererBridge,
  platform: NodeJS.Platform
): RealmFlowApi {
  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>

  return {
    platform,
    getSidecarStatus: () => invoke(IPC_QUERY_CHANNELS.sidecarGetStatus),
    agentRuntime: {
      get: (runId) => invoke(IPC_QUERY_CHANNELS.agentRuntimeGet, { runId }),
      updateGoal: (command) => invoke(IPC_COMMAND_CHANNELS.agentRuntimeUpdateGoal, command),
      steer: (command) => invoke(IPC_COMMAND_CHANNELS.agentRuntimeSteer, command),
      cancel: (command) => invoke(IPC_COMMAND_CHANNELS.agentRuntimeCancel, command)
    },
    conversationAttachments: {
      pick: (command) =>
        invoke(IPC_COMMAND_CHANNELS.conversationAttachmentPick, command),
      remove: (command) =>
        invoke(IPC_COMMAND_CHANNELS.conversationAttachmentRemove, command)
    },
    workbenchHub: {
      layout: {
        get: () => invoke(IPC_QUERY_CHANNELS.workbenchLayoutGet),
        update: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchLayoutUpdate, command)
      },
      dashboard: {
        getSnapshot: (query = {}) =>
          invoke(IPC_QUERY_CHANNELS.workbenchDashboardGet, query),
        onInvalidated: (listener) =>
          subscribe(
            ipcRenderer,
            IPC_EVENT_CHANNELS.workbenchDashboardInvalidated,
            listener
          )
      },
      attachments: {
        list: (query) =>
          invoke(IPC_QUERY_CHANNELS.workbenchAttachmentList, query),
        pickAndAttach: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchAttachmentPick, command),
        readImage: (attachmentId) =>
          invoke(
            IPC_QUERY_CHANNELS.workbenchAttachmentReadImage,
            attachmentId
          ),
        open: (attachmentId) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchAttachmentOpen, attachmentId),
        reveal: (attachmentId) =>
          invoke(
            IPC_COMMAND_CHANNELS.workbenchAttachmentReveal,
            attachmentId
          ),
        delete: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchAttachmentDelete, command)
      },
      memos: {
        getMemos: () =>
          invoke(IPC_QUERY_CHANNELS.workbenchMemoList),
        getDeletedMemos: () =>
          invoke(IPC_QUERY_CHANNELS.workbenchMemoDeletedList),
        createMemo: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchMemoCreate, command),
        updateMemo: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchMemoUpdate, command),
        deleteMemo: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchMemoDelete, command),
        restoreMemo: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchMemoRestore, command)
      },
      sites: {
        getSnapshot: () =>
          invoke(IPC_QUERY_CHANNELS.workbenchSiteSnapshotGet),
        createGroup: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchSiteGroupCreate, command),
        updateGroup: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchSiteGroupUpdate, command),
        deleteGroup: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchSiteGroupDelete, command),
        createSite: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchSiteCreate, command),
        updateSite: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchSiteUpdate, command),
        deleteSite: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchSiteDelete, command)
      },
      tasks: {
        listTables: () =>
          invoke(IPC_QUERY_CHANNELS.workbenchTaskTableList),
        getTable: (tableId, query = {}) =>
          invoke(IPC_QUERY_CHANNELS.workbenchTaskTableGet, {
            tableId,
            ...query
          }),
        createTable: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskTableCreate, command),
        updateTable: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskTableUpdate, command),
        deleteTable: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskTableDelete, command),
        duplicateTable: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskTableDuplicate, command),
        createField: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskFieldCreate, command),
        updateField: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskFieldUpdate, command),
        deleteField: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskFieldDelete, command),
        createRecord: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskRecordCreate, command),
        updateRecord: (command) =>
          invoke(IPC_COMMAND_CHANNELS.workbenchTaskRecordUpdate, command),
        bulkDeleteRecords: (command) =>
          invoke(
            IPC_COMMAND_CHANNELS.workbenchTaskRecordBulkDelete,
            command
          )
      },
      system: {
        getStatus: () => invoke(IPC_QUERY_CHANNELS.workbenchSystemGet)
      }
    },
    aiRuns: {
      start: (input) => invoke(IPC_COMMAND_CHANNELS.aiRunStart, input),
      cancel: (runId) => invoke(IPC_COMMAND_CHANNELS.aiRunCancel, { runId }),
      get: (runId) => invoke(IPC_QUERY_CHANNELS.aiRunGet, { runId }),
      attach: (runId) => invoke(IPC_COMMAND_CHANNELS.aiRunAttach, { runId }),
      recover: (runId, action) =>
        invoke(IPC_COMMAND_CHANNELS.aiRunRecover, { runId, action }),
      listEvents: (runId) =>
        invoke(IPC_QUERY_CHANNELS.aiRunListEvents, { runId }),
      onEvent: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.aiRunEvent, listener)
    },
    business: {
      chooseWorkRoot: () => invoke(IPC_COMMAND_CHANNELS.settingsChooseWorkRoot),
      selectWorkRoot: (command) =>
        invoke(IPC_COMMAND_CHANNELS.settingsSelectWorkRoot, command),
      listWorkRoots: () => invoke(IPC_QUERY_CHANNELS.settingsListWorkRoots),
      createSpace: (command) =>
        invoke(IPC_COMMAND_CHANNELS.spaceCreate, command),
      listSpaces: () => invoke(IPC_QUERY_CHANNELS.spaceList),
      updateSpace: (command) =>
        invoke(IPC_COMMAND_CHANNELS.spaceUpdate, command),
      renameSpaceDirectory: (command) =>
        invoke(IPC_COMMAND_CHANNELS.spaceRenameDirectory, command),
      chooseSpaceRelocation: (command) =>
        invoke(IPC_COMMAND_CHANNELS.spaceChooseRelocation, command),
      relocateSpace: (command) =>
        invoke(IPC_COMMAND_CHANNELS.spaceRelocate, command),
      deleteSpace: (command) =>
        invoke(IPC_COMMAND_CHANNELS.spaceDelete, command),
      restoreSpace: (command) =>
        invoke(IPC_COMMAND_CHANNELS.spaceRestore, command),
      purgeSpace: (command) => invoke(IPC_COMMAND_CHANNELS.spacePurge, command),
      createRequirement: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementCreate, command),
      listRequirements: (command) =>
        invoke(IPC_QUERY_CHANNELS.requirementList, command),
      updateRequirement: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementUpdate, command),
      renameRequirementDirectory: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementRenameDirectory, command),
      deleteRequirement: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementDelete, command),
      restoreRequirement: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementRestore, command),
      purgeRequirement: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementPurge, command),
      listTrashItems: () => invoke(IPC_QUERY_CHANNELS.trashList),
      listWorkflowTemplates: () =>
        invoke(IPC_QUERY_CHANNELS.workflowTemplateList),
      listWorkflowTemplateLibrary: () =>
        invoke(IPC_QUERY_CHANNELS.workflowTemplateLibraryList),
      listWorkflowTemplateVersions: (query) =>
        invoke(IPC_QUERY_CHANNELS.workflowTemplateVersionList, query),
      getWorkflowTemplateVersion: (query) =>
        invoke(IPC_QUERY_CHANNELS.workflowTemplateVersionGet, query),
      getWorkflowTemplateDraft: (query) =>
        invoke(IPC_QUERY_CHANNELS.workflowTemplateDraftGet, query),
      listTemplateMigrationCandidates: (query) =>
        invoke(IPC_QUERY_CHANNELS.templateMigrationCandidateList, query),
      previewTemplateMigration: (query) =>
        invoke(IPC_QUERY_CHANNELS.templateMigrationPreview, query),
      createWorkflowTemplate: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateCreate, command),
      copyWorkflowTemplate: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateCopy, command),
      updateWorkflowTemplate: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateUpdate, command),
      createWorkflowTemplateVersion: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateVersionCreate, command),
      publishWorkflowTemplate: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplatePublish, command),
      archiveWorkflowTemplate: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateArchive, command),
      addWorkflowTemplateNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateNodeAdd, command),
      copyWorkflowTemplateNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateNodeCopy, command),
      updateWorkflowTemplateNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateNodeUpdate, command),
      configureWorkflowTemplateNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateNodeConfigure, command),
      removeWorkflowTemplateNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateNodeRemove, command),
      restoreWorkflowTemplateNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateNodeRestore, command),
      reorderWorkflowTemplateNodes: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateNodeReorder, command),
      updateWorkflowTemplateNodePositions: (command) =>
        invoke(
          IPC_COMMAND_CHANNELS.workflowTemplateNodeUpdatePositions,
          command
        ),
      addWorkflowTemplateEdge: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateEdgeAdd, command),
      removeWorkflowTemplateEdge: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowTemplateEdgeRemove, command),
      applyTemplateMigration: (command) =>
        invoke(IPC_COMMAND_CHANNELS.templateMigrationApply, command),
      getRequirementWorkflow: (command) =>
        invoke(IPC_QUERY_CHANNELS.requirementWorkflowGet, command),
      getRequirementExecutionView: (query) =>
        invoke(IPC_QUERY_CHANNELS.requirementExecutionViewGet, query),
      listRequirementWorkflowRevisions: (command) =>
        invoke(IPC_QUERY_CHANNELS.requirementWorkflowRevisionList, command),
      insertWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementWorkflowInsertNode, command),
      updateWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementWorkflowUpdateNode, command),
      removeWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementWorkflowRemoveNode, command),
      updateWorkflowEdge: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementWorkflowUpdateEdge, command),
      reorderWorkflowNodes: (command) =>
        invoke(IPC_COMMAND_CHANNELS.requirementWorkflowReorder, command),
      setWorkflowParallelism: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowSetParallelism, command),
      getWorkflowNodeExecution: (command) =>
        invoke(IPC_QUERY_CHANNELS.workflowNodeExecutionGet, command),
      startWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowNodeStart, command),
      pauseWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowNodePause, command),
      resumeWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowNodeResume, command),
      cancelWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowNodeCancel, command),
      retryWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowNodeRetry, command),
      rollbackWorkflowToNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowRollbackToNode, command),
      prepareWorkflowNodeContext: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowNodePreviewContext, command),
      skipWorkflowNode: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowNodeSkip, command),
      resolveWorkflowNodeGate: (command) =>
        invoke(IPC_COMMAND_CHANNELS.workflowNodeResolveGate, command),
      listRecentConversations: (query) =>
        invoke(IPC_QUERY_CHANNELS.conversationListRecent, query),
      listWorkspaceConversations: (command) =>
        invoke(IPC_QUERY_CHANNELS.conversationListByWorkspace, command),
      getConversation: (command) =>
        invoke(IPC_QUERY_CHANNELS.conversationGet, command),
      renameConversation: (command) =>
        invoke(IPC_COMMAND_CHANNELS.conversationRename, command),
      deleteConversation: (command) =>
        invoke(IPC_COMMAND_CHANNELS.conversationDelete, command),
      createConversation: (command) =>
        invoke(IPC_COMMAND_CHANNELS.conversationCreate, command),
      appendConversationMessage: (command) =>
        invoke(IPC_COMMAND_CHANNELS.conversationAppendMessage, command),
      sendFollowUpSuggestion: (command) =>
        invoke(
          IPC_COMMAND_CHANNELS.conversationSendFollowUpSuggestion,
          command
        ),
      onConversationEvent: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.conversationEvent, listener),
      listKnowledgeSources: (query) =>
        invoke(IPC_QUERY_CHANNELS.knowledgeSourceList, query),
      listKnowledgeSourceEvents: (query) =>
        invoke(IPC_QUERY_CHANNELS.knowledgeSourceEventList, query),
      getOnlineDocumentSnapshot: (query) =>
        invoke(IPC_QUERY_CHANNELS.onlineDocumentSnapshotGet, query),
      getRepositorySnapshot: (query) =>
        invoke(IPC_QUERY_CHANNELS.repositorySnapshotGet, query),
      listRepositoryBranches: (query) =>
        invoke(IPC_QUERY_CHANNELS.repositoryBranchList, query),
      getKnowledgeIndex: (query) =>
        invoke(IPC_QUERY_CHANNELS.knowledgeIndexGet, query),
      getKnowledgeRuntimeHealth: () =>
        invoke(IPC_QUERY_CHANNELS.knowledgeRuntimeHealthGet),
      listKnowledgeNotes: (query) =>
        invoke(IPC_QUERY_CHANNELS.knowledgeNoteList, query),
      searchKnowledge: (query) =>
        invoke(IPC_QUERY_CHANNELS.knowledgeSearch, query),
      searchCatalog: (query) =>
        invoke(IPC_QUERY_CHANNELS.catalogSearch, query),
      createKnowledgeNote: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeNoteCreate, command),
      editKnowledgeNote: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeNoteEdit, command),
      archiveKnowledgeNote: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeNoteArchive, command),
      registerKnowledgeSource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceRegister, command),
      ingestLocalFiles: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceIngestLocalFiles, command),
      refreshLocalFileSource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceRefreshLocalFile, command),
      openLocalFileSource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceOpenLocalFile, command),
      ingestLocalRepository: (command) =>
        invoke(
          IPC_COMMAND_CHANNELS.knowledgeSourceIngestLocalRepository,
          command
        ),
      ingestRemoteRepository: (command) =>
        invoke(
          IPC_COMMAND_CHANNELS.knowledgeSourceIngestRemoteRepository,
          command
        ),
      refreshRepositorySource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceRefreshRepository, command),
      updateRepositoryBranch: (command) =>
        invoke(IPC_COMMAND_CHANNELS.repositoryUpdateBranch, command),
      retryRepositoryFileIndex: (command) =>
        invoke(IPC_COMMAND_CHANNELS.repositoryRetryFileIndex, command),
      buildKnowledgeIndex: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceBuildIndex, command),
      refreshKnowledgeSource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceRefresh, command),
      setKnowledgeRefreshPolicy: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeRefreshPolicySet, command),
      createOnlineDocumentSource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.onlineDocumentSourceCreate, command),
      syncOnlineDocumentSource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.onlineDocumentSourceSync, command),
      retryKnowledgeSource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceRetry, command),
      removeKnowledgeSource: (command) =>
        invoke(IPC_COMMAND_CHANNELS.knowledgeSourceRemove, command),
      listNodeTodos: (command) =>
        invoke(IPC_QUERY_CHANNELS.nodeTodoList, command),
      saveNodeTodo: (command) =>
        invoke(IPC_COMMAND_CHANNELS.nodeTodoSave, command),
      deleteNodeTodo: (command) =>
        invoke(IPC_COMMAND_CHANNELS.nodeTodoDelete, command),
      listNodeQuestions: (command) =>
        invoke(IPC_QUERY_CHANNELS.nodeQuestionList, command),
      openNodeQuestion: (command) =>
        invoke(IPC_COMMAND_CHANNELS.nodeQuestionOpen, command),
      answerNodeQuestion: (command) =>
        invoke(IPC_COMMAND_CHANNELS.nodeQuestionAnswer, command),
      dismissNodeQuestion: (command) =>
        invoke(IPC_COMMAND_CHANNELS.nodeQuestionDismiss, command),
      listModels: () => invoke(IPC_QUERY_CHANNELS.modelList),
      listEffectiveModels: () => invoke(IPC_QUERY_CHANNELS.modelEffectiveList),
      getApplicationModelDefault: () =>
        invoke(IPC_QUERY_CHANNELS.modelDefaultGet),
      discoverModelProviders: () =>
        invoke(IPC_QUERY_CHANNELS.modelProviderDiscover),
      listConnectors: () => invoke(IPC_QUERY_CHANNELS.connectorList),
      saveConnector: (command) =>
        invoke(IPC_COMMAND_CHANNELS.connectorSave, command),
      deleteConnector: (command) =>
        invoke(IPC_COMMAND_CHANNELS.connectorDelete, command),
      validateConnector: (command) =>
        invoke(IPC_COMMAND_CHANNELS.connectorValidate, command),
      listSchedules: () => invoke(IPC_QUERY_CHANNELS.scheduleList),
      listScheduleRuns: (query) =>
        invoke(IPC_QUERY_CHANNELS.scheduleRunList, query),
      createSchedule: (command) =>
        invoke(IPC_COMMAND_CHANNELS.scheduleCreate, command),
      updateSchedule: (command) =>
        invoke(IPC_COMMAND_CHANNELS.scheduleUpdate, command),
      pauseSchedule: (command) =>
        invoke(IPC_COMMAND_CHANNELS.schedulePause, command),
      resumeSchedule: (command) =>
        invoke(IPC_COMMAND_CHANNELS.scheduleResume, command),
      runScheduleNow: (command) =>
        invoke(IPC_COMMAND_CHANNELS.scheduleRunNow, command),
      deleteSchedule: (command) =>
        invoke(IPC_COMMAND_CHANNELS.scheduleDelete, command),
      routeModel: (request) =>
        invoke(IPC_QUERY_CHANNELS.modelRouteResolve, request),
      saveModelProvider: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelProviderSave, command),
      configureBuiltinModelProvider: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelBuiltinProviderConfigure, command),
      configureDiscoveredModelProvider: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelDiscoveredProviderConfigure, command),
      deleteModelProvider: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelProviderDelete, command),
      removeModelProviderCredential: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelProviderCredentialRemove, command),
      rotateModelCredentialKey: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelCredentialKeyRotate, command),
      saveModelProfile: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelProfileSave, command),
      deleteModelProfile: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelProfileDelete, command),
      setModelProfilesEnabled: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelProfilesSetEnabled, command),
      validateModelProfile: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelProfileValidate, command),
      saveApplicationModelDefault: (command) =>
        invoke(IPC_COMMAND_CHANNELS.modelDefaultSave, command),
      queryModelStatistics: (query) =>
        invoke(IPC_QUERY_CHANNELS.modelStatisticsQuery, query),
      queryProductAnalytics: (query) =>
        invoke(IPC_QUERY_CHANNELS.productAnalyticsQuery, query),
      queryOutboundCallAudit: (query) =>
        invoke(IPC_QUERY_CHANNELS.outboundCallAuditQuery, query),
      getAppSupportInfo: () => invoke(IPC_QUERY_CHANNELS.appSupportGetInfo),
      checkForUpdates: (command) =>
        invoke(IPC_COMMAND_CHANNELS.appSupportCheckUpdate, command),
      openSupportLink: (command) =>
        invoke(IPC_COMMAND_CHANNELS.appSupportOpenLink, command),
      getBackupStatus: () => invoke(IPC_QUERY_CHANNELS.backupGetStatus),
      chooseBackupDestination: (command) =>
        invoke(IPC_COMMAND_CHANNELS.backupChooseDestination, command),
      chooseRestoreBundle: () =>
        invoke(IPC_COMMAND_CHANNELS.restoreChooseBundle),
      prepareRestore: (command) =>
        invoke(IPC_COMMAND_CHANNELS.restorePrepare, command),
      restartForRestore: () => invoke(IPC_COMMAND_CHANNELS.restoreRestart)
    },
    webProviders: {
      get: () => invoke(IPC_QUERY_CHANNELS.webProviderGet),
      save: (command) => invoke(IPC_COMMAND_CHANNELS.webProviderSave, command),
    },
    toolPolicy: {
      get: (query) => invoke(IPC_QUERY_CHANNELS.toolPolicyGet, query),
      preview: (query) => invoke(IPC_QUERY_CHANNELS.toolPolicyPreview, query),
      save: (command) => invoke(IPC_COMMAND_CHANNELS.toolPolicySave, command),
    },
    toolCatalog: {
      list: (query) => invoke(IPC_QUERY_CHANNELS.toolCatalogList, query),
      chooseAndImport: (command) =>
        invoke(IPC_COMMAND_CHANNELS.toolCatalogChooseAndImport, command),
      setActivation: (command) =>
        invoke(IPC_COMMAND_CHANNELS.toolCatalogSetActivation, command),
      changePackageVersion: (command) =>
        invoke(
          IPC_COMMAND_CHANNELS.toolCatalogChangePackageVersion,
          command
        ),
      listMcpServers: () => invoke(IPC_QUERY_CHANNELS.mcpServerList),
      saveMcpServer: (command) =>
        invoke(IPC_COMMAND_CHANNELS.mcpServerSave, command),
      deleteMcpServer: (command) =>
        invoke(IPC_COMMAND_CHANNELS.mcpServerDelete, command),
      testMcpServer: (command) =>
        invoke(IPC_COMMAND_CHANNELS.mcpServerTest, command),
      discoverMcpServer: (command) =>
        invoke(IPC_COMMAND_CHANNELS.mcpServerDiscover, command)
    },
    skillRegistry: {
      list: () => invoke(IPC_QUERY_CHANNELS.skillRegistryList),
      synchronize: () =>
        invoke(IPC_COMMAND_CHANNELS.skillRegistrySynchronize),
      review: (command) =>
        invoke(IPC_COMMAND_CHANNELS.skillRegistryReview, command),
      setActivation: (command) =>
        invoke(IPC_COMMAND_CHANNELS.skillRegistrySetActivation, command)
    },
    toolPermissions: {
      listPending: () =>
        invoke(IPC_QUERY_CHANNELS.toolPermissionListPending),
      resolve: (command) =>
        invoke(IPC_COMMAND_CHANNELS.toolPermissionResolve, command),
      onChanged: (listener) =>
        subscribe(
          ipcRenderer,
          IPC_EVENT_CHANNELS.toolPermissionChanged,
          listener
        )
    },
    capabilityCatalog: {
      list: (query) =>
        invoke(IPC_QUERY_CHANNELS.capabilityCatalogList, query),
      chooseAndPrepare: (command) =>
        invoke(
          IPC_COMMAND_CHANNELS.capabilityPackageChooseAndPrepare,
          command
        ),
      install: (command) =>
        invoke(IPC_COMMAND_CHANNELS.capabilityPackageInstall, command),
      discard: (proposalId) =>
        invoke(IPC_COMMAND_CHANNELS.capabilityPackageDiscard, proposalId),
      setEnabled: (command) =>
        invoke(IPC_COMMAND_CHANNELS.capabilitySetEnabled, command),
      changeVersion: (command) =>
        invoke(IPC_COMMAND_CHANNELS.capabilityChangeVersion, command),
      delete: (command) =>
        invoke(IPC_COMMAND_CHANNELS.capabilityDelete, command)
    },
    capabilityBuilder: {
      createDraft: (command) =>
        invoke(IPC_COMMAND_CHANNELS.capabilityBuilderCreate, command),
      getSession: (sessionId) =>
        invoke(IPC_QUERY_CHANNELS.capabilityBuilderGet, sessionId),
      reviseDraft: (command) =>
        invoke(IPC_COMMAND_CHANNELS.capabilityBuilderRevise, command),
      confirmInstall: (command) =>
        invoke(IPC_COMMAND_CHANNELS.capabilityBuilderConfirm, command),
      cancel: (command) =>
        invoke(IPC_COMMAND_CHANNELS.capabilityBuilderCancel, command)
    },
    runtimeGovernance: {
      getSnapshot: () =>
        invoke(IPC_QUERY_CHANNELS.runtimeGovernanceSnapshot),
      getRunDetail: (runId) =>
        invoke(IPC_QUERY_CHANNELS.runtimeGovernanceRunDetail, { runId }),
      runEvaluation: () =>
        invoke(IPC_COMMAND_CHANNELS.runtimeGovernanceEvaluate),
      release: (command) =>
        invoke(IPC_COMMAND_CHANNELS.runtimeGovernanceRelease, command),
      exportDiagnostic: (runId) =>
        invoke(IPC_COMMAND_CHANNELS.runtimeGovernanceExport, { runId })
    },
    quitApp: () => invoke(IPC_COMMAND_CHANNELS.appQuit),
    appLifecycle: {
      onCloseRequested: (listener) =>
        subscribe<void>(
          ipcRenderer,
          IPC_EVENT_CHANNELS.appCloseRequested,
          () => listener()
        ),
      respondToCloseRequest: (approved) =>
        invoke(IPC_COMMAND_CHANNELS.appCloseRespond, { approved })
    },
    persistence: {
      load: (dataset) => invoke(IPC_QUERY_CHANNELS.persistenceLoad, dataset),
      onChanged: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.persistenceChanged, listener)
    },
    nativeOverlay: {
      show: (request) =>
        invoke(IPC_COMMAND_CHANNELS.nativeOverlayShow, request),
      hide: (kind) => invoke(IPC_COMMAND_CHANNELS.nativeOverlayHide, kind),
      onEvent: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.nativeOverlayEvent, listener)
    },
    workspace: {
      chooseFiles: () => invoke(IPC_COMMAND_CHANNELS.workspaceChooseFiles),
      openSessionFiles: (filePaths) =>
        invoke(IPC_COMMAND_CHANNELS.workspaceOpenSessionFiles, filePaths),
      chooseFolder: () => invoke(IPC_COMMAND_CHANNELS.workspaceChooseFolder),
      chooseDirectory: (requirementId) =>
        invoke(IPC_COMMAND_CHANNELS.workspaceChooseDirectory, requirementId),
      getBinding: (requirementId) =>
        invoke(IPC_QUERY_CHANNELS.workspaceGetBinding, requirementId),
      listDirectory: (requirementId, path) =>
        invoke(IPC_QUERY_CHANNELS.workspaceListDirectory, requirementId, path),
      readFile: (requirementId, path) =>
        invoke(IPC_QUERY_CHANNELS.workspaceReadFile, requirementId, path),
      readPreviewBytes: (requirementId, path) =>
        invoke(
          IPC_QUERY_CHANNELS.workspaceReadPreviewBytes,
          requirementId,
          path
        ),
      writeFile: (input) =>
        invoke(IPC_COMMAND_CHANNELS.workspaceWriteFile, input),
      readManifest: (requirementId) =>
        invoke(IPC_QUERY_CHANNELS.workspaceReadManifest, requirementId),
      writeManifest: (requirementId, manifest) =>
        invoke(
          IPC_COMMAND_CHANNELS.workspaceWriteManifest,
          requirementId,
          manifest
        ),
      getPreviewUrl: (requirementId, path) =>
        invoke(IPC_QUERY_CHANNELS.workspaceGetPreviewUrl, requirementId, path),
      showItem: (requirementId, path) =>
        invoke(IPC_COMMAND_CHANNELS.workspaceShowItem, requirementId, path)
    },
    webWorkbench: {
      create: (url) => invoke(IPC_COMMAND_CHANNELS.webWorkbenchCreate, url),
      show: (id, bounds) =>
        invoke(IPC_COMMAND_CHANNELS.webWorkbenchShow, id, bounds),
      hideAll: () => invoke(IPC_COMMAND_CHANNELS.webWorkbenchHideAll),
      setBounds: (id, bounds) =>
        invoke(IPC_COMMAND_CHANNELS.webWorkbenchSetBounds, id, bounds),
      navigate: (id, url) =>
        invoke(IPC_COMMAND_CHANNELS.webWorkbenchNavigate, id, url),
      goBack: (id) => invoke(IPC_COMMAND_CHANNELS.webWorkbenchGoBack, id),
      goForward: (id) => invoke(IPC_COMMAND_CHANNELS.webWorkbenchGoForward, id),
      reload: (id) => invoke(IPC_COMMAND_CHANNELS.webWorkbenchReload, id),
      destroy: (id) => invoke(IPC_COMMAND_CHANNELS.webWorkbenchDestroy, id),
      openExternal: (url) =>
        invoke(IPC_COMMAND_CHANNELS.webWorkbenchOpenExternal, url),
      onStateChange: (listener) =>
        subscribe(
          ipcRenderer,
          IPC_EVENT_CHANNELS.webWorkbenchStateChanged,
          listener
        ),
      onAgentBrowserSurface: (listener) =>
        subscribe(
          ipcRenderer,
          IPC_EVENT_CHANNELS.agentBrowserSurface,
          listener
        )
    },
    terminal: {
      create: (workspaceId, dimensions) =>
        invoke(IPC_COMMAND_CHANNELS.terminalCreate, workspaceId, dimensions),
      createHome: (dimensions) =>
        invoke(IPC_COMMAND_CHANNELS.terminalCreateHome, dimensions),
      write: (sessionId, data) =>
        invoke(IPC_COMMAND_CHANNELS.terminalWrite, sessionId, data),
      resize: (sessionId, dimensions) =>
        invoke(IPC_COMMAND_CHANNELS.terminalResize, sessionId, dimensions),
      destroy: (sessionId) =>
        invoke(IPC_COMMAND_CHANNELS.terminalDestroy, sessionId),
      onEvent: (listener) =>
        subscribe(ipcRenderer, IPC_EVENT_CHANNELS.terminalEvent, listener)
    },
    codeSnippet: {
      run: (snippet) => invoke(IPC_COMMAND_CHANNELS.codeSnippetRun, snippet),
      save: (snippet) => invoke(IPC_COMMAND_CHANNELS.codeSnippetSave, snippet)
    }
  }
}

function subscribe<T>(
  ipcRenderer: IpcRendererBridge,
  channel: string,
  listener: (payload: T) => void
): () => void {
  const handler = (_event: unknown, payload: unknown): void =>
    listener(payload as T)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
