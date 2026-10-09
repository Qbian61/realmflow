import type { WordComputeOperation } from '../../sidecar/client'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalWordSessionService } from '../files/local-word-session-service'
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

const OPERATIONS: WordComputeOperation[] = [
  'find',
  'insert_blocks',
  'replace_text',
  'update_style',
  'update_layout',
  'table_insert',
  'table_write',
  'comment_add',
  'comment_delete'
]

export function createWordToolHandlers(dependencies: {
  sessions: Pick<LocalWordSessionService, 'open' | 'execute' | 'save'>
}): BuiltinToolHandler[] {
  return [
    {
      name: 'document.inspect',
      version: VERSION,
      execute: (input) => inspectDocument(input, dependencies.sessions)
    },
    ...OPERATIONS.map((operation) => ({
      name: `document.${operation}`,
      version: VERSION,
      execute: (input: BuiltinToolHandlerInput) =>
        executeOperation(input, operation, dependencies.sessions)
    })),
    {
      name: 'document.save',
      version: VERSION,
      execute: (input) => saveDocument(input, dependencies.sessions)
    }
  ]
}

async function inspectDocument(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalWordSessionService, 'open'>
): Promise<JsonObject> {
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: resolved.targetPath,
    fileName: resolved.relativePath
  })
  if (
    capability.format !== 'docx' ||
    capability.preferredTool !== 'document.inspect'
  ) {
    throw new Error('Document editor requires a DOCX file')
  }
  const mode = requireString(input.arguments, 'mode', { optional: true })
  if (mode !== undefined && mode !== 'read' && mode !== 'edit') {
    throw new Error('Document Tool mode is invalid')
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
  operation: WordComputeOperation,
  sessions: Pick<LocalWordSessionService, 'execute'>
): Promise<JsonObject> {
  const sessionId = requireString(input.arguments, 'sessionId')!
  const mutating = operation !== 'find'
  const expectedRevision = mutating
    ? requireInteger(
        input.arguments,
        'expectedRevision',
        -1,
        Number.MAX_SAFE_INTEGER
      )
    : undefined
  const parameters = { ...input.arguments }
  delete parameters.sessionId
  delete parameters.expectedRevision
  delete parameters.scopeRoot
  return toJsonObject(
    await sessions.execute({
      sessionId,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
      operation,
      parameters,
      signal: input.signal
    })
  )
}

async function saveDocument(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalWordSessionService, 'save'>
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
    throw new Error('Document Tool returned an invalid result')
  }
  return normalized as JsonObject
}
