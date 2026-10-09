import {
  spawn,
  type ChildProcessWithoutNullStreams
} from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import { constants } from 'node:fs'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  ManagedProcessPort
} from './builtin-process-tool-handlers'
import {
  PlatformSandboxDriver,
  type SandboxCommandPort
} from './platform-sandbox-driver'

type ProcessOwner = Parameters<ManagedProcessPort['list']>[0]

type ManagedProcess = {
  processId: string
  owner: ProcessOwner
  executable: string
  arguments: string[]
  cwd: string
  pid: number
  fingerprint: string
  startedAt: number
  status: 'running' | 'exited' | 'stopped'
  exitCode?: number | null
  stdout: string
  stderr: string
  truncated: boolean
  child: ChildProcessWithoutNullStreams
}

export class ProcessExecutionError extends Error {
  readonly name = 'ProcessExecutionError'

  constructor(
    readonly code:
      | 'tool_timeout'
      | 'tool_output_limit'
      | 'tool_sandbox_unavailable'
      | 'process_dependency_unavailable',
    readonly stdout: string,
    readonly stderr: string,
    readonly dependencyName?: string
  ) {
    super(
      code === 'tool_timeout'
        ? 'Process Tool execution timed out'
        : code === 'tool_output_limit'
          ? 'Process Tool output limit exceeded'
          : code === 'process_dependency_unavailable'
            ? `Process dependency ${dependencyName ?? 'executable'} is unavailable`
            : 'Process Tool sandbox is unavailable'
    )
  }
}

export class NodeLocalProcessService implements ManagedProcessPort {
  private readonly processes = new Map<string, ManagedProcess>()
  private readonly sandbox: SandboxCommandPort

  constructor(
    options: {
      platform?: NodeJS.Platform
      sandboxExecutable?: string | null
      sandbox?: SandboxCommandPort
    } = {}
  ) {
    this.sandbox =
      options.sandbox ??
      new PlatformSandboxDriver({
        ...(options.platform ? { platform: options.platform } : {}),
        ...(options.sandboxExecutable !== undefined
          ? { sandboxExecutable: options.sandboxExecutable }
          : {})
      })
  }

  async discover(input: {
    names: string[]
    cwd: string
    signal: AbortSignal
  }): Promise<JsonObject[]> {
    const tools: JsonObject[] = []
    for (const name of input.names) {
      assertNotAborted(input.signal)
      const path = await findExecutable(name)
      if (!path) continue
      const version = await this.runCommand({
        executable: path,
        arguments: ['--version'],
        cwd: input.cwd,
        timeoutMs: 2_000,
        maxOutputBytes: 16 * 1024,
        signal: input.signal
      }).catch(() => undefined)
      tools.push({
        name,
        path,
        ...(version
          ? {
              version:
                version.stdout.trim().slice(0, 500) ||
                version.stderr.trim().slice(0, 500)
            }
          : {})
      })
    }
    return tools
  }

  async run(input: {
    executable: string
    arguments: string[]
    cwd: string
    timeoutMs: number
    maxOutputBytes: number
    signal: AbortSignal
  }): Promise<JsonObject> {
    return this.runCommand(input)
  }

  async runCommand(input: {
    executable: string
    arguments: string[]
    cwd: string
    timeoutMs: number
    maxOutputBytes: number
    signal: AbortSignal
  }): Promise<{
    exitCode: number | null
    stdout: string
    stderr: string
    truncated: boolean
    timedOut: boolean
    durationMs: number
  }> {
    assertNotAborted(input.signal)
    const executable = await resolveExecutable(input.executable)
    const command = await this.sandboxCommand(
      executable,
      input.arguments,
      input.cwd
    )
    const startedAt = Date.now()
    return new Promise((resolve, reject) => {
      const child = spawn(command.executable, command.arguments, {
        cwd: input.cwd,
        env: minimalEnvironment(),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      })
      child.stdin.end()
      let stdout = ''
      let stderr = ''
      let outputBytes = 0
      let truncated = false
      let timedOut = false
      let settled = false
      const capture = (target: 'stdout' | 'stderr', chunk: Buffer) => {
        const remaining = Math.max(0, input.maxOutputBytes - outputBytes)
        const accepted = chunk.subarray(0, remaining)
        outputBytes += accepted.byteLength
        if (target === 'stdout') stdout += accepted.toString('utf8')
        else stderr += accepted.toString('utf8')
        if (accepted.byteLength < chunk.byteLength) {
          truncated = true
          terminateProcessGroup(child, 'SIGKILL')
        }
      }
      child.stdout.on('data', (chunk: Buffer) => capture('stdout', chunk))
      child.stderr.on('data', (chunk: Buffer) => capture('stderr', chunk))
      const finishError = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
      const onAbort = () => {
        terminateProcessGroup(child, 'SIGKILL')
        const error = new Error('Process execution was cancelled')
        error.name = 'AbortError'
        finishError(error)
      }
      const timer = setTimeout(() => {
        timedOut = true
        terminateProcessGroup(child, 'SIGKILL')
      }, input.timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        input.signal.removeEventListener('abort', onAbort)
      }
      input.signal.addEventListener('abort', onAbort, { once: true })
      child.once('error', finishError)
      child.once('close', (exitCode) => {
        if (settled) return
        settled = true
        cleanup()
        if (truncated) {
          reject(
            new ProcessExecutionError(
              'tool_output_limit',
              stdout,
              stderr
            )
          )
          return
        }
        if (timedOut) {
          reject(
            new ProcessExecutionError('tool_timeout', stdout, stderr)
          )
          return
        }
        resolve({
          exitCode,
          stdout,
          stderr,
          truncated,
          timedOut,
          durationMs: Date.now() - startedAt
        })
      })
    })
  }

