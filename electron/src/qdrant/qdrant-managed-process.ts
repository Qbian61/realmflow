import { execFileSync } from 'node:child_process'
import {
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

type ManagedQdrantProcess = Readonly<{
  version: 1
  pid: number
  endpoint: string
  apiKey: string
  executable: string
  configPath: string
}>

type QdrantLaunchDescriptor = Readonly<{
  executable: string
  args: string[]
  endpoint: string
  apiKey: string
}>

type ManagedChildProcess = {
  readonly pid?: number
  once(event: 'exit', listener: () => void): unknown
}

export type QdrantManagedProcessOverrides = {
  processKill?: (
    pid: number,
    signal?: NodeJS.Signals | number
  ) => boolean
  isProcessRunning?: (pid: number) => boolean
  processMatchesRecord?: (record: {
    pid: number
    executable: string
    configPath: string
  }) => boolean
  recoveryDelay?: (milliseconds: number) => Promise<void>
}

type QdrantManagedProcessControllerOptions =
  QdrantManagedProcessOverrides & {
    runtimeDirectory: string
    executable: string
    fetchImpl: typeof fetch
  }

const RECOVERY_TIMEOUT_MS = 5_000
const RECOVERY_INTERVAL_MS = 50

export function createQdrantManagedProcessController(
  options: QdrantManagedProcessControllerOptions
): {
  recover(): Promise<void>
  track(
    child: ManagedChildProcess,
    descriptor: QdrantLaunchDescriptor
  ): void
} {
  const configPath = join(options.runtimeDirectory, 'config.yaml')
  const recordPath = join(
    options.runtimeDirectory,
    'managed-process.json'
  )
  const dependencies: RecoveryDependencies = {
    fetchImpl: options.fetchImpl,
    processKill:
      options.processKill ??
      ((pid, signal) => process.kill(pid, signal)),
    isProcessRunning:
      options.isProcessRunning ?? defaultIsProcessRunning,
    processMatchesRecord:
      options.processMatchesRecord ?? defaultProcessMatchesRecord,
    delay:
      options.recoveryDelay ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)))
  }

  return {
    recover: () =>
      recoverRecordedProcess({
        recordPath,
        executable: options.executable,
        configPath,
        ...dependencies
      }),
    track(child, descriptor) {
      if (child.pid === undefined) return
      const pid = child.pid
      writeRecord(recordPath, {
        version: 1,
        pid,
        endpoint: descriptor.endpoint,
        apiKey: descriptor.apiKey,
        executable: descriptor.executable,
        configPath: extractConfigPath(descriptor)
      })
      child.once('exit', () => removeRecordForPid(recordPath, pid))
    }
  }
}

type RecoveryDependencies = {
  fetchImpl: typeof fetch
  processKill: (
    pid: number,
    signal?: NodeJS.Signals | number
  ) => boolean
  isProcessRunning: (pid: number) => boolean
  processMatchesRecord: (record: ManagedQdrantProcess) => boolean
  delay: (milliseconds: number) => Promise<void>
}

async function recoverRecordedProcess(
  input: RecoveryDependencies & {
    recordPath: string
    executable: string
    configPath: string
  }
): Promise<void> {
  const record = await readRecord(input.recordPath)
  if (!record) return
  if (
    record.executable !== input.executable ||
    record.configPath !== input.configPath ||
    !input.isProcessRunning(record.pid) ||
    !input.processMatchesRecord(record)
  ) {
    await removeRecord(input.recordPath)
    return
  }

  try {
    await checkHealth(input.fetchImpl, record)
  } catch {
    await removeRecord(input.recordPath)
    return
  }

  input.processKill(record.pid, 'SIGTERM')
  if (await waitForExit(record.pid, input)) {
    await removeRecord(input.recordPath)
    return
  }
  input.processKill(record.pid, 'SIGKILL')
  if (await waitForExit(record.pid, input)) {
    await removeRecord(input.recordPath)
    return
  }
  throw new Error(
    `Recorded Qdrant process ${record.pid} did not exit after SIGKILL`
  )
}

async function waitForExit(
  pid: number,
  input: Pick<RecoveryDependencies, 'isProcessRunning' | 'delay'>
): Promise<boolean> {
  const attempts = Math.ceil(
    RECOVERY_TIMEOUT_MS / RECOVERY_INTERVAL_MS
  )
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!input.isProcessRunning(pid)) return true
    await input.delay(RECOVERY_INTERVAL_MS)
  }
  return false
}

async function readRecord(
  recordPath: string
): Promise<ManagedQdrantProcess | undefined> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(recordPath, 'utf8'))
  } catch {
    await removeRecord(recordPath)
    return undefined
  }
  if (!isManagedQdrantProcess(value)) {
    await removeRecord(recordPath)
    return undefined
  }
  return value
}

function isManagedQdrantProcess(
  value: unknown
): value is ManagedQdrantProcess {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.version === 1 &&
    Number.isSafeInteger(record.pid) &&
    (record.pid as number) > 0 &&
    typeof record.endpoint === 'string' &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(record.endpoint) &&
    typeof record.apiKey === 'string' &&
    record.apiKey.length > 0 &&
    typeof record.executable === 'string' &&
    typeof record.configPath === 'string'
  )
}

function writeRecord(
  recordPath: string,
  record: ManagedQdrantProcess
): void {
  const temporaryPath = `${recordPath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, JSON.stringify(record), {
    encoding: 'utf8',
    mode: 0o600
  })
  renameSync(temporaryPath, recordPath)
}

function removeRecordForPid(recordPath: string, pid: number): void {
  try {
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as {
      pid?: unknown
    }
    if (record.pid === pid) rmSync(recordPath, { force: true })
  } catch {
    // A newer process may already own the record.
  }
}

function removeRecord(recordPath: string): Promise<void> {
  return rm(recordPath, { force: true })
}

function defaultIsProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (
      error instanceof Error &&
      'code' in error &&
      error.code === 'EPERM'
    )
  }
}

function defaultProcessMatchesRecord(
  record: ManagedQdrantProcess
): boolean {
  if (process.platform === 'win32') return false
  try {
    const command = execFileSync(
      'ps',
      ['-p', String(record.pid), '-o', 'command='],
      { encoding: 'utf8', timeout: 2_000 }
    )
    return (
      command.includes(record.executable) &&
      command.includes(record.configPath)
    )
  } catch {
    return false
  }
}

async function checkHealth(
  fetchImpl: typeof fetch,
  connection: Pick<ManagedQdrantProcess, 'endpoint' | 'apiKey'>
): Promise<void> {
  const response = await fetchImpl(`${connection.endpoint}/healthz`, {
    method: 'GET',
    headers: { 'api-key': connection.apiKey },
    signal: AbortSignal.timeout(2_000)
  })
  if (!response.ok) {
    throw new Error(`Qdrant health check failed with ${response.status}`)
  }
}

function extractConfigPath(
  descriptor: QdrantLaunchDescriptor
): string {
  const index = descriptor.args.indexOf('--config-path')
  return index >= 0 ? (descriptor.args[index + 1] ?? '') : ''
}
