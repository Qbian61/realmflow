import {
  createDefaultWorkspaceNavigation,
  isRecord,
  isWorkspaceRequirement,
  isWorkspaceSpace,
  type WorkspaceNavigation
} from '../../domain/workspace'
import {
  createVersionedRepository,
  type StorageAdapter,
  type VersionedRepository
} from './versioned-repository'
import { PERSISTENCE_DATASETS } from './persistence-registry'

export const WORKSPACE_NAVIGATION_STORAGE_KEY =
  PERSISTENCE_DATASETS.workspaceNavigation.key

export function decodeWorkspaceNavigation(
  value: unknown
): WorkspaceNavigation | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.spaces) ||
    !value.spaces.every(isWorkspaceSpace) ||
    !isRecord(value.requirementsBySpace)
  ) {
    return null
  }

  const requirementsBySpace = Object.fromEntries(
    Object.entries(value.requirementsBySpace).filter(
      (entry): entry is [string, WorkspaceNavigation['requirementsBySpace'][string]] =>
        Array.isArray(entry[1]) && entry[1].every(isWorkspaceRequirement)
    )
  )
  if (
    Object.keys(requirementsBySpace).length !==
    Object.keys(value.requirementsBySpace).length
  ) {
    return null
  }
  return { spaces: value.spaces, requirementsBySpace }
}

export function encodeWorkspaceNavigation(
  navigation: WorkspaceNavigation
): unknown {
  return { version: 1, ...navigation }
}

export function createWorkspaceNavigationRepository(
  storage: StorageAdapter = window.localStorage
): VersionedRepository<WorkspaceNavigation> {
  return createVersionedRepository({
    storage,
    key: WORKSPACE_NAVIGATION_STORAGE_KEY,
    fallback: createDefaultWorkspaceNavigation,
    decode: decodeWorkspaceNavigation,
    encode: encodeWorkspaceNavigation
  })
}
