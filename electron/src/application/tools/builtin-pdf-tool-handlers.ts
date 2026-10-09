import { readFile } from 'node:fs/promises'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { PdfOperation } from '../files/pdf-adapter'
import type { LocalPdfSessionService } from '../files/local-pdf-session-service'
import { inspectLocalFileCapability } from '../files/local-file-capability-service'
import type {
  BuiltinToolHandler,
  BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import {
  requireInteger,
  requireString,
  resolveExisting
} from './builtin-file-tool-support'

const VERSION = '1.0.0'
const MUTATIONS: PdfOperation[] = [
  'merge',
  'split',
  'rotate',
  'watermark',
  'form_fill',
  'annotation_add'
]

type PdfSessions = Pick<
  LocalPdfSessionService,
  'open' | 'thumbnail' | 'ocr' | 'mutate' | 'save'
>

export function createPdfToolHandlers(dependencies: {
  sessions: PdfSessions
}): BuiltinToolHandler[] {
  return [
    {
      name: 'pdf.inspect',
      version: VERSION,
      execute: (input) => inspectPdf(input, dependencies.sessions)
    },
    {
      name: 'pdf.thumbnail',
      version: VERSION,
      execute: (input) => renderThumbnail(input, dependencies.sessions)
    },
    {
      name: 'pdf.ocr',
      version: VERSION,
      execute: (input) => recognizePage(input, dependencies.sessions)
    },
    ...MUTATIONS.map((operation) => ({
      name: `pdf.${operation}`,
      version: VERSION,
      execute: (input: BuiltinToolHandlerInput) =>
        mutatePdf(input, operation, dependencies.sessions)
    })),
    {
      name: 'pdf.save',
      version: VERSION,
      execute: (input) => savePdf(input, dependencies.sessions)
    }
  ]
}

async function inspectPdf(
  input: BuiltinToolHandlerInput,
  sessions: PdfSessions
): Promise<JsonObject> {
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: resolved.targetPath,
    fileName: resolved.relativePath
  })
  if (capability.format !== 'pdf') {
    throw new Error('PDF Tool requires a PDF file')
  }
  const mode = requireString(input.arguments, 'mode', { optional: true })
  if (mode !== undefined && mode !== 'read' && mode !== 'edit') {
    throw new Error('PDF Tool mode is invalid')
  }
  return toJsonObject(
    await sessions.open({
      canonicalPath: resolved.targetPath,
      relativePath: resolved.relativePath,
      mode: mode ?? 'read',
      signal: input.signal
    })
  )
}

async function renderThumbnail(
  input: BuiltinToolHandlerInput,
  sessions: PdfSessions
): Promise<JsonObject> {
  return toJsonObject(
    await sessions.thumbnail({
      sessionId: requireString(input.arguments, 'sessionId')!,
      pageNumber: positiveInteger(input.arguments, 'pageNumber'),
      maxDimension: optionalPositiveInteger(
        input.arguments,
        'maxDimension',
        2048
      ),
      signal: input.signal
    })
  )
}

async function recognizePage(
  input: BuiltinToolHandlerInput,
  sessions: PdfSessions
): Promise<JsonObject> {
  return toJsonObject(
    await sessions.ocr({
      sessionId: requireString(input.arguments, 'sessionId')!,
      pageNumber: positiveInteger(input.arguments, 'pageNumber'),
      language: requireString(input.arguments, 'language', {
        optional: true
      }),
      maxDimension: optionalPositiveInteger(
        input.arguments,
        'maxDimension',
        2048
      ),
      signal: input.signal
    })
  )
}

async function mutatePdf(
  input: BuiltinToolHandlerInput,
  operation: PdfOperation,
  sessions: PdfSessions
): Promise<JsonObject> {
  const parameters: Record<string, unknown> =
    operation === 'merge'
      ? await resolveMergeSources(input)
      : mutationParameters(input.arguments, operation)
  return toJsonObject(
    await sessions.mutate({
      sessionId: requireString(input.arguments, 'sessionId')!,
      expectedRevision: requireInteger(
        input.arguments,
        'expectedRevision',
        -1,
        Number.MAX_SAFE_INTEGER
      ),
      operation,
      parameters,
      signal: input.signal
    })
  )
}

