import { createHash } from 'node:crypto'
import type { DocumentBlock } from './document-delivery'

export type PdfGenerationSource =
  | {
      kind: 'docx'
      sourcePath: string
      sourceChecksum: string
    }
  | {
      kind: 'html'
      html: string
      baseUrl?: string
      title?: string
    }
  | {
      kind: 'markdown'
      markdown: string
      title?: string
    }
  | {
      kind: 'document_blocks'
      title: string
      blocks: DocumentBlock[]
      preferredLayout?: 'office' | 'report'
    }
  | {
      kind: 'pdf_session'
      sessionId: string
      revision: number
    }
  | {
      kind: 'legacy_office'
      sourcePath: string
      sourceChecksum: string
      sourceFormat: 'vsd' | 'vsdx' | 'pub'
    }

export type PdfQualityPolicy =
  | 'require_print_layout'
  | 'prefer_print_layout'
  | 'allow_degraded_text'

export type PdfVerificationPolicy = {
  minimumByteSize?: number
  minimumPageCount?: number
  requireRenderSmokeTest?: boolean
}

export type PdfGenerationBackendId =
  | 'libreoffice_docx_pdf'
  | 'cupsfilter_docx_text_pdf'
  | 'chromium_html_pdf'
  | 'pdf_lib_session_save_as'
  | 'libreoffice_legacy_pdf'

export type PdfGenerationQuality =
  | 'print'
  | 'visual_print'
  | 'edit_preserve'
  | 'degraded_text'

export type PdfGenerationRequest = {
  requestId: string
  scopeRoot: string
  outputPath: string
  expectedAbsent: true
  source: PdfGenerationSource
  qualityPolicy: PdfQualityPolicy
  verification?: PdfVerificationPolicy
  operation?: {
    requirementId?: string
    nodeRunId?: string
  }
  routeHint?: {
    preferredBackend?: PdfGenerationBackendId
    forbidBackends?: PdfGenerationBackendId[]
  }
}

export type PdfGenerationReadinessSnapshot = {
  checkedAt: number
  backends: Record<
    PdfGenerationBackendId,
    {
      status: 'ready' | 'degraded' | 'unavailable'
      reasonCode?: string
      executablePath?: string
      version?: string
      quality: PdfGenerationQuality
    }
  >
}

export type PdfGenerationRouteDecision = {
  selectedBackend: PdfGenerationBackendId
  quality: PdfGenerationQuality
  degraded: boolean
  reasons: string[]
  warnings: string[]
}

export type PdfGenerationArtifact = {
  path: string
  format: 'pdf'
  byteSize: number
  checksum: string
  pageCount?: number
  backend: PdfGenerationBackendId
  quality: PdfGenerationQuality
  warnings: string[]
  renderProof?: {
    firstPagePngChecksum: string
    width: number
    height: number
  }
}

export type PdfGenerationReceipt = {
  requestId: string
  idempotencyFingerprint: string
  status: 'succeeded'
  artifact: PdfGenerationArtifact
  route: PdfGenerationRouteDecision
  completedAt: number
}

export class PdfGenerationError extends Error {
  readonly name = 'PdfGenerationError'

  constructor(
    readonly code:
      | 'pdf_source_invalid'
      | 'pdf_source_conflict'
      | 'pdf_source_unsupported'
      | 'pdf_output_exists'
      | 'pdf_backend_unavailable'
      | 'pdf_quality_unavailable'
      | 'pdf_external_resource_blocked'
      | 'pdf_render_timeout'
      | 'pdf_render_failed'
      | 'pdf_verification_failed'
      | 'pdf_render_smoke_test_failed'
      | 'pdf_session_conflict'
      | 'pdf_permission_denied',
    message: string
  ) {
    super(message)
  }
}

const BACKENDS: readonly PdfGenerationBackendId[] = [
  'libreoffice_docx_pdf',
  'cupsfilter_docx_text_pdf',
  'chromium_html_pdf',
  'pdf_lib_session_save_as',
  'libreoffice_legacy_pdf'
]

