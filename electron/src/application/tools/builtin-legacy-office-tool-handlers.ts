import { extname } from 'node:path'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { LegacyOfficeFormat } from '../../sidecar/client'
import type { LegacyOfficeImportService } from '../files/legacy-office-import-service'
import { inspectLocalFileCapability } from '../files/local-file-capability-service'
import type {
  BuiltinToolHandler,
  BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import {
  assertExpectedChecksum,
  requireExpectedAbsent,
  requireString,
  resolveCreation,
  resolveExisting
} from './builtin-file-tool-support'

const VERSION = '1.0.0'
const LEGACY_FORMATS = new Set<LegacyOfficeFormat>([
  'doc',
  'dot',
  'wps',
  'wpt',
  'xls',
  'xlt',
  'ppt',
  'pps',
  'pot'
])

export function createLegacyOfficeToolHandlers(dependencies: {
  importer: Pick<LegacyOfficeImportService, 'import'>
}): BuiltinToolHandler[] {
  return [
    {
      name: 'office.import_legacy',
      version: VERSION,
      execute: (input) => importLegacyOffice(input, dependencies.importer)
    }
  ]
}

async function importLegacyOffice(
  input: BuiltinToolHandlerInput,
  importer: Pick<LegacyOfficeImportService, 'import'>
): Promise<JsonObject> {
  const source = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: source.targetPath,
    fileName: source.relativePath
  })
  if (
    capability.preferredTool !== 'office.import_legacy' ||
    !LEGACY_FORMATS.has(capability.format as LegacyOfficeFormat)
  ) {
    throw new Error(
      'Legacy Office import requires a supported legacy Office file'
    )
  }
  const sourceFormat = capability.format as LegacyOfficeFormat
  const targetExtension = `.${targetFormat(sourceFormat)}`
  const expectedSourceChecksum = requireString(
    input.arguments,
    'expectedChecksum'
  )!
  const requestedOutput = requireString(input.arguments, 'outputPath')!
  requireExpectedAbsent(input.arguments)
  await assertExpectedChecksum(source.targetPath, expectedSourceChecksum)
  if (extname(requestedOutput).toLowerCase() !== targetExtension) {
    throw new Error(`Legacy Office output must use ${targetExtension}`)
  }
  const output = await resolveCreation(
    input.scopeRoots,
    { ...input.arguments, path: requestedOutput }
  )
  return toJsonObject(
    await importer.import({
      sourceCanonicalPath: source.targetPath,
      sourceRelativePath: source.relativePath,
      expectedSourceChecksum,
      outputCanonicalPath: output.targetPath,
      outputRelativePath: output.relativePath,
      sourceFormat,
      signal: input.signal
    })
  )
}

function targetFormat(
  format: LegacyOfficeFormat
): 'docx' | 'xlsx' | 'pptx' {
  if (
    format === 'doc' ||
    format === 'dot' ||
    format === 'wps' ||
    format === 'wpt'
  ) {
    return 'docx'
  }
  if (format === 'xls' || format === 'xlt') return 'xlsx'
  return 'pptx'
}

function toJsonObject(value: unknown): JsonObject {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown
  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error('Legacy Office Tool returned an invalid result')
  }
  return normalized as JsonObject
}
