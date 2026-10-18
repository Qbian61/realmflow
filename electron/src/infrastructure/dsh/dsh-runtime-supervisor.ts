import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { EventEmitter } from 'node:events'
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { parse, stringify } from 'yaml'
import {
  DshAcpClient,
  type AcpCancelRequest,
  type AcpCloseSessionRequest,
  type AcpPermissionRequest,
  type AcpPermissionResponse,
  type AcpListSessionsRequest,
  type AcpListSessionsResponse,
  type AcpNewSessionRequest,
  type AcpNewSessionResponse,
  type AcpPromptRequest,
  type AcpPromptResponse,
  type AcpResumeSessionRequest,
  type AcpResumeSessionResponse,
  type AcpSetConfigOptionRequest,
  type AcpSetConfigOptionResponse,
  type AcpSessionUpdate
} from './acp-client'
import type { DshRuntimeLocation, DshRuntimeLocatorPort } from './dsh-runtime-locator'
import type { ModelExecutionConfig } from '../../../../domain/model'
import {
  DEFAULT_DSH_MODEL_ROUTE,
  resolveDshModelRoute,
  type DshModelRoute
} from '../../dsh-model-route'

export type DshRuntimeStatus =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'restarting'
  | 'stopping'
  | 'failed'

export type DshRuntimeLaunchDescriptor = {
  executable: string
  args: string[]
  cwd: string
  env: Record<string, string>
  sandbox: {
    allowedReadRoots: string[]
    allowedWriteRoots: string[]
    allowedWorkspaceRoots: string[]
  }
}

export type DshRuntimeChildProcess = EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  kill(signal?: NodeJS.Signals | number): boolean
}

export type DshRuntimeProcessPort = {
  spawn(descriptor: DshRuntimeLaunchDescriptor): DshRuntimeChildProcess
}

export type DshRuntimePermissionHandler = (
  request: AcpPermissionRequest
) => Promise<AcpPermissionResponse> | AcpPermissionResponse

export type DshRuntimeSupervisorOptions = {
  locator: DshRuntimeLocatorPort
  processPort?: DshRuntimeProcessPort
  environment?: Record<string, string | undefined>
  onRequestPermission?: DshRuntimePermissionHandler
  restart?: {
    maxRestarts?: number
    initialBackoffMs?: number
    maxBackoffMs?: number
  }
  shutdownTimeoutMs?: number
}

export class DshRuntimeSupervisor {
  private readonly processPort: DshRuntimeProcessPort
  private readonly environment: Record<string, string | undefined>
  private readonly restart: Required<NonNullable<DshRuntimeSupervisorOptions['restart']>>
  private readonly shutdownTimeoutMs: number
  private state: DshRuntimeStatus = 'stopped'
  private location: DshRuntimeLocation | undefined
  private child: DshRuntimeChildProcess | undefined
  private client: DshAcpClient | undefined
  private startPromise: Promise<void> | undefined
  private readonly activeSessions = new Set<string>()
  private stopping = false
  private restartAttempts = 0
  private restartTimer: NodeJS.Timeout | undefined
  private permissionHandler: DshRuntimePermissionHandler | undefined
  private modelRoute = DEFAULT_DSH_MODEL_ROUTE
  private modelSyncPromise: Promise<void> = Promise.resolve()

  constructor(
    private readonly options: DshRuntimeSupervisorOptions
  ) {
    this.processPort = options.processPort ?? new NodeDshRuntimeProcessPort()
    this.environment = options.environment ?? process.env
    this.restart = {
      maxRestarts: options.restart?.maxRestarts ?? 3,
      initialBackoffMs: options.restart?.initialBackoffMs ?? 500,
      maxBackoffMs: options.restart?.maxBackoffMs ?? 5_000
    }
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5_000
    this.permissionHandler = options.onRequestPermission
  }

  status(): DshRuntimeStatus {
    return this.state
  }

