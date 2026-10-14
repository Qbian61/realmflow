import { realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'

type GitCommandResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
}

type GitRepositoryCommandPort = {
  run(input: {
    executable: string
    arguments: string[]
    cwd: string
    signal: AbortSignal
    maxOutputBytes: number
  }): Promise<GitCommandResult>
}

export type GitRepositoryResolution = {
  selectedRoot: string
  repositoryRoot: string
}

export type GitRepositoryResolverPort = {
  resolve(input: {
    selectedRoot: string
    authorizedRoots: readonly string[]
    signal?: AbortSignal
  }): Promise<GitRepositoryResolution>
}

export class GitToolError extends Error {
  readonly name = 'GitToolError'

  constructor(
    readonly code:
      | 'git_not_repository'
      | 'git_repository_outside_scope'
      | 'git_command_failed',
    message: string
  ) {
    super(message)
  }
}

const DISCOVERY_OUTPUT_LIMIT = 64 * 1024

export class GitCommandRepositoryResolver implements GitRepositoryResolverPort {
  constructor(private readonly command: GitRepositoryCommandPort) {}

  async resolve(input: {
    selectedRoot: string
    authorizedRoots: readonly string[]
    signal?: AbortSignal
  }): Promise<GitRepositoryResolution> {
    const selectedRoot = await realpath(input.selectedRoot)
    const authorizedRoots = await canonicalizeAuthorizedRoots(
      input.authorizedRoots
    )
    const signal = input.signal ?? new AbortController().signal
    const result = await this.command.run({
      executable: 'git',
      arguments: ['rev-parse', '--show-toplevel'],
      cwd: selectedRoot,
      signal,
      maxOutputBytes: DISCOVERY_OUTPUT_LIMIT
    })
    if (result.exitCode !== 0) {
      throw notRepository()
    }
    const repositoryRoot = await canonicalizeRepositoryRoot(result.stdout)
    assertRepositoryInScope(repositoryRoot, authorizedRoots)
    return { selectedRoot, repositoryRoot }
  }
}

export class FilesystemGitRepositoryResolver
  implements GitRepositoryResolverPort
{
  async resolve(input: {
    selectedRoot: string
    authorizedRoots: readonly string[]
  }): Promise<GitRepositoryResolution> {
    const selectedRoot = await realpath(input.selectedRoot)
    const authorizedRoots = await canonicalizeAuthorizedRoots(
      input.authorizedRoots
    )
    const repositoryRoot = await findRepositoryRoot(selectedRoot)
    if (!repositoryRoot) {
      throw notRepository()
    }
    assertRepositoryInScope(repositoryRoot, authorizedRoots)
    return { selectedRoot, repositoryRoot }
  }
}

export function gitCommandFailed(): GitToolError {
  return new GitToolError('git_command_failed', 'Git command failed')
}

function notRepository(): GitToolError {
  return new GitToolError(
    'git_not_repository',
    'Selected folder is not a Git repository. Choose a Git repository folder or a folder inside one.'
  )
}

function repositoryOutsideScope(): GitToolError {
  return new GitToolError(
    'git_repository_outside_scope',
    'Git repository is outside the authorized scope. Choose the repository folder as the scope root.'
  )
}

async function canonicalizeRepositoryRoot(stdout: string): Promise<string> {
  const repositoryRoot = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!repositoryRoot || !isAbsolute(repositoryRoot)) {
    throw notRepository()
  }
  return realpath(repositoryRoot)
}

async function canonicalizeAuthorizedRoots(
  roots: readonly string[]
): Promise<string[]> {
  return Promise.all(roots.map((root) => realpath(root)))
}

async function findRepositoryRoot(
  selectedRoot: string
): Promise<string | undefined> {
  let current = selectedRoot
  while (true) {
    if (await hasGitMarker(current)) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

async function hasGitMarker(directory: string): Promise<boolean> {
  try {
    const marker = await stat(join(directory, '.git'))
    return marker.isDirectory() || marker.isFile()
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

function assertRepositoryInScope(
  repositoryRoot: string,
  authorizedRoots: readonly string[]
): void {
  if (!authorizedRoots.some((root) => isWithin(root, repositoryRoot))) {
    throw repositoryOutsideScope()
  }
}

function isWithin(root: string, target: string): boolean {
  const child = relative(root, target)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}
