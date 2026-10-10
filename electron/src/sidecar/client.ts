import {
  AI_RUN_EVENT_TYPES,
  type AiRunEvent,
  type AiRunToolResult
} from '../../../domain/ai-run'
import type { RunContext } from '../ai-run/application/ports'
import type { RunToolConfiguration } from '../ai-run/application/ports'
import type {
  SidecarModelExecutionConfig,
  SidecarSkillConnectorGrant
} from '../network/network-gateway'
import type { ModelCallErrorCode } from '../../../domain/model'
import type {
  SkillExecutionErrorCode,
  SkillExecutionMetrics
} from '../../../domain/skill-execution'
import type { SandboxManifest } from '../../../domain/sandbox-manifest'
import type { ToolCapability } from '../../../domain/tool-definition'
import {
  GTE_EMBEDDING_DIMENSIONS,
  GTE_EMBEDDING_MODEL,
  GTE_EMBEDDING_REVISION
} from '../../../domain/vector-index-profile'
import {
  KNOWLEDGE_CHUNKER_PROFILE,
  validateChunkedKnowledgeDocuments,
  type ChunkedKnowledgeResult,
  type KnowledgeChunkSourceDocument
} from '../../../domain/knowledge-chunking'

const MODEL_CALL_ERROR_CODES = new Set<ModelCallErrorCode>([
  'provider_rejected',
  'provider_rate_limited',
  'provider_unavailable',
  'provider_timeout',
  'max_agent_turns',
  'request_cancelled',
  'protocol_error',
  'stream_error',
  'interrupted'
])

const SKILL_EXECUTION_ERROR_CODES = new Set<SkillExecutionErrorCode>([
  'skill_version_unavailable',
  'skill_input_invalid',
  'skill_output_invalid',
  'skill_context_invalid',
  'skill_permission_required',
  'skill_permission_denied',
  'skill_connector_unavailable',
  'skill_sandbox_unavailable',
  'skill_timeout',
  'skill_memory_limit',
  'skill_output_limit',
  'skill_execution_failed',
  'skill_revision_conflict',
  'skill_idempotency_conflict',
  'skill_execution_unavailable'
])

export type SidecarHealth = {
  status: 'ok'
  service: 'realmflow-agent'
}

export type SidecarInfo = {
  name: 'RealmFlow Agent'
  version: string
  transport: 'HTTP/SSE'
}

export type SidecarEmbeddingModelHealth =
  | {
      status: 'ready'
      model: typeof GTE_EMBEDDING_MODEL
      revision: typeof GTE_EMBEDDING_REVISION
      dimensions: typeof GTE_EMBEDDING_DIMENSIONS
      normalize: 'L2'
      runtime: 'onnxruntime-cpu'
    }
  | {
      status: 'unavailable'
      model: typeof GTE_EMBEDDING_MODEL
      revision: typeof GTE_EMBEDDING_REVISION
      dimensions: typeof GTE_EMBEDDING_DIMENSIONS
      normalize: 'L2'
      runtime: 'onnxruntime-cpu'
      errorCode: string
    }

export type SidecarQueryEmbeddingResult = {
  embeddingModel: typeof GTE_EMBEDDING_MODEL
  embeddingRevision: typeof GTE_EMBEDDING_REVISION
  dimensions: typeof GTE_EMBEDDING_DIMENSIONS
  embedding: number[]
}

export type SidecarDocumentEmbeddingResult = Omit<
  SidecarQueryEmbeddingResult,
  'embedding'
> & {
  embeddings: Array<{ id: string; embedding: number[] }>
}

export type LegacyOfficeFormat =
  | 'doc'
  | 'dot'
  | 'wps'
  | 'wpt'
  | 'xls'
  | 'xlt'
  | 'ppt'
  | 'pps'
  | 'pot'

export type ModernOfficeFormat = 'docx' | 'xlsx' | 'pptx'

export type OfficeSafeCopyFormat =
  | 'dotx'
  | 'xltx'
  | 'potx'
  | 'docm'
  | 'dotm'
  | 'xlsm'
  | 'xltm'
  | 'pptm'
  | 'ppsm'
  | 'potm'

export type OfficeSafeCopyInput = {
  sourceFormat: OfficeSafeCopyFormat
  documentBase64: string
}

export type OfficeSafeCopyResult = {
  documentBase64: string
  outputFormat: ModernOfficeFormat
  macrosRemoved: boolean
  templateMaterialized: boolean
  removedParts: string[]
}

export class SidecarOfficeSafeCopyError extends Error {
  readonly name = 'SidecarOfficeSafeCopyError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export type LegacyOfficeConversionInput = {
  sourceFormat: LegacyOfficeFormat
  documentBase64: string
}

export type LegacyOfficeConversionResult = {
  documentBase64: string
  outputFormat: ModernOfficeFormat
  converter: 'LibreOffice'
}

