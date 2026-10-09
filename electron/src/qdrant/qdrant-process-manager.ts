import {
  spawn as spawnChildProcess,
  type SpawnOptionsWithoutStdio
} from 'node:child_process'
import type { EventEmitter } from 'node:events'
import { join } from 'node:path'
import {
  generateQdrantApiKey,
  reserveQdrantHttpPort,
  writeQdrantConfig
} from './qdrant-config'
import { waitForExitBeforeTimeout } from '../process/wait-for-exit'

export type QdrantRuntimeState =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'failed'
  | 'stopping'

export type QdrantConnection = Readonly<{
  endpoint: string
  apiKey: string
}>

export type QdrantLaunchDescriptor = QdrantConnection &
  Readonly<{
    executable: string
    args: string[]
    cwd: string
  }>

export interface QdrantChildProcess extends EventEmitter {
  readonly stdout: EventEmitter
  readonly stderr: EventEmitter
  exitCode: number | null
  kill(signal?: NodeJS.Signals | number): boolean
}

export interface QdrantProcessPort {
  prepare(): Promise<QdrantLaunchDescriptor>
  spawn(input: {
    executable: string
    args: string[]
    cwd: string
  }): QdrantChildProcess
  checkHealth(connection: QdrantConnection): Promise<void>
  delay(milliseconds: number): Promise<void>
}

type NodeQdrantProcessPortOptions = {
  binaryPath: string
  userDataPath: string
  environment?: NodeJS.ProcessEnv
  reservePort?: () => Promise<number>
  createApiKey?: () => string
  spawnProcess?: (
    executable: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & { stdio: 'pipe' }
  ) => QdrantChildProcess
  fetchImpl?: typeof fetch
}

export type QdrantRuntimeErrorCode =
  | 'QDRANT_START_FAILED'
  | 'QDRANT_START_TIMEOUT'

export class QdrantRuntimeError extends Error {
  constructor(
    readonly code: QdrantRuntimeErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'QdrantRuntimeError'
  }
}

const LEGAL_TRANSITIONS: Readonly<
  Record<QdrantRuntimeState, readonly QdrantRuntimeState[]>
> = {
  stopped: ['starting'],
  starting: ['ready', 'failed', 'stopping'],
  ready: ['starting', 'failed', 'stopping'],
  failed: ['starting', 'stopping', 'stopped'],
  stopping: ['stopped', 'failed']
}

export function transitionQdrantRuntimeState(
  current: QdrantRuntimeState,
  next: QdrantRuntimeState
): QdrantRuntimeState {
  if (!LEGAL_TRANSITIONS[current].includes(next)) {
    throw new Error(
      `Illegal Qdrant runtime transition: ${current} -> ${next}`
    )
  }
  return next
}

type QdrantProcessManagerOptions = {
  startupTimeoutMs?: number
  healthIntervalMs?: number
  stopTimeoutMs?: number
  maxRestarts?: number
  log?: (stream: 'stdout' | 'stderr', message: string) => void
}

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
const DEFAULT_HEALTH_INTERVAL_MS = 250
const DEFAULT_STOP_TIMEOUT_MS = 5_000
const DEFAULT_MAX_RESTARTS = 2
const MAX_LOG_LINE_LENGTH = 64 * 1024

export class QdrantProcessManager {
  private state: QdrantRuntimeState = 'stopped'
  private child: QdrantChildProcess | undefined
  private connection: QdrantConnection | undefined
  private descriptor: QdrantLaunchDescriptor | undefined
  private startPromise: Promise<QdrantConnection> | undefined
  private restartCount = 0
  private stopping = false
  private startupFailure: QdrantRuntimeError | undefined
  private readonly startupTimeoutMs: number
  private readonly healthIntervalMs: number
  private readonly stopTimeoutMs: number
  private readonly maxRestarts: number
  private readonly log:
    | ((stream: 'stdout' | 'stderr', message: string) => void)
    | undefined

  constructor(
    private readonly port: QdrantProcessPort,
    options: QdrantProcessManagerOptions = {}
  ) {
    this.startupTimeoutMs =
      options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS
    this.healthIntervalMs =
      options.healthIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS
    this.stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS
    this.maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS
    this.log = options.log
  }

  getState(): QdrantRuntimeState {
    return this.state
  }

  getConnection(): QdrantConnection {
    if (this.state !== 'ready' || !this.connection) {
      throw new Error('Qdrant is unavailable')
    }
    return this.connection
  }

