import { resolve, sep } from 'node:path'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  ConnectorProtocolAdapter,
  EffectiveConnectorSnapshot
} from './connector-gateway'

type CliConnectorAdapterDependencies = {
  processes: {
    spawn(input: {
      executable: string
      arguments: string[]
      cwd: string
      environment: Record<string, string>
      shell: false
      timeoutMs: number
      maxOutputBytes: number
      signal?: AbortSignal
    }): Promise<{
      exitCode: number
      stdout: string
      stderr: string
    }>
  }
  resolveWorkingDirectory(
    snapshot: EffectiveConnectorSnapshot,
    policy: 'package' | 'workspace'
  ): string
  resolveCredential(handle: string): Promise<string>
}

export class CliConnectorAdapter implements ConnectorProtocolAdapter {
  constructor(private readonly dependencies: CliConnectorAdapterDependencies) {}

  async invoke(input: {
    snapshot: EffectiveConnectorSnapshot
    arguments: JsonObject
    idempotencyKey?: string
    correlationId: string
    causationId: string
    signal?: AbortSignal
  }): Promise<{ output: JsonObject }> {
    const protocol = input.snapshot.action.protocol
    if (protocol.kind !== 'cli') {
      throw new Error('CLI Connector action is invalid')
    }
    const argumentKeys = Object.keys(input.arguments).sort()
    if (
      argumentKeys.some(
        (key) => !protocol.argumentNames.includes(key)
      )
    ) {
      throw new Error('CLI Connector arguments are invalid')
    }
    const environment: Record<string, string> = {}
    for (const [name, slot] of Object.entries(
      protocol.environmentCredentialRefs
    )) {
      const handle = input.snapshot.credentialHandles[slot]
      if (!handle) throw new Error('CLI Connector credential is unavailable')
      environment[name] = await this.dependencies.resolveCredential(handle)
    }
    const cwd = this.dependencies.resolveWorkingDirectory(
      input.snapshot,
      protocol.workingDirectory
    )
    if (
      !pathAllowed(
        protocol.executable,
        input.snapshot.permissionCeiling.pathPrefixes
      ) ||
      !pathAllowed(cwd, input.snapshot.permissionCeiling.pathPrefixes)
    ) {
      throw new Error('CLI Connector path is outside the permission ceiling')
    }
    const result = await this.dependencies.processes.spawn({
      executable: protocol.executable,
      arguments: [
        ...protocol.subcommand,
        ...protocol.argumentNames.flatMap((name) =>
          mapArgument(name, input.arguments[name])
        )
      ],
      cwd,
      environment,
      shell: false,
      timeoutMs: input.snapshot.action.timeoutMs,
      maxOutputBytes: input.snapshot.action.maxOutputBytes,
      signal: input.signal
    })
    return {
      output: {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
      }
    }
  }
}

function pathAllowed(value: string, prefixes: readonly string[]): boolean {
  const normalized = resolve(value)
  return prefixes.some((prefix) => {
    const normalizedPrefix = resolve(prefix)
    return (
      normalized === normalizedPrefix ||
      normalized.startsWith(`${normalizedPrefix}${sep}`)
    )
  })
}

function mapArgument(name: string, value: unknown): string[] {
  const flag = `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
  if (value === undefined || value === false || value === null) return []
  if (value === true) return [flag]
  if (typeof value === 'string' || typeof value === 'number') {
    return [`${flag}=${String(value)}`]
  }
  if (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === 'string' || typeof item === 'number'
    )
  ) {
    return value.map((item) => `${flag}=${String(item)}`)
  }
  throw new Error('CLI Connector argument value is invalid')
}