export class SidecarLegacyOfficeError extends Error {
  readonly name = 'SidecarLegacyOfficeError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export type SpreadsheetFormat = 'csv' | 'tsv' | 'xlsx' | 'xls'

export type SpreadsheetComputeOperation =
  | 'inspect'
  | 'read_range'
  | 'insert_rows'
  | 'delete_rows'
  | 'write_range'
  | 'set_style'
  | 'set_formula'
  | 'sort'
  | 'filter'
  | 'chart'

export type SpreadsheetComputeInput = {
  format: SpreadsheetFormat
  operation: SpreadsheetComputeOperation
  documentBase64: string
  parameters: Record<string, unknown>
}

export type SpreadsheetComputeResult = {
  documentBase64: string
  result: Record<string, unknown>
  modified: boolean
  requiresRecalculation: boolean
}

export class SidecarSpreadsheetError extends Error {
  readonly name = 'SidecarSpreadsheetError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export type WordComputeOperation =
  | 'inspect'
  | 'find'
  | 'insert_blocks'
  | 'replace_text'
  | 'update_style'
  | 'update_layout'
  | 'table_insert'
  | 'table_write'
  | 'comment_add'
  | 'comment_delete'

export type WordPreservationRisk = {
  code: string
  message: string
  part: string
}

export type WordComputeInput = {
  format: 'docx'
  operation: WordComputeOperation
  documentBase64: string
  parameters: Record<string, unknown>
}

export type WordComputeResult = {
  documentBase64: string
  result: Record<string, unknown>
  modified: boolean
  preservationRisk: WordPreservationRisk[]
}

export class SidecarWordError extends Error {
  readonly name = 'SidecarWordError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export type PresentationComputeOperation =
  | 'inspect'
  | 'update_text'
  | 'replace_image'
  | 'table_write'
  | 'chart_write'
  | 'add_slide'
  | 'copy_slide'
  | 'delete_slide'
  | 'reorder_slide'
  | 'add_text'
  | 'add_image'
  | 'add_table'
  | 'add_chart'
  | 'reorder_shape'
  | 'update_size'

export type PresentationPreservationRisk = {
  code: string
  message: string
  part: string
}

export type PresentationComputeInput = {
  format: 'pptx'
  operation: PresentationComputeOperation
  documentBase64: string
  parameters: Record<string, unknown>
}

export type PresentationComputeResult = {
  documentBase64: string
  result: Record<string, unknown>
  modified: boolean
  preservationRisk: PresentationPreservationRisk[]
}

export class SidecarPresentationError extends Error {
  readonly name = 'SidecarPresentationError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export type DocumentDeliveryBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet_list'; items: string[] }
  | { kind: 'table'; rows: string[][] }

export type SidecarDocumentArtifact = {
  documentBase64: string
  format: 'docx' | 'pdf'
  byteSize: number
  checksum: string
  pageCount: number | null
  converter?: 'libreoffice' | 'cupsfilter_text'
  quality?: 'print' | 'degraded_text'
  warnings?: string[]
}

export type SidecarDocumentVerification = Omit<
  SidecarDocumentArtifact,
  'documentBase64'
> & {
  valid: true
}

export class SidecarDocumentDeliveryError extends Error {
  readonly name = 'SidecarDocumentDeliveryError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export type SidecarSkillExecutionInput = {
  executionId: string
  entryType: 'prompt' | 'python'
  packageRoot: string
  entryPath: string
  input: Record<string, unknown>
  capabilities: ToolCapability[]
  scopeRoots: string[]
  network: SidecarSkillConnectorGrant[]
  timeoutMs: number
  maxMemoryMb: number
  maxOutputBytes: number
}

export type SidecarSkillExecutionResult = {
  output: Record<string, unknown>
  metrics: SkillExecutionMetrics
}

export type SidecarToolExecutionInput = {
  executionId: string
  manifest: SandboxManifest
  runtime: 'python' | 'process'
  packageRoot: string
  entryPath: string
  arguments: string[]
  input: Record<string, unknown>
  capabilities: ToolCapability[]
  scopeRoots: string[]
  network: SidecarSkillConnectorGrant[]
  timeoutMs: number
  maxMemoryMb: number
  maxOutputBytes: number
}

export type SidecarToolExecutionResult = {
  output: Record<string, unknown>
  metrics: SkillExecutionMetrics
}

export type SidecarSandboxCapabilities = {
  platform: string
  processIsolation: 'sandbox-exec' | 'bwrap' | 'unavailable'
}

export type SidecarResumeRunInput = {
  turnGate?: boolean
  resumeToken: string
  conversationId: string
  messages: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolCalls?: Array<{
      id: string
      name: string
      arguments: string
    }>
    toolCallId?: string
    name?: string
  }>
  workspaceId?: string
  folderPath?: string
  context?: string
  reasoning?: 'off' | 'low' | 'medium' | 'high'
  maxOutputTokens?: number
  model?: SidecarModelExecutionConfig
  tools: RunToolConfiguration['tools']
  pendingToolCalls?: Array<{
    callId: string
    index: number
    name: string
    arguments: string
    requestId: string
    toolExecutionId: string
  }>
  maxAgentTurns: number
  maxParallelToolsPerTurn: number
}

export class SidecarToolError extends Error {
  readonly name = 'SidecarToolError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class SidecarSkillError extends Error {
  readonly name = 'SidecarSkillError'

  constructor(
    readonly code: SkillExecutionErrorCode,
    message: string
  ) {
    super(message)
  }
}

class SidecarRequestError extends Error {
  readonly name = 'SidecarRequestError'

  constructor(readonly status: number) {
    super(`Sidecar request failed with status ${status}`)
  }
}

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

type SidecarClientOptions = {
  authToken?: string
  maxReconnects?: number
  timeoutMs?: number
}

export class SidecarClient {
  private readonly baseUrl: string
  private readonly authToken: string | undefined
  private readonly maxReconnects: number
  private readonly timeoutMs: number

