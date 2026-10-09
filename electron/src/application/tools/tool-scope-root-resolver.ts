import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import type { BoundScopeAuthorization } from '../../../../domain/capability-permission'
import type {
  RequirementRepository,
  WorkspaceRepository,
} from '../ports/business-repositories'
import type { ToolExecutionCommand } from './tool-execution-application-service'

type Dependencies = {
  assertFolderAvailable: (folderPath: string) => Promise<void>
  requirements: Pick<RequirementRepository, 'get'>
  workspaces: Pick<WorkspaceRepository, 'get'>
}

export async function resolveToolScopeRoots(
  command: ToolExecutionCommand,
  dependencies: Dependencies,
): Promise<string[]> {
  return resolveExecutionScopeRoots(command.context, dependencies)
}

export async function resolveToolBoundScopeAuthorization(
  command: ToolExecutionCommand,
  dependencies: Dependencies,
  createdAt: number,
): Promise<BoundScopeAuthorization[]> {
  const roots = await resolveToolScopeRoots(command, dependencies)
  if (roots.length === 0) return []
  const canonicalRoots = await Promise.all(
    roots.map((root) => realpath(root)),
  )
  const source: BoundScopeAuthorization['source'] | undefined =
    command.context.folderPath
      ? {
          kind: 'folder',
          folderSessionId:
            command.context.conversationId ??
            digest(command.context.folderPath).slice(0, 24),
        }
      : command.context.scope.kind === 'requirement' &&
          command.context.workspaceId
        ? {
            kind: 'requirement',
            requirementId: command.context.scope.requirementId,
            workspaceId: command.context.workspaceId,
          }
        : command.context.workspaceId
          ? {
              kind: 'space',
              workspaceId: command.context.workspaceId,
            }
          : undefined
  if (!source) return []
  return [
    {
      authorizationId: `bound-${digest(
        JSON.stringify({ source, roots: canonicalRoots }),
      ).slice(0, 24)}`,
      source,
      roots: canonicalRoots.map((canonicalPath) => ({
        canonicalPath,
        access: 'read-write',
      })),
      bindingRevision: 1,
      status: 'active',
      createdAt,
    },
  ]
}

export async function resolveExecutionScopeRoots(
  context: ToolExecutionCommand['context'],
  dependencies: Dependencies,
): Promise<string[]> {
  if (context.folderPath) {
    await dependencies.assertFolderAvailable(context.folderPath)
    return [context.folderPath]
  }
  if (context.scope.kind === 'requirement') {
    if (
      context.requirementId &&
      context.requirementId !== context.scope.requirementId
    ) {
      throw new Error('Tool execution requirement context mismatch')
    }
    const requirement = await dependencies.requirements.get(
      context.scope.requirementId,
    )
    if (!requirement?.workspaceRootPath) {
      throw new Error('Tool execution requirement directory is unavailable')
    }
    if (
      context.workspaceId &&
      requirement.workspaceId !== context.workspaceId
    ) {
      throw new Error('Tool execution requirement workspace mismatch')
    }
    return [requirement.workspaceRootPath]
  }
  if (!context.workspaceId) return []
  const workspace = await dependencies.workspaces.get(context.workspaceId)
  if (!workspace) {
    throw new Error('Tool execution workspace is unavailable')
  }
  return [workspace.rootPath ?? workspace.path]
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
