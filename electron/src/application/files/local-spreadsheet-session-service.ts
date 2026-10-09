import { createHash, randomUUID } from 'node:crypto'
import type {
  SpreadsheetComputeInput,
  SpreadsheetComputeOperation,
  SpreadsheetComputeResult,
  SpreadsheetFormat
} from '../../sidecar/client'

export type SpreadsheetSessionStatus =
  | 'ready'
  | 'dirty'
  | 'saving'
  | 'conflicted'
  | 'closed'

export type SpreadsheetSessionSummary = {
  sessionId: string
  path: string
  format: SpreadsheetFormat
  mode: 'read' | 'edit'
  revision: number
  status: SpreadsheetSessionStatus
  sourceChecksum: string
  inspection?: Record<string, unknown>
}

export type SpreadsheetSessionStorage = {
  read(canonicalPath: string): Promise<Uint8Array>
  checksum(canonicalPath: string): Promise<string>
  snapshot(input: {
    canonicalPath: string
    checksum: string
    content: Uint8Array
  }): Promise<void>
  commit(input: {
    canonicalPath: string
    content: Uint8Array
  }): Promise<void>
  loadRevision(canonicalPath: string, checksum: string): Promise<number>
  saveRevision(
    canonicalPath: string,
    checksum: string,
    revision: number
  ): Promise<void>
}

export type SpreadsheetCompute = (
  input: SpreadsheetComputeInput,
  signal: AbortSignal
) => Promise<SpreadsheetComputeResult>

export type SpreadsheetRecalculate = (
  input: {
    format: 'xlsx'
    documentBase64: string
  },
  signal: AbortSignal
) => Promise<{ documentBase64: string }>

export class SpreadsheetSessionError extends Error {
  readonly name = 'SpreadsheetSessionError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

type SessionRecord = SpreadsheetSessionSummary & {
  canonicalPath: string
  document: Buffer
  sourceDocument: Buffer
  needsRecalculation: boolean
  busy: boolean
}

const MUTATING_OPERATIONS = new Set<SpreadsheetComputeOperation>([
  'insert_rows',
  'delete_rows',
  'write_range',
  'set_style',
  'set_formula',
  'sort',
  'filter',
  'chart'
])

export class LocalSpreadsheetSessionService {
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(
    private readonly dependencies: {
      compute: SpreadsheetCompute
      recalculate: SpreadsheetRecalculate
      storage: SpreadsheetSessionStorage
    }
  ) {}

  async open(input: {
    canonicalPath: string
    relativePath: string
    format: SpreadsheetFormat
    mode: 'read' | 'edit'
    signal: AbortSignal
  }): Promise<SpreadsheetSessionSummary> {
    assertNotAborted(input.signal)
    const existing = [...this.sessions.values()].find(
      (session) =>
        session.canonicalPath === input.canonicalPath &&
        session.mode === input.mode &&
        session.status !== 'closed'
    )
    if (existing) return summary(existing)
    const document = Buffer.from(
      await this.dependencies.storage.read(input.canonicalPath)
    )
    const sourceChecksum = digest(document)
    const actualChecksum = await this.dependencies.storage.checksum(
      input.canonicalPath
    )
    if (sourceChecksum !== actualChecksum) {
      throw new SpreadsheetSessionError(
        'spreadsheet_file_conflict',
        'Spreadsheet file changed while it was opening'
      )
    }
    const computed = await this.dependencies.compute(
      {
        format: input.format,
        operation: 'inspect',
        documentBase64: document.toString('base64'),
        parameters: {}
      },
      input.signal
    )
    const session: SessionRecord = {
      sessionId: randomUUID(),
      canonicalPath: input.canonicalPath,
      path: input.relativePath,
      format: input.format,
      mode: input.mode,
      revision: await this.dependencies.storage.loadRevision(
        input.canonicalPath,
        sourceChecksum
      ),
      status: 'ready',
      sourceChecksum,
      document,
      sourceDocument: Buffer.from(document),
      needsRecalculation: false,
      busy: false,
      inspection: computed.result
    }
    this.sessions.set(session.sessionId, session)
    return summary(session)
  }

  async execute(input: {
    sessionId: string
    expectedRevision?: number
    operation: SpreadsheetComputeOperation
    parameters: Record<string, unknown>
    signal: AbortSignal
  }): Promise<SpreadsheetSessionSummary & { result: Record<string, unknown> }> {
    const session = this.requireSession(input.sessionId)
    const mutating = MUTATING_OPERATIONS.has(input.operation)
    if (mutating) {
      this.requireEditable(session)
      this.requireRevision(session, input.expectedRevision)
    }
    this.acquire(session)
    try {
      assertNotAborted(input.signal)
      const computed = await this.dependencies.compute(
        {
          format: session.format,
          operation: input.operation,
          documentBase64: session.document.toString('base64'),
          parameters: input.parameters
        },
        input.signal
      )
      if (mutating) {
        if (!computed.modified) {
          throw new SpreadsheetSessionError(
            'spreadsheet_compute_invalid',
            'Spreadsheet mutation did not produce a candidate document'
          )
        }
        session.document = decodeDocument(computed.documentBase64)
        session.revision += 1
        session.status = 'dirty'
        session.needsRecalculation ||= computed.requiresRecalculation
      }
      return { ...summary(session), result: computed.result }
    } finally {
      session.busy = false
    }
  }