async function resolveMergeSources(
  input: BuiltinToolHandlerInput
): Promise<Record<string, unknown>> {
  const paths = stringArray(input.arguments.paths, 'paths')
  const sources: Buffer[] = []
  const sourcePaths: string[] = []
  for (const path of paths) {
    const resolved = await resolveExisting(
      input.scopeRoots,
      {
        path,
        ...(typeof input.arguments.scopeRoot === 'string'
          ? { scopeRoot: input.arguments.scopeRoot }
          : {})
      }
    )
    const capability = await inspectLocalFileCapability({
      path: resolved.targetPath,
      fileName: resolved.relativePath
    })
    if (capability.format !== 'pdf') {
      throw new Error('PDF merge source must be a PDF file')
    }
    sources.push(await readFile(resolved.targetPath))
    sourcePaths.push(resolved.relativePath)
  }
  return { sources, sourcePaths }
}

function mutationParameters(
  input: JsonObject,
  operation: PdfOperation
): Record<string, unknown> {
  if (operation === 'split') {
    return { pageNumbers: integerArray(input.pageNumbers, 'pageNumbers') }
  }
  if (operation === 'rotate') {
    return {
      pageNumbers: integerArray(input.pageNumbers, 'pageNumbers'),
      angle: positiveInteger(input, 'angle')
    }
  }
  if (operation === 'watermark') {
    return {
      pageNumbers: integerArray(input.pageNumbers, 'pageNumbers'),
      text: requireString(input, 'text')!,
      ...(numberValue(input.fontSize, 'fontSize') === undefined
        ? {}
        : { fontSize: numberValue(input.fontSize, 'fontSize') }),
      ...(numberValue(input.opacity, 'opacity') === undefined
        ? {}
        : { opacity: numberValue(input.opacity, 'opacity') }),
      ...(numberValue(input.angle, 'angle') === undefined
        ? {}
        : { angle: numberValue(input.angle, 'angle') })
    }
  }
  if (operation === 'form_fill') {
    return { fields: objectValue(input.fields, 'fields') }
  }
  return {
    pageNumber: positiveInteger(input, 'pageNumber'),
    text: requireString(input, 'text')!,
    x: numberValue(input.x, 'x', true)!,
    y: numberValue(input.y, 'y', true)!
  }
}

async function savePdf(
  input: BuiltinToolHandlerInput,
  sessions: PdfSessions
): Promise<JsonObject> {
  return toJsonObject(
    await sessions.save({
      sessionId: requireString(input.arguments, 'sessionId')!,
      expectedRevision: requireInteger(
        input.arguments,
        'expectedRevision',
        -1,
        Number.MAX_SAFE_INTEGER
      ),
      signal: input.signal
    })
  )
}

function positiveInteger(input: JsonObject, key: string): number {
  const value = requireInteger(input, key, -1, Number.MAX_SAFE_INTEGER)
  if (value < 1) throw new Error(`PDF Tool ${key} is invalid`)
  return value
}

function optionalPositiveInteger(
  input: JsonObject,
  key: string,
  maximum: number
): number | undefined {
  if (input[key] === undefined) return undefined
  const value = requireInteger(input, key, -1, maximum)
  if (value < 1) throw new Error(`PDF Tool ${key} is invalid`)
  return value
}

function stringArray(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.some((item) => typeof item !== 'string' || !item)
  ) {
    throw new Error(`PDF Tool ${name} is invalid`)
  }
  return value
}

function integerArray(value: unknown, name: string): number[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.some((item) => !Number.isSafeInteger(item) || item < 1)
  ) {
    throw new Error(`PDF Tool ${name} is invalid`)
  }
  return value
}

function numberValue(
  value: unknown,
  name: string,
  required = false
): number | undefined {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`PDF Tool ${name} is invalid`)
  }
  return value
}

function objectValue(
  value: unknown,
  name: string
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`PDF Tool ${name} is invalid`)
  }
  return value as Record<string, unknown>
}

function toJsonObject(value: unknown): JsonObject {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown
  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error('PDF Tool returned an invalid result')
  }
  return normalized as JsonObject
}
