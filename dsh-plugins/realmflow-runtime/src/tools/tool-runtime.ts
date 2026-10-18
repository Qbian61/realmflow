import { createHash } from 'node:crypto'
import Ajv, { type ErrorObject } from 'ajv'
import type {
  CredentialReference,
  DshRunManifest,
  ExecutableToolManifest,
  ProductCommandGrant
} from '../../../../domain/dsh-run-manifest'
import {
  DshRuntimeAuthorityDeniedError,
  buildDshRuntimeAuthority,
  type DshRuntimeAuthority
} from '../runtime-authority'

export type DshToolHandlerSource =
  | 'dsh-native'
  | 'dsh-experimental'
  | 'rf-dsh-plugin'
  | 'realmflow-executor'

export type JsonSchema = boolean | Record<string, unknown>

export type DshToolHandler = {
  toolId: string
  source: DshToolHandlerSource
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
  requiredCredentials?: DshToolCredentialRequirement[]
  timeoutMs?: number
  maxAttempts?: number
  execute(input: unknown, context: DshToolExecutionContext): Promise<unknown> | unknown
}

export type DshToolCredentialRequirement = {
  ref: string
  purpose: CredentialReference['purpose']
}

export type CredentialLease = {
  leaseId: string
  ref: string
  purpose: CredentialReference['purpose']
  expiresAt?: number
}

export type DshToolExecutionContext = {
  manifest: DshRunManifest
  tool: ExecutableToolManifest
  source: Exclude<DshToolHandlerSource, 'realmflow-executor'>
  signal: AbortSignal
  credentials: Map<string, CredentialLease>
  productCommands: {
    execute(command: string, input: unknown): Promise<unknown>
  }
}

export type DshToolRuntimeOptions = {
  manifest: DshRunManifest
  authority?: DshRuntimeAuthority
  handlers: DshToolHandler[]
  interactionBridge?: {
    requestPermission(request: DshToolPermissionRequest): Promise<{
      decision: 'allow' | 'deny'
      reason?: string
    }>
  }
  credentialBroker?: {
    resolve(request: DshToolCredentialRequest): Promise<CredentialLease>
  }
  productCommandClient?: {
    execute(request: DshToolProductCommandRequest): Promise<unknown>
  }
  emitEvent?: (event: DshToolRuntimeEvent) => void
  now?: () => number
}

export type DshToolPermissionRequest = {
  manifestDigest: string
  runId: string
  sessionId: string
  toolId: string
  callId: string
  risk: ExecutableToolManifest['risk']
  inputDigest: string
}

export type DshToolCredentialRequest = {
  manifestDigest: string
  runId: string
  sessionId: string
  toolId: string
  callId: string
  credential: CredentialReference
}

export type DshToolProductCommandRequest = {
  manifestDigest: string
  runId: string
  sessionId: string
  toolId: string
  callId: string
  command: string
  grantId: string
  idempotencyKey: string
  input: unknown
}

export type DshToolExecutionRequest = {
  toolId: string
  callId: string
  idempotencyKey: string
  input: unknown
  signal?: AbortSignal
  timeoutMs?: number
}

export type DshToolExecutionResult = {
  callId: string
  toolId: string
  output: unknown
  replayed: boolean
}

export type DshToolRuntimeEvent =
  | DshToolRuntimeBaseEvent & { kind: 'tool.started' }
  | DshToolRuntimeBaseEvent & { kind: 'tool.succeeded'; outputDigest: string }
  | DshToolRuntimeBaseEvent & { kind: 'tool.failed'; reason: string }
  | DshToolRuntimeBaseEvent & { kind: 'tool.denied'; reason: string }
  | DshToolRuntimeBaseEvent & { kind: 'tool.approval_requested' }
  | DshToolRuntimeBaseEvent & { kind: 'tool.replayed'; originalCallId: string }

export type DshToolRuntimeBaseEvent = {
  at: number
  manifestDigest: string
  runId: string
  sessionId: string
  toolId: string
  callId: string
}

type CompletedToolCall = {
  inputDigest: string
  result: DshToolExecutionResult
}

