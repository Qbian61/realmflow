import { createHash, randomUUID } from 'node:crypto'
import type {
  WordComputeInput,
  WordComputeOperation,
  WordComputeResult,
  WordPreservationRisk
} from '../../sidecar/client'

export type WordSessionStatus =
  | 'ready'
  | 'dirty'
  | 'saving'
  | 'conflicted'
  | 'closed'

export type WordSessionSummary = {
  sessionId: string
  path: string
  format: 'docx'
  mode: 'read' | 'edit'
  revision: number
  status: WordSessionStatus
  sourceChecksum: string
  preservationRisk: WordPreservationRisk[]
  inspection?: Record<string, unknown>
}

export type WordSessionStorage = {
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

export type WordCompute = (
  input: WordComputeInput,
  signal: AbortSignal
) => Promise<WordComputeResult>

export class WordSessionError extends Error {
  readonly name = 'WordSessionError'

  constructor(
    readonly code: string,
    message: string,
    readonly risks: WordPreservationRisk[] = []
  ) {
    super(message)
  }
}

type SessionRecord = WordSessionSummary & {
  canonicalPath: string
  document: Buffer
  sourceDocument: Buffer
  busy: boolean
}

const MUTATING_OPERATIONS = new Set<WordComputeOperation>([
  'insert_blocks',
  'replace_text',
  'update_style',
  'update_layout',
  'table_insert',
  'table_write',
  'comment_add',
  'comment_delete'
])

export class LocalWordSessionService {
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(
    private readonly dependencies: {
      compute: WordCompute
      storage: WordSessionStorage
    }
  ) {}

  async open(input: {
    canonicalPath: string
    relativePath: string
    mode: 'read' | 'edit'
    signal: AbortSignal
  }): Promise<WordSessionSummary> {
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
      throw new WordSessionError(
        'word_file_conflict',
        'Word document changed while it was opening'
      )
    }
    const computed = await this.dependencies.compute(
      {
        format: 'docx',
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
      format: 'docx',
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
    operation: WordComputeOperation
    parameters: Record<string, unknown>
    signal: AbortSignal
  }): Promise<WordSessionSummary & { result: Record<string, unknown> }> {
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
          format: 'docx',
          operation: input.operation,
          documentBase64: session.document.toString('base64'),
          parameters: input.parameters
        },
        input.signal
      )
      session.preservationRisk = computed.preservationRisk
      if (mutating) {
        if (!computed.modified) {
          throw new WordSessionError(
            'word_compute_invalid',
            'Word mutation did not produce a candidate document'
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
  }): Promise<WordSessionSummary> {
    const session = this.requireSession(input.sessionId)
    this.requireEditable(session)
    this.requireRevision(session, input.expectedRevision)
    this.acquire(session)
    session.status = 'saving'
    try {
      assertNotAborted(input.signal)
      if (session.preservationRisk.length > 0) {
        throw new WordSessionError(
          'word_preservation_risk',
          'Word document contains structures that cannot be safely preserved',
          session.preservationRisk
        )
      }
      if (
        (await this.dependencies.storage.checksum(session.canonicalPath)) !==
        session.sourceChecksum
      ) {
        session.status = 'conflicted'
        throw new WordSessionError(
          'word_file_conflict',
          'Word document changed outside this session'
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
      const committedChecksum = digest(session.document)
      await this.dependencies.storage.saveRevision(
        session.canonicalPath,
        committedChecksum,
        session.revision
      )
      session.sourceDocument = Buffer.from(session.document)
      session.sourceChecksum = committedChecksum
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
      throw new WordSessionError(
        'word_session_not_found',
        'Word document session was not found'
      )
    }
    return session
  }

  private requireEditable(session: SessionRecord): void {
    if (session.mode !== 'edit') {
      throw new WordSessionError(
        'word_read_only',
        'Word document session is read-only'
      )
    }
    if (session.status === 'conflicted') {
      throw new WordSessionError(
        'word_file_conflict',
        'Word document session is conflicted'
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
      throw new WordSessionError(
        'word_revision_conflict',
        'Word document revision conflict'
      )
    }
  }

  private acquire(session: SessionRecord): void {
    if (session.busy) {
      throw new WordSessionError(
        'word_session_busy',
        'Word document session is busy'
      )
    }
    session.busy = true
  }
}

function summary(session: SessionRecord): WordSessionSummary {
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
    throw new WordSessionError(
      'word_compute_invalid',
      'Word computation returned an empty document'
    )
  }
  return document
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Word document operation was cancelled')
    error.name = 'AbortError'
    throw error
  }
}
