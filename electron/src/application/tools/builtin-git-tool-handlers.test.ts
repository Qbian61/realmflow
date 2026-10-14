import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  createGitToolHandlers,
  type GitCommandPort
} from './builtin-git-tool-handlers'

describe('builtin Git Tool handlers', () => {
  let temporaryDirectory: string
  let repositoryRoot: string
  let command: GitCommandPort

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-git-tools-'))
    repositoryRoot = join(temporaryDirectory, 'repository')
    await mkdir(repositoryRoot)
    command = { run: vi.fn() }
    mockRepositoryRoot(repositoryRoot)
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it.each([
    ['git.status', {}, ['status', '--short', '--branch', '--untracked-files=all']],
    [
      'git.diff',
      { staged: true, path: 'src/main.ts' },
      ['diff', '--no-ext-diff', '--cached', '--', 'src/main.ts']
    ],
    [
      'git.log',
      { maxCount: 12 },
      [
        'log',
        '--format=%H%x09%an%x09%aI%x09%s',
        '--no-color',
        '--max-count=12'
      ]
    ],
    [
      'git.list_branches',
      {},
      [
        'branch',
        '--all',
        '--no-color',
        '--format=%(refname)%09%(objectname)%09%(HEAD)'
      ]
    ],
    [
      'git.show',
      { ref: 'HEAD~1' },
      ['show', '--no-ext-diff', '--no-color', '--format=fuller', 'HEAD~1']
    ],
    [
      'git.file_history',
      { path: 'src/main.ts', maxCount: 5 },
      [
        'log',
        '--format=%H%x09%an%x09%aI%x09%s',
        '--no-color',
        '--max-count=5',
        '--',
        'src/main.ts'
      ]
    ]
  ])('runs %s with fixed argv', async (name, arguments_, expectedArguments) => {
    await expect(run(name, arguments_ as JsonObject)).resolves.toEqual({
      exitCode: 0,
      stdout: 'result',
      stderr: '',
      truncated: false
    })
    expect(command.run).toHaveBeenCalledWith({
      executable: 'git',
      arguments: expectedArguments,
      cwd: await realpath(repositoryRoot),
      signal: expect.any(AbortSignal),
      maxOutputBytes: 4 * 1024 * 1024
    })
  })

  it('commits only an explicit file list without bypassing hooks', async () => {
    await expect(
      run('git.commit', {
        message: 'fix: keep explicit staging',
        files: ['src/a.ts', 'src/b.ts']
      })
    ).resolves.toMatchObject({
      committed: true,
      files: ['src/a.ts', 'src/b.ts'],
      message: 'fix: keep explicit staging'
    })

    const calls = vi.mocked(command.run).mock.calls.map(([input]) => input)
    expect(calls).toContainEqual({
      executable: 'git',
      arguments: ['add', '--', 'src/a.ts', 'src/b.ts'],
      cwd: await realpath(repositoryRoot),
      signal: expect.any(AbortSignal),
      maxOutputBytes: 4 * 1024 * 1024
    })
    expect(calls).toContainEqual({
      executable: 'git',
      arguments: [
        'commit',
        '--message',
        'fix: keep explicit staging',
        '--',
        'src/a.ts',
        'src/b.ts'
      ],
      cwd: await realpath(repositoryRoot),
      signal: expect.any(AbortSignal),
      maxOutputBytes: 4 * 1024 * 1024
    })
  })

  it('returns a stable not-repository error before running status', async () => {
    vi.mocked(command.run).mockImplementation(async (input) =>
      input.arguments[0] === 'rev-parse'
        ? gitResult({
            exitCode: 128,
            stdout: '',
            stderr: `fatal: not a git repository: ${repositoryRoot}`
          })
        : gitResult({ stdout: 'unexpected' })
    )

    await expect(run('git.status', {})).rejects.toMatchObject({
      code: 'git_not_repository',
      message:
        'Selected folder is not a Git repository. Choose a Git repository folder or a folder inside one.'
    })

    expect(
      vi
        .mocked(command.run)
        .mock.calls.some(([input]) => input.arguments[0] === 'status')
    ).toBe(false)
  })

  it('runs Git commands from the discovered nested repository top-level', async () => {
    const workspaceRoot = join(temporaryDirectory, 'workspace')
    const nestedRepository = join(workspaceRoot, 'repository')
    const selectedDirectory = join(nestedRepository, 'src')
    await mkdir(selectedDirectory, { recursive: true })
    mockRepositoryRoot(nestedRepository)

    await expect(
      run(
        'git.status',
        { scopeRoot: 'repository/src' },
        [workspaceRoot]
      )
    ).resolves.toMatchObject({ stdout: 'result' })

    const calls = vi.mocked(command.run).mock.calls.map(([input]) => input)
    expect(calls[0]).toMatchObject({
      arguments: ['rev-parse', '--show-toplevel'],
      cwd: await realpath(selectedDirectory)
    })
    expect(calls[1]).toMatchObject({
      arguments: ['status', '--short', '--branch', '--untracked-files=all'],
      cwd: await realpath(nestedRepository)
    })
  })

  it('rejects a parent Git repository outside the authorized scope', async () => {
    const parentRepository = join(temporaryDirectory, 'parent-repository')
    const authorizedChild = join(parentRepository, 'child')
    await mkdir(authorizedChild, { recursive: true })
    mockRepositoryRoot(parentRepository)

    await expect(
      run('git.log', { maxCount: 1 }, [authorizedChild])
    ).rejects.toMatchObject({
      code: 'git_repository_outside_scope',
      message:
        'Git repository is outside the authorized scope. Choose the repository folder as the scope root.'
    })

    expect(
      vi
        .mocked(command.run)
        .mock.calls.some(([input]) => input.arguments[0] === 'log')
    ).toBe(false)
  })

  it('rejects option-like refs and empty commit file lists', async () => {
    await expect(run('git.show', { ref: '--help' })).rejects.toThrow(
      'Git Tool ref is invalid'
    )
    await expect(
      run('git.commit', { message: 'fix: invalid', files: [] })
    ).rejects.toThrow('Git Tool files are invalid')
    expect(command.run).not.toHaveBeenCalled()
  })

  async function run(
    name: string,
    arguments_: JsonObject,
    scopeRoots = [repositoryRoot]
  ) {
    const handler = createGitToolHandlers(command).find(
      (candidate) => candidate.name === name
    )
    if (!handler) throw new Error(`Missing handler: ${name}`)
    return handler.execute({
      arguments: arguments_,
      requestedBy: { type: 'user', id: 'local-user' },
      context: {
        owner: { type: 'application', id: 'realmflow' },
        correlationId: 'correlation-1',
        causationId: 'command-1'
      },
      scopeRoots,
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }

  function mockRepositoryRoot(root: string): void {
    vi.mocked(command.run).mockImplementation(async (input) =>
      input.arguments[0] === 'rev-parse'
        ? gitResult({ stdout: `${await realpath(root)}\n` })
        : gitResult({ stdout: 'result' })
    )
  }
})

function gitResult(
  overrides: Partial<Awaited<ReturnType<GitCommandPort['run']>>> = {}
): Awaited<ReturnType<GitCommandPort['run']>> {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    truncated: false,
    ...overrides
  }
}