const ajv = new Ajv({
  allErrors: true,
  strict: false
})

export const RF_DSH_PLUGIN_TOOL_IDS = new Set([
  'builtin.attachment.read_chunk',
  'builtin.realmflow.artifacts.list',
  'builtin.realmflow.artifacts.read',
  'builtin.realmflow.node.answer_question',
  'builtin.realmflow.node.decide_approval',
  'builtin.realmflow.node.todo.manage',
  'builtin.realmflow.requirements.get',
  'builtin.realmflow.requirements.list',
  'builtin.realmflow.spaces.list',
  'builtin.realmflow.workflow.get_execution',
  'builtin.files.trash',
  'builtin.fixed_layout.inspect',
  'builtin.fixed_layout.ocr',
  'builtin.image.composite',
  'builtin.image.compress',
  'builtin.image.convert',
  'builtin.image.crop',
  'builtin.image.ocr',
  'builtin.image.redact',
  'builtin.image.remove_exif',
  'builtin.image.resize',
  'builtin.image.rotate',
  'builtin.image.save',
  'builtin.knowledge.index.refresh',
  'builtin.knowledge.note.create',
  'builtin.knowledge.note.edit',
  'builtin.knowledge.search',
  'builtin.knowledge.source.read',
  'builtin.office.create_safe_copy',
  'builtin.office.import_legacy',
  'builtin.pdf.annotation_add',
  'builtin.pdf.form_fill',
  'builtin.pdf.inspect',
  'builtin.pdf.merge',
  'builtin.pdf.ocr',
  'builtin.pdf.rotate',
  'builtin.pdf.save',
  'builtin.pdf.save_as',
  'builtin.pdf.split',
  'builtin.pdf.watermark'
])

export type RealmFlowToolSourceClassification = {
  source: 'dsh-native' | 'dsh-experimental' | 'rf-dsh-plugin'
  packageName: string
}

export const REQUIRED_DSH_TOOL_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-attachment-local',
  '@deepseek-ai/dsh-browser-use',
  '@deepseek-ai/dsh-computer-use',
  '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
  '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native',
  '@deepseek-ai/dsh-fs-sandbox',
  '@deepseek-ai/dsh-lsp',
  '@deepseek-ai/dsh-lsp-stdio',
  '@deepseek-ai/dsh-mcp-client',
  '@deepseek-ai/dsh-mcp-resources',
  '@deepseek-ai/dsh-office-to-pdf',
  '@deepseek-ai/dsh-ptc-runtime-node',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-sandbox-local',
  '@deepseek-ai/dsh-sandbox-policy',
  '@deepseek-ai/dsh-skill-office',
  '@deepseek-ai/dsh-subprocess',
  '@deepseek-ai/dsh-subprocess-local',
  '@deepseek-ai/dsh-terminal',
  '@deepseek-ai/dsh-terminal-bash',
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-bash-persistent',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-fs-search',
  '@deepseek-ai/dsh-tool-jobs',
  '@deepseek-ai/dsh-tool-lsp',
  '@deepseek-ai/dsh-tool-present',
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-pwsh-persistent',
  '@deepseek-ai/dsh-tool-str-replace-editor',
  '@deepseek-ai/dsh-tool-terminal',
  '@deepseek-ai/dsh-tool-todo',
  '@deepseek-ai/dsh-tool-web',
  '@deepseek-ai/dsh-tool-workflow',
  '@deepseek-ai/dsh-tool-workspace-dependencies',
  '@deepseek-ai/dsh-web',
  '@deepseek-ai/dsh-web-fetch-http',
  '@deepseek-ai/dsh-workflow-ptc',
  '@deepseek-ai/dsh-workspace-changes'
] as const)