const QUALITY_POLICIES: readonly PdfQualityPolicy[] = [
  'require_print_layout',
  'prefer_print_layout',
  'allow_degraded_text'
]

const CHECKSUM_PATTERN = /^sha256:[a-f0-9]{64}$/
const TEXT_FALLBACK_WARNING =
  'Original DOCX layout will not be preserved.'

export function createPdfGenerationRequest(
  input: PdfGenerationRequest
): PdfGenerationRequest {
  validateRequest(input)
  return deepFreeze(cloneJson(input))
}

export function pdfGenerationFingerprint(
  request: PdfGenerationRequest
): string {
  validateRequest(request)
  const fingerprintInput = {
    expectedAbsent: request.expectedAbsent,
    operation: request.operation ?? null,
    outputPath: request.outputPath,
    qualityPolicy: request.qualityPolicy,
    routeHint: request.routeHint ?? null,
    scopeRoot: request.scopeRoot,
    source: request.source,
    verification: request.verification ?? null
  }
  return `sha256:${createHash('sha256')
    .update(canonicalize(fingerprintInput), 'utf8')
    .digest('hex')}`
}

export function planPdfGenerationRoute(input: {
  request: PdfGenerationRequest
  readiness: PdfGenerationReadinessSnapshot
}): PdfGenerationRouteDecision {
  validateRequest(input.request)
  validateReadiness(input.readiness)
  const { request, readiness } = input
  const source = request.source

  if (source.kind === 'html') {
    return requireReadyBackend({
      backend: 'chromium_html_pdf',
      readiness,
      request,
      reasons: ['source_html_requires_chromium'],
      quality: 'visual_print'
    })
  }
  if (source.kind === 'markdown') {
    return requireReadyBackend({
      backend: 'chromium_html_pdf',
      readiness,
      request,
      reasons: ['source_markdown_rendered_to_html'],
      quality: 'visual_print'
    })
  }
  if (source.kind === 'document_blocks' && source.preferredLayout !== 'office') {
    return requireReadyBackend({
      backend: 'chromium_html_pdf',
      readiness,
      request,
      reasons: ['source_document_blocks_report_layout'],
      quality: 'visual_print'
    })
  }
  if (source.kind === 'pdf_session') {
    return requireReadyBackend({
      backend: 'pdf_lib_session_save_as',
      readiness,
      request,
      reasons: ['pdf_session_save_as'],
      quality: 'edit_preserve'
    })
  }
  if (source.kind === 'legacy_office') {
    if (!backendSelectable(request, 'libreoffice_legacy_pdf')) {
      throw new PdfGenerationError(
        'pdf_backend_unavailable',
        'PDF backend is unavailable'
      )
    }
    if (readiness.backends.libreoffice_legacy_pdf.status !== 'ready') {
      throw new PdfGenerationError(
        'pdf_source_unsupported',
        'Legacy Office PDF generation is not enabled'
      )
    }
    return {
      selectedBackend: 'libreoffice_legacy_pdf',
      quality: 'print',
      degraded: false,
      reasons: ['legacy_office_pdf_enabled'],
      warnings: []
    }
  }
  return planDocxRoute(request, readiness)
}

function planDocxRoute(
  request: PdfGenerationRequest,
  readiness: PdfGenerationReadinessSnapshot
): PdfGenerationRouteDecision {
  const libreOffice = readiness.backends.libreoffice_docx_pdf
  if (
    backendSelectable(request, 'libreoffice_docx_pdf') &&
    libreOffice.status === 'ready'
  ) {
    return {
      selectedBackend: 'libreoffice_docx_pdf',
      quality: 'print',
      degraded: false,
      reasons: ['libreoffice_ready'],
      warnings: []
    }
  }

  const cupsfilter = readiness.backends.cupsfilter_docx_text_pdf
  const fallbackReady =
    backendSelectable(request, 'cupsfilter_docx_text_pdf') &&
    cupsfilter.status !== 'unavailable'
  if (fallbackReady && request.qualityPolicy !== 'require_print_layout') {
    return {
      selectedBackend: 'cupsfilter_docx_text_pdf',
      quality: 'degraded_text',
      degraded: true,
      reasons: ['libreoffice_unavailable', 'quality_policy_allows_text_fallback'],
      warnings: [TEXT_FALLBACK_WARNING]
    }
  }
  if (fallbackReady && request.qualityPolicy === 'require_print_layout') {
    throw new PdfGenerationError(
      'pdf_quality_unavailable',
      'Required PDF print layout backend is unavailable'
    )
  }
  throw new PdfGenerationError(
    'pdf_backend_unavailable',
    'PDF backend is unavailable'
  )
}

