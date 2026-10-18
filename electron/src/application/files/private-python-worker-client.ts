import {
  spawn,
  type ChildProcessWithoutNullStreams
} from 'node:child_process'
import { createInterface } from 'node:readline'

import type {
  SkillExecutionErrorCode,
  SkillExecutionMetrics
} from '../../../../domain/skill-execution'
import { createSanitizedWorkerEnvironment } from '../../../../shared/worker-environment'

const DEFAULT_TIMEOUT_MS = 30_000
const LONG_TIMEOUT_MS = 120_000

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
  | 'odt'
  | 'rtf'
  | 'ods'
  | 'odp'
  | 'pages'
  | 'numbers'
  | 'key'
  | 'vsd'
  | 'vsdx'
  | 'pub'
  | 'mpp'

export type ModernOfficeFormat = 'docx' | 'xlsx' | 'pptx'

export type OptionalOfficeFormat =
  | 'pages'
  | 'numbers'
  | 'key'
  | 'vsd'
  | 'vsdx'
  | 'pub'
  | 'mpp'

export type OptionalOfficeOutputFormat = ModernOfficeFormat | 'pdf'

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

export type LegacyOfficeConversionInput = {
  sourceFormat: LegacyOfficeFormat
  documentBase64: string
}

export type LegacyOfficeConversionResult = {
  documentBase64: string
  outputFormat: ModernOfficeFormat
  converter: 'LibreOffice'
}

export type OfficeConversionCapabilities = Partial<
  Record<OptionalOfficeFormat, OptionalOfficeOutputFormat>
>

export type OptionalOfficeConversionResult = {
  documentBase64: string
  outputFormat: OptionalOfficeOutputFormat
  converter: 'LibreOffice'
}

export type SpreadsheetFormat = 'csv' | 'tsv' | 'xlsx' | 'xls'

export type SpreadsheetComputeOperation =
  | 'extract_text'
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

export type PresentationComputeOperation =
  | 'extract_text'
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

export class SidecarSpreadsheetError extends Error {
  readonly name = 'SidecarSpreadsheetError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
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

export class SidecarOfficeSafeCopyError extends Error {
  readonly name = 'SidecarOfficeSafeCopyError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
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

export class SidecarPresentationError extends Error {
  readonly name = 'SidecarPresentationError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
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

export class SidecarSkillError extends Error {
  readonly name = 'SidecarSkillError'

  constructor(
    readonly code: SkillExecutionErrorCode,
    message: string
  ) {
    super(message)
  }
}

export type PrivatePythonWorkerOperationRunner = (
  operation: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
  timeoutMs: number
) => Promise<unknown>

export type PrivatePythonWorkerClientOptions = {
  runOperation?: PrivatePythonWorkerOperationRunner
  pythonExecutable?: string
  workerScript?: string
  workerRoot?: string
  env?: NodeJS.ProcessEnv
}

export type SidecarClient = PrivatePythonWorkerClient & {
  executeSkill(
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<{ output: Record<string, unknown>; metrics: SkillExecutionMetrics }>
  cancelSkillExecution(executionId: string): Promise<boolean>
}

type WorkerResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: { code?: string; message?: string } }

export class PrivatePythonWorkerClient {
  private readonly runOperation: PrivatePythonWorkerOperationRunner

  constructor(options: PrivatePythonWorkerClientOptions) {
    this.runOperation =
      options.runOperation ??
      createPrivatePythonWorkerRunner({
        pythonExecutable: requireOption(options.pythonExecutable, 'pythonExecutable'),
        workerScript: requireOption(options.workerScript, 'workerScript'),
        workerRoot: requireOption(options.workerRoot, 'workerRoot'),
        env: options.env
      })
  }

  async computeSpreadsheet(
    input: SpreadsheetComputeInput,
    signal: AbortSignal
  ): Promise<SpreadsheetComputeResult> {
    return assertSpreadsheetComputeResult(
      await this.runOperation(
        'office.spreadsheet.compute',
        input,
        signal,
        DEFAULT_TIMEOUT_MS
      )
    )
  }

  async recalculateSpreadsheet(
    input: { format: 'xlsx'; documentBase64: string },
    signal: AbortSignal
  ): Promise<{ documentBase64: string }> {
    return assertDocumentBase64Only(
      await this.runOperation(
        'office.spreadsheet.recalculate',
        input,
        signal,
        LONG_TIMEOUT_MS
      )
    )
  }

  async computeWordDocument(
    input: WordComputeInput,
    signal: AbortSignal
  ): Promise<WordComputeResult> {
    return assertWordComputeResult(
      await this.runOperation(
        'office.word.compute',
        input,
        signal,
        DEFAULT_TIMEOUT_MS
      )
    )
  }

  async computePresentation(
    input: PresentationComputeInput,
    signal: AbortSignal
  ): Promise<PresentationComputeResult> {
    return assertPresentationComputeResult(
      await this.runOperation(
        'office.presentation.compute',
        input,
        signal,
        DEFAULT_TIMEOUT_MS
      )
    )
  }

