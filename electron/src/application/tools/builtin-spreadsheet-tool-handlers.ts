import type { SpreadsheetComputeOperation } from '../../sidecar/client'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LocalSpreadsheetSessionService } from '../files/local-spreadsheet-session-service'
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

const OPERATIONS: SpreadsheetComputeOperation[] = [
  'read_range',
  'insert_rows',
  'delete_rows',
  'write_range',
  'set_style',
  'set_formula',
  'sort',
  'filter',
  'chart'
]

export function createSpreadsheetToolHandlers(dependencies: {
  sessions: Pick<LocalSpreadsheetSessionService, 'open' | 'execute' | 'save'>
}): BuiltinToolHandler[] {
  return [
    {
      name: 'spreadsheet.inspect',
      version: VERSION,
      execute: (input) => inspectSpreadsheet(input, dependencies.sessions)
    },
    ...OPERATIONS.map((operation) => ({
      name: `spreadsheet.${operation}`,
      version: VERSION,
      execute: (input: BuiltinToolHandlerInput) =>
        executeOperation(input, operation, dependencies.sessions)
    })),
    {
      name: 'spreadsheet.save',
      version: VERSION,
      execute: (input) => saveSpreadsheet(input, dependencies.sessions)
    }
  ]
}

async function inspectSpreadsheet(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalSpreadsheetSessionService, 'open'>
): Promise<JsonObject> {
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: resolved.targetPath,
    fileName: resolved.relativePath
  })
  if (
    capability.preferredTool !== 'spreadsheet.inspect' ||
    !isSpreadsheetFormat(capability.format)
  ) {
    throw new Error('Spreadsheet Tool requires an XLSX, CSV, or TSV file')
  }
  const mode = requireString(input.arguments, 'mode', { optional: true })
  if (mode !== undefined && mode !== 'read' && mode !== 'edit') {
    throw new Error('Spreadsheet Tool mode is invalid')
  }
  return toJsonObject(
    await sessions.open({
      canonicalPath: resolved.targetPath,
      relativePath: resolved.relativePath,
      format: capability.format,
      mode: mode ?? 'edit',
      signal: input.signal
    })
  )
}

async function executeOperation(
  input: BuiltinToolHandlerInput,
  operation: SpreadsheetComputeOperation,
  sessions: Pick<LocalSpreadsheetSessionService, 'execute'>
): Promise<JsonObject> {
  const sessionId = requireString(input.arguments, 'sessionId')!
  const mutating = operation !== 'read_range'
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

async function saveSpreadsheet(
  input: BuiltinToolHandlerInput,
  sessions: Pick<LocalSpreadsheetSessionService, 'save'>
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

function isSpreadsheetFormat(
  value: string
): value is 'xlsx' | 'csv' | 'tsv' {
  return value === 'xlsx' || value === 'csv' || value === 'tsv'
}

function toJsonObject(value: unknown): JsonObject {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown
  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error('Spreadsheet Tool returned an invalid result')
  }
  return normalized as JsonObject
}
