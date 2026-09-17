import type { IpcMain } from 'electron'
import type { BusinessCommandHandlers } from '../../../shared/business'
import { IPC_INVOKE_CHANNELS } from '../../../shared/ipc-contract'
import {
  requireAnswerNodeQuestionCommand,
  requireAppendConversationMessageCommand,
  requireCreateConversationCommand,
  requireCreateRequirementCommand,
  requireCreateSpaceCommand,
  requireDeleteEntityCommand,
  requireInsertWorkflowNodeCommand,
  requireManageWorkflowNodeExecutionCommand,
  requireModelCredentialCommand,
  requireModelMetricFilters,
  requireNodeRunIdCommand,
  requireRemoveWorkflowNodeCommand,
  requireReorderWorkflowNodesCommand,
  requireResolveWorkflowNodeGateCommand,
  requireRestoreEntityCommand,
  requireRequirementIdCommand,
  requireSaveNodeTodoCommand,
  requireSaveModelProfileCommand,
  requireSaveModelProviderCommand,
  requireSaveSpaceResourceCommand,
  requireSelectWorkRootCommand,
  requireSessionIdCommand,
  requireUpdateRequirementCommand,
  requireUpdateSpaceCommand,
  requireUpdateWorkflowEdgeCommand,
  requireWorkflowNodeIdCommand,
  requireWorkspaceIdCommand
} from './runtime-validation'

