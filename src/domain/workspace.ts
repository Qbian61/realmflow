import {
  isRequirementStageId,
  type RequirementStageId
} from './requirement'

export type WorkspaceSpace = {
  path: string
  label: string
  description: string
}

export type WorkspaceRequirement = {
  id: string
  title: string
  stage?: RequirementStageId
  status?: 'pending' | 'active' | 'completed'
  updatedAt?: number
}

export type WorkspaceNavigation = {
  spaces: WorkspaceSpace[]
  requirementsBySpace: Record<string, WorkspaceRequirement[]>
}

export function createDefaultWorkspaceNavigation(): WorkspaceNavigation {
  return {
    spaces: [
      {
        path: '/spaces/xxx',
        label: 'xxx 空间',
        description: '查看空间中的需求与产物'
      }
    ],
    requirementsBySpace: {
      '/spaces/xxx': [
        {
          id: 'test-requirement',
          title: '测试需求'
        }
      ]
    }
  }
}

export function isWorkspaceSpace(value: unknown): value is WorkspaceSpace {
  if (!isRecord(value)) return false
  return (
    typeof value.path === 'string' &&
    value.path.startsWith('/spaces/') &&
    typeof value.label === 'string' &&
    typeof value.description === 'string'
  )
}

export function isWorkspaceRequirement(
  value: unknown
): value is WorkspaceRequirement {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.stage === undefined || isRequirementStageId(value.stage)) &&
    (value.status === undefined ||
      ['pending', 'active', 'completed'].includes(String(value.status))) &&
    (value.updatedAt === undefined || typeof value.updatedAt === 'number')
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
