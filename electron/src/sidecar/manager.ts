import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { app } from 'electron'
import type { SidecarStatus } from '../../../shared/types'
import { waitForExitBeforeTimeout } from '../process/wait-for-exit'
import { SidecarClient, type SidecarHealth } from './client'

const HEALTH_RETRIES = 120
const HEALTH_INTERVAL_MS = 500
const STOP_TIMEOUT_MS = 5_000

type HealthClient = {
  getHealth: () => Promise<SidecarHealth>
}

type HealthWaitOptions = {
  retries?: number
  intervalMs?: number
  delay?: (milliseconds: number) => Promise<void>
}

export async function waitUntilSidecarHealthy(
  client: HealthClient,
  {
    retries = HEALTH_RETRIES,
    intervalMs = HEALTH_INTERVAL_MS,
    delay = wait
  }: HealthWaitOptions = {}
): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await client.getHealth()
      return true
    } catch {
      if (attempt + 1 < retries) await delay(intervalMs)
    }
  }
  return false
}

export class SidecarManager {
  private process: ChildProcessWithoutNullStreams | undefined
  private stopPromise: Promise<void> | undefined
  private status: SidecarStatus = 'stopped'
  private port: number | undefined
  private client: SidecarClient | undefined

  getStatus(): SidecarStatus {
    return this.status
  }

  getClient(): SidecarClient {
    if (!this.client || this.status !== 'ready') {
      throw new Error('Sidecar is unavailable')
    }
    return this.client
  }

  async start(): Promise<void> {
    if (this.process) return

    this.status = 'starting'
    this.port = await this.reservePort()
    const authToken = randomBytes(32).toString('base64url')
    const isPackaged = app.isPackaged && !process.env.ELECTRON_RENDERER_URL
    const servicePath = isPackaged
      ? join(process.resourcesPath, 'python-service')
      : join(app.getAppPath(), 'python-service')

    const localPython = join(servicePath, '.venv', 'bin', 'python')
    const executable = isPackaged
      ? join(process.resourcesPath, 'sidecar', this.executableName())
      : process.env.REALMFLOW_PYTHON ||
        (existsSync(localPython) ? localPython : 'python3')
    const args = isPackaged ? [] : [join(servicePath, 'main.py')]

    this.process = spawn(executable, args, {
      cwd: servicePath,
      env: {
        ...process.env,
        REALMFLOW_SIDECAR_HOST: '127.0.0.1',
        REALMFLOW_SIDECAR_PORT: String(this.port),
        REALMFLOW_SIDECAR_TOKEN: authToken
      },
      stdio: 'pipe'
    })

    this.process.stdout.on('data', (chunk) => {
      console.info(`[sidecar] ${String(chunk).trim()}`)
    })
    this.process.stderr.on('data', (chunk) => {
      console.error(`[sidecar] ${String(chunk).trim()}`)
    })
    this.process.once('exit', () => {
      this.process = undefined
      this.client = undefined
      this.status = 'stopped'
    })
    this.process.once('error', (error) => {
      console.error('[sidecar] failed to start', error)
      this.status = 'error'
    })

    this.client = new SidecarClient(
      `http://127.0.0.1:${this.port}`,
      fetch,
      { authToken }
    )
    this.status = (await waitUntilSidecarHealthy(this.client))
      ? 'ready'
      : 'error'
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    const child = this.process
    this.client = undefined
    if (!child || child.exitCode !== null) {
      this.process = undefined
      this.status = 'stopped'
      return Promise.resolve()
    }

    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve())
    })
    this.stopPromise = this.terminate(child, exited).finally(() => {
      if (this.process === child) this.process = undefined
      this.client = undefined
      this.status = 'stopped'
      this.stopPromise = undefined
    })
    return this.stopPromise
  }

  private async terminate(
    child: ChildProcessWithoutNullStreams,
    exited: Promise<void>
  ): Promise<void> {
    child.kill('SIGTERM')
    const graceful = await waitForExitBeforeTimeout(exited, STOP_TIMEOUT_MS)
    if (!graceful && child.exitCode === null) {
      child.kill('SIGKILL')
      await exited
    }
  }

  private reservePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close()
          reject(new Error('Unable to allocate a sidecar port'))
          return
        }
        server.close(() => resolve(address.port))
      })
    })
  }

  private executableName(): string {
    const extension = process.platform === 'win32' ? '.exe' : ''
    return `realmflow-agent-${process.platform}-${process.arch}${extension}`
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