  constructor(
    baseUrl: string,
    private readonly request: Fetch = fetch,
    options: SidecarClientOptions = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.authToken = options.authToken
    this.maxReconnects = options.maxReconnects ?? 3
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  async getHealth(): Promise<SidecarHealth> {
    const payload = await this.getJson('/health')
    if (
      !isRecord(payload) ||
      payload.status !== 'ok' ||
      payload.service !== 'realmflow-agent'
    ) {
      throw new Error('Invalid Sidecar health response')
    }
    return payload as SidecarHealth
  }

  async getInfo(): Promise<SidecarInfo> {
    const payload = await this.getJson('/api/v1/info')
    if (
      !isRecord(payload) ||
      payload.name !== 'RealmFlow Agent' ||
      typeof payload.version !== 'string' ||
      payload.version.length === 0 ||
      payload.transport !== 'HTTP/SSE'
    ) {
      throw new Error('Invalid Sidecar info response')
    }
    return payload as SidecarInfo
  }

  async getSandboxCapabilities(): Promise<SidecarSandboxCapabilities> {
    const payload = await this.requestJson(
      '/api/v1/sandbox/capabilities',
      { method: 'GET' }
    )
    if (
      !hasExactKeys(payload, ['platform', 'processIsolation']) ||
      typeof payload.platform !== 'string' ||
      (payload.processIsolation !== 'sandbox-exec' &&
        payload.processIsolation !== 'bwrap' &&
        payload.processIsolation !== 'unavailable')
    ) {
      throw new Error('Invalid Sidecar sandbox capabilities response')
    }
    return {
      platform: payload.platform,
      processIsolation: payload.processIsolation
    }
  }

  async executeSkill(
    input: SidecarSkillExecutionInput,
    signal: AbortSignal
  ): Promise<SidecarSkillExecutionResult> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/skills/execute`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) {
      throw parseSidecarSkillError(payload, response.status)
    }
    if (
      !hasExactKeys(payload, ['output', 'metrics']) ||
      !isRecord(payload.output) ||
      !isSkillExecutionMetrics(payload.metrics)
    ) {
      throw new Error('Invalid Sidecar Skill response')
    }
    return {
      output: payload.output,
      metrics: payload.metrics
    }
  }

  async executeTool(
    input: SidecarToolExecutionInput,
    signal: AbortSignal
  ): Promise<SidecarToolExecutionResult> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/tools/execute`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) {
      throw parseSidecarToolError(payload, response.status)
    }
    if (
      !hasExactKeys(payload, ['output', 'metrics']) ||
      !isRecord(payload.output) ||
      !isSkillExecutionMetrics(payload.metrics)
    ) {
      throw new Error('Invalid Sidecar Tool response')
    }
    return {
      output: payload.output,
      metrics: payload.metrics
    }
  }

  async cancelToolExecution(executionId: string): Promise<boolean> {
    const payload = await this.requestJson(
      `/api/v1/tools/${encodeURIComponent(executionId)}/cancel`,
      { method: 'POST' }
    )
    if (
      !hasExactKeys(payload, ['executionId', 'cancelled']) ||
      payload.executionId !== executionId ||
      typeof payload.cancelled !== 'boolean'
    ) {
      throw new Error('Invalid Sidecar Tool cancellation response')
    }
    return payload.cancelled
  }

  async cancelSkillExecution(executionId: string): Promise<boolean> {
    const payload = await this.requestJson(
      `/api/v1/skills/${encodeURIComponent(executionId)}/cancel`,
      { method: 'POST' }
    )
    if (
      !hasExactKeys(payload, ['executionId', 'cancelled']) ||
      payload.executionId !== executionId ||
      typeof payload.cancelled !== 'boolean'
    ) {
      throw new Error('Invalid Sidecar Skill cancellation response')
    }
    return payload.cancelled
  }

