import { createHash } from 'node:crypto'
import type {
  DocumentArtifact,
  DocumentBlock,
  DocumentDelivery,
  DocumentDeliveryInput,
  DocumentDeliveryReceipt,
  DocumentFormat
} from '../../../../domain/document-delivery'
import {
  completeDocumentDelivery,
  createDocumentDelivery,
  failDocumentDelivery,
  startDocumentDelivery
} from '../../../../domain/document-delivery'
import type {
  SidecarClient,
  SidecarDocumentArtifact,
  SidecarDocumentVerification
} from '../../sidecar/client'
import { SecurePathService } from '../../workspace/secure-path-service'

export type DocumentDeliveryStorage = {
  read(canonicalPath: string): Promise<Uint8Array>
  checksum(canonicalPath: string): Promise<string>
  exists(canonicalPath: string): Promise<boolean>
  commitNew(input: {
    canonicalPath: string
    content: Uint8Array
  }): Promise<void>
}

export type DocumentDeliveryOperationContext = {
  requestId: string
  scopeRoot: string
  requirementId?: string
  nodeRunId?: string
}

export type DocumentDeliveryJournal = {
  request(input: {
    delivery: Extract<DocumentDelivery, { status: 'requested' }>
    scopeRoot: string
    requirementId?: string
    nodeRunId?: string
  }): Promise<
    | {
        status: 'created' | 'pending'
        delivery: Extract<
          DocumentDelivery,
          { status: 'requested' | 'running' }
        >
      }
    | {
        status: 'completed'
        receipt: DocumentDeliveryReceipt
        receiptId: string
      }
  >
  markRunning(
    requestId: string,
    startedAt: number
  ): Promise<Extract<DocumentDelivery, { status: 'running' }>>
  complete(
    delivery: Extract<DocumentDelivery, { status: 'succeeded' | 'failed' }>
  ): Promise<{ id: string; receipt: DocumentDeliveryReceipt }>
  listPending(): Promise<
    Array<{
      delivery: Extract<
        DocumentDelivery,
        { status: 'requested' | 'running' }
      >
      scopeRoot: string
      requirementId?: string
      nodeRunId?: string
    }>
  >
  listUnregisteredVerified(): Promise<
    Array<{
      receiptId: string
      receipt: Extract<DocumentDeliveryReceipt, { status: 'succeeded' }>
      requirementId: string
      nodeRunId: string
    }>
  >
}

export type VerifiedBinaryArtifactRegistry = {
  registerVerifiedBinary(input: {
    receiptId: string
    requirementId: string
    nodeRunId: string
    relativePath: string
    format: DocumentFormat
    checksum: string
    byteSize: number
    registeredAt: number
  }): Promise<unknown>
}

export class DocumentDeliveryServiceError extends Error {
  readonly name = 'DocumentDeliveryServiceError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class DocumentDeliveryService {
  private readonly securePaths = new SecurePathService()

  constructor(
    private readonly dependencies: {
      engine: Pick<
        SidecarClient,
        | 'createDocument'
        | 'exportDocumentPdf'
        | 'verifyDocumentArtifact'
      >
      storage: DocumentDeliveryStorage
      journal?: DocumentDeliveryJournal
      artifacts?: VerifiedBinaryArtifactRegistry
      now?: () => number
      afterFileCommit?: (artifact: DocumentArtifact) => Promise<void>
    }
  ) {}

  async create(input: {
    outputCanonicalPath: string
    outputRelativePath: string
    document: { title: string; blocks: DocumentBlock[] }
    operation?: DocumentDeliveryOperationContext
    signal: AbortSignal
  }): Promise<DocumentArtifact> {
    if (this.dependencies.journal && input.operation) {
      return this.executeJournaled({
        deliveryInput: {
          kind: 'create',
          outputPath: input.outputRelativePath,
          document: input.document
        },
        operation: input.operation,
        signal: input.signal
      })
    }
    return this.createDirect(input)
  }

  private async createDirect(input: {
    outputCanonicalPath: string
    outputRelativePath: string
    document: { title: string; blocks: DocumentBlock[] }
    signal: AbortSignal
  }): Promise<DocumentArtifact> {
    assertNotAborted(input.signal)
    await this.assertOutputAvailable(input.outputCanonicalPath)
    const generated = await this.dependencies.engine.createDocument(
      { document: input.document },
      input.signal
    )
    const candidate = validateCandidate(generated, 'docx')
    await this.commitNew(input.outputCanonicalPath, candidate.bytes)
    return {
      path: input.outputRelativePath,
      ...candidate.artifact
    }
  }

