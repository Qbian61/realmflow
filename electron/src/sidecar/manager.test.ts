import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  existsSync: vi.fn(() => true),
  getHealth: vi.fn(async () => ({
    status: 'ok' as const,
    embedding: {
      status: 'ready' as const,
      model: 'Alibaba-NLP/gte-multilingual-base',
      revision: 'main',
      dimensions: 768
    }
  }))
}))

vi.mock('node:child_process', () => ({
  default: { spawn: mocks.spawn },
  spawn: mocks.spawn
}))

vi.mock('node:fs', () => ({
  default: { existsSync: mocks.existsSync },
  existsSync: mocks.existsSync
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app'
  }
}))

vi.mock('./client', () => ({
  SidecarClient: class {
    getHealth = mocks.getHealth
  }
}))

import { SidecarManager } from './manager'

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  exitCode: number | null = null
  readonly kill = vi.fn((_signal?: NodeJS.Signals | number) => true)

  exit(code = 0, signal: NodeJS.Signals | null = null): void {
    this.exitCode = code
    this.emit('exit', code, signal)
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('SidecarManager shutdown', () => {
  beforeEach(() => {
    mocks.spawn.mockReset()
    mocks.existsSync.mockClear()
    mocks.getHealth.mockReset()
    mocks.getHealth.mockResolvedValue({
      status: 'ok',
      embedding: {
        status: 'ready',
        model: 'Alibaba-NLP/gte-multilingual-base',
        revision: 'main',
        dimensions: 768
      }
    })
  })

  it('uses the python-service virtual environment in development', async () => {
    const child = new FakeChildProcess()
    mocks.spawn.mockReturnValue(child)
    const manager = new SidecarManager()

    await manager.start()

    expect(mocks.existsSync).toHaveBeenCalledWith(
      '/app/python-service/.venv/bin/python'
    )
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/app/python-service/.venv/bin/python',
      ['/app/python-service/main.py'],
      expect.objectContaining({ cwd: '/app/python-service' })
    )
    child.exit()
  })

  it('waits long enough for a slow Python service startup', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeChildProcess()
      mocks.spawn.mockReturnValue(child)
      mocks.getHealth.mockRejectedValue(new Error('not ready'))
      for (let attempt = 0; attempt < 25; attempt += 1) {
        mocks.getHealth.mockRejectedValueOnce(new Error('not ready'))
      }
      mocks.getHealth.mockResolvedValueOnce({
        status: 'ok',
        embedding: {
          status: 'ready',
          model: 'Alibaba-NLP/gte-multilingual-base',
          revision: 'main',
          dimensions: 768
        }
      })
      const manager = new SidecarManager()

      const starting = manager.start()
      await vi.runAllTimersAsync()
      await starting

      expect(manager.getStatus()).toBe('ready')
      expect(mocks.getHealth).toHaveBeenCalledTimes(26)
      child.exit()
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for the child process to exit after SIGTERM', async () => {
    const child = new FakeChildProcess()
    mocks.spawn.mockReturnValue(child)
    const manager = new SidecarManager()
    await manager.start()

    let stopped = false
    const stopping = Promise.resolve(manager.stop()).then(() => {
      stopped = true
    })
    await flushMicrotasks()

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(stopped).toBe(false)

    child.exit(0, 'SIGTERM')
    await stopping

    expect(manager.getStatus()).toBe('stopped')
  })

  it('clears the force-kill timer after a graceful exit', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeChildProcess()
      mocks.spawn.mockReturnValue(child)
      const manager = new SidecarManager()
      await manager.start()

      const stopping = manager.stop()
      child.exit(0, 'SIGTERM')
      await stopping

      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends SIGKILL after the graceful shutdown timeout and still waits for exit', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeChildProcess()
      mocks.spawn.mockReturnValue(child)
      const manager = new SidecarManager()
      await manager.start()

      let stopped = false
      const stopping = Promise.resolve(manager.stop()).then(() => {
        stopped = true
      })
      await vi.runAllTimersAsync()

      expect(child.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']])
      expect(stopped).toBe(false)

      child.exit(137, 'SIGKILL')
      await stopping
      expect(stopped).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shares one in-flight stop and does not signal the child twice', async () => {
    const child = new FakeChildProcess()
    mocks.spawn.mockReturnValue(child)
    const manager = new SidecarManager()
    await manager.start()

    const first = Promise.resolve(manager.stop())
    const second = Promise.resolve(manager.stop())
    await flushMicrotasks()

    expect(child.kill).toHaveBeenCalledTimes(1)

    child.exit(0, 'SIGTERM')
    await Promise.all([first, second])
  })
})