  async createRun(
    context: RunContext,
    model?: SidecarModelExecutionConfig,
    toolConfiguration?: RunToolConfiguration
  ): Promise<{ runId: string }> {
    const payload = await this.requestJson('/api/v1/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sidecarRunContext(context),
        ...(model ? { model } : {}),
        ...(toolConfiguration ?? {})
      })
    })
    if (
      !isRecord(payload) ||
      typeof payload.runId !== 'string' ||
      payload.runId.length === 0
    ) {
      throw new Error('Invalid Sidecar run response')
    }
    return { runId: payload.runId }
  }

  async resumeRun(
    input: SidecarResumeRunInput
  ): Promise<{ runId: string }> {
    const payload = await this.requestJson('/api/v1/runs/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    })
    if (
      !hasExactKeys(payload, ['runId']) ||
      typeof payload.runId !== 'string' ||
      payload.runId.length === 0
    ) {
      throw new Error('Invalid Sidecar resumed run response')
    }
    return { runId: payload.runId }
  }

  async getEmbeddingModelHealth(): Promise<SidecarEmbeddingModelHealth> {
    const payload = await this.getJson(
      '/api/v1/knowledge/model-health'
    )
    if (!isEmbeddingModelHealth(payload)) {
      throw new Error('Invalid Sidecar embedding model health response')
    }
    return payload
  }

  async embedKnowledgeQuery(
    text: string,
    signal: AbortSignal
  ): Promise<SidecarQueryEmbeddingResult> {
    const payload = await this.requestJson(
      '/api/v1/knowledge/embed-query',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal
      }
    )
    if (
      !hasExactKeys(payload, [
        'embeddingModel',
        'embeddingRevision',
        'dimensions',
        'embedding'
      ]) ||
      !hasFixedEmbeddingIdentity(payload) ||
      !isDenseEmbedding(payload.embedding)
    ) {
      throw new Error('Invalid Sidecar query embedding response')
    }
    return payload as SidecarQueryEmbeddingResult
  }

  async embedKnowledgeDocuments(
    documents: Array<{ id: string; text: string }>,
    signal: AbortSignal
  ): Promise<SidecarDocumentEmbeddingResult> {
    const payload = await this.requestJson(
      '/api/v1/knowledge/embed-documents',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents }),
        signal
      }
    )
    const expectedIds = new Set(documents.map(({ id }) => id))
    if (
      expectedIds.size !== documents.length ||
      !hasExactKeys(payload, [
        'embeddingModel',
        'embeddingRevision',
        'dimensions',
        'embeddings'
      ]) ||
      !hasFixedEmbeddingIdentity(payload) ||
      !Array.isArray(payload.embeddings) ||
      payload.embeddings.length !== documents.length ||
      !payload.embeddings.every(
        (item) =>
          hasExactKeys(item, ['id', 'embedding']) &&
          typeof item.id === 'string' &&
          expectedIds.has(item.id) &&
          isDenseEmbedding(item.embedding)
      ) ||
      new Set(payload.embeddings.map(({ id }) => id)).size !==
        documents.length
    ) {
      throw new Error('Invalid Sidecar document embedding response')
    }
    return payload as SidecarDocumentEmbeddingResult
  }

  async computeSpreadsheet(
    input: SpreadsheetComputeInput,
    signal: AbortSignal
  ): Promise<SpreadsheetComputeResult> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/office/spreadsheets/compute`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal: linkedTimeoutSignal(signal, this.timeoutMs)
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) throw parseSidecarSpreadsheetError(payload, response.status)
    if (
      !hasExactKeys(payload, [
        'documentBase64',
        'result',
        'modified',
        'requiresRecalculation'
      ]) ||
      typeof payload.documentBase64 !== 'string' ||
      !isRecord(payload.result) ||
      typeof payload.modified !== 'boolean' ||
      typeof payload.requiresRecalculation !== 'boolean'
    ) {
      throw new Error('Invalid Sidecar spreadsheet response')
    }
    return payload as SpreadsheetComputeResult
  }

  async convertLegacyOffice(
    input: LegacyOfficeConversionInput,
    signal: AbortSignal
  ): Promise<LegacyOfficeConversionResult> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/office/legacy/convert`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal: linkedTimeoutSignal(signal, 120_000)
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) {
      throw parseSidecarLegacyOfficeError(payload, response.status)
    }
    if (
      !hasExactKeys(payload, [
        'documentBase64',
        'outputFormat',
        'converter'
      ]) ||
      typeof payload.documentBase64 !== 'string' ||
      payload.documentBase64.length === 0 ||
      payload.outputFormat !== legacyTargetFormat(input.sourceFormat) ||
      payload.converter !== 'LibreOffice'
    ) {
      throw new Error('Invalid Sidecar legacy Office response')
    }
    return payload as LegacyOfficeConversionResult
  }

  async createSafeOfficeCopy(
    input: OfficeSafeCopyInput,
    signal: AbortSignal
  ): Promise<OfficeSafeCopyResult> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/office/safe-copy`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal: linkedTimeoutSignal(signal, this.timeoutMs)
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) {
      throw parseSidecarOfficeSafeCopyError(payload, response.status)
    }
    const expected = officeSafeCopyPolicy(input.sourceFormat)
    if (
      !hasExactKeys(payload, [
        'documentBase64',
        'outputFormat',
        'macrosRemoved',
        'templateMaterialized',
        'removedParts'
      ]) ||
      typeof payload.documentBase64 !== 'string' ||
      payload.documentBase64.length === 0 ||
      payload.outputFormat !== expected.outputFormat ||
      payload.macrosRemoved !== expected.macrosRemoved ||
      payload.templateMaterialized !== expected.templateMaterialized ||
      !Array.isArray(payload.removedParts) ||
      !payload.removedParts.every(
        (part) => typeof part === 'string' && part.length > 0
      ) ||
      (expected.macrosRemoved && payload.removedParts.length === 0) ||
      (!expected.macrosRemoved && payload.removedParts.length !== 0)
    ) {
      throw new Error('Invalid Sidecar Office safe-copy response')
    }
    return payload as OfficeSafeCopyResult
  }

  async computeWordDocument(
    input: WordComputeInput,
    signal: AbortSignal
  ): Promise<WordComputeResult> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/office/documents/compute`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal: linkedTimeoutSignal(signal, this.timeoutMs)
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) throw parseSidecarWordError(payload, response.status)
    if (
      !hasExactKeys(payload, [
        'documentBase64',
        'result',
        'modified',
        'preservationRisk'
      ]) ||
      typeof payload.documentBase64 !== 'string' ||
      !isRecord(payload.result) ||
      typeof payload.modified !== 'boolean' ||
      !Array.isArray(payload.preservationRisk) ||
      !payload.preservationRisk.every(isWordPreservationRisk)
    ) {
      throw new Error('Invalid Sidecar Word response')
    }
    return payload as WordComputeResult
  }

  async computePresentation(
    input: PresentationComputeInput,
    signal: AbortSignal
  ): Promise<PresentationComputeResult> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/office/presentations/compute`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal: linkedTimeoutSignal(signal, this.timeoutMs)
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) {
      throw parseSidecarPresentationError(payload, response.status)
    }
    if (
      !hasExactKeys(payload, [
        'documentBase64',
        'result',
        'modified',
        'preservationRisk'
      ]) ||
      typeof payload.documentBase64 !== 'string' ||
      !isRecord(payload.result) ||
      typeof payload.modified !== 'boolean' ||
      !Array.isArray(payload.preservationRisk) ||
      !payload.preservationRisk.every(isPresentationPreservationRisk)
    ) {
      throw new Error('Invalid Sidecar presentation response')
    }
    return payload as PresentationComputeResult
  }

  async createDocument(
    input: {
      document: {
        title: string
        blocks: DocumentDeliveryBlock[]
      }
    },
    signal: AbortSignal
  ): Promise<SidecarDocumentArtifact> {
    return this.requestDocumentArtifact(
      '/api/v1/documents/create',
      input,
      signal
    )
  }

  async exportDocumentPdf(
    input: { documentBase64: string },
    signal: AbortSignal
  ): Promise<SidecarDocumentArtifact> {
    return this.requestDocumentArtifact(
      '/api/v1/documents/export-pdf',
      input,
      signal,
      120_000
    )
  }

  async verifyDocumentArtifact(
    input: {
      documentBase64: string
      format: 'docx' | 'pdf'
    },
    signal: AbortSignal
  ): Promise<SidecarDocumentVerification> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/artifacts/verify`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal: linkedTimeoutSignal(signal, this.timeoutMs)
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) {
      throw parseSidecarDocumentDeliveryError(payload, response.status)
    }
    if (
      !isDocumentArtifactFacts(payload, false) ||
      payload.valid !== true ||
      payload.format !== input.format
    ) {
      throw new Error('Invalid Sidecar document verification response')
    }
    return payload as SidecarDocumentVerification
  }

  private async requestDocumentArtifact(
    path: string,
    input: object,
    signal: AbortSignal,
    timeoutMs = this.timeoutMs
  ): Promise<SidecarDocumentArtifact> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.authenticatedHeaders({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify(input),
      signal: linkedTimeoutSignal(signal, timeoutMs)
    })
    const payload = await response.json() as unknown
    if (!response.ok) {
      throw parseSidecarDocumentDeliveryError(payload, response.status)
    }
    if (!isDocumentArtifactFacts(payload, true)) {
      throw new Error('Invalid Sidecar document delivery response')
    }
    return payload
  }

  async recalculateSpreadsheet(
    input: { format: 'xlsx'; documentBase64: string },
    signal: AbortSignal
  ): Promise<{ documentBase64: string }> {
    const response = await this.request(
      `${this.baseUrl}/api/v1/office/spreadsheets/recalculate`,
      {
        method: 'POST',
        headers: this.authenticatedHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(input),
        signal: linkedTimeoutSignal(signal, 120_000)
      }
    )
    const payload = await response.json() as unknown
    if (!response.ok) throw parseSidecarSpreadsheetError(payload, response.status)
    if (
      !hasExactKeys(payload, ['documentBase64']) ||
      typeof payload.documentBase64 !== 'string' ||
      payload.documentBase64.length === 0
    ) {
      throw new Error('Invalid Sidecar spreadsheet recalculation response')
    }
    return { documentBase64: payload.documentBase64 }
  }

  async chunkKnowledgeDocuments(
    documents: KnowledgeChunkSourceDocument[],
    signal: AbortSignal
  ): Promise<ChunkedKnowledgeResult> {
    const payload = await this.requestJson(
      '/api/v1/knowledge/chunk-documents',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunkerVersion: KNOWLEDGE_CHUNKER_PROFILE.version,
          documents
        }),
        signal
      }
    )
    const validated = validateChunkedKnowledgeDocuments(documents, payload)
    return {
      chunkerVersion: KNOWLEDGE_CHUNKER_PROFILE.version,
      embeddingModel: GTE_EMBEDDING_MODEL,
      embeddingRevision: GTE_EMBEDDING_REVISION,
      documents: validated
    }
  }

  async *streamEvents(
    runId: string,
    signal: AbortSignal
  ): AsyncGenerator<AiRunEvent> {
    let reconnects = 0
    let lastEventId: string | undefined
    let lastSequence = 0
    let terminal = false

    while (!terminal) {
      const headers: Record<string, string> = {
        Accept: 'text/event-stream'
      }
      if (this.authToken) {
        headers.Authorization = `Bearer ${this.authToken}`
      }
      if (lastEventId) headers['Last-Event-ID'] = lastEventId
      try {
        const response = await this.request(
          `${this.baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/events`,
          { headers, signal }
        )
        if (!response.ok || !response.body) {
          throw new SidecarProtocolError(
            `Sidecar request failed with status ${response.status}`
          )
        }
        if (!response.headers.get('Content-Type')?.includes('text/event-stream')) {
          throw new SidecarProtocolError('Invalid Sidecar event stream response')
        }

        for await (const payload of parseSseStream(response.body)) {
          const event = parseAiRunEvent(payload.data)
          if (event.runId !== runId) {
            throw new SidecarProtocolError('Invalid Sidecar event runId')
          }
          if (event.sequence <= lastSequence) continue
          if (event.sequence !== lastSequence + 1) {
            break
          }
          lastEventId = payload.id ?? event.id
          lastSequence = event.sequence
          yield event
          terminal = isTerminalEvent(event)
          if (terminal) return
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason
        if (error instanceof SidecarProtocolError) throw error
      }

      if (reconnects >= this.maxReconnects) {
        throw new Error('Sidecar event stream disconnected')
      }
      reconnects += 1
    }
  }

  async cancelRun(runId: string): Promise<void> {
    try {
      await this.requestJson(
        `/api/v1/runs/${encodeURIComponent(runId)}/cancel`,
        { method: 'POST' }
      )
    } catch (error) {
      if (error instanceof SidecarRequestError && error.status === 404) return
      throw error
    }
  }

  async acknowledgeTurn(
    runId: string,
    input: { turn: number; messages: Array<{ role: 'user'; content: string }> }
  ): Promise<void> {
    const payload = await this.requestJson(
      `/api/v1/runs/${encodeURIComponent(runId)}/turn`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
    )
    if (!hasExactKeys(payload, ['runId', 'turn', 'status']) ||
        payload.runId !== runId || payload.turn !== input.turn || payload.status !== 'accepted') {
      throw new Error('Invalid Sidecar turn acknowledgment')
    }
  }

  async submitToolResult(
    runId: string,
    result: AiRunToolResult
  ): Promise<void> {
    const payload = await this.requestJson(
      `/api/v1/runs/${encodeURIComponent(runId)}/tool-results`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      }
    )
    if (
      !hasExactKeys(payload, ['runId', 'callId', 'status']) ||
      payload.runId !== runId ||
      payload.callId !== result.callId ||
      payload.status !== 'accepted'
    ) {
      throw new Error('Invalid Sidecar Tool result response')
    }
  }

  async suspendToolCall(
    runId: string,
    suspension: {
      callId: string
      requestId: string
      toolExecutionId: string
    }
  ): Promise<void> {
    const payload = await this.requestJson(
      `/api/v1/runs/${encodeURIComponent(runId)}/tool-calls/${encodeURIComponent(suspension.callId)}/suspend`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: suspension.requestId,
          toolExecutionId: suspension.toolExecutionId
        })
      }
    )
    if (
      !hasExactKeys(payload, [
        'runId',
        'callId',
        'requestId',
        'status'
      ]) ||
      payload.runId !== runId ||
      payload.callId !== suspension.callId ||
      payload.requestId !== suspension.requestId ||
      payload.status !== 'suspended'
    ) {
      throw new Error('Invalid Sidecar Tool suspension response')
    }
  }

  private async getJson(path: string): Promise<unknown> {
    return this.requestJson(path)
  }

  private async requestJson(
    path: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.authenticatedHeaders(init.headers),
      signal: init.signal
        ? linkedTimeoutSignal(init.signal, this.timeoutMs)
        : AbortSignal.timeout(this.timeoutMs)
    })
    if (!response.ok) {
      throw new SidecarRequestError(response.status)
    }
    return response.json() as Promise<unknown>
  }

  private authenticatedHeaders(headers?: HeadersInit): Headers {
    const authenticated = new Headers(headers)
    if (this.authToken) {
      authenticated.set('Authorization', `Bearer ${this.authToken}`)
    }
    return authenticated
  }
}

