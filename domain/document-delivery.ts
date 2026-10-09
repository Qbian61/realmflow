import { createHash } from 'node:crypto'

export type DocumentFormat = 'docx' | 'pdf'

export type DocumentBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet_list'; items: string[] }
  | { kind: 'table'; rows: string[][] }

export type CreateDocumentInput = {
  kind: 'create'
  outputPath: string
  document: {
    title: string
    blocks: DocumentBlock[]
  }
}

export type ExportPdfInput = {
  kind: 'export_pdf'
  sourcePath: string
  sourceChecksum: string
  outputPath: string
}

export type VerifyArtifactInput = {
  kind: 'verify'
  path: string
  format: DocumentFormat
  expectedChecksum?: string
  minimumByteSize?: number
  minimumPageCount?: number
}

export type DocumentDeliveryInput =
  | CreateDocumentInput
  | ExportPdfInput
  | VerifyArtifactInput

export type DocumentArtifact = {
  path: string
  format: DocumentFormat
  byteSize: number
  checksum: string
  pageCount?: number
  converter?: 'libreoffice' | 'cupsfilter_text'
  quality?: 'print' | 'degraded_text'
  warnings?: string[]
  verified?: true
}

export type DocumentDeliverySuccessReceipt = {
  requestId: string
  operation: DocumentDeliveryInput['kind']
  idempotencyFingerprint: string
  status: 'succeeded'
  artifact: DocumentArtifact
  completedAt: number
}

export type DocumentDeliveryFailureReceipt = {
  requestId: string
  operation: DocumentDeliveryInput['kind']
  idempotencyFingerprint: string
  status: 'failed'
  errorCode: string
  message: string
  completedAt: number
}

export type DocumentDeliveryReceipt =
  | DocumentDeliverySuccessReceipt
  | DocumentDeliveryFailureReceipt

type DocumentDeliveryBase = {
  requestId: string
  input: DocumentDeliveryInput
  idempotencyFingerprint: string
  requestedAt: number
}

export type RequestedDocumentDelivery = DocumentDeliveryBase & {
  status: 'requested'
}

export type RunningDocumentDelivery = DocumentDeliveryBase & {
  status: 'running'
  startedAt: number
}

export type SucceededDocumentDelivery = DocumentDeliveryBase & {
  status: 'succeeded'
  startedAt: number
  receipt: DocumentDeliverySuccessReceipt
}

export type FailedDocumentDelivery = DocumentDeliveryBase & {
  status: 'failed'
  startedAt: number
  receipt: DocumentDeliveryFailureReceipt
}

export type DocumentDelivery =
  | RequestedDocumentDelivery
  | RunningDocumentDelivery
  | SucceededDocumentDelivery
  | FailedDocumentDelivery

export type DocumentDeliveryCompletionGateInput = {
  pendingCalls: number
  waitingPermissions: number
  fileTransactionsTerminal: boolean
  acceptance: 'satisfied' | 'not_applicable' | 'pending'
  requiredArtifacts: Array<{
    path: string
    format: DocumentFormat
    checksum: string
  }>
  deliveries: readonly DocumentDelivery[]
}

export type DocumentDeliveryCompletionGateReason =
  | 'pending_calls'
  | 'waiting_permissions'
  | 'file_transactions_pending'
  | 'delivery_pending'
  | 'delivery_failed'
  | 'artifact_missing'
  | 'artifact_not_verified'
  | 'acceptance_pending'

export function createDocumentDelivery(input: {
  requestId: string
  input: DocumentDeliveryInput
  requestedAt: number
}): RequestedDocumentDelivery {
  requireText(input.requestId, 'Document delivery request ID')
  requireTimestamp(input.requestedAt)
  validateInput(input.input)
  const deliveryInput = cloneAndFreeze(input.input)
  return Object.freeze({
    requestId: input.requestId,
    input: deliveryInput,
    idempotencyFingerprint: documentDeliveryFingerprint(deliveryInput),
    status: 'requested',
    requestedAt: input.requestedAt
  })
}

export function documentDeliveryFingerprint(
  input: DocumentDeliveryInput
): string {
  validateInput(input)
  const digest = createHash('sha256')
    .update(canonicalize(input), 'utf8')
    .digest('hex')
  return `sha256:${digest}`
}

