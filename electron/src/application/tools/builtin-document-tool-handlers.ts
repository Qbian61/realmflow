import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  createDocumentDelivery,
  type CreateDocumentInput,
  type DocumentFormat
} from '../../../../domain/document-delivery'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  ExtractedContentBundle,
  ExtractedContentUnit
} from '../../../../domain/content-extraction'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'
import type { DocumentDeliveryService } from '../files/document-delivery-service'
import type { PdfGenerationService } from '../files/pdf-generation-service'
import type {
  PdfGenerationSource,
  PdfQualityPolicy
} from '../../../../domain/pdf-generation'
import type {
  BuiltinToolHandler,
  BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import {
  assertNotAborted,
  requireInteger,
  requireExpectedAbsent,
  requireString,
  resolveCreation,
  resolveExisting
} from './builtin-file-tool-support'

const DEFAULT_MAX_CHARACTERS = 100_000
const MAX_CHARACTERS = 200_000
const DEFAULT_MAX_UNITS = 100
const MAX_UNITS = 1_000

export function createDocumentToolHandlers(dependencies: {
  extractor: Pick<LocalContentExtractionService, 'extract'>
  delivery: Pick<DocumentDeliveryService, 'create' | 'exportPdf' | 'verify'>
  pdfGeneration?: Pick<PdfGenerationService, 'generate'>
}): BuiltinToolHandler[] {
  return [
    {
      name: 'documents.read',
      version: '1.0.0',
      execute: (input) => readDocument(input, dependencies.extractor)
    },
    {
      name: 'document.create',
      version: '1.0.0',
      execute: (input) => createDocument(input, dependencies.delivery)
    },
    {
      name: 'document.export_pdf',
      version: '1.0.0',
      execute: (input) => exportPdf(input, dependencies.delivery)
    },
    {
      name: 'document.deliver_pdf',
      version: '1.0.0',
      execute: (input) => deliverPdf(input, dependencies.pdfGeneration)
    },
    {
      name: 'artifact.verify',
      version: '1.0.0',
      execute: (input) => verifyArtifact(input, dependencies.delivery)
    }
  ]
}

async function readDocument(
  input: BuiltinToolHandlerInput,
  extractor: Pick<LocalContentExtractionService, 'extract'>
): Promise<JsonObject> {
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  const maxCharacters = requireInteger(
    input.arguments,
    'maxCharacters',
    DEFAULT_MAX_CHARACTERS,
    MAX_CHARACTERS
  )
  if (maxCharacters < 1_000) {
    throw new Error('Document Tool maxCharacters is invalid')
  }
  const unitOffset = requireInteger(
    input.arguments,
    'unitOffset',
    0,
    Number.MAX_SAFE_INTEGER
  )
  const maxUnits = requireInteger(
    input.arguments,
    'maxUnits',
    DEFAULT_MAX_UNITS,
    MAX_UNITS,
    1
  )
  assertNotAborted(input.signal)
  const bytes = await readFile(resolved.targetPath)
  assertNotAborted(input.signal)
  const sourceChecksum = `sha256:${createHash('sha256')
    .update(bytes)
    .digest('hex')}`
  const extracted = await extractor.extract({
    bytes: Uint8Array.from(bytes),
    fileName: basename(resolved.relativePath),
    sourceChecksum,
    signal: input.signal,
    depth: 0,
    policy: {
      consumer: 'tool',
      allowLocalOcr: true,
      allowLocalConversion: true,
      maxCharacters: MAX_CHARACTERS,
      maxUnits: MAX_UNITS
    }
  })
  return {
    path: resolved.relativePath,
    ...pageExtractedBundle(extracted, {
      unitOffset,
      maxUnits,
      maxCharacters
    })
  }
}

function pageExtractedBundle(
  bundle: ExtractedContentBundle,
  input: {
    unitOffset: number
    maxUnits: number
    maxCharacters: number
  }
): JsonObject {
  const selected = bundle.units.slice(
    input.unitOffset,
    input.unitOffset + input.maxUnits
  )
  const units: ExtractedContentUnit[] = []
  let remainingCharacters = input.maxCharacters
  for (const unit of selected) {
    if (remainingCharacters === 0) break
    const text = unit.text.slice(0, remainingCharacters)
    if (!text) break
    units.push({ ...unit, text })
    remainingCharacters -= text.length
    if (text.length < unit.text.length) break
  }
  const nextOffset = input.unitOffset + units.length
  return {
    format: bundle.format,
    extractorVersion: bundle.extractorVersion,
    characterCount: bundle.units.reduce(
      (total, unit) => total + unit.text.length,
      0
    ),
    unitCount: bundle.units.length,
    units,
    nextUnitOffset:
      nextOffset < bundle.units.length ? nextOffset : null
  }
}

async function createDocument(
  input: BuiltinToolHandlerInput,
  service: Pick<DocumentDeliveryService, 'create'>
): Promise<JsonObject> {
  requireExpectedAbsent(input.arguments)
  const outputPath = requireString(input.arguments, 'outputPath')!
  const document = requireDocument(input.arguments.document)
  createDocumentDelivery({
    requestId: input.context.correlationId,
    input: { kind: 'create', outputPath, document },
    requestedAt: 0
  })
  const output = await resolveCreation(
    input.scopeRoots,
    { ...input.arguments, path: outputPath }
  )
  return service.create({
    outputCanonicalPath: output.targetPath,
    outputRelativePath: output.relativePath,
    document,
    operation: deliveryOperation(input, output.rootPath),
    signal: input.signal
  })
}

async function exportPdf(
  input: BuiltinToolHandlerInput,
  service: Pick<DocumentDeliveryService, 'exportPdf'>
): Promise<JsonObject> {
  requireExpectedAbsent(input.arguments)
  const sourcePath = requireString(input.arguments, 'sourcePath')!
  const sourceChecksum = requireString(input.arguments, 'sourceChecksum')!
  const outputPath = requireString(input.arguments, 'outputPath')!
  createDocumentDelivery({
    requestId: input.context.correlationId,
    input: {
      kind: 'export_pdf',
      sourcePath,
      sourceChecksum,
      outputPath
    },
    requestedAt: 0
  })
  const [source, output] = await Promise.all([
    resolveExisting(input.scopeRoots, input.arguments, 'sourcePath'),
    resolveCreation(input.scopeRoots, {
      ...input.arguments,
      path: outputPath
    })
  ])
  return service.exportPdf({
    sourceCanonicalPath: source.targetPath,
    sourceRelativePath: source.relativePath,
    sourceChecksum,
    outputCanonicalPath: output.targetPath,
    outputRelativePath: output.relativePath,
    operation: deliveryOperation(input, output.rootPath),
    signal: input.signal
  })
}

async function deliverPdf(
  input: BuiltinToolHandlerInput,
  service: Pick<PdfGenerationService, 'generate'> | undefined
): Promise<JsonObject> {
  if (!service) throw new Error('PDF generation service is unavailable')
  requireExpectedAbsent(input.arguments)
  const outputPath = requireString(input.arguments, 'outputPath')!
  const output = await resolveCreation(input.scopeRoots, {
    ...input.arguments,
    path: outputPath
  })
  const qualityPolicy = requireQualityPolicy(input.arguments.qualityPolicy)
  const minimumByteSize = optionalPositiveInteger(
    input.arguments.minimumByteSize,
    'minimumByteSize'
  )
  const minimumPageCount = optionalPositiveInteger(
    input.arguments.minimumPageCount,
    'minimumPageCount'
  )
  const requireRenderSmokeTest = optionalBoolean(
    input.arguments.requireRenderSmokeTest,
    'requireRenderSmokeTest'
  )
  const verification =
    minimumByteSize || minimumPageCount || requireRenderSmokeTest !== undefined
      ? {
          ...(minimumByteSize ? { minimumByteSize } : {}),
          ...(minimumPageCount ? { minimumPageCount } : {}),
          ...(requireRenderSmokeTest === undefined
            ? {}
            : { requireRenderSmokeTest })
        }
      : undefined
  const receipt = await service.generate(
    {
      requestId:
        input.idempotencyKey ??
        input.mutation?.idempotencyKey ??
        input.context.correlationId,
      scopeRoot: output.rootPath,
      outputPath: output.relativePath,
      expectedAbsent: true,
      source: requirePdfSource(input.arguments.source),
      qualityPolicy,
      ...(verification ? { verification } : {}),
      ...(input.context.requirementId || input.context.nodeRunId
        ? {
            operation: {
              ...(input.context.requirementId
                ? { requirementId: input.context.requirementId }
                : {}),
              ...(input.context.nodeRunId
                ? { nodeRunId: input.context.nodeRunId }
                : {})
            }
          }
        : {})
    },
    input.signal
  )
  return {
    ...receipt.artifact,
    routeDecision: receipt.route
  }
}

async function verifyArtifact(
  input: BuiltinToolHandlerInput,
  service: Pick<DocumentDeliveryService, 'verify'>
): Promise<JsonObject> {
  const path = requireString(input.arguments, 'path')!
  const format = requireFormat(input.arguments.format)
  const expectedChecksum = requireString(input.arguments, 'expectedChecksum', {
    optional: true
  })
  const minimumByteSize = optionalPositiveInteger(
    input.arguments.minimumByteSize,
    'minimumByteSize'
  )
  const minimumPageCount = optionalPositiveInteger(
    input.arguments.minimumPageCount,
    'minimumPageCount'
  )
  createDocumentDelivery({
    requestId: input.context.correlationId,
    input: {
      kind: 'verify',
      path,
      format,
      ...(expectedChecksum ? { expectedChecksum } : {}),
      ...(minimumByteSize ? { minimumByteSize } : {}),
      ...(minimumPageCount ? { minimumPageCount } : {})
    },
    requestedAt: 0
  })
  const artifact = await resolveExisting(input.scopeRoots, input.arguments)
  return service.verify({
    canonicalPath: artifact.targetPath,
    relativePath: artifact.relativePath,
    format,
    ...(expectedChecksum ? { expectedChecksum } : {}),
    ...(minimumByteSize ? { minimumByteSize } : {}),
    ...(minimumPageCount ? { minimumPageCount } : {}),
    operation: deliveryOperation(input, artifact.rootPath),
    signal: input.signal
  })
}

function deliveryOperation(
  input: BuiltinToolHandlerInput,
  scopeRoot: string
) {
  return {
    requestId:
      input.idempotencyKey ??
      input.mutation?.idempotencyKey ??
      input.context.correlationId,
    scopeRoot,
    ...(input.context.requirementId
      ? { requirementId: input.context.requirementId }
      : {}),
    ...(input.context.nodeRunId
      ? { nodeRunId: input.context.nodeRunId }
      : {})
  }
}

function requireDocument(value: unknown): CreateDocumentInput['document'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Document Tool document is invalid')
  }
  const document = value as Record<string, unknown>
  if (
    typeof document.title !== 'string' ||
    !Array.isArray(document.blocks)
  ) {
    throw new Error('Document Tool document is invalid')
  }
  return document as CreateDocumentInput['document']
}