  async exportPdf(input: {
    sourceCanonicalPath: string
    sourceRelativePath: string
    sourceChecksum: string
    outputCanonicalPath: string
    outputRelativePath: string
    operation?: DocumentDeliveryOperationContext
    signal: AbortSignal
  }): Promise<DocumentArtifact> {
    if (this.dependencies.journal && input.operation) {
      return this.executeJournaled({
        deliveryInput: {
          kind: 'export_pdf',
          sourcePath: input.sourceRelativePath,
          sourceChecksum: input.sourceChecksum,
          outputPath: input.outputRelativePath
        },
        operation: input.operation,
        signal: input.signal
      })
    }
    return this.exportPdfDirect(input)
  }

  private async exportPdfDirect(input: {
    sourceCanonicalPath: string
    sourceRelativePath: string
    sourceChecksum: string
    outputCanonicalPath: string
    outputRelativePath: string
    signal: AbortSignal
  }): Promise<DocumentArtifact> {
    assertNotAborted(input.signal)
    await this.assertOutputAvailable(input.outputCanonicalPath)
    const source = Buffer.from(
      await this.dependencies.storage.read(input.sourceCanonicalPath)
    )
    if (digest(source) !== input.sourceChecksum) throw sourceConflict()
    const generated = await this.dependencies.engine.exportDocumentPdf(
      { documentBase64: source.toString('base64') },
      input.signal
    )
    const candidate = validateCandidate(generated, 'pdf')
    if (
      `sha256:${await this.dependencies.storage.checksum(
        input.sourceCanonicalPath
      )}` !== input.sourceChecksum
    ) {
      throw sourceConflict()
    }
    await this.commitNew(input.outputCanonicalPath, candidate.bytes)
    return {
      path: input.outputRelativePath,
      ...candidate.artifact
    }
  }

  async verify(input: {
    canonicalPath: string
    relativePath: string
    format: DocumentFormat
    expectedChecksum?: string
    minimumByteSize?: number
    minimumPageCount?: number
    operation?: DocumentDeliveryOperationContext
    signal: AbortSignal
  }): Promise<DocumentArtifact & { verified: true }> {
    if (this.dependencies.journal && input.operation) {
      return this.executeJournaled({
        deliveryInput: {
          kind: 'verify',
          path: input.relativePath,
          format: input.format,
          ...(input.expectedChecksum
            ? { expectedChecksum: input.expectedChecksum }
            : {}),
          ...(input.minimumByteSize
            ? { minimumByteSize: input.minimumByteSize }
            : {}),
          ...(input.minimumPageCount
            ? { minimumPageCount: input.minimumPageCount }
            : {})
        },
        operation: input.operation,
        signal: input.signal
      }) as Promise<DocumentArtifact & { verified: true }>
    }
    return this.verifyDirect(input)
  }

  private async verifyDirect(input: {
    canonicalPath: string
    relativePath: string
    format: DocumentFormat
    expectedChecksum?: string
    minimumByteSize?: number
    minimumPageCount?: number
    signal: AbortSignal
  }): Promise<DocumentArtifact & { verified: true }> {
    assertNotAborted(input.signal)
    const document = Buffer.from(
      await this.dependencies.storage.read(input.canonicalPath)
    )
    const verification =
      await this.dependencies.engine.verifyDocumentArtifact(
        {
          documentBase64: document.toString('base64'),
          format: input.format
        },
        input.signal
      )
    validateVerification(verification, input.format, document)
    if (
      (input.expectedChecksum !== undefined &&
        verification.checksum !== input.expectedChecksum) ||
      (input.minimumByteSize !== undefined &&
        verification.byteSize < input.minimumByteSize) ||
      (input.minimumPageCount !== undefined &&
        (verification.pageCount === null ||
          verification.pageCount < input.minimumPageCount))
    ) {
      throw new DocumentDeliveryServiceError(
        'artifact_verification_failed',
        'Artifact does not satisfy the requested acceptance criteria'
      )
    }
    return {
      path: input.relativePath,
      format: input.format,
      byteSize: verification.byteSize,
      checksum: verification.checksum,
      ...(verification.pageCount === null
        ? {}
        : { pageCount: verification.pageCount }),
      verified: true
    }
  }

  async recover(): Promise<void> {
    if (!this.dependencies.journal) return
    const pending = await this.dependencies.journal.listPending()
    for (const operation of pending) {
      await this.resumePending(operation).catch(() => undefined)
    }
    await this.reconcileVerifiedReceipts()
  }

  private async resumePending(input: {
    delivery: Extract<
      DocumentDelivery,
      { status: 'requested' | 'running' }
    >
    scopeRoot: string
    requirementId?: string
    nodeRunId?: string
  }): Promise<DocumentArtifact> {
    return this.executeJournaled({
      deliveryInput: input.delivery.input,
      operation: {
        requestId: input.delivery.requestId,
        scopeRoot: input.scopeRoot,
        ...(input.requirementId
          ? { requirementId: input.requirementId }
          : {}),
        ...(input.nodeRunId ? { nodeRunId: input.nodeRunId } : {})
      },
      signal: new AbortController().signal
    })
  }