  async start(): Promise<void> {
    if (this.state === 'ready') return
    if (this.startPromise !== undefined) return this.startPromise
    this.stopping = false
    this.state = 'starting'
    this.startPromise = this.startFreshRuntime()
      .then(() => {
        this.state = 'ready'
      })
      .catch((error: unknown) => {
        this.state = 'failed'
        throw error
      })
      .finally(() => {
        this.startPromise = undefined
      })
    return this.startPromise
  }

  async syncModelCredentials(model: ModelExecutionConfig): Promise<void> {
    const sync = this.modelSyncPromise.then(() =>
      this.applyModelRoute(model)
    )
    this.modelSyncPromise = sync.catch(() => undefined)
    return sync
  }

  private async applyModelRoute(model: ModelExecutionConfig): Promise<void> {
    const nextRoute = resolveDshModelRoute(model)
    this.location = this.location ?? await this.options.locator.resolve()
    const credential = dshLocalCredentialForModel(model, nextRoute)
    if (credential !== undefined) {
      await writeDshLocalCredential(this.location.dshHome, credential)
    }
    if (sameDshModelRoute(this.modelRoute, nextRoute)) return
    this.modelRoute = nextRoute
    if (this.state === 'starting' && this.startPromise !== undefined) {
      await this.startPromise
    }
    if (this.state === 'ready' || this.state === 'restarting') {
      await this.stop()
      await this.start()
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.restartTimer !== undefined) {
      clearTimeout(this.restartTimer)
      this.restartTimer = undefined
    }
    if (this.state === 'stopped') return
    this.state = 'stopping'
    const currentClient = this.client
    const currentChild = this.child
    if (currentClient !== undefined) {
      for (const sessionId of [...this.activeSessions]) {
        await currentClient.closeSession({ sessionId }).catch(() => undefined)
      }
      this.activeSessions.clear()
      await currentClient.close().catch(() => undefined)
    }
    if (currentChild !== undefined) {
      currentChild.kill('SIGTERM')
      await waitForExitOrHardKill(currentChild, this.shutdownTimeoutMs)
    }
    this.child = undefined
    this.client = undefined
    this.state = 'stopped'
  }

  async newSession(params: AcpNewSessionRequest): Promise<AcpNewSessionResponse> {
    const client = this.requireClient()
    const response = await client.newSession({
      ...params,
      mcpServers: params.mcpServers ?? []
    })
    this.activeSessions.add(response.sessionId)
    return response
  }

  async resumeSession(params: AcpResumeSessionRequest): Promise<AcpResumeSessionResponse> {
    const response = await this.requireClient().resumeSession({
      ...params,
      mcpServers: params.mcpServers ?? []
    })
    this.activeSessions.add(params.sessionId)
    return response
  }

  async listSessions(params: AcpListSessionsRequest = {}): Promise<AcpListSessionsResponse> {
    return this.requireClient().listSessions(params)
  }

  async closeSession(params: AcpCloseSessionRequest): Promise<Record<string, never>> {
    const response = await this.requireClient().closeSession(params)
    this.activeSessions.delete(params.sessionId)
    return response
  }

  prompt(params: AcpPromptRequest): Promise<AcpPromptResponse> {
    return this.requireClient().prompt(params)
  }

  cancel(params: AcpCancelRequest): Promise<void> {
    return this.requireClient().cancel(params)
  }

  setConfigOption(params: AcpSetConfigOptionRequest): Promise<AcpSetConfigOptionResponse> {
    return this.requireClient().setConfigOption(params)
  }

  async getSessionUpdateCursor(params: { sessionId: string }): Promise<number> {
    const rows = await this.readStoredSessionRows(params.sessionId)
    return rows.reduce((cursor, row) => Math.max(cursor, row.seq), 0)
  }