function requireReadyBackend(input: {
  backend: PdfGenerationBackendId
  readiness: PdfGenerationReadinessSnapshot
  request: PdfGenerationRequest
  reasons: string[]
  quality: PdfGenerationQuality
}): PdfGenerationRouteDecision {
  if (
    !backendSelectable(input.request, input.backend) ||
    input.readiness.backends[input.backend].status === 'unavailable'
  ) {
    throw new PdfGenerationError(
      'pdf_backend_unavailable',
      'PDF backend is unavailable'
    )
  }
  return {
    selectedBackend: input.backend,
    quality: input.quality,
    degraded: input.readiness.backends[input.backend].status === 'degraded',
    reasons: input.reasons,
    warnings: []
  }
}

function backendSelectable(
  request: PdfGenerationRequest,
  backend: PdfGenerationBackendId
): boolean {
  const hint = request.routeHint
  if (hint?.forbidBackends?.includes(backend)) return false
  if (hint?.preferredBackend && hint.preferredBackend !== backend) return false
  return true
}

function validateRequest(request: PdfGenerationRequest): void {
  requireText(request.requestId, 'PDF generation request ID')
  requireText(request.scopeRoot, 'PDF generation scope root')
  requirePath(request.outputPath, 'PDF generation output path')
  if (!request.outputPath.toLowerCase().endsWith('.pdf')) {
    throw new PdfGenerationError(
      'pdf_source_invalid',
      'PDF generation output format is invalid'
    )
  }
  if (request.expectedAbsent !== true) {
    throw new PdfGenerationError(
      'pdf_output_exists',
      'PDF generation requires expectedAbsent true'
    )
  }
  requireEnum(
    request.qualityPolicy,
    QUALITY_POLICIES,
    'PDF generation quality policy'
  )
  validateSource(request.source)
  validateVerification(request.verification)
  validateRouteHint(request.routeHint)
}

function validateSource(source: PdfGenerationSource): void {
  if (!source || typeof source !== 'object') {
    throw new PdfGenerationError(
      'pdf_source_invalid',
      'PDF generation source is invalid'
    )
  }
  if (source.kind === 'docx') {
    requirePath(source.sourcePath, 'PDF generation source path')
    requireChecksum(source.sourceChecksum)
    if (!source.sourcePath.toLowerCase().endsWith('.docx')) {
      throw new PdfGenerationError(
        'pdf_source_invalid',
        'PDF generation DOCX source format is invalid'
      )
    }
    return
  }
  if (source.kind === 'html') {
    requireText(source.html, 'PDF generation HTML')
    if (source.baseUrl !== undefined) {
      requireText(source.baseUrl, 'PDF generation base URL')
    }
    if (source.title !== undefined) {
      requireText(source.title, 'PDF generation title')
    }
    return
  }
  if (source.kind === 'markdown') {
    requireText(source.markdown, 'PDF generation Markdown')
    if (source.title !== undefined) {
      requireText(source.title, 'PDF generation title')
    }
    return
  }
  if (source.kind === 'document_blocks') {
    requireText(source.title, 'PDF generation document title')
    if (!Array.isArray(source.blocks) || source.blocks.length === 0) {
      throw new PdfGenerationError(
        'pdf_source_invalid',
        'PDF generation document blocks are required'
      )
    }
    if (
      source.preferredLayout !== undefined &&
      source.preferredLayout !== 'office' &&
      source.preferredLayout !== 'report'
    ) {
      throw new PdfGenerationError(
        'pdf_source_invalid',
        'PDF generation document layout is invalid'
      )
    }
    return
  }
  if (source.kind === 'pdf_session') {
    requireText(source.sessionId, 'PDF generation session ID')
    requirePositiveInteger(source.revision, 'PDF generation revision', 0)
    return
  }
  if (source.kind === 'legacy_office') {
    requirePath(source.sourcePath, 'PDF generation source path')
    requireChecksum(source.sourceChecksum)
    requireEnum(
      source.sourceFormat,
      ['vsd', 'vsdx', 'pub'] as const,
      'PDF generation legacy source format'
    )
    return
  }
  throw new PdfGenerationError(
    'pdf_source_invalid',
    'PDF generation source kind is invalid'
  )
}