export function startDocumentDelivery(
  delivery: DocumentDelivery,
  startedAt: number
): RunningDocumentDelivery {
  if (delivery.status !== 'requested') invalidTransition()
  requireTimestamp(startedAt)
  if (startedAt < delivery.requestedAt) invalidTimestamp()
  return Object.freeze({ ...delivery, status: 'running', startedAt })
}

export function completeDocumentDelivery(
  delivery: DocumentDelivery,
  input: {
    completedAt: number
    artifact: DocumentArtifact
  }
): SucceededDocumentDelivery {
  if (delivery.status !== 'running') invalidTransition()
  requireTimestamp(input.completedAt)
  if (input.completedAt < delivery.startedAt) invalidTimestamp()
  const artifact = validateArtifact(input.artifact, delivery.input)
  const receipt: DocumentDeliverySuccessReceipt = Object.freeze({
    requestId: delivery.requestId,
    operation: delivery.input.kind,
    idempotencyFingerprint: delivery.idempotencyFingerprint,
    status: 'succeeded',
    artifact,
    completedAt: input.completedAt
  })
  return Object.freeze({
    ...delivery,
    status: 'succeeded',
    receipt
  })
}

export function failDocumentDelivery(
  delivery: DocumentDelivery,
  input: {
    completedAt: number
    errorCode: string
    message: string
  }
): FailedDocumentDelivery {
  if (delivery.status !== 'running') invalidTransition()
  requireTimestamp(input.completedAt)
  if (input.completedAt < delivery.startedAt) invalidTimestamp()
  requireText(input.errorCode, 'Document delivery error code')
  requireText(input.message, 'Document delivery error message')
  const receipt: DocumentDeliveryFailureReceipt = Object.freeze({
    requestId: delivery.requestId,
    operation: delivery.input.kind,
    idempotencyFingerprint: delivery.idempotencyFingerprint,
    status: 'failed',
    errorCode: input.errorCode,
    message: input.message,
    completedAt: input.completedAt
  })
  return Object.freeze({ ...delivery, status: 'failed', receipt })
}

export function evaluateDocumentDeliveryCompletionGate(
  input: DocumentDeliveryCompletionGateInput
): {
  allowed: boolean
  reasons: DocumentDeliveryCompletionGateReason[]
} {
  const reasons: DocumentDeliveryCompletionGateReason[] = []
  if (input.pendingCalls > 0) reasons.push('pending_calls')
  if (input.waitingPermissions > 0) reasons.push('waiting_permissions')
  if (!input.fileTransactionsTerminal) {
    reasons.push('file_transactions_pending')
  }
  if (
    input.deliveries.some(
      (delivery) =>
        delivery.status === 'requested' || delivery.status === 'running'
    )
  ) {
    reasons.push('delivery_pending')
  }
  if (input.deliveries.some((delivery) => delivery.status === 'failed')) {
    reasons.push('delivery_failed')
  }
  for (const required of input.requiredArtifacts) {
    const exists = input.deliveries.some(
      (delivery) =>
        delivery.status === 'succeeded' &&
        delivery.input.kind !== 'verify' &&
        delivery.receipt.artifact.path === required.path &&
        delivery.receipt.artifact.format === required.format
    )
    if (!exists) {
      appendUnique(reasons, 'artifact_missing')
      continue
    }
    const verified = input.deliveries.some(
      (delivery) =>
        delivery.status === 'succeeded' &&
        delivery.input.kind === 'verify' &&
        delivery.receipt.artifact.verified === true &&
        artifactMatches(delivery.receipt.artifact, required)
    )
    if (!verified) appendUnique(reasons, 'artifact_not_verified')
  }
  if (input.acceptance === 'pending') reasons.push('acceptance_pending')
  return { allowed: reasons.length === 0, reasons }
}