function sidecarRunContext(context: RunContext): Record<string, unknown> {
  if (!('conversationId' in context) || !context.attachmentContext) {
    return context
  }
  const { attachmentContext, ...rest } = context
  if (attachmentContext.imageParts.length === 0) return rest
  let lastUserIndex = -1
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    if (context.messages[index]?.role === 'user') {
      lastUserIndex = index
      break
    }
  }
  if (lastUserIndex < 0) {
    throw new Error('Conversation image input requires a user message')
  }
  const messages = context.messages.map((message, index) =>
    index !== lastUserIndex
      ? message
      : {
          ...message,
          content: [
            { type: 'text' as const, text: message.content },
            ...attachmentContext.imageParts.map((image) => ({
              type: 'image' as const,
              attachmentId: image.attachmentId,
              mimeType: image.mimeType,
              dataBase64: image.dataBase64
            }))
          ]
        }
  )
  return { ...rest, messages }
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<{ id?: string; data: string }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseSseFrame(frame)
        if (parsed) yield parsed
        boundary = buffer.indexOf('\n\n')
      }
      if (done) break
    }
    const parsed = parseSseFrame(buffer)
    if (parsed) yield parsed
  } finally {
    reader.releaseLock()
  }
}

function parseSseFrame(frame: string): { id?: string; data: string } | null {
  const data: string[] = []
  let id: string | undefined
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const value =
      separator < 0
        ? ''
        : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'id') id = value
    if (field === 'data') data.push(value)
  }
  return data.length > 0 ? { id, data: data.join('\n') } : null
}