function validateVerification(
  verification: PdfVerificationPolicy | undefined
): void {
  if (!verification) return
  requireOptionalPositiveInteger(
    verification.minimumByteSize,
    'PDF generation minimum byte size'
  )
  requireOptionalPositiveInteger(
    verification.minimumPageCount,
    'PDF generation minimum page count'
  )
  if (
    verification.requireRenderSmokeTest !== undefined &&
    typeof verification.requireRenderSmokeTest !== 'boolean'
  ) {
    throw new PdfGenerationError(
      'pdf_source_invalid',
      'PDF generation render smoke test flag is invalid'
    )
  }
}

function validateRouteHint(
  routeHint: PdfGenerationRequest['routeHint']
): void {
  if (!routeHint) return
  if (routeHint.preferredBackend !== undefined) {
    requireBackend(routeHint.preferredBackend)
  }
  if (routeHint.forbidBackends !== undefined) {
    if (!Array.isArray(routeHint.forbidBackends)) {
      throw new PdfGenerationError(
        'pdf_source_invalid',
        'PDF generation forbidden backends are invalid'
      )
    }
    for (const backend of routeHint.forbidBackends) requireBackend(backend)
  }
}

function validateReadiness(readiness: PdfGenerationReadinessSnapshot): void {
  if (!Number.isSafeInteger(readiness.checkedAt) || readiness.checkedAt < 0) {
    throw new PdfGenerationError(
      'pdf_source_invalid',
      'PDF generation readiness timestamp is invalid'
    )
  }
  for (const backend of BACKENDS) {
    if (!readiness.backends[backend]) {
      throw new PdfGenerationError(
        'pdf_backend_unavailable',
        'PDF generation readiness is incomplete'
      )
    }
  }
}

function requireBackend(value: unknown): PdfGenerationBackendId {
  if (typeof value !== 'string' || !BACKENDS.includes(value as PdfGenerationBackendId)) {
    throw new PdfGenerationError(
      'pdf_source_invalid',
      'PDF generation backend is invalid'
    )
  }
  return value as PdfGenerationBackendId
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new PdfGenerationError('pdf_source_invalid', `${field} is invalid`)
  }
  return value.trim()
}

function requirePath(value: unknown, field: string): string {
  const path = requireText(value, field).replaceAll('\\', '/')
  if (
    path.startsWith('/') ||
    /^[A-Za-z]:\//.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new PdfGenerationError('pdf_source_invalid', `${field} is invalid`)
  }
  return path
}

function requireChecksum(value: unknown): void {
  if (typeof value !== 'string' || !CHECKSUM_PATTERN.test(value)) {
    throw new PdfGenerationError(
      'pdf_source_invalid',
      'PDF generation source checksum is invalid'
    )
  }
}

function requirePositiveInteger(
  value: unknown,
  field: string,
  minimum = 1
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    throw new PdfGenerationError('pdf_source_invalid', `${field} is invalid`)
  }
  return value
}

function requireOptionalPositiveInteger(
  value: unknown,
  field: string
): void {
  if (value !== undefined) requirePositiveInteger(value, field)
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new PdfGenerationError('pdf_source_invalid', `${field} is invalid`)
  }
  return value as T
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child)
    }
  }
  return value
}

function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)])
    )
  }
  return value
}