  async start(input: {
    owner: ProcessOwner
    executable: string
    arguments: string[]
    cwd: string
    maxOutputBytes: number
    signal: AbortSignal
  }): Promise<JsonObject> {
    assertNotAborted(input.signal)
    const executable = await resolveExecutable(input.executable)
    const command = await this.sandboxCommand(
      executable,
      input.arguments,
      input.cwd
    )
    const child = spawn(command.executable, command.arguments, {
      cwd: input.cwd,
      env: minimalEnvironment(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    })
    child.stdin.end()
    await waitForSpawn(child)
    const processId = randomUUID()
    const startedAt = Date.now()
    const record: ManagedProcess = {
      processId,
      owner: { ...input.owner },
      executable,
      arguments: [...input.arguments],
      cwd: input.cwd,
      pid: child.pid!,
      fingerprint: fingerprint(input, child.pid!, startedAt),
      startedAt,
      status: 'running',
      stdout: '',
      stderr: '',
      truncated: false,
      child
    }
    this.processes.set(processId, record)
    captureManagedOutput(record, input.maxOutputBytes)
    child.once('close', (exitCode) => {
      record.exitCode = exitCode
      if (record.status === 'running') record.status = 'exited'
    })
    return processView(record)
  }

  async list(owner: ProcessOwner): Promise<JsonObject[]> {
    return [...this.processes.values()]
      .filter((process) => sameOwner(process.owner, owner))
      .map(processView)
  }

  async stop(input: {
    owner: ProcessOwner
    processId: string
  }): Promise<JsonObject> {
    const process = this.processes.get(input.processId)
    if (!process) throw new Error('Managed process was not found')
    if (!sameOwner(process.owner, input.owner)) {
      throw new Error('Managed process ownership does not match')
    }
    if (process.status === 'running') {
      process.status = 'stopped'
      terminateProcessGroup(process.child, 'SIGTERM')
      const exited = await waitForClose(process.child, 2_000)
      if (!exited) {
        terminateProcessGroup(process.child, 'SIGKILL')
        await waitForClose(process.child, 2_000)
      }
    }
    return { processId: process.processId, stopped: true }
  }

  async close(): Promise<void> {
    const running = [...this.processes.values()].filter(
      (process) => process.status === 'running'
    )
    await Promise.all(
      running.map((process) =>
        this.stop({
          owner: process.owner,
          processId: process.processId
        })
      )
    )
  }

  private async sandboxCommand(
    executable: string,
    arguments_: string[],
    cwd: string
  ): Promise<{ executable: string; arguments: string[] }> {
    try {
      return await this.sandbox.wrap({
        executable,
        arguments: arguments_,
        cwd
      })
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'tool_sandbox_unavailable'
      ) {
        throw new ProcessExecutionError(
          'tool_sandbox_unavailable',
          '',
          ''
        )
      }
      throw error
    }
  }
}

function captureManagedOutput(
  process: ManagedProcess,
  maximum: number
): void {
  let bytes = 0
  const capture = (target: 'stdout' | 'stderr', chunk: Buffer) => {
    const accepted = chunk.subarray(0, Math.max(0, maximum - bytes))
    bytes += accepted.byteLength
    if (target === 'stdout') process.stdout += accepted.toString('utf8')
    else process.stderr += accepted.toString('utf8')
    if (accepted.byteLength < chunk.byteLength) {
      process.truncated = true
      terminateProcessGroup(process.child, 'SIGKILL')
    }
  }
  process.child.stdout.on('data', (chunk: Buffer) => capture('stdout', chunk))
  process.child.stderr.on('data', (chunk: Buffer) => capture('stderr', chunk))
}

function processView(process: ManagedProcess): JsonObject {
  return {
    processId: process.processId,
    pid: process.pid,
    status: process.status,
    executable: process.executable,
    arguments: [...process.arguments],
    cwd: process.cwd,
    fingerprint: process.fingerprint,
    startedAt: process.startedAt,
    stdout: process.stdout,
    stderr: process.stderr,
    truncated: process.truncated,
    ...(process.exitCode !== undefined
      ? { exitCode: process.exitCode }
      : {})
  }
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  return {
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8'
  }
}

async function resolveExecutable(executable: string): Promise<string> {
  if (isAbsolute(executable)) {
    try {
      await access(executable, constants.X_OK)
    } catch {
      throw new ProcessExecutionError(
        'process_dependency_unavailable',
        '',
        '',
        executable
      )
    }
    return executable
  }
  const resolved = await findExecutable(executable)
  if (!resolved) {
    throw new ProcessExecutionError(
      'process_dependency_unavailable',
      '',
      '',
      executable
    )
  }
  return resolved
}

async function findExecutable(name: string): Promise<string | undefined> {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue
    const candidate = join(directory, name)
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

function waitForSpawn(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
}

function waitForClose(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<boolean> {
  if (child.exitCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    child.once('close', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

function terminateProcessGroup(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals
): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    }
  }
  try {
    child.kill(signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

function fingerprint(
  input: {
    executable: string
    arguments: string[]
    cwd: string
  },
  pid: number,
  startedAt: number
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        input.executable,
        input.arguments,
        input.cwd,
        pid,
        startedAt
      ])
    )
    .digest('hex')
}

function sameOwner(left: ProcessOwner, right: ProcessOwner): boolean {
  return left.type === right.type && left.id === right.id
}

function assertNotAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  const error = new Error('Process execution was cancelled')
  error.name = 'AbortError'
  throw error
}
