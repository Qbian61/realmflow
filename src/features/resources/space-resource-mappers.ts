import type { SpaceResourceDto } from '../../../shared/business'
import type {
  OpenedSessionFiles,
  WorkspaceFile
} from '../../../shared/workspace'
import type { SpaceResource } from '../../domain/space-resource'

export function formatResourceUpdatedAt(value?: number): string {
  if (!value) return '刚刚'
  const elapsed = Date.now() - value
  if (elapsed < 86_400_000) return '今天'
  const days = Math.max(1, Math.round(elapsed / 86_400_000))
  return `${days} 天前`
}

export function mapLocalFileResource(
  selection: OpenedSessionFiles,
  file: WorkspaceFile,
  sequence: number
): SpaceResource {
  return {
    id: `file-${Date.now()}-${sequence}`,
    name: file.name,
    type: 'file',
    locator: file.path,
    detail: selection.binding.rootName,
    updatedAt: Date.now()
  }
}

export function mapBusinessResource(
  resource: SpaceResourceDto
): SpaceResource {
  return {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    locator: resource.locator,
    detail: resource.detail,
    sortOrder: resource.sortOrder,
    revision: resource.revision,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt
  }
}
