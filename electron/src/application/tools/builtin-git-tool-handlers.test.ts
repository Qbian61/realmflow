import { mkdir, mkdtemp, rm } from 'node:fs/promises'
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
    command = {
      run: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'result',
        stderr: '',
        truncated: false
      })
    }
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
      cwd: expect.stringMatching(/\/repository$/),
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

    expect(command.run).toHaveBeenNthCalledWith(1, {
      executable: 'git',
      arguments: ['add', '--', 'src/a.ts', 'src/b.ts'],
      cwd: expect.any(String),
      signal: expect.any(AbortSignal),
      maxOutputBytes: 4 * 1024 * 1024
    })
    expect(command.run).toHaveBeenNthCalledWith(2, {
      executable: 'git',
      arguments: [
        'commit',
        '--message',
        'fix: keep explicit staging',
        '--',
        'src/a.ts',
        'src/b.ts'
      ],
      cwd: expect.any(String),
      signal: expect.any(AbortSignal),
      maxOutputBytes: 4 * 1024 * 1024
    })
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

  async function run(name: string, arguments_: JsonObject) {
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
      scopeRoots: [repositoryRoot],
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }
})