  start(): Promise<QdrantConnection> {
    if (this.state === 'ready') return Promise.resolve(this.getConnection())
    if (this.startPromise) return this.startPromise

    this.stopping = false
    this.restartCount = 0
    this.setState('starting')
    this.startPromise = this.prepareAndLaunch().finally(() => {
      this.startPromise = undefined
    })
    return this.startPromise
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') return
    this.stopping = true
    if (this.state !== 'stopping') this.setState('stopping')
    this.connection = undefined

    const child = this.child
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => {
        child.once('exit', () => resolve())
      })
      child.kill('SIGTERM')
      const graceful = await waitForExitBeforeTimeout(
        exited,
        this.stopTimeoutMs
      )
      if (!graceful && child.exitCode === null) {
        child.kill('SIGKILL')
        await exited
      }
    }

    this.child = undefined
    this.descriptor = undefined
    this.startupFailure = undefined
    this.setState('stopped')
  }

  private async prepareAndLaunch(): Promise<QdrantConnection> {
    try {
      this.descriptor = await this.port.prepare()
      return await this.launch(this.descriptor)
    } catch (error) {
      await this.failStart(error)
      throw mapStartError(error)
    }
  }

  private async launch(
    descriptor: QdrantLaunchDescriptor
  ): Promise<QdrantConnection> {
    this.startupFailure = undefined
    const child = this.port.spawn({
      executable: descriptor.executable,
      args: descriptor.args,
      cwd: descriptor.cwd
    })
    this.child = child
    consumeQdrantOutput(child.stdout, 'stdout', descriptor, this.log)
    consumeQdrantOutput(child.stderr, 'stderr', descriptor, this.log)
    child.once('error', (error) => {
      this.startupFailure = new QdrantRuntimeError(
        'QDRANT_START_FAILED',
        'Qdrant process failed to start',
        { cause: error }
      )
    })
    child.once('exit', (code, signal) => {
      void this.handleExit(child, code, signal)
    })

    const attempts = Math.max(
      1,
      Math.ceil(this.startupTimeoutMs / this.healthIntervalMs)
    )
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (this.startupFailure) throw this.startupFailure
      try {
        await this.port.checkHealth(descriptor)
        if (this.startupFailure || child.exitCode !== null) {
          throw (
            this.startupFailure ??
            new QdrantRuntimeError(
              'QDRANT_START_FAILED',
              'Qdrant exited before becoming healthy'
            )
          )
        }
        this.connection = {
          endpoint: descriptor.endpoint,
          apiKey: descriptor.apiKey
        }
        this.setState('ready')
        return this.connection
      } catch (error) {
        if (error instanceof QdrantRuntimeError) throw error
        if (this.startupFailure) throw this.startupFailure
        if (attempt + 1 < attempts) {
          await this.port.delay(this.healthIntervalMs)
        }
      }
    }
    throw new QdrantRuntimeError(
      'QDRANT_START_TIMEOUT',
      'Qdrant did not become healthy before the startup timeout'
    )
  }

  private async failStart(error: unknown): Promise<void> {
    const child = this.child
    this.connection = undefined
    this.child = undefined
    if (child && child.exitCode === null) child.kill('SIGTERM')
    if (!this.stopping && this.state !== 'failed') this.setState('failed')
    this.startupFailure =
      error instanceof QdrantRuntimeError ? error : mapStartError(error)
  }

  private async handleExit(
    exitedChild: QdrantChildProcess,
    _code: number | null,
    _signal: NodeJS.Signals | null
  ): Promise<void> {
    if (this.child !== exitedChild) return
    this.child = undefined
    this.connection = undefined
    if (this.stopping || this.state === 'stopping') return
    if (this.state === 'starting') {
      this.startupFailure = new QdrantRuntimeError(
        'QDRANT_START_FAILED',
        'Qdrant exited before becoming healthy'
      )
      return
    }
    if (this.restartCount >= this.maxRestarts || !this.descriptor) {
      this.setState('failed')
      return
    }

    this.restartCount += 1
    this.setState('starting')
    try {
      await this.launch(this.descriptor)
    } catch (error) {
      await this.failStart(error)
    }
  }

  private setState(next: QdrantRuntimeState): void {
    if (this.state === next) return
    this.state = transitionQdrantRuntimeState(this.state, next)
  }
}

function mapStartError(error: unknown): QdrantRuntimeError {
  if (error instanceof QdrantRuntimeError) return error
  return new QdrantRuntimeError(
    'QDRANT_START_FAILED',
    'Qdrant process failed to start',
    { cause: error }
  )
}