  async readSessionUpdates(params: {
    sessionId: string
    afterSequence: number
    limit: number
  }): Promise<{
    updates: AcpSessionUpdate[]
    nextAfterSequence: number
    hasMore: boolean
  }> {
    const rows = await this.readStoredSessionRows(params.sessionId)
    const updates = rows
      .filter((row) => row.seq > params.afterSequence)
      .flatMap((row) => storedUpdateFromRow(row))
    const page = updates.slice(0, params.limit)
    return {
      updates: page,
      nextAfterSequence: page.reduce((cursor, update) => {
        const sequence = typeof update.seq === 'number' ? update.seq : cursor
        return Math.max(cursor, sequence)
      }, params.afterSequence),
      hasMore: updates.length > page.length
    }
  }

  onSessionUpdate(sessionId: string, handler: (update: AcpSessionUpdate) => void): () => void {
    return this.requireClient().onSessionUpdate(sessionId, handler)
  }

  private async readStoredSessionRows(
    sessionId: string
  ): Promise<StoredDshSessionRow[]> {
    this.location = this.location ?? await this.options.locator.resolve()
    const path = await findStoredSessionLog(this.location.dshHome, sessionId)
    if (path === undefined) return []
    const text = await decodeStoredSessionLogFile(
      path,
      this.location.nodeBinaryPath
    )
    return text
      .split(/\n+/)
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          return [storedRowFromJson(JSON.parse(line))]
        } catch {
          return []
        }
      })
  }

  setPermissionHandler(handler: DshRuntimePermissionHandler | undefined): void {
    this.permissionHandler = handler
  }

  private async startFreshRuntime(): Promise<void> {
    this.location = await this.options.locator.resolve()
    const descriptor = launchDescriptor(
      this.location,
      this.environment,
      this.modelRoute
    )
    const child = this.processPort.spawn(descriptor)
    const client = new DshAcpClient({
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr
    }, {
      onRequestPermission: (request) =>
        this.permissionHandler?.(request) ?? {
          outcome: {
            outcome: 'cancelled'
          }
        }
    })
    this.child = child
    this.client = client
    child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.handleExit(code, signal)
    })
    await client.initialize()
  }

  private handleExit(_code: number | null, _signal: NodeJS.Signals | null): void {
    const exitedClient = this.client
    this.client = undefined
    this.child = undefined
    this.activeSessions.clear()
    void exitedClient?.close()
    if (this.stopping) {
      this.state = 'stopped'
      return
    }
    if (this.restartAttempts >= this.restart.maxRestarts) {
      this.state = 'failed'
      return
    }
    this.restartAttempts += 1
    this.state = 'restarting'
    const delay = Math.min(
      this.restart.initialBackoffMs * 2 ** (this.restartAttempts - 1),
      this.restart.maxBackoffMs
    )
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined
      void this.start().catch(() => undefined)
    }, delay)
  }

  private requireClient(): DshAcpClient {
    if (this.client === undefined || this.state !== 'ready') {
      throw new Error(`DSH runtime is not ready: ${this.state}`)
    }
    return this.client
  }
}

export class NodeDshRuntimeProcessPort implements DshRuntimeProcessPort {
  spawn(descriptor: DshRuntimeLaunchDescriptor): DshRuntimeChildProcess {
    return spawn(descriptor.executable, descriptor.args, {
      cwd: descriptor.cwd,
      env: descriptor.env,
      stdio: 'pipe',
      windowsHide: true
    }) as ChildProcessWithoutNullStreams
  }
}

