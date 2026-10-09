import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import type {
  ImageFormat,
  ImageInspection,
  ImageTransformOperation,
  ImageTransformResult
} from './image-adapter'

export type ImageSessionStatus =
  | 'ready'
  | 'dirty'
  | 'saving'
  | 'conflicted'
  | 'closed'

export type ImageSessionSummary = {
  sessionId: string
  path: string
  format: ImageFormat
  mode: 'read' | 'edit'
  revision: number
  status: ImageSessionStatus
  sourceChecksum: string
  inspection: ImageInspection
}

export type ImageSessionStorage = {
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
  commitNew(input: {
    canonicalPath: string
    content: Uint8Array
  }): Promise<void>
  remove(canonicalPath: string): Promise<void>
  loadRevision(canonicalPath: string, checksum: string): Promise<number>
  saveRevision(
    canonicalPath: string,
    checksum: string,
    revision: number
  ): Promise<void>
}

export type ImageAdapterPort = {
  inspect(
    content: Uint8Array,
    declaredFormat?: ImageFormat
  ): Promise<ImageInspection>
  transform(
    content: Uint8Array,
    operation: ImageTransformOperation,
    parameters: Record<string, unknown>
  ): Promise<ImageTransformResult>
}

export type ImageOcrBlock = {
  text: string
  confidence: number
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}

export type ImageOcrResult = {
  language: string
  blocks: ImageOcrBlock[]
}

export type ImageOcrPort = {
  recognize(
    input: {
      content: Buffer
      sourcePath: string
      language?: string
    },
    signal: AbortSignal
  ): Promise<ImageOcrResult>
}

export class ImageSessionError extends Error {
  readonly name = 'ImageSessionError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

type SessionRecord = ImageSessionSummary & {
  canonicalPath: string
  document: Buffer
  sourceDocument: Buffer
  sourceFormat: ImageFormat
  busy: boolean
}

export class LocalImageSessionService {
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(
    private readonly dependencies: {
      adapter: ImageAdapterPort
      storage: ImageSessionStorage
      localOcr?: ImageOcrPort
      modelVision?: ImageOcrPort
    }
  ) {}

  async open(input: {
    canonicalPath: string
    relativePath: string
    format: ImageFormat
    mode: 'read' | 'edit'
    signal: AbortSignal
  }): Promise<ImageSessionSummary> {
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
      throw new ImageSessionError(
        'image_file_conflict',
        'Image changed while it was opening'
      )
    }
    const inspection = await this.dependencies.adapter.inspect(
      document,
      input.format
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
      sourceFormat: input.format,
      inspection,
      busy: false
    }
    this.sessions.set(session.sessionId, session)
    return summary(session)
  }

  async transform(input: {
    sessionId: string
    expectedRevision: number
    operation: ImageTransformOperation
    parameters: Record<string, unknown>
    signal: AbortSignal
  }): Promise<ImageSessionSummary & { result: Record<string, unknown> }> {
    const session = this.requireSession(input.sessionId)
    this.requireEditable(session)
    this.requireRevision(session, input.expectedRevision)
    this.acquire(session)
    try {
      assertNotAborted(input.signal)
      const transformed = await this.dependencies.adapter.transform(
        session.document,
        input.operation,
        input.parameters
      )
      session.document = Buffer.from(transformed.content)
      session.format = transformed.inspection.format
      session.inspection = transformed.inspection
      session.revision += 1
      session.status = 'dirty'
      return { ...summary(session), result: transformed.summary }
    } finally {
      session.busy = false
    }
  }

