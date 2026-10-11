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
  ReusableToolPermissionView,
  ToolPermissionRequestProjection
} from '../../../shared/tool-permissions'
import { requireNoIpcPayload } from './runtime-validation'
import type { ApprovalDefaultView, ApprovalHistoryQuery, ApprovalHistoryView } from '../../../shared/tool-permissions'
import { normalizeApprovalProfile } from '../../../domain/approval-profile'

type RegisterToolPermissionIpcOptions = {
  defaults?: { get(): Promise<ApprovalDefaultView>; save(command: ApprovalDefaultView): Promise<ApprovalDefaultView> }
  observability?: { query(query: ApprovalHistoryQuery): Promise<ApprovalHistoryView> }
  permissions: {
    listPendingPermissions(): Promise<PendingToolPermissionView[]>
  }
  decisions: {
    resolve(
      command: PermissionDecisionCommand
    ): Promise<ToolPermissionRequestProjection>
    listGrants(): Promise<ReusableToolPermissionView[]>
    revokeGrant(grantId: string): Promise<void>
  }
  onChanged?: () => Promise<void> | void
  ipcMain: Pick<IpcMain, 'handle'>
}

export function registerToolPermissionIpc({
  permissions,
  decisions,
  defaults,
  observability,
  onChanged,
  ipcMain
}: RegisterToolPermissionIpcOptions): void {
  ipcMain.handle(IPC_QUERY_CHANNELS.toolPermissionGetDefault, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.toolPermissionGetDefault)
    if (!defaults) throw new Error('approval_default_unavailable')
    return defaults.get()
  })
  ipcMain.handle(IPC_COMMAND_CHANNELS.toolPermissionSetDefault, async (_event, value) => {
    const command = requireObject(value, 'Approval default')
    requireExactKeys(command, new Set(['approvalProfileId', 'revision']), 'Approval default')
    if (!defaults) throw new Error('approval_default_unavailable')
    const result = await defaults.save({
      approvalProfileId: normalizeApprovalProfile(command.approvalProfileId),
      revision: requireInteger(command.revision, 'Approval default revision', 0, Number.MAX_SAFE_INTEGER)
    })
    await onChanged?.()
    return result
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.toolPermissionHistory, (_event, value) => {
    const query = requireObject(value, 'Approval history query')
    requireExactKeys(query, new Set(['risk', 'limit']), 'Approval history query', new Set(['risk', 'limit']))
    if (!observability) throw new Error('approval_history_unavailable')
    return observability.query({
      ...(query.risk !== undefined ? { risk: requireEnum(query.risk, new Set(['L0', 'L1', 'L2', 'L3', 'L4'] as const), 'Approval risk') } : {}),
      ...(query.limit !== undefined ? { limit: requireInteger(query.limit, 'Approval history limit', 1, 500) } : {})
    })
  })
  ipcMain.handle(IPC_QUERY_CHANNELS.toolPermissionListGrants, (_event, ...values) => {
    requireNoIpcPayload(values, IPC_QUERY_CHANNELS.toolPermissionListGrants)
    return decisions.listGrants()
  })
  ipcMain.handle(IPC_COMMAND_CHANNELS.toolPermissionRevokeGrant, async (_event, value) => {
    await decisions.revokeGrant(requireIdentifier(value, 'Tool permission grant ID'))
    await onChanged?.()
  })
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
      new Set(['allow_once', 'deny', 'allow_session', 'allow_requirement', 'allow_space', 'allow_always'] as const),
      'Tool permission decision'
    )
  }
}