  private async executeJournaled(input: {
    deliveryInput: DocumentDeliveryInput
    operation: DocumentDeliveryOperationContext
    signal: AbortSignal
  }): Promise<DocumentArtifact> {
    const journal = this.dependencies.journal!
    const requested = createDocumentDelivery({
      requestId: input.operation.requestId,
      input: input.deliveryInput,
      requestedAt: this.now()
    })
    const request = await journal.request({
      delivery: requested,
      scopeRoot: input.operation.scopeRoot,
      ...(input.operation.requirementId
        ? { requirementId: input.operation.requirementId }
        : {}),
      ...(input.operation.nodeRunId
        ? { nodeRunId: input.operation.nodeRunId }
        : {})
    })
    if (request.status === 'completed') {
      await this.registerVerifiedReceipt(
        request.receiptId,
        request.receipt,
        input.operation
      )
      return artifactFromReceipt(request.receipt)
    }
    const wasRunning = request.delivery.status === 'running'
    const running =
      request.delivery.status === 'running'
        ? request.delivery
        : await journal.markRunning(requested.requestId, this.now())
    let artifact: DocumentArtifact
    try {
      artifact = await this.performDelivery({
        input: running.input,
        scopeRoot: input.operation.scopeRoot,
        signal: input.signal,
        recoverExisting: wasRunning
      })
    } catch (error) {
      const failed = failDocumentDelivery(running, {
        completedAt: this.now(),
        errorCode:
          error instanceof DocumentDeliveryServiceError
            ? error.code
            : 'document_delivery_failed',
        message: error instanceof Error ? error.message : 'Document delivery failed'
      })
      await journal.complete(failed)
      throw error
    }
    if (
      input.deliveryInput.kind !== 'verify' &&
      this.dependencies.afterFileCommit
    ) {
      await this.dependencies.afterFileCommit(artifact)
    }
    const completed = completeDocumentDelivery(running, {
      completedAt: this.now(),
      artifact
    })
    const stored = await journal.complete(completed)
    await this.registerVerifiedReceipt(stored.id, stored.receipt, input.operation)
    return artifact
  }

  private async reconcileVerifiedReceipts(): Promise<void> {
    if (!this.dependencies.journal || !this.dependencies.artifacts) return
    const receipts =
      await this.dependencies.journal.listUnregisteredVerified()
    for (const item of receipts) {
      await this.registerVerifiedReceipt(item.receiptId, item.receipt, {
        requestId: item.receipt.requestId,
        scopeRoot: '',
        requirementId: item.requirementId,
        nodeRunId: item.nodeRunId
      })
    }
  }

  private async registerVerifiedReceipt(
    receiptId: string,
    receipt: DocumentDeliveryReceipt,
    operation: DocumentDeliveryOperationContext
  ): Promise<void> {
    if (
      receipt.status !== 'succeeded' ||
      receipt.operation !== 'verify' ||
      receipt.artifact.verified !== true ||
      !operation.requirementId ||
      !operation.nodeRunId ||
      !this.dependencies.artifacts
    ) {
      return
    }
    await this.dependencies.artifacts.registerVerifiedBinary({
      receiptId,
      requirementId: operation.requirementId,
      nodeRunId: operation.nodeRunId,
      relativePath: receipt.artifact.path,
      format: receipt.artifact.format,
      checksum: receipt.artifact.checksum,
      byteSize: receipt.artifact.byteSize,
      registeredAt: receipt.completedAt
    })
  }