  async ocr(input: {
    sessionId: string
    language?: string
    modelVisionAuthorized: boolean
    signal: AbortSignal
  }): Promise<{
    sourceImage: string
    provider: 'local' | 'model'
    language: string
    blocks: ImageOcrBlock[]
  }> {
    const session = this.requireSession(input.sessionId)
    this.acquire(session)
    try {
      assertNotAborted(input.signal)
      let provider: 'local' | 'model'
      let result: ImageOcrResult
      if (this.dependencies.localOcr) {
        provider = 'local'
        result = await this.dependencies.localOcr.recognize(
          {
            content: Buffer.from(session.document),
            sourcePath: session.path,
            language: input.language
          },
          input.signal
        )
      } else {
        if (!input.modelVisionAuthorized || !this.dependencies.modelVision) {
          throw new ImageSessionError(
            'image_ocr_unavailable',
            'Local OCR is unavailable and model vision is not authorized'
          )
        }
        provider = 'model'
        result = await this.dependencies.modelVision.recognize(
          {
            content: Buffer.from(session.document),
            sourcePath: session.path,
            language: input.language
          },
          input.signal
        )
      }
      validateOcrResult(result, session.inspection)
      return {
        sourceImage: session.path,
        provider,
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

  async save(input: {
    sessionId: string
    expectedRevision: number
    output?: {
      canonicalPath: string
      relativePath: string
    }
    signal: AbortSignal
  }): Promise<ImageSessionSummary> {
    const session = this.requireSession(input.sessionId)
    this.requireEditable(session)
    this.requireRevision(session, input.expectedRevision)
    this.acquire(session)
    session.status = 'saving'
    try {
      assertNotAborted(input.signal)
      if (!input.output && session.format !== session.sourceFormat) {
        throw new ImageSessionError(
          'image_output_path_required',
          'Image conversion requires a new output path'
        )
      }
      if (input.output) {
        assertMatchingExtension(input.output.relativePath, session.format)
      }
      if (
        (await this.dependencies.storage.checksum(session.canonicalPath)) !==
        session.sourceChecksum
      ) {
        session.status = 'conflicted'
        throw new ImageSessionError(
          'image_file_conflict',
          'Image changed outside this session'
        )
      }
      await this.dependencies.adapter.inspect(session.document, session.format)
      if (input.output) {
        try {
          await this.dependencies.storage.commitNew({
            canonicalPath: input.output.canonicalPath,
            content: session.document
          })
        } catch (error) {
          if (isAlreadyExists(error)) {
            throw new ImageSessionError(
              'image_output_exists',
              'Image output already exists'
            )
          }
          throw error
        }
        const committedChecksum = digest(session.document)
        try {
          await this.dependencies.storage.saveRevision(
            input.output.canonicalPath,
            committedChecksum,
            session.revision
          )
        } catch (error) {
          await this.dependencies.storage
            .remove(input.output.canonicalPath)
            .catch(() => undefined)
          throw error
        }
        session.canonicalPath = input.output.canonicalPath
        session.path = input.output.relativePath
        session.sourceDocument = Buffer.from(session.document)
        session.sourceChecksum = committedChecksum
        session.sourceFormat = session.format
        session.status = 'ready'
        return summary(session)
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
      session.sourceFormat = session.format
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
      throw new ImageSessionError(
        'image_session_not_found',
        'Image session was not found'
      )
    }
    return session
  }

  private requireEditable(session: SessionRecord): void {
    if (session.mode !== 'edit') {
      throw new ImageSessionError(
        'image_read_only',
        'Image session is read-only'
      )
    }
    if (session.status === 'conflicted') {
      throw new ImageSessionError(
        'image_file_conflict',
        'Image session is conflicted'
      )
    }
  }

  private requireRevision(
    session: SessionRecord,
    expectedRevision: number
  ): void {
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision !== session.revision
    ) {
      throw new ImageSessionError(
        'image_revision_conflict',
        'Image revision conflict'
      )
    }
  }

  private acquire(session: SessionRecord): void {
    if (session.busy) {
      throw new ImageSessionError(
        'image_session_busy',
        'Image session is busy'
      )
    }
    session.busy = true
  }
}

function summary(session: SessionRecord): ImageSessionSummary {
  return {
    sessionId: session.sessionId,
    path: session.path,
    format: session.format,
    mode: session.mode,
    revision: session.revision,
    status: session.status,
    sourceChecksum: session.sourceChecksum,
    inspection: {
      ...session.inspection,
      exif: { ...session.inspection.exif }
    }
  }
}

function validateOcrResult(
  result: ImageOcrResult,
  inspection: ImageInspection
): void {
  if (typeof result.language !== 'string' || !Array.isArray(result.blocks)) {
    throw new ImageSessionError(
      'image_ocr_invalid',
      'OCR returned an invalid result'
    )
  }
  for (const block of result.blocks) {
    const { bounds } = block
    if (
      typeof block.text !== 'string' ||
      !block.text.trim() ||
      typeof block.confidence !== 'number' ||
      block.confidence < 0 ||
      block.confidence > 1 ||
      !isFiniteCoordinate(bounds.x) ||
      !isFiniteCoordinate(bounds.y) ||
      !isFiniteCoordinate(bounds.width, false) ||
      !isFiniteCoordinate(bounds.height, false) ||
      bounds.x + bounds.width > inspection.width ||
      bounds.y + bounds.height > inspection.height
    ) {
      throw new ImageSessionError(
        'image_ocr_invalid',
        'OCR returned invalid block coordinates'
      )
    }
  }
}

function isFiniteCoordinate(value: number, allowZero = true): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (allowZero ? value >= 0 : value > 0)
  )
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Image operation was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function assertMatchingExtension(path: string, format: ImageFormat): void {
  const extension = extname(path).toLowerCase()
  const valid =
    (format === 'jpeg' && (extension === '.jpg' || extension === '.jpeg')) ||
    extension === `.${format}`
  if (!valid) {
    throw new ImageSessionError(
      'image_output_format_conflict',
      'Image output extension does not match the candidate format'
    )
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