function parseAiRunEvent(value: string): AiRunEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new SidecarProtocolError('Invalid Sidecar event JSON')
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.id !== 'string' ||
    typeof parsed.runId !== 'string' ||
    !Number.isSafeInteger(parsed.sequence) ||
    (parsed.sequence as number) < 1 ||
    !AI_RUN_EVENT_TYPES.includes(parsed.type as AiRunEvent['type']) ||
    typeof parsed.timestamp !== 'string' ||
    !isRecord(parsed.data) ||
    !isValidEventData(
      parsed.type as AiRunEvent['type'],
      parsed.data
    )
  ) {
    throw new SidecarProtocolError('Invalid Sidecar event')
  }
  return parsed as AiRunEvent
}

class SidecarProtocolError extends Error {}

function isValidEventData(
  type: AiRunEvent['type'],
  data: Record<string, unknown>
): boolean {
  if (!isValidEventMetrics(data)) return false
  if (type === 'run.turn_ready') {
    return hasExactKeys(data, ['agentTurn']) && isNonNegativeInteger(data.agentTurn) &&
      (data.agentTurn as number) >= 1 && (data.agentTurn as number) <= 180
  }
  if (type === 'tool.call.requested') {
    return (
      hasAllowedKeys(data, ['toolCall', 'agentTurn']) &&
      isRecord(data.toolCall) &&
      hasExactKeys(data.toolCall, [
        'index',
        'id',
        'name',
        'arguments'
      ]) &&
      isNonNegativeInteger(data.toolCall.index) &&
      isNonEmptyString(data.toolCall.id) &&
      isNonEmptyString(data.toolCall.name) &&
      typeof data.toolCall.arguments === 'string'
    )
  }
  if (
    type === 'tool.call.completed' ||
    type === 'tool.call.failed'
  ) {
    return (
      hasAllowedKeys(data, ['toolResult', 'toolName']) &&
      (data.toolName === undefined || isNonEmptyString(data.toolName)) &&
      isValidToolResult(data.toolResult, type)
    )
  }
  if (type === 'tool.call.permission_required') {
    return (
      hasExactKeys(data, ['callId', 'requestId', 'toolExecutionId']) &&
      isNonEmptyString(data.callId) &&
      isNonEmptyString(data.requestId) &&
      isNonEmptyString(data.toolExecutionId)
    )
  }
  return true
}

function isValidToolResult(
  value: unknown,
  type: AiRunEvent['type']
): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.callId)) return false
  if (type === 'tool.call.completed') {
    return (
      hasAllowedKeys(value, [
        'callId',
        'status',
        'output',
        'toolExecutionId',
        'resultSummary',
        'artifactIds'
      ]) &&
      value.status === 'completed' &&
      isRecord(value.output) &&
      (value.toolExecutionId === undefined ||
        isNonEmptyString(value.toolExecutionId)) &&
      (value.resultSummary === undefined ||
        isNonEmptyString(value.resultSummary)) &&
      (value.artifactIds === undefined ||
        (Array.isArray(value.artifactIds) &&
          value.artifactIds.every(isNonEmptyString)))
    )
  }
  if (type === 'tool.call.failed') {
    return (
      hasAllowedKeys(value, [
        'callId',
        'status',
        'errorCode',
        'message',
        'toolExecutionId'
      ]) &&
      value.status === 'failed' &&
      isNonEmptyString(value.errorCode) &&
      isNonEmptyString(value.message) &&
      (value.toolExecutionId === undefined ||
        isNonEmptyString(value.toolExecutionId))
    )
  }
  return false
}

