import { describe, expect, it, vi } from 'vitest'
import type { ToastApi } from '../../features/toast/ToastProvider'
import {
  publishWorkspaceOperationNotice,
  type WorkspaceToastPublisher
} from './workspace-toast'

function publisher(): WorkspaceToastPublisher {
  return {
    warning: vi.fn(),
    error: vi.fn()
  } as unknown as Pick<ToastApi, 'warning' | 'error'>
}

describe('publishWorkspaceOperationNotice', () => {
  it('publishes missing work root as a deduplicated warning', () => {
    const toast = publisher()

    publishWorkspaceOperationNotice(toast, 'work-root-required')

    expect(toast.warning).toHaveBeenCalledWith(
      'workspace.workRootRequired',
      { dedupeKey: 'workspace-work-root-required' }
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it.each([
    ['space-create-failed', 'toast.workspace.createFailed'],
    ['space-rename-failed', 'toast.workspace.renameFailed'],
    ['space-relocate-failed', 'toast.workspace.relocateFailed'],
    ['space-delete-failed', 'toast.workspace.deleteFailed'],
    ['space-move-failed', 'toast.workspace.moveFailed'],
    ['requirement-create-failed', 'toast.requirement.createFailed'],
    ['requirement-rename-failed', 'toast.requirement.renameFailed'],
    ['requirement-delete-failed', 'toast.requirement.deleteFailed'],
    ['requirement-move-failed', 'toast.requirement.moveFailed']
  ] as const)('maps %s to a safe error toast', (notice, messageKey) => {
    const toast = publisher()

    publishWorkspaceOperationNotice(toast, notice)

    expect(toast.error).toHaveBeenCalledWith(messageKey, {
      dedupeKey: `workspace-operation-${notice}`
    })
  })
})
