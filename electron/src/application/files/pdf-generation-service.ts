import { createHash } from 'node:crypto'
import type {
  PdfGenerationArtifact,
  PdfGenerationBackendId,
  PdfGenerationQuality,
  PdfGenerationReadinessSnapshot,
  PdfGenerationReceipt,
  PdfGenerationRequest,
  PdfGenerationRouteDecision
} from '../../../../domain/pdf-generation'
import {
  PdfGenerationError,
  createPdfGenerationRequest,
  pdfGenerationFingerprint,
  planPdfGenerationRoute
} from '../../../../domain/pdf-generation'
import { SecurePathService } from '../../workspace/secure-path-service'

export type PdfGenerationStorage = {
  read(canonicalPath: string): Promise<Uint8Array>
  checksum(canonicalPath: string): Promise<string>
  exists(canonicalPath: string): Promise<boolean>
  commitNew(input: {
    canonicalPath: string
    content: Uint8Array
  }): Promise<void>
}

export type PdfGenerationBackendInput = {
  request: PdfGenerationRequest
  route: PdfGenerationRouteDecision
  sourceBytes?: Buffer
}

export type PdfGenerationBackendResult = {
  bytes: Uint8Array
  pageCount?: number
  backend: PdfGenerationBackendId
  quality: PdfGenerationQuality
  warnings?: string[]
  renderProof?: PdfGenerationArtifact['renderProof']
}

export type PdfGenerationBackend = {
  generate(
    input: PdfGenerationBackendInput,
    signal: AbortSignal
  ): Promise<PdfGenerationBackendResult>
}

export type PdfGenerationBackendMap = Partial<
  Record<PdfGenerationBackendId, PdfGenerationBackend>
>

export class PdfGenerationService {
  private readonly securePaths = new SecurePathService()

  constructor(
    private readonly dependencies: {
      storage: PdfGenerationStorage
      backends: PdfGenerationBackendMap
      getReadiness: () => Promise<PdfGenerationReadinessSnapshot>
      now?: () => number
    }
  ) {}

  async generate(
    input: PdfGenerationRequest,
    signal: AbortSignal
  ): Promise<PdfGenerationReceipt> {
    assertNotAborted(signal)
    const request = createPdfGenerationRequest(input)
    const output = await this.securePaths.resolvePathForCreation(
      request.scopeRoot,
      request.outputPath
    )
    if (await this.dependencies.storage.exists(output.targetPath)) {
      throw new PdfGenerationError(
        'pdf_output_exists',
        'PDF output already exists'
      )
    }
    const sourceBytes = await this.readSourceBytes(request)
    const route = await this.planRoute(request)
    const backend = this.dependencies.backends[route.selectedBackend]
    if (!backend) {
      throw new PdfGenerationError(
        'pdf_backend_unavailable',
        'PDF backend is unavailable'
      )
    }
    const generated = await backend.generate(
      { request, route, ...(sourceBytes ? { sourceBytes } : {}) },
      signal
    )
    const artifact = validateCandidate(
      generated,
      output.relativePath,
      route
    )
    assertVerificationPolicy(request, artifact)
    await this.assertSourceStable(request)
    try {
      await this.dependencies.storage.commitNew({
        canonicalPath: output.targetPath,
        content: generated.bytes
      })
    } catch (error) {
      if (isAlreadyExists(error)) {
        throw new PdfGenerationError(
          'pdf_output_exists',
          'PDF output already exists'
        )
      }
      throw error
    }
    return {
      requestId: request.requestId,
      idempotencyFingerprint: pdfGenerationFingerprint(request),
      status: 'succeeded',
      artifact,
      route,
      completedAt: this.now()
    }
  }

  async planRoute(
    input: PdfGenerationRequest
  ): Promise<PdfGenerationRouteDecision> {
    return planPdfGenerationRoute({
      request: createPdfGenerationRequest(input),
      readiness: await this.getReadiness()
    })
  }

  async getReadiness(): Promise<PdfGenerationReadinessSnapshot> {
    return this.dependencies.getReadiness()
  }

  private async readSourceBytes(
    request: PdfGenerationRequest
  ): Promise<Buffer | undefined> {
    if (
      request.source.kind !== 'docx' &&
      request.source.kind !== 'legacy_office'
    ) {
      return undefined
    }
    const source = await this.securePaths.resolveExistingPath(
      request.scopeRoot,
      request.source.sourcePath
    )
    const bytes = Buffer.from(
      await this.dependencies.storage.read(source.targetPath)
    )
    if (digest(bytes) !== request.source.sourceChecksum) {
      throw new PdfGenerationError(
        'pdf_source_conflict',
        'PDF source checksum conflict'
      )
    }
    return bytes
  }