  async convertLegacyOffice(
    input: LegacyOfficeConversionInput,
    signal: AbortSignal
  ): Promise<LegacyOfficeConversionResult> {
    return assertLegacyOfficeResult(
      await this.runOperation(
        'office.legacy.convert',
        input,
        signal,
        LONG_TIMEOUT_MS
      )
    )
  }

  async convertOptionalOffice(
    input: {
      sourceFormat: OptionalOfficeFormat
      documentBase64: string
    },
    signal: AbortSignal
  ): Promise<OptionalOfficeConversionResult> {
    return assertOptionalOfficeResult(
      await this.runOperation(
        'office.optional.convert',
        input,
        signal,
        LONG_TIMEOUT_MS
      )
    )
  }

  async getOfficeConversionCapabilities(
    signal: AbortSignal
  ): Promise<OfficeConversionCapabilities> {
    return assertOfficeConversionCapabilities(
      await this.runOperation(
        'office.conversion.capabilities',
        {},
        signal,
        DEFAULT_TIMEOUT_MS
      )
    )
  }

  async createSafeOfficeCopy(
    input: OfficeSafeCopyInput,
    signal: AbortSignal
  ): Promise<OfficeSafeCopyResult> {
    return assertOfficeSafeCopyResult(
      await this.runOperation(
        'office.safe_copy.create',
        input,
        signal,
        DEFAULT_TIMEOUT_MS
      )
    )
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
    return assertDocumentArtifact(
      await this.runOperation(
        'documents.create',
        input,
        signal,
        DEFAULT_TIMEOUT_MS
      )
    )
  }

  async exportDocumentPdf(
    input: { documentBase64: string },
    signal: AbortSignal
  ): Promise<SidecarDocumentArtifact> {
    return assertDocumentArtifact(
      await this.runOperation(
        'documents.export_pdf',
        input,
        signal,
        LONG_TIMEOUT_MS
      )
    )
  }

  async verifyDocumentArtifact(
    input: { documentBase64: string; format: 'docx' | 'pdf' },
    signal: AbortSignal
  ): Promise<SidecarDocumentVerification> {
    return assertDocumentVerification(
      await this.runOperation(
        'documents.verify',
        input,
        signal,
        DEFAULT_TIMEOUT_MS
      ),
      input.format
    )
  }
}

export function createPrivatePythonWorkerRunner(options: {
  pythonExecutable: string
  workerScript: string
  workerRoot: string
  env?: NodeJS.ProcessEnv
}): PrivatePythonWorkerOperationRunner {
  return (operation, input, signal, timeoutMs) =>
    runPrivatePythonWorker({
      ...options,
      operation,
      input,
      signal,
      timeoutMs
    })
}

async function runPrivatePythonWorker({
  pythonExecutable,
  workerScript,
  workerRoot,
  env,
  operation,
  input,
  signal,
  timeoutMs
}: {
  pythonExecutable: string
  workerScript: string
  workerRoot: string
  env?: NodeJS.ProcessEnv
  operation: string
  input: Record<string, unknown>
  signal: AbortSignal
  timeoutMs: number
}): Promise<unknown> {
  if (signal.aborted) throw new Error('Private Python worker request cancelled')
  const child = spawn(pythonExecutable, [workerScript], {
    cwd: workerRoot,
    env: createSanitizedWorkerEnvironment({
      overrideEnv: env,
      pythonPathEntries: [workerRoot],
      extraEnv: {
        PYTHONUNBUFFERED: '1'
      }
    }),
    stdio: 'pipe'
  })
  return await exchangeWithWorker(child, { operation, input }, signal, timeoutMs)
}

function exchangeWithWorker(
  child: ChildProcessWithoutNullStreams,
  request: Record<string, unknown>,
  signal: AbortSignal,
  timeoutMs: number
): Promise<unknown> {
  let stdoutLine: string | undefined
  let stderrTail = ''
  let settled = false

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      rejectOnce(new Error('Private Python worker timed out'))
      terminate(child)
    }, timeoutMs)
    const cleanup = (): void => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }
    const rejectOnce = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const resolveOnce = (value: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const onAbort = (): void => {
      rejectOnce(new Error('Private Python worker request cancelled'))
      terminate(child)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    createInterface({ input: child.stdout }).on('line', (line) => {
      stdoutLine = line
    })
    child.stderr.on('data', (chunk) => {
      stderrTail = `${stderrTail}${String(chunk)}`.slice(-8_192)
    })
    child.once('error', (error) => {
      rejectOnce(new Error('Private Python worker failed to start', { cause: error }))
    })
    child.once('exit', (code) => {
      if (settled) return
      if (code !== 0 || !stdoutLine) {
        rejectOnce(
          new Error(
            stderrTail.trim() || `Private Python worker exited with code ${code}`
          )
        )
        return
      }
      let response: WorkerResponse
      try {
        response = JSON.parse(stdoutLine) as WorkerResponse
      } catch (error) {
        rejectOnce(new Error('Private Python worker returned invalid JSON', { cause: error }))
        return
      }
      if (response.ok) {
        resolveOnce(response.result)
        return
      }
      rejectOnce(
        new Error(
          response.error.message ||
            `Private Python worker failed: ${response.error.code ?? 'unknown'}`
        )
      )
    })
    child.stdin.end(`${JSON.stringify(request)}\n`)
  })
}