function isValidEventMetrics(data: Record<string, unknown>): boolean {
  if (
    data.errorCode !== undefined &&
    (typeof data.errorCode !== 'string' ||
      !MODEL_CALL_ERROR_CODES.has(data.errorCode as ModelCallErrorCode))
  ) {
    return false
  }
  if (
    !isOptionalFiniteNonNegative(data.firstTokenLatencyMs) ||
    !isOptionalFiniteNonNegative(data.durationMs) ||
    !isOptionalNonNegativeInteger(data.agentTurn) ||
    !isOptionalNonNegativeInteger(data.retryCount) ||
    (data.retryable !== undefined &&
      typeof data.retryable !== 'boolean') ||
    !isOptionalNonNegativeInteger(data.retryAfterMs) ||
    (typeof data.retryAfterMs === 'number' &&
      data.retryAfterMs > 30_000)
  ) {
    return false
  }
  if (data.usage === undefined) return true
  if (!isRecord(data.usage)) return false
  return (
    isNonNegativeInteger(data.usage.inputTokens) &&
    isNonNegativeInteger(data.usage.outputTokens) &&
    isOptionalNonNegativeInteger(data.usage.cachedTokens) &&
    isOptionalNonNegativeInteger(data.usage.reasoningTokens)
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isOptionalFiniteNonNegative(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0)
  )
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || isNonNegativeInteger(value)
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isTerminalEvent(event: AiRunEvent): boolean {
  return (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  )
}

function linkedTimeoutSignal(
  external: AbortSignal,
  timeoutMs: number
): AbortSignal {
  const controller = new AbortController()
  const timeout = AbortSignal.timeout(timeoutMs)
  const abort = (source: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(source.reason)
  }
  if (external.aborted) abort(external)
  else external.addEventListener('abort', () => abort(external), { once: true })
  timeout.addEventListener('abort', () => abort(timeout), { once: true })
  return controller.signal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasFixedEmbeddingIdentity(
  value: Record<string, unknown>
): boolean {
  return (
    value.embeddingModel === GTE_EMBEDDING_MODEL &&
    value.embeddingRevision === GTE_EMBEDDING_REVISION &&
    value.dimensions === GTE_EMBEDDING_DIMENSIONS
  )
}

function isDenseEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === GTE_EMBEDDING_DIMENSIONS &&
    value.every(
      (component) =>
        typeof component === 'number' && Number.isFinite(component)
    )
  )
}

function isEmbeddingModelHealth(
  value: unknown
): value is SidecarEmbeddingModelHealth {
  if (!isRecord(value)) return false
  const common =
    value.model === GTE_EMBEDDING_MODEL &&
    value.revision === GTE_EMBEDDING_REVISION &&
    value.dimensions === GTE_EMBEDDING_DIMENSIONS &&
    value.normalize === 'L2' &&
    value.runtime === 'onnxruntime-cpu'
  if (!common) return false
  if (value.status === 'ready') {
    return hasExactKeys(value, [
      'status',
      'model',
      'revision',
      'dimensions',
      'normalize',
      'runtime'
    ])
  }
  return (
    value.status === 'unavailable' &&
    hasExactKeys(value, [
      'status',
      'model',
      'revision',
      'dimensions',
      'normalize',
      'runtime',
      'errorCode'
    ]) &&
    typeof value.errorCode === 'string' &&
    value.errorCode.length > 0
  )
}

function parseSidecarSkillError(
  payload: unknown,
  status: number
): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.detail) &&
    typeof payload.detail.code === 'string' &&
    SKILL_EXECUTION_ERROR_CODES.has(
      payload.detail.code as SkillExecutionErrorCode
    ) &&
    typeof payload.detail.message === 'string' &&
    payload.detail.message.length > 0
  ) {
    return new SidecarSkillError(
      payload.detail.code as SkillExecutionErrorCode,
      payload.detail.message
    )
  }
  return new Error(`Sidecar request failed with status ${status}`)
}

function parseSidecarToolError(payload: unknown, status: number): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.detail) &&
    typeof payload.detail.code === 'string' &&
    /^tool_[a-z_]+$/.test(payload.detail.code) &&
    typeof payload.detail.message === 'string' &&
    payload.detail.message.length > 0
  ) {
    return new SidecarToolError(
      payload.detail.code,
      payload.detail.message
    )
  }
  return new Error(`Sidecar request failed with status ${status}`)
}

function parseSidecarSpreadsheetError(
  payload: unknown,
  status: number
): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.detail) &&
    typeof payload.detail.code === 'string' &&
    /^spreadsheet_[a-z_]+$/.test(payload.detail.code) &&
    typeof payload.detail.message === 'string' &&
    payload.detail.message.length > 0
  ) {
    return new SidecarSpreadsheetError(
      payload.detail.code,
      payload.detail.message
    )
  }
  return new Error(`Sidecar request failed with status ${status}`)
}

function parseSidecarLegacyOfficeError(
  payload: unknown,
  status: number
): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.detail) &&
    typeof payload.detail.code === 'string' &&
    (
      payload.detail.code === 'converter_unavailable' ||
      /^legacy_office_[a-z_]+$/.test(payload.detail.code)
    ) &&
    typeof payload.detail.message === 'string' &&
    payload.detail.message.length > 0
  ) {
    return new SidecarLegacyOfficeError(
      payload.detail.code,
      payload.detail.message
    )
  }
  return new Error(`Sidecar request failed with status ${status}`)
}