export function classifyRealmFlowToolSource(
  toolId: string
): RealmFlowToolSourceClassification | undefined {
  const rfPluginPackage = realmFlowPluginPackage(toolId)
  if (rfPluginPackage !== undefined) {
    return {
      source: 'rf-dsh-plugin',
      packageName: rfPluginPackage
    }
  }
  if (toolId.startsWith('builtin.browser.')) {
    return {
      source: 'dsh-experimental',
      packageName: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
    }
  }
  if (toolId.startsWith('builtin.computer.')) {
    return {
      source: 'dsh-experimental',
      packageName: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
    }
  }
  const nativePackage = nativeDshPackage(toolId)
  if (nativePackage === undefined) return undefined
  return {
    source: 'dsh-native',
    packageName: nativePackage
  }
}

export class DshToolRuntime {
  private readonly authority: DshRuntimeAuthority
  private readonly handlers: Map<string, DshToolHandler>
  private readonly emitEvent: (event: DshToolRuntimeEvent) => void
  private readonly now: () => number
  private readonly completed = new Map<string, CompletedToolCall>()

  constructor(private readonly options: DshToolRuntimeOptions) {
    this.authority =
      options.authority ?? buildDshRuntimeAuthority(options.manifest)
    this.handlers = new Map(options.handlers.map((handler) => [
      handler.toolId,
      handler
    ]))
    this.emitEvent = options.emitEvent ?? (() => {})
    this.now = options.now ?? Date.now
  }

