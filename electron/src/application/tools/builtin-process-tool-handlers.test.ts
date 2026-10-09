import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import {
  createProcessToolHandlers,
  type ManagedProcessPort
} from './builtin-process-tool-handlers'

describe('builtin process Tool handlers', () => {
  let temporaryDirectory: string
  let rootPath: string
  let processes: ManagedProcessPort

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-process-'))
    rootPath = join(temporaryDirectory, 'workspace')
    await mkdir(join(rootPath, 'app'), { recursive: true })
    processes = {
      discover: vi.fn().mockResolvedValue([
        { name: 'node', path: '/usr/bin/node', version: 'v20.0.0' }
      ]),
      run: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        truncated: false,
        durationMs: 10
      }),
      start: vi.fn().mockResolvedValue({
        processId: 'process-1',
        pid: 123,
        status: 'running'
      }),
      list: vi.fn().mockResolvedValue([]),
      stop: vi.fn().mockResolvedValue({
        processId: 'process-1',
        stopped: true
      })
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('discovers only explicitly requested executable names', async () => {
    await expect(
      run('process.discover', { names: ['node', 'git'] })
    ).resolves.toMatchObject({ tools: [{ name: 'node' }] })
    expect(processes.discover).toHaveBeenCalledWith({
      names: ['node', 'git'],
      cwd: expect.stringMatching(/\/workspace$/),
      signal: expect.any(AbortSignal)
    })
  })

  it('runs a bounded foreground process without a shell', async () => {
    await expect(
      run('process.run', {
        executable: 'npm',
        arguments: ['test', '--', 'unit'],
        cwd: 'app',
        timeoutMs: 2_000,
        maxOutputBytes: 32_000
      })
    ).resolves.toMatchObject({ exitCode: 0, stdout: 'ok' })
    expect(processes.run).toHaveBeenCalledWith({
      executable: 'npm',
      arguments: ['test', '--', 'unit'],
      cwd: expect.stringMatching(/\/workspace\/app$/),
      timeoutMs: 2_000,
      maxOutputBytes: 32_000,
      signal: expect.any(AbortSignal)
    })
  })

  it('accepts a small explicit process output limit', async () => {
    await expect(
      run('process.run', {
        executable: 'npm',
        arguments: ['test'],
        maxOutputBytes: 64_000
      })
    ).resolves.toMatchObject({ exitCode: 0, stdout: 'ok' })
    expect(processes.run).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputBytes: 64_000
      })
    )
  })

  it('accepts an explicitly addressed absolute executable path', async () => {
    await expect(
      run('process.run', {
        executable: '/bin/sh',
        arguments: ['-lc', 'printf ok'],
        cwd: 'app'
      })
    ).resolves.toMatchObject({ exitCode: 0, stdout: 'ok' })
    expect(processes.run).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: '/bin/sh',
        arguments: ['-lc', 'printf ok'],
        cwd: expect.stringMatching(/\/workspace\/app$/)
      })
    )
  })

  it('starts, lists, and stops processes under the execution owner', async () => {
    await run('process.start', {
      executable: 'npm',
      arguments: ['run', 'dev'],
      cwd: 'app'
    })
    await run('process.list', {})
    await run('process.stop', { processId: 'process-1' })

    const owner = { type: 'node_run', id: 'node-run-1' }
    expect(processes.start).toHaveBeenCalledWith(
      expect.objectContaining({ owner, executable: 'npm' })
    )
    expect(processes.list).toHaveBeenCalledWith(owner)
    expect(processes.stop).toHaveBeenCalledWith({
      owner,
      processId: 'process-1'
    })
  })

  it('rejects shell fragments, absolute cwd, and empty discovery lists', async () => {
    await expect(
      run('process.run', {
        executable: 'npm test && rm -rf /',
        arguments: []
      })
    ).rejects.toThrow('Process Tool executable is invalid')
    await expect(
      run('process.run', {
        executable: 'npm',
        arguments: [],
        cwd: '/tmp'
      })
    ).rejects.toThrow('Path is outside the bound workspace')
    await expect(
      run('process.discover', { names: [] })
    ).rejects.toThrow('Process Tool names are invalid')
  })

  it('returns actionable validation errors for common model argument mistakes', async () => {
    await expect(
      run('process.run', {
        executable: 'npm',
        args: ['test']
      })
    ).rejects.toThrow('Process Tool arguments must be provided as arguments')
    await expect(
      run('process.run', {
        command: 'npm test'
      })
    ).rejects.toThrow('Process Tool executable is required')
    await expect(
      run('process.discover', {})
    ).rejects.toThrow('Process Tool names are required')
  })

  async function run(name: string, arguments_: JsonObject) {
    const handler = createProcessToolHandlers(processes).find(
      (candidate) => candidate.name === name
    )
    if (!handler) throw new Error(`Missing handler: ${name}`)
    return handler.execute({
      arguments: arguments_,
      requestedBy: { type: 'user', id: 'local-user' },
      context: {
        owner: { type: 'node_run', id: 'node-run-1' },
        nodeRunId: 'node-run-1',
        correlationId: 'correlation-1',
        causationId: 'command-1'
      },
      scopeRoots: [rootPath],
      signal: new AbortController().signal,
      sink: { emit: vi.fn() }
    })
  }
})
