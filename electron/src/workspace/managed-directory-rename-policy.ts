import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { relative, sep } from 'node:path'
import type {
  ManagedDirectoryRenamePolicy,
  ManagedDirectoryWriteTracker
} from '../application/ports/business-repositories'

export type GitCommandRunner = (arguments_: string[]) => Promise<string>

const execFileAsync = promisify(execFile)

async function runGit(arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', arguments_, {
    encoding: 'utf8'
  })
  return stdout
}

export class ManagedDirectoryRenamePolicyService
  implements ManagedDirectoryRenamePolicy
{
  constructor(
    private readonly writes: ManagedDirectoryWriteTracker,
    private readonly git: GitCommandRunner = runGit
  ) {}

  async assertAllowed(input: {
    path: string
    entityType: 'space' | 'requirement'
    entityId: string
  }): Promise<void> {
    if (await this.writes.hasActiveWrites(input.path)) {
      throw new Error('Managed directory has active file writes')
    }

    let repositoryRoot: string
    try {
      repositoryRoot = (
        await this.git([
          '-C',
          input.path,
          'rev-parse',
          '--show-toplevel'
        ])
      ).trim()
    } catch (error) {
      if ((error as { code?: unknown }).code === 128) return
      throw error
    }

    const scopedPath =
      relative(repositoryRoot, input.path).split(sep).join('/') || '.'
    const status = await this.git([
      '-C',
      repositoryRoot,
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      scopedPath
    ])
    if (status.trim()) {
      throw new Error('Managed directory has uncommitted Git changes')
    }
  }
}