  async execute(
    request: DshToolExecutionRequest
  ): Promise<DshToolExecutionResult> {
    const inputDigest = digestJson(request.input)
    const cached = this.completed.get(request.idempotencyKey)
    if (cached !== undefined) {
      if (cached.inputDigest !== inputDigest) {
        throw new Error('Tool idempotency key was reused with different input')
      }
      const replayed = {
        ...cached.result,
        callId: request.callId,
        replayed: true
      }
      this.emit('tool.replayed', request, {
        originalCallId: cached.result.callId
      })
      return replayed
    }

    try {
      const tool = this.authority.requireTool({ id: request.toolId })
      const handler = this.requireHandler(tool.id)
      assertHandlerSource(tool.id, handler.source)
      validateSchema('input', handler.inputSchema ?? true, request.input)
      assertPolicyAllows(this.options.manifest, tool)
      await this.requestApprovalIfNeeded(tool, request, inputDigest)
      const credentials = await this.resolveCredentials(handler, request)
      const { signal, dispose } = makeExecutionSignal(
        request.signal,
        request.timeoutMs ?? handler.timeoutMs
      )
      this.emit('tool.started', request)
      try {
        const output = await this.executeWithRetry(handler, request, {
          manifest: this.options.manifest,
          tool,
          source: handler.source,
          signal,
          credentials,
          productCommands: this.productCommandPort(request)
        })
        validateSchema('output', handler.outputSchema ?? true, output)
        const result: DshToolExecutionResult = {
          callId: request.callId,
          toolId: request.toolId,
          output,
          replayed: false
        }
        this.completed.set(request.idempotencyKey, {
          inputDigest,
          result
        })
        this.emit('tool.succeeded', request, {
          outputDigest: digestJson(output)
        })
        return result
      } finally {
        dispose()
      }
    } catch (error) {
      if (isDenied(error)) {
        this.emit('tool.denied', request, {
          reason: deniedReason(error)
        })
      } else {
        this.emit('tool.failed', request, {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
  }

  private requireHandler(toolId: string): DshToolHandler {
    const handler = this.handlers.get(toolId)
    if (handler === undefined) {
      throw new DshToolRuntimeDeniedError('tool handler is not registered')
    }
    return handler
  }

  private async requestApprovalIfNeeded(
    tool: ExecutableToolManifest,
    request: DshToolExecutionRequest,
    inputDigest: string
  ): Promise<void> {
    if (this.options.manifest.policy.approvalMode !== 'manual') return
    if (this.options.interactionBridge === undefined) {
      throw new DshToolRuntimeDeniedError('interaction approval is required')
    }
    this.emit('tool.approval_requested', request)
    const decision = await this.options.interactionBridge.requestPermission({
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      toolId: request.toolId,
      callId: request.callId,
      risk: tool.risk,
      inputDigest
    })
    if (decision.decision !== 'allow') {
      throw new DshToolRuntimeDeniedError(
        decision.reason ?? 'tool permission was denied'
      )
    }
  }

  private async resolveCredentials(
    handler: DshToolHandler,
    request: DshToolExecutionRequest
  ): Promise<Map<string, CredentialLease>> {
    const credentials = new Map<string, CredentialLease>()
    for (const required of handler.requiredCredentials ?? []) {
      const reference = this.authority.requireCredential(required)
      if (this.options.credentialBroker === undefined) {
        throw new DshToolRuntimeDeniedError('credential broker is required')
      }
      const lease = await this.options.credentialBroker.resolve({
        manifestDigest: this.options.manifest.digest,
        runId: this.options.manifest.runId,
        sessionId: this.options.manifest.sessionId,
        toolId: request.toolId,
        callId: request.callId,
        credential: reference
      })
      credentials.set(required.ref, lease)
    }
    return credentials
  }

  private productCommandPort(request: DshToolExecutionRequest) {
    return {
      execute: async (command: string, input: unknown): Promise<unknown> => {
        const grant = this.authority.requireProductCommand({ command })
        if (this.options.productCommandClient === undefined) {
          throw new DshToolRuntimeDeniedError('product command client is required')
        }
        return this.options.productCommandClient.execute({
          manifestDigest: this.options.manifest.digest,
          runId: this.options.manifest.runId,
          sessionId: this.options.manifest.sessionId,
          toolId: request.toolId,
          callId: request.callId,
          command,
          grantId: grant.grantId,
          idempotencyKey: `${request.idempotencyKey}:${grant.grantId}`,
          input
        })
      }
    }
  }

  private async executeWithRetry(
    handler: DshToolHandler,
    request: DshToolExecutionRequest,
    context: DshToolExecutionContext
  ): Promise<unknown> {
    const maxAttempts = Math.max(
      1,
      Math.min(
        handler.maxAttempts ?? 1,
        this.options.manifest.budget.maxRetries + 1
      )
    )
    let lastError: unknown
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      context.signal.throwIfAborted()
      try {
        return await handler.execute(request.input, context)
      } catch (error) {
        lastError = error
        if (attempt + 1 >= maxAttempts) break
      }
    }
    throw lastError
  }

  private emit(
    kind: DshToolRuntimeEvent['kind'],
    request: DshToolExecutionRequest,
    extra: Partial<DshToolRuntimeEvent> = {}
  ): void {
    this.emitEvent({
      kind,
      at: this.now(),
      manifestDigest: this.options.manifest.digest,
      runId: this.options.manifest.runId,
      sessionId: this.options.manifest.sessionId,
      toolId: request.toolId,
      callId: request.callId,
      ...extra
    } as DshToolRuntimeEvent)
  }
}

function realmFlowPluginPackage(toolId: string): string | undefined {
  if (!RF_DSH_PLUGIN_TOOL_IDS.has(toolId)) return undefined
  if (
    toolId === 'builtin.attachment.read_chunk'
    || toolId.startsWith('builtin.realmflow.')
  ) {
    return '@realmflow/dsh-product-tools'
  }
  if (toolId === 'builtin.files.trash') {
    return '@realmflow/dsh-platform-files'
  }
  if (toolId.startsWith('builtin.fixed_layout.')) {
    return '@realmflow/dsh-ofd-tools'
  }
  if (toolId.startsWith('builtin.image.')) {
    return '@realmflow/dsh-image-tools'
  }
  if (toolId.startsWith('builtin.knowledge.')) {
    return '@realmflow/dsh-knowledge-tools'
  }
  if (toolId.startsWith('builtin.office.')) {
    return '@realmflow/dsh-legacy-office-tools'
  }
  if (toolId.startsWith('builtin.pdf.')) {
    return '@realmflow/dsh-pdf-tools'
  }
  return undefined
}

function nativeDshPackage(toolId: string): string | undefined {
  if (toolId.startsWith('builtin.archives.')) {
    return '@deepseek-ai/dsh-tool-bash'
  }
  if (
    toolId === 'builtin.documents.read'
    || toolId === 'builtin.image.inspect'
  ) {
    return '@deepseek-ai/dsh-attachment-local'
  }
  if (toolId === 'builtin.files.search') {
    return '@deepseek-ai/dsh-tool-fs-search'
  }
  if (toolId === 'builtin.files.apply_patch') {
    return '@deepseek-ai/dsh-tool-str-replace-editor'
  }
  if (toolId.startsWith('builtin.files.')) {
    return '@deepseek-ai/dsh-tool-fs'
  }
  if (toolId.startsWith('builtin.git.')) {
    return '@deepseek-ai/dsh-tool-bash'
  }
  if (toolId.startsWith('builtin.process.')) {
    return '@deepseek-ai/dsh-tool-jobs'
  }
  if (toolId.startsWith('builtin.web.')) {
    return '@deepseek-ai/dsh-tool-web'
  }
  if (
    toolId.startsWith('builtin.document.')
    || toolId.startsWith('builtin.presentation.')
    || toolId.startsWith('builtin.spreadsheet.')
    || toolId === 'builtin.artifact.verify'
    || toolId === 'builtin.office.inspect_original'
  ) {
    return '@deepseek-ai/dsh-skill-office'
  }
  if (
    toolId === 'builtin.document.deliver_pdf'
    || toolId === 'builtin.document.export_pdf'
  ) {
    return '@deepseek-ai/dsh-office-to-pdf'
  }
  if (toolId === 'builtin.pdf.thumbnail') {
    return '@deepseek-ai/dsh-skill-office'
  }
  return undefined
}

export class DshToolRuntimeDeniedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DshToolRuntimeDeniedError'
  }
}

function assertHandlerSource(toolId: string, source: DshToolHandlerSource): asserts source is Exclude<DshToolHandlerSource, 'realmflow-executor'> {
  if (source === 'realmflow-executor') {
    throw new DshToolRuntimeDeniedError(
      'RealmFlow executor fallback is forbidden'
    )
  }
  const requiresRfPlugin = RF_DSH_PLUGIN_TOOL_IDS.has(toolId)
  if (requiresRfPlugin && source !== 'rf-dsh-plugin') {
    throw new DshToolRuntimeDeniedError(
      `${toolId} must execute as an RF_DSH_PLUGIN`
    )
  }
  if (!requiresRfPlugin && source === 'rf-dsh-plugin') {
    throw new DshToolRuntimeDeniedError(
      `${toolId} is already provided by DSH and cannot be shadowed by a RealmFlow plugin`
    )
  }
}

function assertPolicyAllows(
  manifest: DshRunManifest,
  tool: ExecutableToolManifest
): void {
  if (riskRank(tool.risk) > riskRank(manifest.policy.maximumRisk)) {
    throw new DshToolRuntimeDeniedError('tool risk exceeds manifest policy')
  }
}

function riskRank(risk: ExecutableToolManifest['risk']): number {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  }[risk]
}

function validateSchema(
  label: 'input' | 'output',
  schema: JsonSchema,
  value: unknown
): void {
  if (schema === true) return
  if (schema === false) {
    throw new Error(`Tool ${label} schema validation failed`)
  }
  const validate = ajv.compile(schema)
  if (!validate(value)) {
    throw new Error(
      `Tool ${label} schema validation failed: ${formatAjvErrors(validate.errors)}`
    )
  }
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'unknown schema error'
  return ajv.errorsText(errors, { separator: '; ' })
}

function makeExecutionSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number | undefined
): {
  signal: AbortSignal
  dispose: () => void
} {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parent?.reason)
  if (parent?.aborted) abortFromParent()
  parent?.addEventListener('abort', abortFromParent, { once: true })
  const timeout =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(new Error('Tool execution timed out')), timeoutMs)
  return {
    signal: controller.signal,
    dispose: () => {
      parent?.removeEventListener('abort', abortFromParent)
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof DshRuntimeAuthorityDeniedError
    || error instanceof DshToolRuntimeDeniedError
  )
}

function deniedReason(error: unknown): string {
  if (error instanceof DshRuntimeAuthorityDeniedError) {
    return error.event.reason
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Tool payload number is invalid')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`
}