export function registerBusinessIpc(options: {
  handlers: BusinessCommandHandlers
  ipcMain: Pick<IpcMain, 'handle'>
}): void {
  const { handlers, ipcMain } = options
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.settingsSelectWorkRoot,
    (_event, value) =>
      handlers.selectWorkRoot.execute(
        requireSelectWorkRootCommand(
          value,
          IPC_INVOKE_CHANNELS.settingsSelectWorkRoot
        )
      )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.settingsListWorkRoots, () =>
    handlers.listWorkRoots.execute()
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.spaceCreate, (_event, value) =>
    handlers.createSpace.execute(
      requireCreateSpaceCommand(value, IPC_INVOKE_CHANNELS.spaceCreate)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.spaceList, () =>
    handlers.listSpaces.execute()
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.spaceUpdate, (_event, value) =>
    handlers.updateSpace.execute(
      requireUpdateSpaceCommand(value, IPC_INVOKE_CHANNELS.spaceUpdate)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.spaceDelete, (_event, value) =>
    handlers.deleteSpace.execute(
      requireDeleteEntityCommand(value, IPC_INVOKE_CHANNELS.spaceDelete)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.spaceRestore, (_event, value) =>
    handlers.restoreSpace.execute(
      requireRestoreEntityCommand(value, IPC_INVOKE_CHANNELS.spaceRestore)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.requirementCreate, (_event, value) =>
    handlers.createRequirement.execute(
      requireCreateRequirementCommand(
        value,
        IPC_INVOKE_CHANNELS.requirementCreate
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.requirementList, (_event, value) =>
    handlers.listRequirements.execute(
      requireWorkspaceIdCommand(value, IPC_INVOKE_CHANNELS.requirementList)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.requirementUpdate, (_event, value) =>
    handlers.updateRequirement.execute(
      requireUpdateRequirementCommand(
        value,
        IPC_INVOKE_CHANNELS.requirementUpdate
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.requirementDelete, (_event, value) =>
    handlers.deleteRequirement.execute(
      requireDeleteEntityCommand(
        value,
        IPC_INVOKE_CHANNELS.requirementDelete
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.requirementRestore, (_event, value) =>
    handlers.restoreRequirement.execute(
      requireRestoreEntityCommand(
        value,
        IPC_INVOKE_CHANNELS.requirementRestore
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.workflowTemplateList, () =>
    handlers.listWorkflowTemplates.execute()
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.requirementWorkflowGet,
    (_event, value) =>
      handlers.getRequirementWorkflow.execute(
        requireRequirementIdCommand(
          value,
          IPC_INVOKE_CHANNELS.requirementWorkflowGet
        )
      )
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.requirementWorkflowInsertNode,
    (_event, value) => {
      const command = requireInsertWorkflowNodeCommand(
        value,
        IPC_INVOKE_CHANNELS.requirementWorkflowInsertNode
      )
      return handlers.insertWorkflowNode.execute(command)
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.requirementWorkflowRemoveNode,
    (_event, value) =>
      handlers.removeWorkflowNode.execute(
        requireRemoveWorkflowNodeCommand(
          value,
          IPC_INVOKE_CHANNELS.requirementWorkflowRemoveNode
        )
      )
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.requirementWorkflowUpdateEdge,
    (_event, value) =>
      handlers.updateWorkflowEdge.execute(
        requireUpdateWorkflowEdgeCommand(
          value,
          IPC_INVOKE_CHANNELS.requirementWorkflowUpdateEdge
        )
      )
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.requirementWorkflowReorder,
    (_event, value) =>
      handlers.reorderWorkflowNodes.execute(
        requireReorderWorkflowNodesCommand(
          value,
          IPC_INVOKE_CHANNELS.requirementWorkflowReorder
        )
      )
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.workflowNodeExecutionGet,
    (_event, value) =>
      handlers.getWorkflowNodeExecution.execute(
        requireWorkflowNodeIdCommand(
          value,
          IPC_INVOKE_CHANNELS.workflowNodeExecutionGet
        )
      )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.workflowNodePause, (_event, value) =>
    handlers.pauseWorkflowNode.execute(
      requireManageWorkflowNodeExecutionCommand(
        value,
        IPC_INVOKE_CHANNELS.workflowNodePause
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.workflowNodeResume, (_event, value) =>
    handlers.resumeWorkflowNode.execute(
      requireManageWorkflowNodeExecutionCommand(
        value,
        IPC_INVOKE_CHANNELS.workflowNodeResume
      )
    )
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.workflowNodeResolveGate,
    (_event, value) =>
      handlers.resolveWorkflowNodeGate.execute(
        requireResolveWorkflowNodeGateCommand(
          value,
          IPC_INVOKE_CHANNELS.workflowNodeResolveGate
        )
      )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.conversationListRecent, () =>
    handlers.listRecentConversations.execute()
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.conversationListByWorkspace,
    (_event, value) =>
      handlers.listWorkspaceConversations.execute(
        requireWorkspaceIdCommand(
          value,
          IPC_INVOKE_CHANNELS.conversationListByWorkspace
        )
      )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.conversationGet, (_event, value) =>
    handlers.getConversation.execute(
      requireSessionIdCommand(value, IPC_INVOKE_CHANNELS.conversationGet)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.conversationCreate, (_event, value) =>
    handlers.createConversation.execute(
      requireCreateConversationCommand(
        value,
        IPC_INVOKE_CHANNELS.conversationCreate
      )
    )
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.conversationAppendMessage,
    (_event, value) =>
      handlers.appendConversationMessage.execute(
        requireAppendConversationMessageCommand(
          value,
          IPC_INVOKE_CHANNELS.conversationAppendMessage
        )
      )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.spaceResourceList, (_event, value) =>
    handlers.listSpaceResources.execute(
      requireWorkspaceIdCommand(value, IPC_INVOKE_CHANNELS.spaceResourceList)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.spaceResourceSave, (_event, value) =>
    handlers.saveSpaceResource.execute(
      requireSaveSpaceResourceCommand(
        value,
        IPC_INVOKE_CHANNELS.spaceResourceSave
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.spaceResourceDelete, (_event, value) =>
    handlers.deleteSpaceResource.execute(
      requireDeleteEntityCommand(
        value,
        IPC_INVOKE_CHANNELS.spaceResourceDelete
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.nodeTodoList, (_event, value) =>
    handlers.listNodeTodos.execute(
      requireNodeRunIdCommand(value, IPC_INVOKE_CHANNELS.nodeTodoList)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.nodeTodoSave, (_event, value) =>
    handlers.saveNodeTodo.execute(
      requireSaveNodeTodoCommand(value, IPC_INVOKE_CHANNELS.nodeTodoSave)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.nodeQuestionList, (_event, value) =>
    handlers.listNodeQuestions.execute(
      requireNodeRunIdCommand(value, IPC_INVOKE_CHANNELS.nodeQuestionList)
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.nodeQuestionAnswer, (_event, value) =>
    handlers.answerNodeQuestion.execute(
      requireAnswerNodeQuestionCommand(
        value,
        IPC_INVOKE_CHANNELS.nodeQuestionAnswer
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.modelList, () =>
    handlers.listModels.execute()
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.modelProviderSave, (_event, value) =>
    handlers.saveModelProvider.execute(
      requireSaveModelProviderCommand(
        value,
        IPC_INVOKE_CHANNELS.modelProviderSave
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.modelProfileSave, (_event, value) =>
    handlers.saveModelProfile.execute(
      requireSaveModelProfileCommand(
        value,
        IPC_INVOKE_CHANNELS.modelProfileSave
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.modelCredentialSet, (_event, value) =>
    handlers.setModelCredential.execute(
      requireModelCredentialCommand(
        value,
        IPC_INVOKE_CHANNELS.modelCredentialSet
      )
    )
  )
  ipcMain.handle(IPC_INVOKE_CHANNELS.modelMetricList, (_event, value) =>
    handlers.listModelMetrics.execute(
      requireModelMetricFilters(value, IPC_INVOKE_CHANNELS.modelMetricList)
    )
  )
}
