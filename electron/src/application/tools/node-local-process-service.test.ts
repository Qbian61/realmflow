import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { NodeLocalProcessService } from './node-local-process-service'

const owner = { type: 'application' as const, id: 'realmflow' }

describe('NodeLocalProcessService', () => {
  it('runs argv directly and captures bounded output', async () => {
    const service = new NodeLocalProcessService()

    await expect(
      service.run({
        executable: process.execPath,
        arguments: ['-e', 'process.stdout.write(process.argv[1])', 'literal'],
        cwd: process.cwd(),
        timeoutMs: 2_000,
        maxOutputBytes: 1_024,
        signal: new AbortController().signal
      })
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: 'literal',
      stderr: '',
      truncated: false
    })
  })

  it('does not expose the host environment to managed commands', async () => {
    process.env.REALMFLOW_TEST_SECRET = 'must-not-leak'
    const service = new NodeLocalProcessService()
    try {
      const result = await service.run({
        executable: process.execPath,
        arguments: [
          '-e',
          [
            'HOME',
            'PATH',
            'TMPDIR',
            'REALMFLOW_TEST_SECRET'
          ].map((name) => `process.env.${name} ?? null`).join(',')
            .replace(
              /^/,
              'process.stdout.write(JSON.stringify(['
            ) + ']))'
        ],
        cwd: process.cwd(),
        timeoutMs: 2_000,
        maxOutputBytes: 1_024,
        signal: new AbortController().signal
      })

      expect(JSON.parse(String(result.stdout))).toEqual([
        null,
        null,
        null,
        null
      ])
    } finally {
      delete process.env.REALMFLOW_TEST_SECRET
    }
  })

  it('classifies output limits and cancellation', async () => {
    const service = new NodeLocalProcessService()
    await expect(
      service.run({
        executable: process.execPath,
        arguments: ['-e', 'process.stdout.write("x".repeat(10000))'],
        cwd: process.cwd(),
        timeoutMs: 2_000,
        maxOutputBytes: 100,
        signal: new AbortController().signal
      })
    ).rejects.toMatchObject({ code: 'tool_output_limit' })

    const controller = new AbortController()
    controller.abort()
    await expect(
      service.run({
        executable: process.execPath,
        arguments: ['-e', 'setInterval(() => {}, 1000)'],
        cwd: process.cwd(),
        timeoutMs: 2_000,
        maxOutputBytes: 100,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('classifies missing executables as dependency gaps', async () => {
    const service = new NodeLocalProcessService()

    await expect(
      service.run({
        executable: 'realmflow-missing-tool-for-test',
        arguments: ['--version'],
        cwd: process.cwd(),
        timeoutMs: 2_000,
        maxOutputBytes: 1_024,
        signal: new AbortController().signal
      })
    ).rejects.toMatchObject({
      code: 'process_dependency_unavailable',
      message:
        'Process dependency realmflow-missing-tool-for-test is unavailable'
    })
  })

  it('prevents descendants from surviving a timed execution', async () => {
    const service = new NodeLocalProcessService()
    let descendantPid = 0
    let earlyExitCode: unknown
    try {
      const result = await service.run({
        executable: process.execPath,
        arguments: [
          '-e',
          [
            "const { spawn } = require('node:child_process')",
            "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
            "process.stdout.write(String(child.pid) + '\\n')",
            'setInterval(() => {}, 1000)'
          ].join(';')
        ],
        cwd: process.cwd(),
        timeoutMs: 500,
        maxOutputBytes: 1_024,
        signal: new AbortController().signal
      })
      earlyExitCode = result.exitCode
    } catch (error) {
      expect(error).toMatchObject({ code: 'tool_timeout' })
      const output =
        error instanceof Error && 'stdout' in error
          ? String(error.stdout)
          : ''
      descendantPid = Number.parseInt(output.trim(), 10)
    }

    if (descendantPid > 0) {
      await expectProcessToExit(descendantPid)
    } else {
      expect(earlyExitCode).not.toBe(0)
    }
  })

  it('lists and stops only processes owned by the caller', async () => {
    const service = new NodeLocalProcessService()
    const started = await service.start({
      owner,
      executable: process.execPath,
      arguments: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      maxOutputBytes: 1_024,
      signal: new AbortController().signal
    })
    const processId = String(started.processId)

    await expect(service.list(owner)).resolves.toEqual([
      expect.objectContaining({ processId, status: 'running' })
    ])
    await expect(
      service.stop({
        owner: { type: 'application', id: 'another-owner' },
        processId
      })
    ).rejects.toThrow('Managed process ownership does not match')
    await expect(service.stop({ owner, processId })).resolves.toEqual({
      processId,
      stopped: true
    })
  })

  it('stops every managed process group during runtime shutdown', async () => {
    const service = new NodeLocalProcessService()
    await service.start({
      owner,
      executable: process.execPath,
      arguments: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      maxOutputBytes: 1_024,
      signal: new AbortController().signal
    })
    await service.start({
      owner: { type: 'application', id: 'another-owner' },
      executable: process.execPath,
      arguments: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      maxOutputBytes: 1_024,
      signal: new AbortController().signal
    })

    await service.close()
    await service.close()

    await expect(service.list(owner)).resolves.toEqual([
      expect.objectContaining({ status: 'stopped' })
    ])
  })

  it('denies outbound network from managed commands', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.end('unexpected')
    })
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    )
    const port = (server.address() as AddressInfo).port
    const service = new NodeLocalProcessService()
    try {
      const result = await service.run({
        executable: process.execPath,
        arguments: [
          '-e',
          `fetch('http://127.0.0.1:${port}').then(() => process.exit(0)).catch(() => process.exit(17))`
        ],
        cwd: process.cwd(),
        timeoutMs: 2_000,
        maxOutputBytes: 1_024,
        signal: new AbortController().signal
      })

      expect(result).toMatchObject({ exitCode: 17 })
      expect(requests).toBe(0)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })

  it('refuses process execution when OS isolation is unavailable', async () => {
    const service = new NodeLocalProcessService({
      sandboxExecutable: null
    })

    await expect(
      service.run({
        executable: process.execPath,
        arguments: ['-e', 'process.stdout.write("unsafe")'],
        cwd: process.cwd(),
        timeoutMs: 2_000,
        maxOutputBytes: 1_024,
        signal: new AbortController().signal
      })
    ).rejects.toMatchObject({ code: 'tool_sandbox_unavailable' })
  })

  it('uses bubblewrap with network and filesystem isolation on Linux', async () => {
    const service = new NodeLocalProcessService({
      platform: 'linux',
      sandboxExecutable: '/bin/echo'
    })

    const result = await service.run({
      executable: process.execPath,
      arguments: ['-e', 'process.stdout.write("unsafe")'],
      cwd: process.cwd(),
      timeoutMs: 2_000,
      maxOutputBytes: 8 * 1024,
      signal: new AbortController().signal
    })

    expect(result.stdout).toContain('--unshare-net')
    expect(result.stdout).toContain('--die-with-parent')
    expect(result.stdout).toContain('--ro-bind /usr /usr')
    expect(result.stdout).toContain(`--bind ${process.cwd()} ${process.cwd()}`)
    expect(result.stdout).toContain(process.execPath)
  })
})

async function expectProcessToExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  process.kill(pid, 'SIGKILL')
  throw new Error(`Descendant process ${pid} was not terminated`)
}