function parseSidecarOfficeSafeCopyError(
  payload: unknown,
  status: number
): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.detail) &&
    typeof payload.detail.code === 'string' &&
    /^office_safe_copy_[a-z_]+$/.test(payload.detail.code) &&
    typeof payload.detail.message === 'string' &&
    payload.detail.message.length > 0
  ) {
    return new SidecarOfficeSafeCopyError(
      payload.detail.code,
      payload.detail.message
    )
  }
  return new Error(`Sidecar request failed with status ${status}`)
}

function parseSidecarWordError(payload: unknown, status: number): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.detail) &&
    typeof payload.detail.code === 'string' &&
    /^word_[a-z_]+$/.test(payload.detail.code) &&
    typeof payload.detail.message === 'string' &&
    payload.detail.message.length > 0
  ) {
    return new SidecarWordError(
      payload.detail.code,
      payload.detail.message
    )
  }
  return new Error(`Sidecar request failed with status ${status}`)
}

function parseSidecarPresentationError(
  payload: unknown,
  status: number
): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.detail) &&
    typeof payload.detail.code === 'string' &&
    /^presentation_[a-z_]+$/.test(payload.detail.code) &&
    typeof payload.detail.message === 'string' &&
    payload.detail.message.length > 0
  ) {
    return new SidecarPresentationError(
      payload.detail.code,
      payload.detail.message
    )
  }
  return new Error(`Sidecar request failed with status ${status}`)
}

function parseSidecarDocumentDeliveryError(
  payload: unknown,
  status: number
): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.detail) &&
    typeof payload.detail.code === 'string' &&
    /^document_[a-z_]+$/.test(payload.detail.code) &&
    typeof payload.detail.message === 'string' &&
    payload.detail.message.length > 0
  ) {
    return new SidecarDocumentDeliveryError(
      payload.detail.code,
      payload.detail.message
    )
  }
  return new Error(`Sidecar request failed with status ${status}`)
}

function isDocumentArtifactFacts(
  value: unknown,
  includesDocument: boolean
): value is SidecarDocumentArtifact & { valid?: true } {
  const requiredKeys = includesDocument
    ? ['documentBase64', 'format', 'byteSize', 'checksum', 'pageCount']
    : ['valid', 'format', 'byteSize', 'checksum', 'pageCount']
  const optionalKeys = ['converter', 'quality', 'warnings']
  return (
    hasExactKeysWithOptional(value, requiredKeys, optionalKeys) &&
    (!includesDocument ||
      (typeof value.documentBase64 === 'string' &&
        value.documentBase64.length > 0)) &&
    (value.format === 'docx' || value.format === 'pdf') &&
    Number.isInteger(value.byteSize) &&
    typeof value.byteSize === 'number' &&
    value.byteSize > 0 &&
    typeof value.checksum === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(value.checksum) &&
    (value.pageCount === null ||
      (Number.isInteger(value.pageCount) &&
        typeof value.pageCount === 'number' &&
        value.pageCount > 0)) &&
    (value.converter === undefined ||
      value.converter === 'libreoffice' ||
      value.converter === 'cupsfilter_text') &&
    (value.quality === undefined ||
      value.quality === 'print' ||
      value.quality === 'degraded_text') &&
    (value.warnings === undefined ||
      (Array.isArray(value.warnings) &&
        value.warnings.every(
          (warning) => typeof warning === 'string' && warning.length > 0
        )))
  )
}

function hasExactKeysWithOptional(
  value: unknown,
  requiredKeys: string[],
  optionalKeys: string[]
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  const keys = Object.keys(value)
  return (
    requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
  )
}

function isWordPreservationRisk(
  value: unknown
): value is WordPreservationRisk {
  return (
    hasExactKeys(value, ['code', 'message', 'part']) &&
    typeof value.code === 'string' &&
    value.code.length > 0 &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    typeof value.part === 'string' &&
    value.part.length > 0
  )
}

function isPresentationPreservationRisk(
  value: unknown
): value is PresentationPreservationRisk {
  return isWordPreservationRisk(value)
}

function legacyTargetFormat(
  format: LegacyOfficeFormat
): ModernOfficeFormat {
  if (
    format === 'doc' ||
    format === 'dot' ||
    format === 'wps' ||
    format === 'wpt'
  ) {
    return 'docx'
  }
  if (format === 'xls' || format === 'xlt') return 'xlsx'
  return 'pptx'
}

function officeSafeCopyPolicy(format: OfficeSafeCopyFormat): {
  outputFormat: ModernOfficeFormat
  macrosRemoved: boolean
  templateMaterialized: boolean
} {
  const outputFormat =
    format === 'dotx' || format === 'docm' || format === 'dotm'
      ? 'docx'
      : format === 'xltx' || format === 'xlsm' || format === 'xltm'
        ? 'xlsx'
        : 'pptx'
  return {
    outputFormat,
    macrosRemoved: !format.endsWith('x'),
    templateMaterialized:
      format === 'dotx' ||
      format === 'xltx' ||
      format === 'potx' ||
      format === 'dotm' ||
      format === 'xltm' ||
      format === 'potm'
  }
}

function isSkillExecutionMetrics(
  value: unknown
): value is SkillExecutionMetrics {
  if (
    !isRecord(value) ||
    !hasAllowedKeys(value, [
      'durationMs',
      'outputBytes',
      'peakMemoryBytes'
    ]) ||
    !isNonNegativeInteger(value.durationMs) ||
    !isNonNegativeInteger(value.outputBytes)
  ) {
    return false
  }
  return (
    value.peakMemoryBytes === undefined ||
    isNonNegativeInteger(value.peakMemoryBytes)
  )
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}

function hasAllowedKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}