  private async assertSourceStable(
    request: PdfGenerationRequest
  ): Promise<void> {
    if (
      request.source.kind !== 'docx' &&
      request.source.kind !== 'legacy_office'
    ) {
      return
    }
    const source = await this.securePaths.resolveExistingPath(
      request.scopeRoot,
      request.source.sourcePath
    )
    const checksum = await this.dependencies.storage.checksum(source.targetPath)
    if (normalizeChecksum(checksum) !== request.source.sourceChecksum) {
      throw new PdfGenerationError(
        'pdf_source_conflict',
        'PDF source checksum conflict'
      )
    }
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now()
  }
}

export function createSidecarDocxPdfBackend(engine: {
  exportDocumentPdf(
    input: { documentBase64: string },
    signal: AbortSignal
  ): Promise<{
    documentBase64: string
    format: 'docx' | 'pdf'
    byteSize: number
    checksum: string
    pageCount: number | null
    converter?: 'libreoffice' | 'cupsfilter_text'
    quality?: 'print' | 'degraded_text'
    warnings?: string[]
  }>
}): PdfGenerationBackend {
  return {
    async generate(input, signal) {
      if (!input.sourceBytes) {
        throw new PdfGenerationError(
          'pdf_source_invalid',
          'DOCX PDF generation requires source bytes'
        )
      }
      const generated = await engine.exportDocumentPdf(
        { documentBase64: input.sourceBytes.toString('base64') },
        signal
      )
      const bytes = Buffer.from(generated.documentBase64, 'base64')
      const backend =
        generated.converter === 'cupsfilter_text'
          ? 'cupsfilter_docx_text_pdf'
          : 'libreoffice_docx_pdf'
      return {
        bytes,
        ...(generated.pageCount === null
          ? {}
          : { pageCount: generated.pageCount }),
        backend,
        quality:
          generated.quality ??
          (backend === 'cupsfilter_docx_text_pdf'
            ? 'degraded_text'
            : 'print'),
        warnings: generated.warnings ?? []
      }
    }
  }
}

export function createPdfSessionSaveAsBackend(sessions: {
  exportRevision(input: {
    sessionId: string
    expectedRevision: number
    signal: AbortSignal
  }): Promise<{
    content: Buffer
    pageCount: number
    checksum: string
    sourcePath: string
    revision: number
  }>
}): PdfGenerationBackend {
  return {
    async generate(input, signal) {
      if (input.request.source.kind !== 'pdf_session') {
        throw new PdfGenerationError(
          'pdf_source_invalid',
          'PDF session backend requires a PDF session source'
        )
      }
      const exported = await sessions.exportRevision({
        sessionId: input.request.source.sessionId,
        expectedRevision: input.request.source.revision,
        signal
      })
      return {
        bytes: exported.content,
        pageCount: exported.pageCount,
        backend: 'pdf_lib_session_save_as',
        quality: 'edit_preserve',
        warnings: []
      }
    }
  }
}

function validateCandidate(
  candidate: PdfGenerationBackendResult,
  relativePath: string,
  route: PdfGenerationRouteDecision
): PdfGenerationArtifact {
  const bytes = Buffer.from(candidate.bytes)
  if (
    bytes.byteLength === 0 ||
    candidate.backend !== route.selectedBackend ||
    candidate.quality !== route.quality
  ) {
    throw new PdfGenerationError(
      'pdf_verification_failed',
      'PDF backend returned inconsistent artifact facts'
    )
  }
  if (candidate.pageCount !== undefined && candidate.pageCount < 1) {
    throw new PdfGenerationError(
      'pdf_verification_failed',
      'PDF backend returned invalid page count'
    )
  }
  return {
    path: relativePath,
    format: 'pdf',
    byteSize: bytes.byteLength,
    checksum: digest(bytes),
    ...(candidate.pageCount === undefined
      ? {}
      : { pageCount: candidate.pageCount }),
    backend: candidate.backend,
    quality: candidate.quality,
    warnings: candidate.warnings ?? [],
    ...(candidate.renderProof ? { renderProof: candidate.renderProof } : {})
  }
}

function assertVerificationPolicy(
  request: PdfGenerationRequest,
  artifact: PdfGenerationArtifact
): void {
  const verification = request.verification
  if (!verification) return
  if (
    verification.minimumByteSize !== undefined &&
    artifact.byteSize < verification.minimumByteSize
  ) {
    throw new PdfGenerationError(
      'pdf_verification_failed',
      'PDF byte size does not satisfy verification policy'
    )
  }
  if (
    verification.minimumPageCount !== undefined &&
    (artifact.pageCount === undefined ||
      artifact.pageCount < verification.minimumPageCount)
  ) {
    throw new PdfGenerationError(
      'pdf_verification_failed',
      'PDF page count does not satisfy verification policy'
    )
  }
  if (
    verification.requireRenderSmokeTest === true &&
    artifact.renderProof === undefined
  ) {
    throw new PdfGenerationError(
      'pdf_render_smoke_test_failed',
      'PDF render smoke test was not completed'
    )
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function normalizeChecksum(value: string): string {
  return value.startsWith('sha256:') ? value : `sha256:${value}`
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('PDF generation was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