  async save(input: {
    sessionId: string
    expectedRevision: number
    signal: AbortSignal
  }): Promise<SpreadsheetSessionSummary> {
    const session = this.requireSession(input.sessionId)
    this.requireEditable(session)
    this.requireRevision(session, input.expectedRevision)
    this.acquire(session)
    session.status = 'saving'
    try {
      assertNotAborted(input.signal)
      const currentChecksum = await this.dependencies.storage.checksum(
        session.canonicalPath
      )
      if (currentChecksum !== session.sourceChecksum) {
        session.status = 'conflicted'
        throw new SpreadsheetSessionError(
          'spreadsheet_file_conflict',
          'Spreadsheet file changed outside this session'
        )
      }
      let candidate = session.document
      if (session.needsRecalculation) {
        if (session.format !== 'xlsx') {
          throw new SpreadsheetSessionError(
            'spreadsheet_recalculation_unavailable',
            'Spreadsheet format cannot be recalculated'
          )
        }
        const recalculated = await this.dependencies.recalculate(
          {
            format: 'xlsx',
            documentBase64: candidate.toString('base64')
          },
          input.signal
        )
        candidate = decodeDocument(recalculated.documentBase64)
      }
      await this.dependencies.storage.snapshot({
        canonicalPath: session.canonicalPath,
        checksum: session.sourceChecksum,
        content: session.sourceDocument
      })
      await this.dependencies.storage.commit({
        canonicalPath: session.canonicalPath,
        content: candidate
      })
      const committedChecksum = digest(candidate)
      await this.dependencies.storage.saveRevision(
        session.canonicalPath,
        committedChecksum,
        session.revision
      )
      session.document = Buffer.from(candidate)
      session.sourceDocument = Buffer.from(candidate)
      session.sourceChecksum = committedChecksum
      session.needsRecalculation = false
      session.status = 'ready'
      return summary(session)
    } catch (error) {
      if (session.status === 'saving') session.status = 'dirty'
      throw error
    } finally {
      session.busy = false
    }
  }

  getCanonicalPath(sessionId: string): string {
    return this.requireSession(sessionId).canonicalPath
  }

  close(sessionId: string): void {
    const session = this.requireSession(sessionId)
    session.document.fill(0)
    session.sourceDocument.fill(0)
    session.status = 'closed'
    this.sessions.delete(sessionId)
  }

  private requireSession(sessionId: string): SessionRecord {
    const session = this.sessions.get(sessionId)
    if (!session || session.status === 'closed') {
      throw new SpreadsheetSessionError(
        'spreadsheet_session_not_found',
        'Spreadsheet session was not found'
      )
    }
    return session
  }

  private requireEditable(session: SessionRecord): void {
    if (session.mode !== 'edit') {
      throw new SpreadsheetSessionError(
        'spreadsheet_read_only',
        'Spreadsheet session is read-only'
      )
    }
    if (session.status === 'conflicted') {
      throw new SpreadsheetSessionError(
        'spreadsheet_file_conflict',
        'Spreadsheet session is conflicted'
      )
    }
  }

  private requireRevision(
    session: SessionRecord,
    expectedRevision: number | undefined
  ): void {
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision !== session.revision
    ) {
      throw new SpreadsheetSessionError(
        'spreadsheet_revision_conflict',
        'Spreadsheet revision conflict'
      )
    }
  }

  private acquire(session: SessionRecord): void {
    if (session.busy) {
      throw new SpreadsheetSessionError(
        'spreadsheet_session_busy',
        'Spreadsheet session is busy'
      )
    }
    session.busy = true
  }
}

function summary(session: SessionRecord): SpreadsheetSessionSummary {
  return {
    sessionId: session.sessionId,
    path: session.path,
    format: session.format,
    mode: session.mode,
    revision: session.revision,
    status: session.status,
    sourceChecksum: session.sourceChecksum,
    ...(session.inspection ? { inspection: session.inspection } : {})
  }
}

function decodeDocument(value: string): Buffer {
  const document = Buffer.from(value, 'base64')
  if (document.byteLength === 0) {
    throw new SpreadsheetSessionError(
      'spreadsheet_compute_invalid',
      'Spreadsheet computation returned an empty document'
    )
  }
  return document
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Spreadsheet operation was cancelled')
    error.name = 'AbortError'
    throw error
  }
}