function terminate(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode === null) child.kill('SIGTERM')
}

function requireOption(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Private Python worker ${name} is required`)
  return value
}

function assertSpreadsheetComputeResult(
  value: unknown
): SpreadsheetComputeResult {
  if (
    !isRecord(value) ||
    typeof value.documentBase64 !== 'string' ||
    !isRecord(value.result) ||
    typeof value.modified !== 'boolean' ||
    typeof value.requiresRecalculation !== 'boolean'
  ) {
    throw new Error('Invalid private Python spreadsheet response')
  }
  return value as SpreadsheetComputeResult
}

function assertDocumentBase64Only(value: unknown): { documentBase64: string } {
  if (!isRecord(value) || typeof value.documentBase64 !== 'string') {
    throw new Error('Invalid private Python document response')
  }
  return { documentBase64: value.documentBase64 }
}

function assertWordComputeResult(value: unknown): WordComputeResult {
  if (
    !isRecord(value) ||
    typeof value.documentBase64 !== 'string' ||
    !isRecord(value.result) ||
    typeof value.modified !== 'boolean' ||
    !Array.isArray(value.preservationRisk)
  ) {
    throw new Error('Invalid private Python Word response')
  }
  return value as WordComputeResult
}

function assertPresentationComputeResult(
  value: unknown
): PresentationComputeResult {
  if (
    !isRecord(value) ||
    typeof value.documentBase64 !== 'string' ||
    !isRecord(value.result) ||
    typeof value.modified !== 'boolean' ||
    !Array.isArray(value.preservationRisk)
  ) {
    throw new Error('Invalid private Python presentation response')
  }
  return value as PresentationComputeResult
}

function assertLegacyOfficeResult(value: unknown): LegacyOfficeConversionResult {
  if (
    !isRecord(value) ||
    typeof value.documentBase64 !== 'string' ||
    !['docx', 'xlsx', 'pptx'].includes(String(value.outputFormat)) ||
    value.converter !== 'LibreOffice'
  ) {
    throw new Error('Invalid private Python legacy Office response')
  }
  return value as LegacyOfficeConversionResult
}

function assertOptionalOfficeResult(
  value: unknown
): OptionalOfficeConversionResult {
  if (
    !isRecord(value) ||
    typeof value.documentBase64 !== 'string' ||
    !['docx', 'xlsx', 'pptx', 'pdf'].includes(String(value.outputFormat)) ||
    value.converter !== 'LibreOffice'
  ) {
    throw new Error('Invalid private Python optional Office response')
  }
  return value as OptionalOfficeConversionResult
}

function assertOfficeConversionCapabilities(
  value: unknown
): OfficeConversionCapabilities {
  if (!isRecord(value) || !isRecord(value.formats)) {
    throw new Error('Invalid private Python Office capabilities response')
  }
  return value.formats as OfficeConversionCapabilities
}

function assertOfficeSafeCopyResult(value: unknown): OfficeSafeCopyResult {
  if (
    !isRecord(value) ||
    typeof value.documentBase64 !== 'string' ||
    !['docx', 'xlsx', 'pptx'].includes(String(value.outputFormat)) ||
    typeof value.macrosRemoved !== 'boolean' ||
    typeof value.templateMaterialized !== 'boolean' ||
    !Array.isArray(value.removedParts)
  ) {
    throw new Error('Invalid private Python safe-copy response')
  }
  return value as OfficeSafeCopyResult
}

function assertDocumentArtifact(value: unknown): SidecarDocumentArtifact {
  if (!isDocumentArtifactFacts(value, true)) {
    throw new Error('Invalid private Python document artifact response')
  }
  return value
}

function assertDocumentVerification(
  value: unknown,
  expectedFormat: 'docx' | 'pdf'
): SidecarDocumentVerification {
  if (
    !isDocumentArtifactFacts(value, false) ||
    value.valid !== true ||
    value.format !== expectedFormat
  ) {
    throw new Error('Invalid private Python document verification response')
  }
  return value as SidecarDocumentVerification
}

function isDocumentArtifactFacts(
  value: unknown,
  requiresDocument: boolean
): value is SidecarDocumentArtifact & { valid?: true } {
  if (
    !isRecord(value) ||
    (requiresDocument && typeof value.documentBase64 !== 'string') ||
    (value.format !== 'docx' && value.format !== 'pdf') ||
    typeof value.byteSize !== 'number' ||
    typeof value.checksum !== 'string' ||
    (value.pageCount !== null && typeof value.pageCount !== 'number')
  ) {
    return false
  }
  if ('warnings' in value && !Array.isArray(value.warnings)) return false
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
