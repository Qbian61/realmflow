import type { IpcMain } from 'electron'
import type { AiRunEvent } from '../../../../domain/ai-run'
import { IPC_INVOKE_CHANNELS } from '../../../../shared/ipc-contract'
import {
  requireCancelAiRunInput,
  requireGetAiRunInput,
  requireListAiRunEventsInput,
  requireStartAiRunInput
} from '../../ipc/runtime-validation'
import type {
  GetAiRunUseCase,
  ListAiRunEventsUseCase
} from '../../application/query-ai-runs'
import type { CancelAiRunUseCase } from '../application/generate-stage-artifact'
import type { ExecuteWorkflowStageUseCase } from '../../application/workflow/execute-workflow-stage'
import type { ExecuteWorkflowNodeUseCase } from '../../application/workflow/execute-workflow-node'

type RunEventTarget = {
  id: number
  isDestroyed: () => boolean
  send: (channel: string, event: AiRunEvent) => void
  once?: (event: 'destroyed', listener: () => void) => void
}

export interface RunEventSubscriber {
  subscribe: (runId: string, target: RunEventTarget) => void
}

type Dependencies = {
  executeNode: Pick<ExecuteWorkflowNodeUseCase, 'execute'>
  executeStage: Pick<ExecuteWorkflowStageUseCase, 'execute'>
  cancel: Pick<CancelAiRunUseCase, 'execute'>
  getRun: Pick<GetAiRunUseCase, 'execute'>
  listEvents: Pick<ListAiRunEventsUseCase, 'execute'>
  publisher: RunEventSubscriber
  ipcMain: Pick<IpcMain, 'handle'>
}

export function registerAiRunIpc({
  executeNode,
  executeStage,
  cancel,
  getRun,
  listEvents,
  publisher,
  ipcMain
}: Dependencies): void {
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.aiRunStart,
    async (event, payload: unknown) => {
      const input = requireStartAiRunInput(
        payload,
        IPC_INVOKE_CHANNELS.aiRunStart
      )
      const handle =
        input.nodeId !== undefined && input.nodeRunId !== undefined
          ? await executeNode.execute({
              requirementId: input.requirementId,
              nodeId: input.nodeId,
              nodeRunId: input.nodeRunId,
              ...(input.modelProfileId
                ? { modelProfileId: input.modelProfileId }
                : {})
            })
          : await executeStage.execute({
              requirementId: input.requirementId,
              stageId: input.stageId!,
              ...(input.nodeRunId ? { nodeRunId: input.nodeRunId } : {}),
              ...(input.modelProfileId
                ? { modelProfileId: input.modelProfileId }
                : {})
            })
      publisher.subscribe(handle.runId, event.sender)
      return { runId: handle.runId }
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.aiRunCancel,
    async (_event, payload: unknown) => {
      const input = requireCancelAiRunInput(
        payload,
        IPC_INVOKE_CHANNELS.aiRunCancel
      )
      await cancel.execute(input.runId)
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.aiRunGet,
    async (_event, payload: unknown) => {
      const input = requireGetAiRunInput(payload, IPC_INVOKE_CHANNELS.aiRunGet)
      return getRun.execute(input.runId)
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.aiRunAttach,
    async (event, payload: unknown) => {
      const input = requireGetAiRunInput(
        payload,
        IPC_INVOKE_CHANNELS.aiRunAttach
      )
      publisher.subscribe(input.runId, event.sender)
      const [run, events] = await Promise.all([
        getRun.execute(input.runId),
        listEvents.execute(input.runId)
      ])
      return { run, events }
    }
  )
  ipcMain.handle(
    IPC_INVOKE_CHANNELS.aiRunListEvents,
    async (_event, payload: unknown) => {
      const input = requireListAiRunEventsInput(
        payload,
        IPC_INVOKE_CHANNELS.aiRunListEvents
      )
      return listEvents.execute(input.runId)
    }
  )
}
