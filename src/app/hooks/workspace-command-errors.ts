import type {
  BusinessApi,
  CreateSpaceCommand
} from '../../../shared/business'

export async function executeCreateSpace(
  business: BusinessApi,
  command: CreateSpaceCommand,
  refresh: () => Promise<void>
): Promise<'created' | 'work-root-required'> {
  try {
    await business.createSpace(command)
  } catch (reason) {
    if (isWorkRootRequiredError(reason)) return 'work-root-required'
    throw reason
  }
  await refresh()
  return 'created'
}

function isWorkRootRequiredError(reason: unknown): boolean {
  return (
    reason instanceof Error &&
    reason.message.includes('Select a work root before creating a space')
  )
}
