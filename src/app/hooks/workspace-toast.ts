import type { ToastApi } from '../../features/toast/ToastProvider'
import type { TranslationKey } from '../../localization/translate'
import type { WorkspaceOperationNotice } from './use-workspace-controller'

export type WorkspaceToastPublisher = Pick<
  ToastApi,
  'warning' | 'error'
>

const errorMessageKeys: Record<
  Exclude<WorkspaceOperationNotice, 'work-root-required'>,
  TranslationKey
> = {
  'space-create-failed': 'toast.workspace.createFailed',
  'space-rename-failed': 'toast.workspace.renameFailed',
  'space-relocate-failed': 'toast.workspace.relocateFailed',
  'space-delete-failed': 'toast.workspace.deleteFailed',
  'space-move-failed': 'toast.workspace.moveFailed',
  'requirement-create-failed': 'toast.requirement.createFailed',
  'requirement-rename-failed': 'toast.requirement.renameFailed',
  'requirement-delete-failed': 'toast.requirement.deleteFailed',
  'requirement-move-failed': 'toast.requirement.moveFailed',
  'conversation-rename-failed': 'toast.conversation.renameFailed',
  'conversation-delete-failed': 'toast.conversation.deleteFailed'
}

export function publishWorkspaceOperationNotice(
  toast: WorkspaceToastPublisher,
  notice: WorkspaceOperationNotice
): void {
  if (notice === 'work-root-required') {
    toast.warning('workspace.workRootRequired', {
      dedupeKey: 'workspace-work-root-required'
    })
    return
  }

  toast.error(errorMessageKeys[notice], {
    dedupeKey: `workspace-operation-${notice}`
  })
}