function validateInput(input: DocumentDeliveryInput): void {
  if (input.kind === 'create') {
    requirePath(input.outputPath)
    if (!input.outputPath.toLowerCase().endsWith('.docx')) {
      throw new Error('Document delivery output format is invalid')
    }
    requireText(input.document.title, 'Document delivery title')
    if (!Array.isArray(input.document.blocks) || input.document.blocks.length === 0) {
      throw new Error('Document delivery blocks are required')
    }
    return
  }
  if (input.kind === 'export_pdf') {
    requirePath(input.sourcePath)
    requirePath(input.outputPath)
    requireChecksum(input.sourceChecksum)
    if (
      !input.sourcePath.toLowerCase().endsWith('.docx') ||
      !input.outputPath.toLowerCase().endsWith('.pdf')
    ) {
      throw new Error('Document delivery output format is invalid')
    }
    return
  }
  requirePath(input.path)
  if (!input.path.toLowerCase().endsWith(`.${input.format}`)) {
    throw new Error('Document delivery verification format is invalid')
  }
  if (input.expectedChecksum !== undefined) {
    requireChecksum(input.expectedChecksum)
  }
  requireOptionalPositiveInteger(input.minimumByteSize)
  requireOptionalPositiveInteger(input.minimumPageCount)
  if (input.format !== 'pdf' && input.minimumPageCount !== undefined) {
    throw new Error('Document delivery page count is only valid for PDF')
  }
}

function validateArtifact(
  artifact: DocumentArtifact,
  input: DocumentDeliveryInput
): DocumentArtifact {
  requirePath(artifact.path)
  requireChecksum(artifact.checksum)
  requirePositiveInteger(artifact.byteSize, 'Document delivery byte size')
  requireOptionalPositiveInteger(artifact.pageCount)
  requireOptionalConverter(artifact.converter)
  requireOptionalQuality(artifact.quality)
  requireOptionalWarnings(artifact.warnings)
  const expectedPath =
    input.kind === 'create'
      ? input.outputPath
      : input.kind === 'export_pdf'
        ? input.outputPath
        : input.path
  const expectedFormat =
    input.kind === 'create'
      ? 'docx'
      : input.kind === 'export_pdf'
        ? 'pdf'
        : input.format
  if (artifact.path !== expectedPath || artifact.format !== expectedFormat) {
    throw new Error('Document delivery artifact does not match request')
  }
  if (
    input.kind === 'verify' &&
    input.expectedChecksum !== undefined &&
    artifact.checksum !== input.expectedChecksum
  ) {
    throw new Error('Document delivery artifact checksum does not match request')
  }
  if (input.kind === 'verify' && artifact.verified !== true) {
    throw new Error('Document delivery verification receipt must be verified')
  }
  return cloneAndFreeze(artifact)
}

function artifactMatches(
  artifact: DocumentArtifact,
  required: {
    path: string
    format: DocumentFormat
    checksum: string
  }
): boolean {
  return (
    artifact.path === required.path &&
    artifact.format === required.format &&
    artifact.checksum === required.checksum
  )
}

function canonicalize(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value))
}

function toCanonicalValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Document delivery input is not canonical')
    }
    return value
  }
  if (Array.isArray(value)) return value.map(toCanonicalValue)
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, toCanonicalValue(value[key])])
    )
  }
  throw new Error('Document delivery input is not canonical')
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreeze)) as T
  }
  if (isPlainObject(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneAndFreeze(item)])
      )
    ) as T
  }
  return value
}

function requirePath(value: string): void {
  requireText(value, 'Document delivery path')
  const normalized = value.replaceAll('\\', '/')
  if (
    normalized !== value ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Document delivery path is invalid')
  }
}

function requireChecksum(value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error('Document delivery checksum is invalid')
  }
}

function requireText(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`)
  }
}

function requireTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) invalidTimestamp()
}

function invalidTimestamp(): never {
  throw new Error('Document delivery timestamp is invalid')
}

function requireOptionalPositiveInteger(value: number | undefined): void {
  if (value !== undefined) {
    requirePositiveInteger(value, 'Document delivery numeric constraint')
  }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} is invalid`)
  }
}

function requireOptionalConverter(value: string | undefined): void {
  if (
    value !== undefined &&
    value !== 'libreoffice' &&
    value !== 'cupsfilter_text'
  ) {
    throw new Error('Document delivery converter is invalid')
  }
}

function requireOptionalQuality(value: string | undefined): void {
  if (
    value !== undefined &&
    value !== 'print' &&
    value !== 'degraded_text'
  ) {
    throw new Error('Document delivery quality is invalid')
  }
}

function requireOptionalWarnings(value: string[] | undefined): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) ||
      !value.every((warning) => typeof warning === 'string' && warning.trim()))
  ) {
    throw new Error('Document delivery warnings are invalid')
  }
}

function invalidTransition(): never {
  throw new Error('Invalid document delivery transition')
}

function appendUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value)
}

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