function launchDescriptor(
  location: DshRuntimeLocation,
  environment: Record<string, string | undefined>,
  modelRoute: DshModelRoute
): DshRuntimeLaunchDescriptor {
  const path = environment.PATH
  return {
    executable: location.nodeBinaryPath,
    args: [
      location.dshEntrypointPath,
      '--profile',
      'acp'
    ],
    cwd: location.runtimeRoot,
    env: {
      ...(path === undefined ? {} : { PATH: path }),
      HOME: location.dshHome,
      DSH_HOME: location.dshHome,
      DSH_TELEMETRY_DISABLED: '1',
      DSH_SESSION_LOG_UPLOAD_DISABLED: '1',
      NODE_ENV: 'production',
      REALMFLOW_DSH_RUNTIME_ID: location.runtimeId,
      REALMFLOW_DSH_RUNTIME_DIGEST: location.runtimeBuildDigest,
      REALMFLOW_DSH_PROFILE_PATH: location.profilePath,
      REALMFLOW_DSH_SESSION_ROOT: `${location.dshHome}/sessions`,
      REALMFLOW_DSH_PROVIDER_ID: modelRoute.providerId,
      REALMFLOW_DSH_MODEL_ID: modelRoute.modelId,
      REALMFLOW_DSH_PI_AI_PROVIDERS: JSON.stringify(
        modelRoute.piAiProviders
      )
    },
    sandbox: {
      allowedReadRoots: [location.assetsRoot],
      allowedWriteRoots: [location.dshHome],
      allowedWorkspaceRoots: []
    }
  }
}

type StoredDshSessionRow = {
  type: string
  seq: number
  time?: number
  data: Record<string, unknown>
}

const ZSTD_MAGIC = 0xFD2FB528
const STORED_UPDATE_TYPES = new Set([
  'tool/call',
  'tool/result',
  'subagent/catalog',
  'approval/asked',
  'agent/inbox/spliced'
])

