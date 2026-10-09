import { readFile } from 'node:fs/promises'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { PresentationComputeOperation } from '../../sidecar/client'
import type { LocalPresentationSessionService } from '../files/local-presentation-session-service'
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
const IMAGE_OPERATIONS = new Set<PresentationComputeOperation>([
  'replace_image',
  'add_image'
])
const OPERATIONS: PresentationComputeOperation[] = [
  'update_text',
  'replace_image',
  'table_write',
  'chart_write',
  'add_slide',
  'copy_slide',
  'delete_slide',
  'reorder_slide',
  'add_text',
  'add_image',
  'add_table',
  'add_chart',
  'reorder_shape',
  'update_size'
]

export function createPresentationToolHandlers(dependencies: {
  sessions: Pick<
    LocalPresentationSessionService,
    'open' | 'execute' | 'save'
  >
}): BuiltinToolHandler[] {
  return [
    {
      name: 'presentation.inspect',
      version: VERSION,
      execute: (input) => inspectPresentation(input, dependencies.sessions)
    },
    ...OPERATIONS.map((operation) => ({
      name: `presentation.${operation}`,
      version: VERSION,
      execute: (input: BuiltinToolHandlerInput) =>
        executeOperation(input, operation, dependencies.sessions)
    })),
    {
      name: 'presentation.save',
      version: VERSION,
      execute: (input) => savePresentation(input, dependencies.sessions)
    }
  ]
}

async function inspectPresentation(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalPresentationSessionService, 'open'>
): Promise<JsonObject> {
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: resolved.targetPath,
    fileName: resolved.relativePath
  })
  if (
    capability.format !== 'pptx' ||
    capability.preferredTool !== 'presentation.inspect'
  ) {
    throw new Error('Presentation editor requires a PPTX file')
  }
  const mode = requireString(input.arguments, 'mode', { optional: true })
  if (mode !== undefined && mode !== 'read' && mode !== 'edit') {
    throw new Error('Presentation Tool mode is invalid')
  }
  return toJsonObject(
    await sessions.open({
      canonicalPath: resolved.targetPath,
      relativePath: resolved.relativePath,
      mode: mode ?? 'edit',
      signal: input.signal
    })
  )
}

async function executeOperation(
  input: BuiltinToolHandlerInput,
  operation: PresentationComputeOperation,
  sessions: Pick<LocalPresentationSessionService, 'execute'>
): Promise<JsonObject> {
  const parameters: Record<string, unknown> = { ...input.arguments }
  delete parameters.sessionId
  delete parameters.expectedRevision
  delete parameters.scopeRoot
  if (IMAGE_OPERATIONS.has(operation)) {
    const image = await resolveExisting(
      input.scopeRoots,
      input.arguments,
      'imagePath'
    )
    const capability = await inspectLocalFileCapability({
      path: image.targetPath,
      fileName: image.relativePath
    })
    if (
      capability.preferredTool !== 'image.inspect' ||
      capability.format === 'svg' ||
      capability.format === 'gif'
    ) {
      throw new Error(
        'Presentation image requires a PNG, JPEG, or WebP file'
      )
    }
    parameters.imageBase64 = (
      await readFile(image.targetPath)
    ).toString('base64')
    delete parameters.imagePath
  }
  return toJsonObject(
    await sessions.execute({
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

async function savePresentation(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalPresentationSessionService, 'save'>
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

function toJsonObject(value: unknown): JsonObject {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown
  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error('Presentation Tool returned an invalid result')
  }
  return normalized as JsonObject
}