export function createNodeQdrantProcessPort(
  options: NodeQdrantProcessPortOptions
): QdrantProcessPort {
  const environment = options.environment ?? process.env
  const reservePort = options.reservePort ?? reserveQdrantHttpPort
  const createApiKey = options.createApiKey ?? generateQdrantApiKey
  const spawnProcess =
    options.spawnProcess ??
    ((executable, args, spawnOptions) =>
      spawnChildProcess(executable, [...args], spawnOptions))
  const fetchImpl = options.fetchImpl ?? fetch
  const runtimeDirectory = join(options.userDataPath, 'qdrant')

  return {
    async prepare() {
      const [port, apiKey] = await Promise.all([
        reservePort(),
        Promise.resolve(createApiKey())
      ])
      const configPath = await writeQdrantConfig({
        directory: runtimeDirectory,
        port,
        apiKey,
        storagePath: join(runtimeDirectory, 'storage'),
        snapshotsPath: join(runtimeDirectory, 'snapshots')
      })
      return {
        executable: options.binaryPath,
        args: ['--config-path', configPath],
        cwd: runtimeDirectory,
        endpoint: `http://127.0.0.1:${port}`,
        apiKey
      }
    },
    spawn(input) {
      return spawnProcess(input.executable, input.args, {
        cwd: input.cwd,
        env: selectProcessEnvironment(environment),
        stdio: 'pipe'
      })
    },
    async checkHealth(connection) {
      const response = await fetchImpl(`${connection.endpoint}/healthz`, {
        method: 'GET',
        headers: { 'api-key': connection.apiKey },
        signal: AbortSignal.timeout(2_000)
      })
      if (!response.ok) {
        throw new Error(`Qdrant health check failed with ${response.status}`)
      }
    },
    delay(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds))
    }
  }
}

function selectProcessEnvironment(
  environment: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const allowed = [
    'HOME',
    'LANG',
    'LC_ALL',
    'PATH',
    'SystemRoot',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'WINDIR'
  ] as const
  return Object.fromEntries(
    allowed.flatMap((key) => {
      const value = environment[key]
      return value === undefined ? [] : [[key, value]]
    })
  )
}

function consumeQdrantOutput(
  stream: EventEmitter,
  streamName: 'stdout' | 'stderr',
  descriptor: QdrantLaunchDescriptor,
  log: ((stream: 'stdout' | 'stderr', message: string) => void) | undefined
): void {
  let buffer = ''
  stream.on('data', (chunk: unknown) => {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    if (buffer.length > MAX_LOG_LINE_LENGTH && !buffer.includes('\n')) {
      log?.(streamName, '[Qdrant output truncated]')
      buffer = ''
      return
    }
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.length > 0) {
        log?.(streamName, redactQdrantOutput(line, descriptor))
      }
    }
  })
  stream.once('end', () => {
    if (buffer.length > 0) {
      log?.(streamName, redactQdrantOutput(buffer, descriptor))
      buffer = ''
    }
  })
}

function redactQdrantOutput(
  message: string,
  descriptor: QdrantLaunchDescriptor
): string {
  const configPath = descriptor.args[
    descriptor.args.indexOf('--config-path') + 1
  ]
  let redacted = replaceLiteral(
    message,
    descriptor.apiKey,
    '[REDACTED]'
  )
  if (configPath) {
    redacted = replaceLiteral(
      redacted,
      configPath,
      '[REDACTED_PATH]'
    )
  }
  redacted = replaceLiteral(
    redacted,
    descriptor.cwd,
    '[REDACTED_PATH]'
  )
  redacted = redacted.replace(
    /((?:api[_-]?key|authorization|token|secret)\s*[:=]\s*)(?:bearer\s+)?(?:"[^"]*"|'[^']*'|\S+)/gi,
    '$1[REDACTED]'
  )
  return redactStructuredQdrantOutput(redacted)
}

function redactStructuredQdrantOutput(message: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(message)
  } catch {
    return message
  }
  const redact = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(redact)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /(?:content|text|vector|dense|sparse|path|api[_-]?key|authorization|token|secret)/i.test(
          key
        )
          ? key.toLowerCase().includes('path')
            ? '[REDACTED_PATH]'
            : '[REDACTED]'
          : redact(entry)
      ])
    )
  }
  return JSON.stringify(redact(parsed))
}

function replaceLiteral(
  value: string,
  search: string,
  replacement: string
): string {
  return search.length === 0 ? value : value.split(search).join(replacement)
}
