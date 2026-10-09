import { createHash, randomUUID } from 'node:crypto'
import type {
  PresentationComputeInput,
  PresentationComputeOperation,
  PresentationComputeResult,
  PresentationPreservationRisk
} from '../../sidecar/client'

export type PresentationSessionStatus =
  | 'ready'
  | 'dirty'
  | 'saving'
  | 'conflicted'
  | 'closed'

export type PresentationSessionSummary = {
  sessionId: string
  path: string
  format: 'pptx'
  mode: 'read' | 'edit'
  revision: number
  status: PresentationSessionStatus
  sourceChecksum: string
  preservationRisk: PresentationPreservationRisk[]
  inspection?: Record<string, unknown>
}

export type PresentationSessionStorage = {
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

export type PresentationCompute = (
  input: PresentationComputeInput,
  signal: AbortSignal
) => Promise<PresentationComputeResult>

export class PresentationSessionError extends Error {
  readonly name = 'PresentationSessionError'

  constructor(
    readonly code: string,
    message: string,
    readonly risks: PresentationPreservationRisk[] = []
  ) {
    super(message)
  }
}

type SessionRecord = PresentationSessionSummary & {
  canonicalPath: string
  document: Buffer
  sourceDocument: Buffer
  busy: boolean
}

const MUTATING_OPERATIONS = new Set<PresentationComputeOperation>([
  'update_text',
  'replace_image',
  'table_write',
  'chart_write',
  'add_slide',
  'copy_slide',
  'delete_slide',
  'reorder_slide',
  'add_text',
  'add_image',
  'add_table',
  'add_chart',
  'reorder_shape',
  'update_size'
])

export class LocalPresentationSessionService {
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(
    private readonly dependencies: {
      compute: PresentationCompute
      storage: PresentationSessionStorage
    }
  ) {}

  async open(input: {
    canonicalPath: string
    relativePath: string
    mode: 'read' | 'edit'
    signal: AbortSignal
  }): Promise<PresentationSessionSummary> {
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
    if (
      sourceChecksum !==
      (await this.dependencies.storage.checksum(input.canonicalPath))
    ) {
      throw new PresentationSessionError(
        'presentation_file_conflict',
        'Presentation changed while it was opening'
      )
    }
    const computed = await this.inspect(document, input.signal)
    const session: SessionRecord = {
      sessionId: randomUUID(),
      canonicalPath: input.canonicalPath,
      path: input.relativePath,
      format: 'pptx',
      mode: input.mode,
      revision: await this.dependencies.storage.loadRevision(
        input.canonicalPath,
        sourceChecksum
      ),
      status: 'ready',
      sourceChecksum,
      document,
      sourceDocument: Buffer.from(document),
      preservationRisk: computed.preservationRisk,
      inspection: computed.result,
      busy: false
    }
    this.sessions.set(session.sessionId, session)
    return summary(session)
  }

  async execute(input: {
    sessionId: string
    expectedRevision?: number
    operation: PresentationComputeOperation
    parameters: Record<string, unknown>
    signal: AbortSignal
  }): Promise<PresentationSessionSummary & { result: Record<string, unknown> }> {
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
          format: 'pptx',
          operation: input.operation,
          documentBase64: session.document.toString('base64'),
          parameters: input.parameters
        },
        input.signal
      )
      session.preservationRisk = computed.preservationRisk
      if (mutating) {
        if (!computed.modified) {
          throw new PresentationSessionError(
            'presentation_compute_invalid',
            'Presentation mutation did not produce a candidate document'
          )
        }
        session.document = decodeDocument(computed.documentBase64)
        session.revision += 1
        session.status = 'dirty'
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
  }): Promise<PresentationSessionSummary> {
    const session = this.requireSession(input.sessionId)
    this.requireEditable(session)
    this.requireRevision(session, input.expectedRevision)
    this.acquire(session)
    session.status = 'saving'
    let candidateCommitted = false
    try {
      assertNotAborted(input.signal)
      const verification = await this.inspect(session.document, input.signal)
      session.preservationRisk = verification.preservationRisk
      if (session.preservationRisk.length > 0) {
        throw new PresentationSessionError(
          'presentation_preservation_risk',
          'Presentation contains structures that cannot be safely preserved',
          session.preservationRisk
        )
      }
      if (
        (await this.dependencies.storage.checksum(session.canonicalPath)) !==
        session.sourceChecksum
      ) {
        session.status = 'conflicted'
        throw new PresentationSessionError(
          'presentation_file_conflict',
          'Presentation changed outside this session'
        )
      }
      await this.dependencies.storage.snapshot({
        canonicalPath: session.canonicalPath,
        checksum: session.sourceChecksum,
        content: session.sourceDocument
      })
      await this.dependencies.storage.commit({
        canonicalPath: session.canonicalPath,
        content: session.document
      })
      candidateCommitted = true
      const committedChecksum = digest(session.document)
      await this.dependencies.storage.saveRevision(
        session.canonicalPath,
        committedChecksum,
        session.revision
      )
      session.sourceDocument = Buffer.from(session.document)
      session.sourceChecksum = committedChecksum
      session.inspection = verification.result
      session.status = 'ready'
      return summary(session)
    } catch (error) {
      if (candidateCommitted) {
        try {
          await this.dependencies.storage.commit({
            canonicalPath: session.canonicalPath,
            content: session.sourceDocument
          })
        } catch (rollbackError) {
          throw new PresentationSessionError(
            'presentation_rollback_failed',
            `Presentation save failed and rollback failed: ${errorMessage(rollbackError)}`
          )
        }
      }
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

  private inspect(
    document: Buffer,
    signal: AbortSignal
  ): Promise<PresentationComputeResult> {
    return this.dependencies.compute(
      {
        format: 'pptx',
        operation: 'inspect',
        documentBase64: document.toString('base64'),
        parameters: {}
      },
      signal
    )
  }

  private requireSession(sessionId: string): SessionRecord {
    const session = this.sessions.get(sessionId)
    if (!session || session.status === 'closed') {
      throw new PresentationSessionError(
        'presentation_session_not_found',
        'Presentation session was not found'
      )
    }
    return session
  }

  private requireEditable(session: SessionRecord): void {
    if (session.mode !== 'edit') {
      throw new PresentationSessionError(
        'presentation_read_only',
        'Presentation session is read-only'
      )
    }
    if (session.status === 'conflicted') {
      throw new PresentationSessionError(
        'presentation_file_conflict',
        'Presentation session is conflicted'
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
      throw new PresentationSessionError(
        'presentation_revision_conflict',
        'Presentation revision conflict'
      )
    }
  }

  private acquire(session: SessionRecord): void {
    if (session.busy) {
      throw new PresentationSessionError(
        'presentation_session_busy',
        'Presentation session is busy'
      )
    }
    session.busy = true
  }
}

function summary(session: SessionRecord): PresentationSessionSummary {
  return {
    sessionId: session.sessionId,
    path: session.path,
    format: session.format,
    mode: session.mode,
    revision: session.revision,
    status: session.status,
    sourceChecksum: session.sourceChecksum,
    preservationRisk: [...session.preservationRisk],
    ...(session.inspection ? { inspection: session.inspection } : {})
  }
}

function decodeDocument(value: string): Buffer {
  const document = Buffer.from(value, 'base64')
  if (document.byteLength === 0) {
    throw new PresentationSessionError(
      'presentation_compute_invalid',
      'Presentation computation returned an empty document'
    )
  }
  return document
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Presentation operation was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