async function findStoredSessionLog(
  dshHome: string,
  sessionId: string
): Promise<string | undefined> {
  const sessionsRoot = join(dshHome, 'sessions')
  try {
    const workspaces = await readdir(sessionsRoot, { withFileTypes: true })
    for (const workspace of workspaces) {
      if (!workspace.isDirectory()) continue
      const sessionDir = join(sessionsRoot, workspace.name, sessionId)
      try {
        const files = await readdir(sessionDir, { withFileTypes: true })
        if (files.some((file) => file.isFile() && file.name === 'session.v4.jsonl.zstd')) {
          return join(sessionDir, 'session.v4.jsonl.zstd')
        }
      } catch {
        continue
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

async function decodeStoredSessionLogFile(
  path: string,
  nodeBinaryPath: string
): Promise<string> {
  const input = await readFile(path)
  const decoded = await decodeStoredSessionLog(input)
  if (decoded || input.length === 0) return decoded
  return decodeStoredSessionLogWithNode(nodeBinaryPath, path)
    .catch(() => '')
}

async function decodeStoredSessionLog(input: Buffer): Promise<string> {
  if (input.length === 0) return ''
  if (input.length < 4 || input.readUInt32LE(0) !== ZSTD_MAGIC) {
    return input.toString('utf8')
  }
  try {
    const frames = scanZstdFrames(input)
    const zlib = await import('node:zlib') as typeof import('node:zlib') & {
      zstdDecompressSync?: (buffer: Buffer) => Buffer
    }
    if (typeof zlib.zstdDecompressSync !== 'function') return ''
    return Buffer.concat(
      frames.map(({ start, end }) =>
        zlib.zstdDecompressSync!(input.subarray(start, end))
      )
    ).toString('utf8')
  } catch {
    return ''
  }
}

function decodeStoredSessionLogWithNode(
  nodeBinaryPath: string,
  path: string
): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(nodeBinaryPath, [
      '--input-type=module',
      '-e',
      EXTERNAL_ZSTD_DECODER_SCRIPT,
      path
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const stdout: Buffer[] = []
    let stdoutBytes = 0
    const maxBytes = 32 * 1024 * 1024
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length
      if (stdoutBytes <= maxBytes) stdout.push(chunk)
      if (stdoutBytes > maxBytes) child.kill('SIGKILL')
    })
    child.stderr.resume()
    child.once('error', () => resolve(''))
    child.once('exit', (code) => {
      if (code !== 0 || stdoutBytes > maxBytes) {
        resolve('')
        return
      }
      resolve(Buffer.concat(stdout).toString('utf8'))
    })
  })
}

const EXTERNAL_ZSTD_DECODER_SCRIPT = `
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
const ZSTD_MAGIC = 0xFD2FB528;
function scan(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return frames;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return frames;
    offset += 4;
    if (offset === buffer.length) return frames;
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 0x18) !== 0) return frames;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 0x20) !== 0;
    const checksum = (descriptor & 0x04) !== 0;
    const dictionaryFlag = descriptor & 0x03;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0
      ? (singleSegment ? 1 : 0)
      : 1 << contentSizeFlag;
    const remainingHeaderBytes =
      (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return frames;
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return frames;
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 0x03;
      const blockSize = blockHeader >>> 3;
      if (blockType === 0x03) return frames;
      const payloadBytes = blockType === 0x01 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return frames;
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames;
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return frames;
}
const path = process.argv.at(-1);
const input = readFileSync(path);
for (const frame of scan(input)) {
  process.stdout.write(zstdDecompressSync(input.subarray(frame.start, frame.end)));
}
`

function scanZstdFrames(buffer: Buffer): Array<{ start: number; end: number }> {
  const frames: Array<{ start: number; end: number }> = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return frames
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return frames
    offset += 4
    if (offset === buffer.length) return frames
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) return frames
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0
      ? (singleSegment ? 1 : 0)
      : 1 << contentSizeFlag
    const remainingHeaderBytes =
      (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return frames
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return frames
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) return frames
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return frames
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

function storedRowFromJson(value: unknown): StoredDshSessionRow {
  if (!isRecord(value)) throw new Error('Stored DSH session row is invalid')
  if (typeof value.type !== 'string' || typeof value.seq !== 'number') {
    throw new Error('Stored DSH session row is malformed')
  }
  return {
    type: value.type,
    seq: value.seq,
    ...(typeof value.time === 'number' ? { time: value.time } : {}),
    data: isRecord(value.data) ? value.data : {}
  }
}

function storedUpdateFromRow(row: StoredDshSessionRow): AcpSessionUpdate[] {
  if (!STORED_UPDATE_TYPES.has(row.type)) return []
  return [
    {
      sessionUpdate: row.type,
      type: row.type,
      seq: row.seq,
      ...(row.time === undefined ? {} : { time: row.time }),
      data: row.data
    }
  ]
}

type DshLocalCredential = {
  ref: string
  value: string
}

function dshLocalCredentialForModel(
  model: ModelExecutionConfig,
  route: DshModelRoute
): DshLocalCredential | undefined {
  if (!model.apiKey?.trim()) return undefined
  if (route.credentialRef === undefined) return undefined
  return {
    ref: route.credentialRef,
    value: model.apiKey
  }
}

function sameDshModelRoute(
  left: DshModelRoute,
  right: DshModelRoute
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function writeDshLocalCredential(
  dshHome: string,
  credential: DshLocalCredential
): Promise<void> {
  await mkdir(dshHome, { recursive: true })
  const credentialPath = join(dshHome, '.credentials.yaml')
  const document = await readDshCredentialDocument(credentialPath)
  const refs = isRecord(document.refs) ? document.refs : {}
  const nextDocument = {
    ...document,
    version: 1,
    refs: {
      ...refs,
      [credential.ref]: credential.value
    }
  }
  await writeFile(credentialPath, stringify(nextDocument), {
    mode: 0o600
  })
  await chmod(credentialPath, 0o600)
}

async function readDshCredentialDocument(
  credentialPath: string
): Promise<Record<string, unknown>> {
  try {
    const parsed = parse(await readFile(credentialPath, 'utf8'))
    return isRecord(parsed) ? parsed : {}
  } catch (error) {
    if (
      isRecord(error) &&
      error.code === 'ENOENT'
    ) {
      return {}
    }
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function waitForExitOrHardKill(
  child: DshRuntimeChildProcess,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('exit', finish)
      resolve()
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish()
    }, timeoutMs)
    child.once('exit', finish)
  })
}
