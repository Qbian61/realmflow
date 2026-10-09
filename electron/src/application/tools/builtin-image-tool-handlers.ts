import type {
  ImageFormat,
  ImageTransformOperation
} from '../files/image-adapter'
import type { LocalImageSessionService } from '../files/local-image-session-service'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { inspectLocalFileCapability } from '../files/local-file-capability-service'
import type {
  BuiltinToolHandler,
  BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import {
  requireInteger,
  requireString,
  resolveCreation,
  resolveExisting
} from './builtin-file-tool-support'

const VERSION = '1.0.0'
const IMAGE_FORMATS = new Set<ImageFormat>([
  'png',
  'jpeg',
  'webp',
  'gif',
  'svg'
])
const TRANSFORMS: ImageTransformOperation[] = [
  'resize',
  'crop',
  'rotate',
  'compress',
  'convert',
  'composite',
  'redact',
  'remove_exif'
]

export function createImageToolHandlers(dependencies: {
  sessions: Pick<
    LocalImageSessionService,
    'open' | 'transform' | 'ocr' | 'save'
  >
}): BuiltinToolHandler[] {
  return [
    {
      name: 'image.inspect',
      version: VERSION,
      execute: (input) => inspectImage(input, dependencies.sessions)
    },
    {
      name: 'image.ocr',
      version: VERSION,
      execute: (input) => recognizeImage(input, dependencies.sessions)
    },
    ...TRANSFORMS.map((operation) => ({
      name: `image.${operation}`,
      version: VERSION,
      execute: (input: BuiltinToolHandlerInput) =>
        transformImage(input, operation, dependencies.sessions)
    })),
    {
      name: 'image.save',
      version: VERSION,
      execute: (input) => saveImage(input, dependencies.sessions)
    }
  ]
}

async function inspectImage(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalImageSessionService, 'open'>
): Promise<JsonObject> {
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: resolved.targetPath,
    fileName: resolved.relativePath
  })
  if (
    capability.preferredTool !== 'image.inspect' ||
    !IMAGE_FORMATS.has(capability.format as ImageFormat)
  ) {
    throw new Error('Image editor requires a supported image file')
  }
  const mode = requireString(input.arguments, 'mode', { optional: true })
  if (mode !== undefined && mode !== 'read' && mode !== 'edit') {
    throw new Error('Image Tool mode is invalid')
  }
  return toJsonObject(
    await sessions.open({
      canonicalPath: resolved.targetPath,
      relativePath: resolved.relativePath,
      format: capability.format as ImageFormat,
      mode: mode ?? 'edit',
      signal: input.signal
    })
  )
}

async function recognizeImage(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalImageSessionService, 'ocr'>
): Promise<JsonObject> {
  return toJsonObject(
    await sessions.ocr({
      sessionId: requireString(input.arguments, 'sessionId')!,
      language: requireString(input.arguments, 'language', { optional: true }),
      modelVisionAuthorized:
        input.connectorGrants?.some(
          ({ service }) => service === 'realmflow.model-vision'
        ) ?? false,
      signal: input.signal
    })
  )
}

async function transformImage(
  input: BuiltinToolHandlerInput,
  operation: ImageTransformOperation,
  sessions: Pick<LocalImageSessionService, 'transform'>
): Promise<JsonObject> {
  const parameters = { ...input.arguments }
  delete parameters.sessionId
  delete parameters.expectedRevision
  delete parameters.scopeRoot
  delete parameters.modelVisionAuthorized
  return toJsonObject(
    await sessions.transform({
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

async function saveImage(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalImageSessionService, 'save'>
): Promise<JsonObject> {
  const outputPath = requireString(input.arguments, 'path', { optional: true })
  const output = outputPath
    ? await resolveCreation(input.scopeRoots, input.arguments)
    : undefined
  return toJsonObject(
    await sessions.save({
      sessionId: requireString(input.arguments, 'sessionId')!,
      expectedRevision: requireInteger(
        input.arguments,
        'expectedRevision',
        -1,
        Number.MAX_SAFE_INTEGER
      ),
      ...(output
        ? {
            output: {
              canonicalPath: output.targetPath,
              relativePath: output.relativePath
            }
          }
        : {}),
      signal: input.signal
    })
  )
}

function toJsonObject(value: unknown): JsonObject {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown
  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error('Image Tool returned an invalid result')
  }
  return normalized as JsonObject
}