  private async performDelivery(input: {
    input: DocumentDeliveryInput
    scopeRoot: string
    signal: AbortSignal
    recoverExisting: boolean
  }): Promise<DocumentArtifact> {
    const delivery = input.input
    if (delivery.kind === 'create') {
      if (input.recoverExisting) {
        const existing = await this.resolveExistingIfPresent(
          input.scopeRoot,
          delivery.outputPath
        )
        if (existing) {
          return this.verifyExisting(
            existing,
            delivery.outputPath,
            'docx',
            input.signal
          )
        }
      }
      const canonicalPath = (
        await this.securePaths.resolvePathForCreation(
          input.scopeRoot,
          delivery.outputPath
        )
      ).targetPath
      return this.createDirect({
        outputCanonicalPath: canonicalPath,
        outputRelativePath: delivery.outputPath,
        document: delivery.document,
        signal: input.signal
      })
    }
    if (delivery.kind === 'export_pdf') {
      if (input.recoverExisting) {
        const existing = await this.resolveExistingIfPresent(
          input.scopeRoot,
          delivery.outputPath
        )
        if (existing) {
          return this.verifyExisting(
            existing,
            delivery.outputPath,
            'pdf',
            input.signal
          )
        }
      }
      const outputCanonicalPath = (
        await this.securePaths.resolvePathForCreation(
          input.scopeRoot,
          delivery.outputPath
        )
      ).targetPath
      const sourceCanonicalPath = (
        await this.securePaths.resolveExistingPath(
          input.scopeRoot,
          delivery.sourcePath
        )
      ).targetPath
      return this.exportPdfDirect({
        sourceCanonicalPath,
        sourceRelativePath: delivery.sourcePath,
        sourceChecksum: delivery.sourceChecksum,
        outputCanonicalPath,
        outputRelativePath: delivery.outputPath,
        signal: input.signal
      })
    }
    const canonicalPath = (
      await this.securePaths.resolveExistingPath(
        input.scopeRoot,
        delivery.path
      )
    ).targetPath
    return this.verifyDirect({
      canonicalPath,
      relativePath: delivery.path,
      format: delivery.format,
      ...(delivery.expectedChecksum
        ? { expectedChecksum: delivery.expectedChecksum }
        : {}),
      ...(delivery.minimumByteSize
        ? { minimumByteSize: delivery.minimumByteSize }
        : {}),
      ...(delivery.minimumPageCount
        ? { minimumPageCount: delivery.minimumPageCount }
        : {}),
      signal: input.signal
    })
  }

  private async resolveExistingIfPresent(
    scopeRoot: string,
    relativePath: string
  ): Promise<string | undefined> {
    try {
      return (
        await this.securePaths.resolveExistingPath(scopeRoot, relativePath)
      ).targetPath
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  private async verifyExisting(
    canonicalPath: string,
    relativePath: string,
    format: DocumentFormat,
    signal: AbortSignal
  ): Promise<DocumentArtifact> {
    const verified = await this.verifyDirect({
      canonicalPath,
      relativePath,
      format,
      signal
    })
    const { verified: _verified, ...artifact } = verified
    return artifact
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now()
  }

  private async assertOutputAvailable(path: string): Promise<void> {
    if (await this.dependencies.storage.exists(path)) {
      throw outputConflict()
    }
  }

  private async commitNew(path: string, content: Uint8Array): Promise<void> {
    try {
      await this.dependencies.storage.commitNew({
        canonicalPath: path,
        content
      })
    } catch (error) {
      if (isAlreadyExists(error)) throw outputConflict()
      throw error
    }
  }
}

function validateCandidate(
  value: SidecarDocumentArtifact,
  format: DocumentFormat
): {
  bytes: Buffer
  artifact: Omit<DocumentArtifact, 'path'>
} {
  const bytes = Buffer.from(value.documentBase64, 'base64')
  if (
    value.format !== format ||
    value.byteSize !== bytes.byteLength ||
    value.checksum !== digest(bytes) ||
    bytes.byteLength === 0
  ) {
    throw new DocumentDeliveryServiceError(
      'document_output_invalid',
      'Document engine returned inconsistent artifact facts'
    )
  }
  return {
    bytes,
    artifact: {
      format,
      byteSize: value.byteSize,
      checksum: value.checksum,
      ...(value.pageCount === null ? {} : { pageCount: value.pageCount }),
      ...(value.converter ? { converter: value.converter } : {}),
      ...(value.quality ? { quality: value.quality } : {}),
      ...(value.warnings ? { warnings: value.warnings } : {})
    }
  }
}

function validateVerification(
  value: SidecarDocumentVerification,
  format: DocumentFormat,
  bytes: Uint8Array
): void {
  if (
    value.valid !== true ||
    value.format !== format ||
    value.byteSize !== bytes.byteLength ||
    value.checksum !== digest(bytes)
  ) {
    throw new DocumentDeliveryServiceError(
      'artifact_verification_failed',
      'Artifact verification facts do not match the stored file'
    )
  }
}

function digest(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function artifactFromReceipt(
  receipt: DocumentDeliveryReceipt
): DocumentArtifact {
  if (receipt.status === 'failed') {
    throw new DocumentDeliveryServiceError(receipt.errorCode, receipt.message)
  }
  return receipt.artifact
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Document delivery was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function sourceConflict(): DocumentDeliveryServiceError {
  return new DocumentDeliveryServiceError(
    'document_source_conflict',
    'Document source checksum conflict'
  )
}

function outputConflict(): DocumentDeliveryServiceError {
  return new DocumentDeliveryServiceError(
    'document_output_conflict',
    'Document output already exists'
  )
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
