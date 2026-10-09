import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { extname } from 'node:path'
import type { IpcMain } from 'electron'
import type {
  BackupStatusDto,
  BusinessHandlers,
  CatalogSearchResultDto,
  KnowledgeSearchResultDto,
  PrepareRestoreCommand,
  RestorePreviewDto
} from '../../../shared/business'
import type { BackupOperation } from '../../../domain/backup'
import {
  IPC_COMMAND_CHANNELS,
  IPC_EVENT_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import {
  requireConnectorListResult,
  requireConnectorResult
} from './connector-result-validation'
import {
  requireDeleteScheduleResult,
  requireRunScheduleNowResult,
  requireScheduleListResult,
  requireScheduleMutationResult,
  requireScheduleRunListResult
} from './schedule-result-validation'
import {
  requireAppSupportInfoResult,
  requireSupportLinkResult,
  requireUpdateCheckRecordResult
} from './app-support-result-validation'
import {
  requireBackupOperationResult,
  requireBackupStatusResult,
  requireRestorePreviewResult
} from './backup-result-validation'
import {
  requireAddWorkflowTemplateEdgeCommand,
  requireAddWorkflowTemplateNodeCommand,
  requireAnswerNodeQuestionCommand,
  requireArchiveKnowledgeNoteCommand,
  requireApplyTemplateMigrationCommand,
  requireAppendConversationMessageCommand,
  requireConfigureWorkflowTemplateNodeCommand,
  requireCopyWorkflowTemplateCommand,
  requireCopyWorkflowTemplateNodeCommand,
  requireCatalogSearchQuery,
  requireConfigureBuiltinModelProviderCommand,
  requireConfigureDiscoveredModelProviderCommand,
  requireCreateOnlineDocumentSourceCommand,
  requireCreateKnowledgeNoteCommand,
  requireCreateConversationCommand,
  requireCreateRequirementCommand,
  requireCreateScheduleCommand,
  requireCreateSpaceCommand,
  requireCreateWorkflowTemplateCommand,
  requireCreateWorkflowTemplateVersionCommand,
  requireCheckForUpdatesCommand,
  requireChooseBackupDestinationCommand,
  requireDeleteConnectorCommand,
  requireDeleteConversationCommand,
  requireDeleteModelProfileCommand,
  requireDeleteModelProviderCommand,
  requireDeleteNodeTodoCommand,
  requireDeleteEntityCommand,
  requireDismissNodeQuestionCommand,
  requireEditKnowledgeNoteCommand,
  requireIngestLocalRepositoryCommand,
  requireIngestRemoteRepositoryCommand,
  requireInsertWorkflowNodeCommand,
  requireIngestLocalFilesCommand,
  requireKnowledgeSearchQuery,
  requireKnowledgeSourceIdQuery,
  requireListRepositoryBranchesQuery,
  requireListScheduleRunsQuery,
  requireManageKnowledgeSourceCommand,
  requireManageWorkflowNodeExecutionCommand,
  requireModelStatisticsQuery,
  requireModelRouteRequest,
  requireNoIpcPayload,
  requireNodeRunIdCommand,
  requireOpenNodeQuestionCommand,
  requireOpenSupportLinkCommand,
  requireOutboundCallQuery,
  requirePrepareContextSnapshotCommand,
  requirePrepareRestoreCommand,
  requireProductAnalyticsQuery,
  requirePurgeEntityCommand,
  requireRelocateSpaceCommand,
  requireRenameManagedDirectoryCommand,
  requireRenameConversationCommand,
  requireRemoveWorkflowTemplateEdgeCommand,
  requireRemoveWorkflowNodeCommand,
  requireRemoveWorkflowTemplateNodeCommand,
  requireRestoreWorkflowTemplateNodeCommand,
  requireRecentConversationQuery,
  requireRefreshKnowledgeSourceCommand,
  requireRegisterKnowledgeSourceCommand,
  requireRollbackWorkflowToNodeCommand,
  requireRemoveModelProviderCredentialCommand,
  requireRefreshRepositorySourceCommand,
  requireRetryRepositoryFileIndexCommand,
  requireReorderWorkflowTemplateNodesCommand,
  requireReorderWorkflowNodesCommand,
  requireResolveWorkflowNodeGateCommand,
  requireRestoreEntityCommand,
  requireRotateModelCredentialKeyCommand,
  requireRunScheduleNowCommand,
  requireSaveApplicationModelDefaultCommand,
  requireRequirementExecutionViewQuery,
  requireRequirementIdCommand,
  requireSaveNodeTodoCommand,
  requireSaveConnectorCommand,
  requireSaveModelProfileCommand,
  requireSaveModelProviderCommand,
  requireSendFollowUpSuggestionCommand,
  requireSelectWorkRootCommand,
  requireSetWorkflowParallelismCommand,
  requireSetModelProfilesEnabledCommand,
  requireSetKnowledgeRefreshPolicyCommand,
  requireSessionIdCommand,
  requireSkipWorkflowNodeCommand,
  requireSyncOnlineDocumentSourceCommand,
  requireTemplateMigrationPreviewQuery,
  requireTemplateMigrationRequirementQuery,
  requireTransitionWorkflowTemplateCommand,
  requireTransitionScheduleCommand,
  requireUpdateRequirementCommand,
  requireUpdateRepositoryBranchCommand,
  requireUpdateScheduleCommand,
  requireUpdateSpaceCommand,
  requireValidateConnectorCommand,
  requireValidateModelProfileCommand,
  requireUpdateWorkflowTemplateCommand,
  requireUpdateWorkflowTemplateNodeCommand,
  requireUpdateWorkflowTemplateNodePositionsCommand,
  requireUpdateWorkflowEdgeCommand,
  requireUpdateWorkflowNodeCommand,
  requireWorkflowNodeIdCommand,
  requireWorkflowTemplateIdQuery,
  requireWorkflowTemplateVersionQuery,
  requireWorkspaceIdCommand
} from './runtime-validation'

export function registerBusinessIpc(options: {
  handlers: BusinessHandlers
  backup?: {
    getStatus: () => Promise<BackupStatusDto>
    createBackup: (input: {
      requestId: string
      destinationPath: string
    }) => Promise<BackupOperation>
    inspectRestore: (bundlePath: string) => Promise<RestorePreviewDto>
    prepareRestore: (command: PrepareRestoreCommand) => Promise<BackupOperation>
    restartForRestore: () => Promise<boolean>
  }
  ipcMain: Pick<IpcMain, 'handle'>
  dialog?: {
    showOpenDialog: (options: {
      properties: Array<'openDirectory' | 'createDirectory'>
    }) => Promise<{ canceled: boolean; filePaths: string[] }>
    showSaveDialog?: (options: {
      defaultPath: string
      filters: Array<{ name: string; extensions: string[] }>
      properties: Array<'createDirectory' | 'showOverwriteConfirmation'>
    }) => Promise<{ canceled: boolean; filePath?: string }>
  }
  resolvePath?: (path: string) => Promise<string>
  createId?: () => string
}): void {
  const {
    handlers,
    ipcMain,
    dialog,
    backup,
    resolvePath = realpath,
    createId = randomUUID
  } = options
  if (backup) registerBackupIpc({ backup, ipcMain, dialog })
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.settingsChooseWorkRoot,
    async (_event, ...values) => {
      requireNoIpcPayload(values, IPC_COMMAND_CHANNELS.settingsChooseWorkRoot)
      if (!dialog) throw new Error('Work root directory picker is unavailable')
      const selection = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      const selectedPath = selection.filePaths[0]
      if (selection.canceled || !selectedPath) return null

      const path = await resolvePath(selectedPath)
      const existing = (await handlers.listWorkRoots.execute()).find(
        (workRoot) => workRoot.path === path
      )
      return handlers.selectWorkRoot.execute({
        id: existing?.id ?? createId(),
        path,
        expectedRevision: existing?.revision ?? 0
      })
    }
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.settingsSelectWorkRoot, (_event, value) =>
    handlers.selectWorkRoot.execute(
      requireSelectWorkRootCommand(
        value,
        IPC_COMMAND_CHANNELS.settingsSelectWorkRoot
      )
    )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.settingsListWorkRoots,
    (_event, ...values) => {
      requireNoIpcPayload(values, IPC_QUERY_CHANNELS.settingsListWorkRoots)
      return handlers.listWorkRoots.execute()
    }
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.spaceCreate, (_event, value) =>
    handlers.createSpace.execute(
      requireCreateSpaceCommand(value, IPC_COMMAND_CHANNELS.spaceCreate)
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.spaceList, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.spaceList)
    return handlers.listSpaces.execute()
  })
  ipcMain.handle(IPC_COMMAND_CHANNELS.spaceUpdate, (_event, value) =>
    handlers.updateSpace.execute(
      requireUpdateSpaceCommand(value, IPC_COMMAND_CHANNELS.spaceUpdate)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.spaceRenameDirectory, (_event, value) =>
    handlers.renameSpaceDirectory.execute(
      requireRenameManagedDirectoryCommand(
        value,
        IPC_COMMAND_CHANNELS.spaceRenameDirectory
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.spaceChooseRelocation,
    async (_event, value) => {
      if (!dialog) throw new Error('Space directory picker is unavailable')
      const command = requireDeleteEntityCommand(
        value,
        IPC_COMMAND_CHANNELS.spaceChooseRelocation
      )
      const selection = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      const targetPath = selection.filePaths[0]
      if (selection.canceled || !targetPath) return null
      return handlers.relocateSpace.execute({ ...command, targetPath })
    }
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.spaceRelocate, (_event, value) =>
    handlers.relocateSpace.execute(
      requireRelocateSpaceCommand(value, IPC_COMMAND_CHANNELS.spaceRelocate)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.spaceDelete, (_event, value) =>
    handlers.deleteSpace.execute(
      requireDeleteEntityCommand(value, IPC_COMMAND_CHANNELS.spaceDelete)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.spaceRestore, (_event, value) =>
    handlers.restoreSpace.execute(
      requireRestoreEntityCommand(value, IPC_COMMAND_CHANNELS.spaceRestore)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.spacePurge, (_event, value) =>
    handlers.purgeSpace.execute(
      requirePurgeEntityCommand(value, IPC_COMMAND_CHANNELS.spacePurge)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.requirementCreate, (_event, value) =>
    handlers.createRequirement.execute(
      requireCreateRequirementCommand(
        value,
        IPC_COMMAND_CHANNELS.requirementCreate
      )
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.requirementList, (_event, value) =>
    handlers.listRequirements.execute(
      requireWorkspaceIdCommand(value, IPC_QUERY_CHANNELS.requirementList)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.requirementUpdate, (_event, value) =>
    handlers.updateRequirement.execute(
      requireUpdateRequirementCommand(
        value,
        IPC_COMMAND_CHANNELS.requirementUpdate
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.requirementRenameDirectory,
    (_event, value) =>
      handlers.renameRequirementDirectory.execute(
        requireRenameManagedDirectoryCommand(
          value,
          IPC_COMMAND_CHANNELS.requirementRenameDirectory
        )
      )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.requirementDelete, (_event, value) =>
    handlers.deleteRequirement.execute(
      requireDeleteEntityCommand(value, IPC_COMMAND_CHANNELS.requirementDelete)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.requirementRestore, (_event, value) =>
    handlers.restoreRequirement.execute(
      requireRestoreEntityCommand(
        value,
        IPC_COMMAND_CHANNELS.requirementRestore
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.requirementPurge, (_event, value) =>
    handlers.purgeRequirement.execute(
      requirePurgeEntityCommand(value, IPC_COMMAND_CHANNELS.requirementPurge)
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.trashList, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.trashList)
    return handlers.listTrashItems.execute()
  })
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workflowTemplateList,
    (_event, ...values) => {
      requireNoIpcPayload(values, IPC_QUERY_CHANNELS.workflowTemplateList)
      return handlers.listWorkflowTemplates.execute()
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workflowTemplateLibraryList,
    (_event, ...values) => {
      requireNoIpcPayload(
        values,
        IPC_QUERY_CHANNELS.workflowTemplateLibraryList
      )
      return handlers.listWorkflowTemplateLibrary.execute()
    }
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workflowTemplateVersionList,
    (_event, value) =>
      handlers.listWorkflowTemplateVersions.execute(
        requireWorkflowTemplateIdQuery(
          value,
          IPC_QUERY_CHANNELS.workflowTemplateVersionList
        )
      )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.workflowTemplateVersionGet,
    (_event, value) =>
      handlers.getWorkflowTemplateVersion.execute(
        requireWorkflowTemplateVersionQuery(
          value,
          IPC_QUERY_CHANNELS.workflowTemplateVersionGet
        )
      )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.workflowTemplateDraftGet, (_event, value) =>
    handlers.getWorkflowTemplateDraft.execute(
      requireWorkflowTemplateIdQuery(
        value,
        IPC_QUERY_CHANNELS.workflowTemplateDraftGet
      )
    )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.templateMigrationCandidateList,
    (_event, value) =>
      handlers.listTemplateMigrationCandidates.execute(
        requireTemplateMigrationRequirementQuery(
          value,
          IPC_QUERY_CHANNELS.templateMigrationCandidateList
        )
      )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.templateMigrationPreview, (_event, value) =>
    handlers.previewTemplateMigration.execute(
      requireTemplateMigrationPreviewQuery(
        value,
        IPC_QUERY_CHANNELS.templateMigrationPreview
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowTemplateCreate, (_event, value) =>
    handlers.createWorkflowTemplate.execute(
      requireCreateWorkflowTemplateCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowTemplateCreate
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowTemplateCopy, (_event, value) =>
    handlers.copyWorkflowTemplate.execute(
      requireCopyWorkflowTemplateCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowTemplateCopy
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowTemplateUpdate, (_event, value) =>
    handlers.updateWorkflowTemplate.execute(
      requireUpdateWorkflowTemplateCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowTemplateUpdate
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateVersionCreate,
    (_event, value) =>
      handlers.createWorkflowTemplateVersion.execute(
        requireCreateWorkflowTemplateVersionCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateVersionCreate
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplatePublish,
    (_event, value) =>
      handlers.publishWorkflowTemplate.execute(
        requireTransitionWorkflowTemplateCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplatePublish
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateArchive,
    (_event, value) =>
      handlers.archiveWorkflowTemplate.execute(
        requireTransitionWorkflowTemplateCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateArchive
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateNodeAdd,
    (_event, value) =>
      handlers.addWorkflowTemplateNode.execute(
        requireAddWorkflowTemplateNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateNodeAdd
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateNodeCopy,
    (_event, value) =>
      handlers.copyWorkflowTemplateNode.execute(
        requireCopyWorkflowTemplateNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateNodeCopy
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateNodeUpdate,
    (_event, value) =>
      handlers.updateWorkflowTemplateNode.execute(
        requireUpdateWorkflowTemplateNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateNodeUpdate
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateNodeConfigure,
    (_event, value) =>
      handlers.configureWorkflowTemplateNode.execute(
        requireConfigureWorkflowTemplateNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateNodeConfigure
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateNodeRemove,
    (_event, value) =>
      handlers.removeWorkflowTemplateNode.execute(
        requireRemoveWorkflowTemplateNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateNodeRemove
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateNodeRestore,
    (_event, value) =>
      handlers.restoreWorkflowTemplateNode.execute(
        requireRestoreWorkflowTemplateNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateNodeRestore
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateNodeReorder,
    (_event, value) =>
      handlers.reorderWorkflowTemplateNodes.execute(
        requireReorderWorkflowTemplateNodesCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateNodeReorder
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateNodeUpdatePositions,
    (_event, value) =>
      handlers.updateWorkflowTemplateNodePositions.execute(
        requireUpdateWorkflowTemplateNodePositionsCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateNodeUpdatePositions
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateEdgeAdd,
    (_event, value) =>
      handlers.addWorkflowTemplateEdge.execute(
        requireAddWorkflowTemplateEdgeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateEdgeAdd
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowTemplateEdgeRemove,
    (_event, value) =>
      handlers.removeWorkflowTemplateEdge.execute(
        requireRemoveWorkflowTemplateEdgeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowTemplateEdgeRemove
        )
      )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.templateMigrationApply, (_event, value) =>
    handlers.applyTemplateMigration.execute(
      requireApplyTemplateMigrationCommand(
        value,
        IPC_COMMAND_CHANNELS.templateMigrationApply
      )
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.requirementWorkflowGet, (_event, value) =>
    handlers.getRequirementWorkflow.execute(
      requireRequirementIdCommand(
        value,
        IPC_QUERY_CHANNELS.requirementWorkflowGet
      )
    )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.requirementExecutionViewGet,
    (_event, value) =>
      handlers.getRequirementExecutionView.execute(
        requireRequirementExecutionViewQuery(
          value,
          IPC_QUERY_CHANNELS.requirementExecutionViewGet
        )
      )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.requirementWorkflowRevisionList,
    (_event, value) =>
      handlers.listRequirementWorkflowRevisions.execute(
        requireRequirementIdCommand(
          value,
          IPC_QUERY_CHANNELS.requirementWorkflowRevisionList
        )
      )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowSetParallelism, (_event, value) =>
    handlers.setWorkflowParallelism.execute(
      requireSetWorkflowParallelismCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowSetParallelism
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.requirementWorkflowInsertNode,
    (_event, value) => {
      const command = requireInsertWorkflowNodeCommand(
        value,
        IPC_COMMAND_CHANNELS.requirementWorkflowInsertNode
      )
      return handlers.insertWorkflowNode.execute(command)
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.requirementWorkflowUpdateNode,
    (_event, value) =>
      handlers.updateWorkflowNode.execute(
        requireUpdateWorkflowNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.requirementWorkflowUpdateNode
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.requirementWorkflowRemoveNode,
    (_event, value) =>
      handlers.removeWorkflowNode.execute(
        requireRemoveWorkflowNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.requirementWorkflowRemoveNode
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.requirementWorkflowUpdateEdge,
    (_event, value) =>
      handlers.updateWorkflowEdge.execute(
        requireUpdateWorkflowEdgeCommand(
          value,
          IPC_COMMAND_CHANNELS.requirementWorkflowUpdateEdge
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.requirementWorkflowReorder,
    (_event, value) =>
      handlers.reorderWorkflowNodes.execute(
        requireReorderWorkflowNodesCommand(
          value,
          IPC_COMMAND_CHANNELS.requirementWorkflowReorder
        )
      )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.workflowNodeExecutionGet, (_event, value) =>
    handlers.getWorkflowNodeExecution.execute(
      requireWorkflowNodeIdCommand(
        value,
        IPC_QUERY_CHANNELS.workflowNodeExecutionGet
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowNodeStart, (_event, value) =>
    handlers.startWorkflowNode.execute(
      requireManageWorkflowNodeExecutionCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowNodeStart
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowNodePause, (_event, value) =>
    handlers.pauseWorkflowNode.execute(
      requireManageWorkflowNodeExecutionCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowNodePause
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowNodeResume, (_event, value) =>
    handlers.resumeWorkflowNode.execute(
      requireManageWorkflowNodeExecutionCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowNodeResume
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowNodeCancel, (_event, value) =>
    handlers.cancelWorkflowNode.execute(
      requireManageWorkflowNodeExecutionCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowNodeCancel
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowNodeRetry, (_event, value) =>
    handlers.retryWorkflowNode.execute(
      requireManageWorkflowNodeExecutionCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowNodeRetry
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowRollbackToNode,
    (_event, value) =>
      handlers.rollbackWorkflowToNode.execute(
        requireRollbackWorkflowToNodeCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowRollbackToNode
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowNodePreviewContext,
    (_event, value) =>
      handlers.prepareWorkflowNodeContext.execute(
        requirePrepareContextSnapshotCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowNodePreviewContext
        )
      )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.workflowNodeSkip, (_event, value) =>
    handlers.skipWorkflowNode.execute(
      requireSkipWorkflowNodeCommand(
        value,
        IPC_COMMAND_CHANNELS.workflowNodeSkip
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.workflowNodeResolveGate,
    (_event, value) =>
      handlers.resolveWorkflowNodeGate.execute(
        requireResolveWorkflowNodeGateCommand(
          value,
          IPC_COMMAND_CHANNELS.workflowNodeResolveGate
        )
      )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.conversationListRecent, (_event, value) =>
    handlers.listRecentConversations.execute(
      requireRecentConversationQuery(
        value,
        IPC_QUERY_CHANNELS.conversationListRecent
      )
    )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.conversationListByWorkspace,
    (_event, value) =>
      handlers.listWorkspaceConversations.execute(
        requireWorkspaceIdCommand(
          value,
          IPC_QUERY_CHANNELS.conversationListByWorkspace
        )
      )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.conversationGet, (_event, value) =>
    handlers.getConversation.execute(
      requireSessionIdCommand(value, IPC_QUERY_CHANNELS.conversationGet)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.conversationRename, (_event, value) =>
    handlers.renameConversation.execute(
      requireRenameConversationCommand(
        value,
        IPC_COMMAND_CHANNELS.conversationRename
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.conversationDelete, (_event, value) =>
    handlers.deleteConversation.execute(
      requireDeleteConversationCommand(
        value,
        IPC_COMMAND_CHANNELS.conversationDelete
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.conversationCreate, (event, value) =>
    handlers.createConversation.execute(
      requireCreateConversationCommand(
        value,
        IPC_COMMAND_CHANNELS.conversationCreate
      ),
      (conversation) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_EVENT_CHANNELS.conversationEvent, {
            conversation
          })
        }
      }
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.conversationAppendMessage,
    (event, value) =>
      handlers.appendConversationMessage.execute(
        requireAppendConversationMessageCommand(
          value,
          IPC_COMMAND_CHANNELS.conversationAppendMessage
        ),
        (conversation) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_EVENT_CHANNELS.conversationEvent, {
              conversation
            })
          }
        }
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.conversationSendFollowUpSuggestion,
    (event, value) =>
      handlers.sendFollowUpSuggestion.execute(
        requireSendFollowUpSuggestionCommand(
          value,
          IPC_COMMAND_CHANNELS.conversationSendFollowUpSuggestion
        ),
        (conversation) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_EVENT_CHANNELS.conversationEvent, {
              conversation
            })
          }
        }
      )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.knowledgeSourceList, (_event, value) =>
    handlers.listKnowledgeSources.execute(
      requireWorkspaceIdCommand(value, IPC_QUERY_CHANNELS.knowledgeSourceList)
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.knowledgeSourceEventList, (_event, value) =>
    handlers.listKnowledgeSourceEvents.execute(
      requireKnowledgeSourceIdQuery(
        value,
        IPC_QUERY_CHANNELS.knowledgeSourceEventList
      )
    )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.onlineDocumentSnapshotGet,
    (_event, value) =>
      handlers.getOnlineDocumentSnapshot.execute(
        requireKnowledgeSourceIdQuery(
          value,
          IPC_QUERY_CHANNELS.onlineDocumentSnapshotGet
        )
      )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.repositorySnapshotGet, (_event, value) =>
    handlers.getRepositorySnapshot.execute(
      requireKnowledgeSourceIdQuery(
        value,
        IPC_QUERY_CHANNELS.repositorySnapshotGet
      )
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.repositoryBranchList, (_event, value) =>
    handlers.listRepositoryBranches.execute(
      requireListRepositoryBranchesQuery(
        value,
        IPC_QUERY_CHANNELS.repositoryBranchList
      )
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.knowledgeIndexGet, (_event, value) =>
    handlers.getKnowledgeIndex.execute(
      requireKnowledgeSourceIdQuery(value, IPC_QUERY_CHANNELS.knowledgeIndexGet)
    )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.knowledgeRuntimeHealthGet,
    (_event, ...values) => {
      requireNoIpcPayload(
        values,
        IPC_QUERY_CHANNELS.knowledgeRuntimeHealthGet
      )
      return handlers.getKnowledgeRuntimeHealth.execute()
    }
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.knowledgeNoteList, (_event, value) =>
    handlers.listKnowledgeNotes.execute(
      requireWorkspaceIdCommand(value, IPC_QUERY_CHANNELS.knowledgeNoteList)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.knowledgeNoteCreate, (_event, value) =>
    handlers.createKnowledgeNote.execute(
      requireCreateKnowledgeNoteCommand(
        value,
        IPC_COMMAND_CHANNELS.knowledgeNoteCreate
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.knowledgeNoteEdit, (_event, value) =>
    handlers.editKnowledgeNote.execute(
      requireEditKnowledgeNoteCommand(
        value,
        IPC_COMMAND_CHANNELS.knowledgeNoteEdit
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.knowledgeNoteArchive, (_event, value) =>
    handlers.archiveKnowledgeNote.execute(
      requireArchiveKnowledgeNoteCommand(
        value,
        IPC_COMMAND_CHANNELS.knowledgeNoteArchive
      )
    )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.knowledgeSearch,
    async (_event, value) =>
      toKnowledgeSearchResultDtos(
        await handlers.searchKnowledge.execute(
          requireKnowledgeSearchQuery(
            value,
            IPC_QUERY_CHANNELS.knowledgeSearch
          )
        )
      )
  )
  ipcMain.handle(
    IPC_QUERY_CHANNELS.catalogSearch,
    async (_event, value) =>
      toCatalogSearchResultDtos(
        await handlers.searchCatalog.execute(
          requireCatalogSearchQuery(value, IPC_QUERY_CHANNELS.catalogSearch)
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceRegister,
    (_event, value) =>
      handlers.registerKnowledgeSource.execute(
        requireRegisterKnowledgeSourceCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceRegister
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceIngestLocalFiles,
    (_event, value) =>
      handlers.ingestLocalFiles.execute(
        requireIngestLocalFilesCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceIngestLocalFiles
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceRefreshLocalFile,
    (_event, value) =>
      handlers.refreshLocalFileSource.execute(
        requireManageKnowledgeSourceCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceRefreshLocalFile
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceOpenLocalFile,
    (_event, value) =>
      handlers.openLocalFileSource.execute(
        requireKnowledgeSourceIdQuery(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceOpenLocalFile
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceIngestLocalRepository,
    (_event, value) =>
      handlers.ingestLocalRepository.execute(
        requireIngestLocalRepositoryCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceIngestLocalRepository
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceIngestRemoteRepository,
    (_event, value) =>
      handlers.ingestRemoteRepository.execute(
        requireIngestRemoteRepositoryCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceIngestRemoteRepository
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceRefreshRepository,
    (_event, value) =>
      handlers.refreshRepositorySource.execute(
        requireRefreshRepositorySourceCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceRefreshRepository
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.repositoryUpdateBranch,
    (_event, value) =>
      handlers.updateRepositoryBranch.execute(
        requireUpdateRepositoryBranchCommand(
          value,
          IPC_COMMAND_CHANNELS.repositoryUpdateBranch
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.repositoryRetryFileIndex,
    (_event, value) =>
      handlers.retryRepositoryFileIndex.execute(
        requireRetryRepositoryFileIndexCommand(
          value,
          IPC_COMMAND_CHANNELS.repositoryRetryFileIndex
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceBuildIndex,
    (_event, value) =>
      handlers.buildKnowledgeIndex.execute(
        requireManageKnowledgeSourceCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceBuildIndex
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeSourceRefresh,
    (_event, value) =>
      handlers.refreshKnowledgeSource.execute(
        requireRefreshKnowledgeSourceCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeSourceRefresh
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.knowledgeRefreshPolicySet,
    (_event, value) =>
      handlers.setKnowledgeRefreshPolicy.execute(
        requireSetKnowledgeRefreshPolicyCommand(
          value,
          IPC_COMMAND_CHANNELS.knowledgeRefreshPolicySet
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.onlineDocumentSourceCreate,
    (_event, value) =>
      handlers.createOnlineDocumentSource.execute(
        requireCreateOnlineDocumentSourceCommand(
          value,
          IPC_COMMAND_CHANNELS.onlineDocumentSourceCreate
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.onlineDocumentSourceSync,
    (_event, value) =>
      handlers.syncOnlineDocumentSource.execute(
        requireSyncOnlineDocumentSourceCommand(
          value,
          IPC_COMMAND_CHANNELS.onlineDocumentSourceSync
        )
      )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.knowledgeSourceRetry, (_event, value) =>
    handlers.retryKnowledgeSource.execute(
      requireManageKnowledgeSourceCommand(
        value,
        IPC_COMMAND_CHANNELS.knowledgeSourceRetry
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.knowledgeSourceRemove, (_event, value) =>
    handlers.removeKnowledgeSource.execute(
      requireManageKnowledgeSourceCommand(
        value,
        IPC_COMMAND_CHANNELS.knowledgeSourceRemove
      )
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.nodeTodoList, (_event, value) =>
    handlers.listNodeTodos.execute(
      requireNodeRunIdCommand(value, IPC_QUERY_CHANNELS.nodeTodoList)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.nodeTodoSave, (_event, value) =>
    handlers.saveNodeTodo.execute(
      requireSaveNodeTodoCommand(value, IPC_COMMAND_CHANNELS.nodeTodoSave)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.nodeTodoDelete, (_event, value) =>
    handlers.deleteNodeTodo.execute(
      requireDeleteNodeTodoCommand(value, IPC_COMMAND_CHANNELS.nodeTodoDelete)
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.nodeQuestionList, (_event, value) =>
    handlers.listNodeQuestions.execute(
      requireNodeRunIdCommand(value, IPC_QUERY_CHANNELS.nodeQuestionList)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.nodeQuestionOpen, (_event, value) =>
    handlers.openNodeQuestion.execute(
      requireOpenNodeQuestionCommand(
        value,
        IPC_COMMAND_CHANNELS.nodeQuestionOpen
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.nodeQuestionAnswer, (_event, value) =>
    handlers.answerNodeQuestion.execute(
      requireAnswerNodeQuestionCommand(
        value,
        IPC_COMMAND_CHANNELS.nodeQuestionAnswer
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.nodeQuestionDismiss, (_event, value) =>
    handlers.dismissNodeQuestion.execute(
      requireDismissNodeQuestionCommand(
        value,
        IPC_COMMAND_CHANNELS.nodeQuestionDismiss
      )
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.modelList, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.modelList)
    return handlers.listModels.execute()
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.modelEffectiveList, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.modelEffectiveList)
    return handlers.listEffectiveModels.execute()
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.modelDefaultGet, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.modelDefaultGet)
    return handlers.getApplicationModelDefault.execute()
  })
  ipcMain.handle(
    IPC_QUERY_CHANNELS.modelProviderDiscover,
    (_event, ...values) => {
      requireNoIpcPayload(values, IPC_QUERY_CHANNELS.modelProviderDiscover)
      return handlers.discoverModelProviders.execute()
    }
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.connectorList, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.connectorList)
    return Promise.resolve(handlers.listConnectors.execute()).then((result) =>
      requireConnectorListResult(result, IPC_QUERY_CHANNELS.connectorList)
    )
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.scheduleList, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.scheduleList)
    return Promise.resolve(handlers.listSchedules.execute()).then((result) =>
      requireScheduleListResult(result, IPC_QUERY_CHANNELS.scheduleList)
    )
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.scheduleRunList, (_event, value) =>
    Promise.resolve(
      handlers.listScheduleRuns.execute(
        requireListScheduleRunsQuery(value, IPC_QUERY_CHANNELS.scheduleRunList)
      )
    ).then((result) =>
      requireScheduleRunListResult(result, IPC_QUERY_CHANNELS.scheduleRunList)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.scheduleCreate, (_event, value) =>
    Promise.resolve(
      handlers.createSchedule.execute(
        requireCreateScheduleCommand(value, IPC_COMMAND_CHANNELS.scheduleCreate)
      )
    ).then((result) =>
      requireScheduleMutationResult(result, IPC_COMMAND_CHANNELS.scheduleCreate)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.scheduleUpdate, (_event, value) =>
    Promise.resolve(
      handlers.updateSchedule.execute(
        requireUpdateScheduleCommand(value, IPC_COMMAND_CHANNELS.scheduleUpdate)
      )
    ).then((result) =>
      requireScheduleMutationResult(result, IPC_COMMAND_CHANNELS.scheduleUpdate)
    )
  )
  for (const [channel, handler] of [
    [IPC_COMMAND_CHANNELS.schedulePause, handlers.pauseSchedule],
    [IPC_COMMAND_CHANNELS.scheduleResume, handlers.resumeSchedule]
  ] as const) {
    ipcMain.handle(channel, (_event, value) =>
      Promise.resolve(
        handler.execute(requireTransitionScheduleCommand(value, channel))
      ).then((result) => requireScheduleMutationResult(result, channel))
    )
  }
  ipcMain.handle(IPC_COMMAND_CHANNELS.scheduleRunNow, (_event, value) =>
    Promise.resolve(
      handlers.runScheduleNow.execute(
        requireRunScheduleNowCommand(value, IPC_COMMAND_CHANNELS.scheduleRunNow)
      )
    ).then((result) =>
      requireRunScheduleNowResult(result, IPC_COMMAND_CHANNELS.scheduleRunNow)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.scheduleDelete, (_event, value) =>
    Promise.resolve(
      handlers.deleteSchedule.execute(
        requireTransitionScheduleCommand(
          value,
          IPC_COMMAND_CHANNELS.scheduleDelete
        )
      )
    ).then((result) =>
      requireDeleteScheduleResult(result, IPC_COMMAND_CHANNELS.scheduleDelete)
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.modelRouteResolve, (_event, value) =>
    handlers.routeModel.execute(
      requireModelRouteRequest(value, IPC_QUERY_CHANNELS.modelRouteResolve)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.modelProviderSave, (_event, value) =>
    handlers.saveModelProvider.execute(
      requireSaveModelProviderCommand(
        value,
        IPC_COMMAND_CHANNELS.modelProviderSave
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.modelBuiltinProviderConfigure,
    (_event, value) =>
      handlers.configureBuiltinModelProvider.execute(
        requireConfigureBuiltinModelProviderCommand(
          value,
          IPC_COMMAND_CHANNELS.modelBuiltinProviderConfigure
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.modelDiscoveredProviderConfigure,
    (_event, value) =>
      handlers.configureDiscoveredModelProvider.execute(
        requireConfigureDiscoveredModelProviderCommand(
          value,
          IPC_COMMAND_CHANNELS.modelDiscoveredProviderConfigure
        )
      )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.modelProviderDelete, (_event, value) =>
    handlers.deleteModelProvider.execute(
      requireDeleteModelProviderCommand(
        value,
        IPC_COMMAND_CHANNELS.modelProviderDelete
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.modelProviderCredentialRemove,
    (_event, value) =>
      handlers.removeModelProviderCredential.execute(
        requireRemoveModelProviderCredentialCommand(
          value,
          IPC_COMMAND_CHANNELS.modelProviderCredentialRemove
        )
      )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.modelCredentialKeyRotate,
    (_event, value) =>
      handlers.rotateModelCredentialKey.execute(
        requireRotateModelCredentialKeyCommand(
          value,
          IPC_COMMAND_CHANNELS.modelCredentialKeyRotate
        )
      )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.modelProfileSave, (_event, value) =>
    handlers.saveModelProfile.execute(
      requireSaveModelProfileCommand(
        value,
        IPC_COMMAND_CHANNELS.modelProfileSave
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.modelProfileDelete, (_event, value) =>
    handlers.deleteModelProfile.execute(
      requireDeleteModelProfileCommand(
        value,
        IPC_COMMAND_CHANNELS.modelProfileDelete
      )
    )
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.modelProfilesSetEnabled,
    (_event, value) =>
      handlers.setModelProfilesEnabled.execute(
        requireSetModelProfilesEnabledCommand(
          value,
          IPC_COMMAND_CHANNELS.modelProfilesSetEnabled
        )
      )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.modelProfileValidate, (_event, value) =>
    handlers.validateModelProfile.execute(
      requireValidateModelProfileCommand(
        value,
        IPC_COMMAND_CHANNELS.modelProfileValidate
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.modelDefaultSave, (_event, value) =>
    handlers.saveApplicationModelDefault.execute(
      requireSaveApplicationModelDefaultCommand(
        value,
        IPC_COMMAND_CHANNELS.modelDefaultSave
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.connectorSave, (_event, value) =>
    Promise.resolve(
      handlers.saveConnector.execute(
        requireSaveConnectorCommand(value, IPC_COMMAND_CHANNELS.connectorSave)
      )
    ).then((result) =>
      requireConnectorResult(result, IPC_COMMAND_CHANNELS.connectorSave)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.connectorDelete, (_event, value) =>
    handlers.deleteConnector.execute(
      requireDeleteConnectorCommand(value, IPC_COMMAND_CHANNELS.connectorDelete)
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.connectorValidate, (_event, value) =>
    Promise.resolve(
      handlers.validateConnector.execute(
        requireValidateConnectorCommand(
          value,
          IPC_COMMAND_CHANNELS.connectorValidate
        )
      )
    ).then((result) =>
      requireConnectorResult(result, IPC_COMMAND_CHANNELS.connectorValidate)
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.modelStatisticsQuery, (_event, value) =>
    handlers.queryModelStatistics.execute(
      requireModelStatisticsQuery(
        value,
        IPC_QUERY_CHANNELS.modelStatisticsQuery
      )
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.productAnalyticsQuery, (_event, value) =>
    handlers.queryProductAnalytics.execute(
      requireProductAnalyticsQuery(
        value,
        IPC_QUERY_CHANNELS.productAnalyticsQuery
      )
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.outboundCallAuditQuery, (_event, value) =>
    handlers.queryOutboundCallAudit.execute(
      requireOutboundCallQuery(value, IPC_QUERY_CHANNELS.outboundCallAuditQuery)
    )
  )
  ipcMain.handle(IPC_QUERY_CHANNELS.appSupportGetInfo, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.appSupportGetInfo)
    return Promise.resolve(handlers.getAppSupportInfo.execute()).then(
      (result) =>
        requireAppSupportInfoResult(
          result,
          IPC_QUERY_CHANNELS.appSupportGetInfo
        )
    )
  })
  ipcMain.handle(IPC_COMMAND_CHANNELS.appSupportCheckUpdate, (_event, value) =>
    Promise.resolve(
      handlers.checkForUpdates.execute(
        requireCheckForUpdatesCommand(
          value,
          IPC_COMMAND_CHANNELS.appSupportCheckUpdate
        )
      )
    ).then((result) =>
      requireUpdateCheckRecordResult(
        result,
        IPC_COMMAND_CHANNELS.appSupportCheckUpdate
      )
    )
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.appSupportOpenLink, (_event, value) =>
    Promise.resolve(
      handlers.openSupportLink.execute(
        requireOpenSupportLinkCommand(
          value,
          IPC_COMMAND_CHANNELS.appSupportOpenLink
        )
      )
    ).then((result) =>
      requireSupportLinkResult(result, IPC_COMMAND_CHANNELS.appSupportOpenLink)
    )
  )
}

function toKnowledgeSearchResultDtos(
  results: Awaited<
    ReturnType<BusinessHandlers['searchKnowledge']['execute']>
  >
): KnowledgeSearchResultDto[] {
  return results.map((result) => ({
    id: result.id,
    schemaVersion: result.schemaVersion,
    profileId: result.profileId,
    workspaceId: result.workspaceId,
    workspaceName: result.workspaceName,
    generationId: result.generationId,
    sourceKind: result.sourceKind,
    sourceId: result.sourceId,
    sourceVersion: result.sourceVersion,
    ...(result.requirementId
      ? { requirementId: result.requirementId }
      : {}),
    ...(result.nodeId ? { nodeId: result.nodeId } : {}),
    ...(result.sessionId ? { sessionId: result.sessionId } : {}),
    documentId: result.documentId,
    documentKey: result.documentKey,
    title: result.title,
    chunkId: result.chunkId,
    chunkOrdinal: result.chunkOrdinal,
    startOffset: result.startOffset,
    endOffset: result.endOffset,
    startLine: result.startLine,
    endLine: result.endLine,
    checksum: result.checksum,
    createdAt: result.createdAt,
    ...(result.denseScore === undefined
      ? {}
      : { denseScore: result.denseScore }),
    ...(result.denseRank === undefined
      ? {}
      : { denseRank: result.denseRank }),
    ...(result.bm25Score === undefined
      ? {}
      : { bm25Score: result.bm25Score }),
    ...(result.bm25Rank === undefined
      ? {}
      : { bm25Rank: result.bm25Rank }),
    fusionScore: result.fusionScore,
    fusionRank: result.fusionRank
  }))
}

function toCatalogSearchResultDtos(
  results: Awaited<ReturnType<BusinessHandlers['searchCatalog']['execute']>>
): CatalogSearchResultDto[] {
  return results.map((result) => ({
    id: result.id,
    catalogKind: result.catalogKind,
    catalogId: result.catalogId,
    versionId: result.versionId,
    sourceVersion: result.sourceVersion,
    title: result.title,
    updatedAt: result.updatedAt,
    ...(result.denseScore === undefined
      ? {}
      : { denseScore: result.denseScore }),
    ...(result.denseRank === undefined ? {} : { denseRank: result.denseRank }),
    ...(result.bm25Score === undefined ? {} : { bm25Score: result.bm25Score }),
    ...(result.bm25Rank === undefined ? {} : { bm25Rank: result.bm25Rank }),
    fusionScore: result.fusionScore,
    fusionRank: result.fusionRank
  }))
}

function registerBackupIpc(options: {
  backup: {
    getStatus: () => Promise<BackupStatusDto>
    createBackup: (input: {
      requestId: string
      destinationPath: string
    }) => Promise<BackupOperation>
    inspectRestore: (bundlePath: string) => Promise<RestorePreviewDto>
    prepareRestore: (command: PrepareRestoreCommand) => Promise<BackupOperation>
    restartForRestore: () => Promise<boolean>
  }
  ipcMain: Pick<IpcMain, 'handle'>
  dialog?: {
    showOpenDialog: (options: {
      properties: Array<'openDirectory' | 'createDirectory'>
    }) => Promise<{ canceled: boolean; filePaths: string[] }>
    showSaveDialog?: (options: {
      defaultPath: string
      filters: Array<{ name: string; extensions: string[] }>
      properties: Array<'createDirectory' | 'showOverwriteConfirmation'>
    }) => Promise<{ canceled: boolean; filePath?: string }>
  }
}): void {
  const { backup, ipcMain, dialog } = options
  ipcMain.handle(IPC_QUERY_CHANNELS.backupGetStatus, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.backupGetStatus)
    return backup
      .getStatus()
      .then((result) =>
        requireBackupStatusResult(result, IPC_QUERY_CHANNELS.backupGetStatus)
      )
  })
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.backupChooseDestination,
    async (_event, value) => {
      const command = requireChooseBackupDestinationCommand(
        value,
        IPC_COMMAND_CHANNELS.backupChooseDestination
      )
      if (!dialog?.showSaveDialog) {
        throw new Error('Backup destination picker is unavailable')
      }
      const selection = await dialog.showSaveDialog({
        defaultPath: 'RealmFlow.realmflow-backup',
        filters: [
          {
            name: 'RealmFlow Backup',
            extensions: ['realmflow-backup']
          }
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      })
      if (selection.canceled || !selection.filePath) return null
      const destinationPath =
        extname(selection.filePath) === '.realmflow-backup'
          ? selection.filePath
          : `${selection.filePath}.realmflow-backup`
      const result = await backup.createBackup({
        requestId: command.requestId,
        destinationPath
      })
      return requireBackupOperationResult(
        result,
        IPC_COMMAND_CHANNELS.backupChooseDestination
      )
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.restoreChooseBundle,
    async (_event, ...values) => {
      requireNoIpcPayload(values, IPC_COMMAND_CHANNELS.restoreChooseBundle)
      if (!dialog) throw new Error('Restore bundle picker is unavailable')
      const selection = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      const bundlePath = selection.filePaths[0]
      if (selection.canceled || !bundlePath) return null
      const result = await backup.inspectRestore(bundlePath)
      return requireRestorePreviewResult(
        result,
        IPC_COMMAND_CHANNELS.restoreChooseBundle
      )
    }
  )
  ipcMain.handle(IPC_COMMAND_CHANNELS.restorePrepare, async (_event, value) => {
    const command = requirePrepareRestoreCommand(
      value,
      IPC_COMMAND_CHANNELS.restorePrepare
    )
    const result = await backup.prepareRestore(command)
    return requireBackupOperationResult(
      result,
      IPC_COMMAND_CHANNELS.restorePrepare
    )
  })
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.restoreRestart,
    async (_event, ...values) => {
      requireNoIpcPayload(values, IPC_COMMAND_CHANNELS.restoreRestart)
      const result = await backup.restartForRestore()
      if (result !== true) {
        throw new Error(
          `Invalid IPC result for ${IPC_COMMAND_CHANNELS.restoreRestart}`
        )
      }
      return true
    }
  )
}
