import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createNodeQdrantProcessPort,
  QdrantProcessManager,
  QdrantRuntimeError,
  transitionQdrantRuntimeState,
  type QdrantChildProcess,
  type QdrantLaunchDescriptor,
  type QdrantProcessPort
} from './qdrant-process-manager'

class FakeChildProcess extends EventEmitter implements QdrantChildProcess {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  exitCode: number | null = null
  readonly kill = vi.fn((signal?: NodeJS.Signals | number) => {
    if (this.exitsOnSignal) {
      this.exitCode = signal === 'SIGKILL' ? 137 : 0
      queueMicrotask(() => this.emit('exit', this.exitCode, signal ?? null))
    }
    return true
  })

  constructor(private readonly exitsOnSignal = true) {
    super()
  }

  exit(code = 1): void {
    this.exitCode = code
    this.emit('exit', code, null)
  }
}

function createPort(options?: {
  health?: () => Promise<void>
  children?: FakeChildProcess[]
}): QdrantProcessPort & {
  spawn: ReturnType<typeof vi.fn>
  prepare: ReturnType<typeof vi.fn>
} {
  const children = options?.children ?? [new FakeChildProcess()]
  let childIndex = 0
  return {
    prepare: vi.fn(async (): Promise<QdrantLaunchDescriptor> => ({
      executable: '/app/qdrant',
      args: ['--config-path', '/data/config.yaml'],
      cwd: '/data',
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'secret'
    })),
    spawn: vi.fn(() => children[childIndex++] ?? new FakeChildProcess()),
    checkHealth: vi.fn(options?.health ?? (async () => undefined)),
    delay: vi.fn(async () => undefined)
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Condition was not reached')
}

describe('QdrantProcessManager', () => {
  it('defines only legal runtime state transitions', () => {
    expect(transitionQdrantRuntimeState('stopped', 'starting')).toBe(
      'starting'
    )
    expect(transitionQdrantRuntimeState('starting', 'ready')).toBe('ready')
    expect(transitionQdrantRuntimeState('ready', 'stopping')).toBe(
      'stopping'
    )
    expect(transitionQdrantRuntimeState('stopping', 'stopped')).toBe(
      'stopped'
    )
    expect(() =>
      transitionQdrantRuntimeState('stopped', 'ready')
    ).toThrow('Illegal Qdrant runtime transition: stopped -> ready')
  })

  it('starts the process and exposes its connection only after health succeeds', async () => {
    const port = createPort()
    const manager = new QdrantProcessManager(port)

    await expect(manager.start()).resolves.toEqual({
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'secret'
    })

    expect(manager.getState()).toBe('ready')
    expect(port.spawn).toHaveBeenCalledWith({
      executable: '/app/qdrant',
      args: ['--config-path', '/data/config.yaml'],
      cwd: '/data'
    })
    expect(manager.getConnection()).toEqual({
      endpoint: 'http://127.0.0.1:43177',
      apiKey: 'secret'
    })
  })

  it('maps startup timeout to a stable error and terminates the child', async () => {
    const child = new FakeChildProcess()
    const port = createPort({
      children: [child],
      health: async () => {
        throw new Error('not ready')
      }
    })
    const manager = new QdrantProcessManager(port, {
      startupTimeoutMs: 20,
      healthIntervalMs: 10
    })

    await expect(manager.start()).rejects.toMatchObject({
      code: 'QDRANT_START_TIMEOUT',
      message: 'Qdrant did not become healthy before the startup timeout'
    } satisfies Partial<QdrantRuntimeError>)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(manager.getState()).toBe('failed')
    expect(() => manager.getConnection()).toThrow('Qdrant is unavailable')
  })

  it('maps a child process error to startup failure instead of timeout', async () => {
    const child = new FakeChildProcess()
    const port = createPort({
      children: [child],
      health: async () => {
        child.emit('error', new Error('spawn EACCES'))
        throw new Error('not ready')
      }
    })
    const manager = new QdrantProcessManager(port, {
      startupTimeoutMs: 10,
      healthIntervalMs: 10
    })

    await expect(manager.start()).rejects.toMatchObject({
      code: 'QDRANT_START_FAILED',
      message: 'Qdrant process failed to start'
    } satisfies Partial<QdrantRuntimeError>)
  })

  it('restarts unexpected exits only up to the configured limit', async () => {
    const first = new FakeChildProcess()
    const second = new FakeChildProcess()
    const third = new FakeChildProcess()
    const port = createPort({ children: [first, second, third] })
    const manager = new QdrantProcessManager(port, {
      maxRestarts: 2,
      healthIntervalMs: 1,
      startupTimeoutMs: 10
    })
    await manager.start()

    first.exit()
    await waitFor(() => port.spawn.mock.calls.length === 2)
    expect(manager.getState()).toBe('ready')

    second.exit()
    await waitFor(() => port.spawn.mock.calls.length === 3)
    expect(manager.getState()).toBe('ready')

    third.exit()
    await waitFor(() => manager.getState() === 'failed')
    expect(port.spawn).toHaveBeenCalledTimes(3)
  })

  it('waits for the managed child to exit during stop', async () => {
    const child = new FakeChildProcess()
    const port = createPort({ children: [child] })
    const manager = new QdrantProcessManager(port)
    await manager.start()

    await manager.stop()

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(manager.getState()).toBe('stopped')
    expect(() => manager.getConnection()).toThrow('Qdrant is unavailable')
  })

  it('clears the force-kill timer after a graceful exit', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeChildProcess()
      const port = createPort({ children: [child] })
      port.delay = vi.fn(
        (milliseconds: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
      )
      const manager = new QdrantProcessManager(port)
      await manager.start()

      await manager.stop()

      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('force-kills a child that exceeds the graceful shutdown timeout', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeChildProcess(false)
      const port = createPort({ children: [child] })
      const manager = new QdrantProcessManager(port, { stopTimeoutMs: 10 })
      await manager.start()

      let stopped = false
      const stopping = manager.stop().then(() => {
        stopped = true
      })
      await vi.runAllTimersAsync()

      expect(child.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']])
      expect(stopped).toBe(false)

      child.exit(137)
      await stopping
      expect(stopped).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('consumes both output streams and redacts runtime secrets before logging', async () => {
    const child = new FakeChildProcess()
    const logs: Array<{ stream: string; message: string }> = []
    const port = createPort({ children: [child] })
    const manager = new QdrantProcessManager(port, {
      log: (stream, message) => logs.push({ stream, message })
    })
    await manager.start()

    child.stdout.emit('data', Buffer.from('api_key=sec'))
    child.stdout.emit(
      'data',
      Buffer.from('ret config=/data/config.yaml\n')
    )
    child.stderr.emit(
      'data',
      Buffer.from('Authorization: Bearer one-run-token\n')
    )

    expect(logs).toEqual([
      {
        stream: 'stdout',
        message: 'api_key=[REDACTED] config=[REDACTED_PATH]'
      },
      {
        stream: 'stderr',
        message: 'Authorization: [REDACTED]'
      }
    ])
    expect(JSON.stringify(logs)).not.toContain('secret')
    expect(JSON.stringify(logs)).not.toContain('one-run-token')
    expect(JSON.stringify(logs)).not.toContain('/data/config.yaml')

    child.stderr.emit(
      'data',
      Buffer.from(
        '{"content":"body-canary","vector":[0.125,0.25],' +
          '"path":"/Users/private/notes.md"}\n'
      )
    )
    expect(JSON.stringify(logs)).not.toContain('body-canary')
    expect(JSON.stringify(logs)).not.toContain('0.125')
    expect(JSON.stringify(logs)).not.toContain('/Users/private/notes.md')
  })
})

describe('Node Qdrant process port', () => {
  it('prepares local files, spawns with a minimal environment, and authenticates health', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-qdrant-port-'))
    const child = new FakeChildProcess()
    const spawnProcess = vi.fn(() => child)
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))

    try {
      const port = createNodeQdrantProcessPort({
        binaryPath: '/bundle/qdrant',
        userDataPath: directory,
        environment: {
          PATH: '/usr/bin',
          TMPDIR: '/tmp',
          REALMFLOW_PRIVATE_TOKEN: 'must-not-leak'
        },
        reservePort: async () => 43177,
        createApiKey: () => 'local-secret',
        spawnProcess,
        fetchImpl
      })

      const descriptor = await port.prepare()
      expect(descriptor).toEqual({
        executable: '/bundle/qdrant',
        args: [
          '--config-path',
          join(directory, 'qdrant', 'config.yaml')
        ],
        cwd: join(directory, 'qdrant'),
        endpoint: 'http://127.0.0.1:43177',
        apiKey: 'local-secret'
      })
      expect(await readFile(descriptor.args[1], 'utf8')).toContain(
        'api_key: "local-secret"'
      )

      port.spawn(descriptor)
      expect(spawnProcess).toHaveBeenCalledWith(
        '/bundle/qdrant',
        descriptor.args,
        expect.objectContaining({
          cwd: join(directory, 'qdrant'),
          env: { PATH: '/usr/bin', TMPDIR: '/tmp' },
          stdio: 'pipe'
        })
      )

      await port.checkHealth(descriptor)
      expect(fetchImpl).toHaveBeenCalledWith(
        'http://127.0.0.1:43177/healthz',
        expect.objectContaining({
          headers: { 'api-key': 'local-secret' }
        })
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
