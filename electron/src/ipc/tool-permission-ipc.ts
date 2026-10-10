import type { IpcMain } from 'electron'
import {
  requireEnum,
  requireExactKeys,
  requireIdentifier,
  requireInteger,
  requireObject
} from '../../../domain/tool-protocol-validation'
import {
  IPC_COMMAND_CHANNELS,
  IPC_QUERY_CHANNELS
} from '../../../shared/ipc-contract'
import type {
  PendingToolPermissionView,
  PermissionDecisionCommand,
  ToolPermissionRequestProjection
} from '../../../shared/tool-permissions'
import { requireNoIpcPayload } from './runtime-validation'

type RegisterToolPermissionIpcOptions = {
  permissions: {
    listPendingPermissions(): Promise<PendingToolPermissionView[]>
  }
  decisions: {
    resolve(
      command: PermissionDecisionCommand
    ): Promise<ToolPermissionRequestProjection>
  }
  onChanged?: () => Promise<void> | void
  ipcMain: Pick<IpcMain, 'handle'>
}

export function registerToolPermissionIpc({
  permissions,
  decisions,
  onChanged,
  ipcMain
}: RegisterToolPermissionIpcOptions): void {
  ipcMain.handle(
    IPC_QUERY_CHANNELS.toolPermissionListPending,
    (_event, ...values) => {
      requireNoIpcPayload(
        values,
        IPC_QUERY_CHANNELS.toolPermissionListPending
      )
      return permissions.listPendingPermissions()
    }
  )
  ipcMain.handle(
    IPC_COMMAND_CHANNELS.toolPermissionResolve,
    async (_event, value) => {
      const result = await decisions.resolve(
        requirePermissionDecisionCommand(value)
      )
      await onChanged?.()
      return result
    }
  )
}

function requirePermissionDecisionCommand(
  value: unknown
): PermissionDecisionCommand {
  const command = requireObject(value, 'Tool permission decision')
  requireExactKeys(
    command,
    new Set(['requestId', 'expectedRevision', 'decision']),
    'Tool permission decision'
  )
  return {
    requestId: requireIdentifier(
      command.requestId,
      'Tool permission request ID'
    ),
    expectedRevision: requireInteger(
      command.expectedRevision,
      'Tool permission revision',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    decision: requireEnum(
      command.decision,
      new Set(['allow_once', 'deny', 'allow_session', 'allow_always'] as const),
      'Tool permission decision'
    )
  }
}