function requireFormat(value: unknown): DocumentFormat {
  if (value !== 'docx' && value !== 'pdf') {
    throw new Error('Document Tool format is invalid')
  }
  return value
}

function requireQualityPolicy(value: unknown): PdfQualityPolicy {
  if (value === undefined) return 'require_print_layout'
  if (
    value !== 'require_print_layout' &&
    value !== 'prefer_print_layout' &&
    value !== 'allow_degraded_text'
  ) {
    throw new Error('Document Tool qualityPolicy is invalid')
  }
  return value
}

function requirePdfSource(value: unknown): PdfGenerationSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Document Tool PDF source is invalid')
  }
  const source = value as Record<string, unknown>
  if (source.kind === 'html') {
    return {
      kind: 'html',
      html: requireString(source as JsonObject, 'html')!,
      ...(typeof source.title === 'string' ? { title: source.title } : {}),
      ...(typeof source.baseUrl === 'string' ? { baseUrl: source.baseUrl } : {})
    }
  }
  if (source.kind === 'markdown') {
    return {
      kind: 'markdown',
      markdown: requireString(source as JsonObject, 'markdown')!,
      ...(typeof source.title === 'string' ? { title: source.title } : {})
    }
  }
  if (source.kind === 'document_blocks') {
    if (typeof source.title !== 'string' || !Array.isArray(source.blocks)) {
      throw new Error('Document Tool PDF source is invalid')
    }
    return {
      kind: 'document_blocks',
      title: source.title,
      blocks: source.blocks as PdfGenerationSource extends {
        kind: 'document_blocks'
      } ? PdfGenerationSource['blocks'] : never,
      ...(source.preferredLayout === 'office' ||
      source.preferredLayout === 'report'
        ? { preferredLayout: source.preferredLayout }
        : {})
    }
  }
  if (source.kind === 'docx') {
    return {
      kind: 'docx',
      sourcePath: requireString(source as JsonObject, 'sourcePath')!,
      sourceChecksum: requireString(source as JsonObject, 'sourceChecksum')!
    }
  }
  throw new Error('Document Tool PDF source is invalid')
}

function optionalBoolean(
  value: unknown,
  field: string
): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`Document Tool ${field} is invalid`)
  }
  return value
}

function optionalPositiveInteger(
  value: unknown,
  field: string
): number | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(`Document Tool ${field} is invalid`)
  }
  return value
}
