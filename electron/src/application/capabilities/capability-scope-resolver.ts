import { isAbsolute, relative, resolve } from 'node:path'
import type { CapabilityScope } from '../../../../domain/capability'
import type { RunContext } from '../../ai-run/application/ports'
import type {
  WorkspaceRepository,
  WorkRootRepository
} from '../ports/business-repositories'

type Dependencies = {
  workspaces: Pick<WorkspaceRepository, 'get'>
  workRoots: Pick<WorkRootRepository, 'list'>
  canonicalizeDirectory(path: string): Promise<string>
}

export class CapabilityScopeResolver {
  constructor(private readonly dependencies: Dependencies) {}

  async resolve(context: RunContext): Promise<CapabilityScope[]> {
    const workspaceId =
      'workspaceId' in context ? context.workspaceId : undefined
    const requirementId =
      'requirementId' in context ? context.requirementId : undefined
    const folderPath =
      'folderPath' in context ? context.folderPath : undefined
    const [workspace, roots, canonicalFolder] = await Promise.all([
      workspaceId
        ? this.dependencies.workspaces.get(workspaceId)
        : Promise.resolve(undefined),
      this.dependencies.workRoots.list(),
      folderPath
        ? this.dependencies.canonicalizeDirectory(folderPath)
        : Promise.resolve(undefined)
    ])
    const workRoot = workspace?.workRootId
      ? roots.find((root) => root.id === workspace.workRootId)
      : canonicalFolder
        ? roots.find((root) => pathWithin(canonicalFolder, root.path))
        : undefined
    const scopes: CapabilityScope[] = [{ kind: 'global' }]
    if (workRoot) {
      scopes.push({ kind: 'work-root', workRootId: workRoot.id })
    }
    if (workspaceId) {
      scopes.push({ kind: 'workspace', workspaceId })
    }
    if (
      workRoot &&
      canonicalFolder &&
      pathWithin(canonicalFolder, workRoot.path)
    ) {
      scopes.push({
        kind: 'folder',
        workRootId: workRoot.id,
        canonicalPath: canonicalFolder
      })
    }
    if (workspaceId && requirementId) {
      scopes.push({
        kind: 'requirement',
        workspaceId,
        requirementId
      })
    }
    return scopes
  }
}

function pathWithin(candidate: string, parent: string): boolean {
  const nested = relative(resolve(parent), resolve(candidate))
  return nested === '' || (!nested.startsWith('..') && !isAbsolute(nested))
}
