import { createHash, randomUUID } from 'node:crypto'
import type {
  PdfInspection,
  PdfOperation,
  PdfRenderedPage
} from './pdf-adapter'
import type {
  ImageOcrPort,
  ImageOcrResult
} from './local-image-session-service'

export type PdfSessionStorage = {
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

export type PdfAdapterPort = {
  inspect(content: Uint8Array): Promise<PdfInspection>
  renderPage(
    content: Uint8Array,
    pageNumber: number,
    maxDimension?: number
  ): Promise<PdfRenderedPage>
  mutate(
    content: Uint8Array,
    operation: PdfOperation,
    parameters: Record<string, unknown>
  ): Promise<{ content: Buffer; summary: Record<string, unknown> }>
}

export type PdfSessionStatus =
  | 'ready'
  | 'dirty'
  | 'saving'
  | 'conflicted'
  | 'closed'

export type PdfSessionSummary = {
  sessionId: string
  path: string
  format: 'pdf'
  mode: 'read' | 'edit'
  revision: number
  status: PdfSessionStatus
  sourceChecksum: string
  inspection: PdfInspection
}

export class PdfSessionError extends Error {
  readonly name = 'PdfSessionError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

type SessionRecord = PdfSessionSummary & {
  canonicalPath: string
  document: Buffer
  sourceDocument: Buffer
  busy: boolean
}

export class LocalPdfSessionService {
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(
    private readonly dependencies: {
      adapter: PdfAdapterPort
      storage: PdfSessionStorage
      localOcr?: ImageOcrPort
    }
  ) {}

  async open(input: {
    canonicalPath: string
    relativePath: string
    mode: 'read' | 'edit'
    signal: AbortSignal
  }): Promise<PdfSessionSummary> {
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
      throw new PdfSessionError(
        'pdf_file_conflict',
        'PDF changed while it was opening'
      )
    }
    const inspection = await this.dependencies.adapter.inspect(document)
    if (input.mode === 'edit') assertEditableInspection(inspection)
    const session: SessionRecord = {
      sessionId: randomUUID(),
      canonicalPath: input.canonicalPath,
      path: input.relativePath,
      format: 'pdf',
      mode: input.mode,
      revision: await this.dependencies.storage.loadRevision(
        input.canonicalPath,
        sourceChecksum
      ),
      status: 'ready',
      sourceChecksum,
      inspection,
      document,
      sourceDocument: Buffer.from(document),
      busy: false
    }
    this.sessions.set(session.sessionId, session)
    return summary(session)
  }

  async thumbnail(input: {
    sessionId: string
    pageNumber: number
    maxDimension?: number
    signal: AbortSignal
  }): Promise<{
    sourcePdf: string
    sourcePage: number
    mimeType: 'image/png'
    width: number
    height: number
    contentBase64: string
  }> {
    const session = this.requireSession(input.sessionId)
    this.acquire(session)
    try {
      assertNotAborted(input.signal)
      const rendered = await this.dependencies.adapter.renderPage(
        session.document,
        input.pageNumber,
        input.maxDimension
      )
      return {
        sourcePdf: session.path,
        sourcePage: rendered.sourcePage,
        mimeType: rendered.mimeType,
        width: rendered.width,
        height: rendered.height,
        contentBase64: rendered.content.toString('base64')
      }
    } finally {
      session.busy = false
    }
  }

  async ocr(input: {
    sessionId: string
    pageNumber: number
    language?: string
    maxDimension?: number
    signal: AbortSignal
  }): Promise<{
    sourcePdf: string
    sourcePage: number
    provider: 'local'
    language: string
    blocks: ImageOcrResult['blocks']
  }> {
    const session = this.requireSession(input.sessionId)
    if (!this.dependencies.localOcr) {
      throw new PdfSessionError(
        'pdf_ocr_unavailable',
        'Local PDF OCR is unavailable'
      )
    }
    this.acquire(session)
    try {
      assertNotAborted(input.signal)
      const rendered = await this.dependencies.adapter.renderPage(
        session.document,
        input.pageNumber,
        input.maxDimension
      )
      const result = await this.dependencies.localOcr.recognize(
        {
          content: rendered.content,
          sourcePath: `${session.path}#page=${input.pageNumber}`,
          language: input.language
        },
        input.signal
      )
      validateOcr(result, rendered)
      return {
        sourcePdf: session.path,
        sourcePage: rendered.sourcePage,
        provider: 'local',
        language: result.language,
        blocks: result.blocks.map((block) => ({
          ...block,
          bounds: { ...block.bounds }
        }))
      }
    } finally {
      session.busy = false
    }
  }

  async mutate(input: {
    sessionId: string
    expectedRevision: number
    operation: PdfOperation
    parameters: Record<string, unknown>
    signal: AbortSignal
  }): Promise<PdfSessionSummary & { result: Record<string, unknown> }> {
    const session = this.requireSession(input.sessionId)
    this.requireEditable(session)
    this.requireRevision(session, input.expectedRevision)
    this.acquire(session)
    try {
      assertNotAborted(input.signal)
      const changed = await this.dependencies.adapter.mutate(
        session.document,
        input.operation,
        input.parameters
      )
      const inspection = await this.dependencies.adapter.inspect(changed.content)
      assertEditableInspection(inspection)
      session.document = Buffer.from(changed.content)
      session.inspection = inspection
      session.revision += 1
      session.status = 'dirty'
      return { ...summary(session), result: changed.summary }
    } finally {
      session.busy = false
    }
  }

  async save(input: {
    sessionId: string
    expectedRevision: number
    signal: AbortSignal
  }): Promise<PdfSessionSummary> {
    const session = this.requireSession(input.sessionId)
    this.requireEditable(session)
    this.requireRevision(session, input.expectedRevision)
    this.acquire(session)
    session.status = 'saving'
    let committed = false
    try {
      assertNotAborted(input.signal)
      if (
        (await this.dependencies.storage.checksum(session.canonicalPath)) !==
        session.sourceChecksum
      ) {
        session.status = 'conflicted'
        throw new PdfSessionError(
          'pdf_file_conflict',
          'PDF changed outside this session'
        )
      }
      const inspection = await this.dependencies.adapter.inspect(session.document)
      assertEditableInspection(inspection)
      await this.dependencies.storage.snapshot({
        canonicalPath: session.canonicalPath,
        checksum: session.sourceChecksum,
        content: session.sourceDocument
      })
      await this.dependencies.storage.commit({
        canonicalPath: session.canonicalPath,
        content: session.document
      })
      committed = true
      const checksum = digest(session.document)
      await this.dependencies.storage.saveRevision(
        session.canonicalPath,
        checksum,
        session.revision
      )
      session.sourceDocument = Buffer.from(session.document)
      session.sourceChecksum = checksum
      session.inspection = inspection
      session.status = 'ready'
      return summary(session)
    } catch (error) {
      if (committed) {
        await this.dependencies.storage
          .commit({
            canonicalPath: session.canonicalPath,
            content: session.sourceDocument
          })
          .catch(() => undefined)
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

  private requireSession(sessionId: string): SessionRecord {
    const session = this.sessions.get(sessionId)
    if (!session || session.status === 'closed') {
      throw new PdfSessionError(
        'pdf_session_not_found',
        'PDF session was not found'
      )
    }
    return session
  }

  private requireEditable(session: SessionRecord): void {
    if (session.mode !== 'edit') {
      throw new PdfSessionError('pdf_read_only', 'PDF session is read-only')
    }
    assertEditableInspection(session.inspection)
    if (session.status === 'conflicted') {
      throw new PdfSessionError(
        'pdf_file_conflict',
        'PDF session is conflicted'
      )
    }
  }

  private requireRevision(
    session: SessionRecord,
    expectedRevision: number
  ): void {
    if (
      !Number.isSafeInteger(expectedRevision) ||
      session.revision !== expectedRevision
    ) {
      throw new PdfSessionError(
        'pdf_revision_conflict',
        'PDF revision conflict'
      )
    }
  }

  private acquire(session: SessionRecord): void {
    if (session.busy) {
      throw new PdfSessionError('pdf_session_busy', 'PDF session is busy')
    }
    session.busy = true
  }
}

function summary(session: SessionRecord): PdfSessionSummary {
  return {
    sessionId: session.sessionId,
    path: session.path,
    format: 'pdf',
    mode: session.mode,
    revision: session.revision,
    status: session.status,
    sourceChecksum: session.sourceChecksum,
    inspection: structuredClone(session.inspection)
  }
}

function assertEditableInspection(inspection: PdfInspection): void {
  if (inspection.encrypted) {
    throw new PdfSessionError(
      'pdf_encrypted_read_only',
      'Encrypted PDF is read-only'
    )
  }
  if (inspection.signed) {
    throw new PdfSessionError('pdf_signed_read_only', 'Signed PDF is read-only')
  }
}

function validateOcr(result: ImageOcrResult, page: PdfRenderedPage): void {
  for (const block of result.blocks) {
    const { bounds } = block
    if (
      !block.text.trim() ||
      !Number.isFinite(block.confidence) ||
      block.confidence < 0 ||
      block.confidence > 1 ||
      !validCoordinate(bounds.x, true) ||
      !validCoordinate(bounds.y, true) ||
      !validCoordinate(bounds.width, false) ||
      !validCoordinate(bounds.height, false) ||
      bounds.x + bounds.width > page.width ||
      bounds.y + bounds.height > page.height
    ) {
      throw new PdfSessionError(
        'pdf_ocr_invalid',
        'PDF OCR returned invalid coordinates'
      )
    }
  }
}

function validCoordinate(value: number, allowZero: boolean): boolean {
  return (
    Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)
  )
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('PDF operation was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
