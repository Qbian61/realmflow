import {
  spawn,
  type ChildProcess
} from 'node:child_process'
import {
  ConnectorGatewayError
} from './connector-gateway'
import {
  PlatformSandboxDriver,
  type SandboxCommandPort
} from '../tools/platform-sandbox-driver'

export class NodeConnectorProcessHost {
  private readonly sandbox: SandboxCommandPort

  constructor(
    options: {
      sandbox?: SandboxCommandPort
      platform?: NodeJS.Platform
      sandboxExecutable?: string | null
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

  async spawn(input: {
    executable: string
    arguments: string[]
    cwd: string
    environment: Record<string, string>
    shell: false
    timeoutMs: number
    maxOutputBytes: number
    signal?: AbortSignal
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    let command: Awaited<ReturnType<SandboxCommandPort['wrap']>>
    try {
      command = await this.sandbox.wrap({
        executable: input.executable,
        arguments: input.arguments,
        cwd: input.cwd
      })
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'tool_sandbox_unavailable'
      ) {
        throw new ConnectorGatewayError(
          'connector_sandbox_unavailable',
          'Connector CLI sandbox is unavailable',
          false
        )
      }
      throw error
    }
    return new Promise((resolve, reject) => {
      const child = spawn(command.executable, command.arguments, {
        cwd: input.cwd,
        env: {
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          ...input.environment
        },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let outputBytes = 0
      let settled = false
      const finish = (
        error?: ConnectorGatewayError,
        exitCode?: number
      ): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        input.signal?.removeEventListener('abort', abort)
        if (error) reject(error)
        else {
          resolve({
            exitCode: exitCode ?? -1,
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8')
          })
        }
      }
      const append = (target: Buffer[], chunk: Buffer): void => {
        outputBytes += chunk.byteLength
        if (outputBytes > input.maxOutputBytes) {
          terminateProcessGroup(child, 'SIGKILL')
          finish(
            new ConnectorGatewayError(
              'connector_output_too_large',
              'Connector CLI output exceeded its size limit',
              false,
              true
            )
          )
          return
        }
        target.push(chunk)
      }
      child.stdout.on('data', (chunk: Buffer) => append(stdout, chunk))
      child.stderr.on('data', (chunk: Buffer) => append(stderr, chunk))
      child.once('error', () =>
        finish(
          new ConnectorGatewayError(
            'connector_process_unavailable',
            'Connector CLI process is unavailable',
            true
          )
        )
      )
      child.once('close', (code) => finish(undefined, code ?? -1))
      const abort = (): void => {
        terminateProcessGroup(child, 'SIGKILL')
        finish(
          new ConnectorGatewayError(
            'connector_process_cancelled',
            'Connector CLI process was cancelled',
            false,
            true
          )
        )
      }
      const timer = setTimeout(() => {
        terminateProcessGroup(child, 'SIGKILL')
        finish(
          new ConnectorGatewayError(
            'connector_process_timeout',
            'Connector CLI process timed out',
            true,
            true
          )
        )
      }, input.timeoutMs)
      if (input.signal?.aborted) abort()
      else input.signal?.addEventListener('abort', abort, { once: true })
    })
  }
}

function terminateProcessGroup(
  child: ChildProcess,
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
