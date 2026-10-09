import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  createDocumentDelivery,
  type CreateDocumentInput,
  type DocumentFormat
} from '../../../../domain/document-delivery'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { DocumentTextExtractor } from '../documents/local-document-text-extractor'
import type { DocumentDeliveryService } from '../files/document-delivery-service'
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

export function createDocumentToolHandlers(dependencies: {
  extractor: DocumentTextExtractor
  delivery: Pick<DocumentDeliveryService, 'create' | 'exportPdf' | 'verify'>
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
      name: 'artifact.verify',
      version: '1.0.0',
      execute: (input) => verifyArtifact(input, dependencies.delivery)
    }
  ]
}

async function readDocument(
  input: BuiltinToolHandlerInput,
  extractor: DocumentTextExtractor
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
  const chunkId = requireString(input.arguments, 'chunkId', {
    optional: true
  })
  assertNotAborted(input.signal)
  const bytes = await readFile(resolved.targetPath)
  assertNotAborted(input.signal)
  const extracted = await extractor.extract({
    bytes: Uint8Array.from(bytes),
    fileName: basename(resolved.relativePath),
    maxCharacters,
    ...(chunkId ? { chunkId } : {})
  })
  return {
    path: resolved.relativePath,
    ...extracted
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
