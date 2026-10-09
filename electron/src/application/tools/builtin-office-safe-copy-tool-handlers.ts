import { extname } from 'node:path'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { OfficeSafeCopyFormat } from '../../sidecar/client'
import {
  OfficeSafeCopyError,
  type OfficeSafeCopyService
} from '../files/office-safe-copy-service'
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
const SAFE_COPY_FORMATS = new Set<OfficeSafeCopyFormat>([
  'dotx',
  'xltx',
  'potx',
  'docm',
  'dotm',
  'xlsm',
  'xltm',
  'pptm',
  'ppsm',
  'potm'
])
const MACRO_FORMATS = new Set<OfficeSafeCopyFormat>([
  'docm',
  'dotm',
  'xlsm',
  'xltm',
  'pptm',
  'ppsm',
  'potm'
])

export function createOfficeSafeCopyToolHandlers(dependencies: {
  safeCopy: Pick<OfficeSafeCopyService, 'create'>
}): BuiltinToolHandler[] {
  return [
    {
      name: 'office.create_safe_copy',
      version: VERSION,
      execute: (input) => createSafeCopy(input, dependencies.safeCopy)
    }
  ]
}

async function createSafeCopy(
  input: BuiltinToolHandlerInput,
  service: Pick<OfficeSafeCopyService, 'create'>
): Promise<JsonObject> {
  const source = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: source.targetPath,
    fileName: source.relativePath
  })
  if (
    !SAFE_COPY_FORMATS.has(capability.format as OfficeSafeCopyFormat)
  ) {
    throw new Error(
      'Office safe copy requires a supported template or macro file'
    )
  }
  const sourceFormat = capability.format as OfficeSafeCopyFormat
  const confirmMacroRemoval = optionalBoolean(
    input.arguments,
    'confirmMacroRemoval'
  )
  if (MACRO_FORMATS.has(sourceFormat) && confirmMacroRemoval !== true) {
    throw new OfficeSafeCopyError(
      'macro_removal_confirmation_required',
      'Macro removal must be explicitly confirmed'
    )
  }
  const outputExtension = `.${targetFormat(sourceFormat)}`
  const expectedSourceChecksum = requireString(
    input.arguments,
    'expectedChecksum'
  )!
  const requestedOutput = requireString(input.arguments, 'outputPath')!
  requireExpectedAbsent(input.arguments)
  await assertExpectedChecksum(source.targetPath, expectedSourceChecksum)
  if (extname(requestedOutput).toLowerCase() !== outputExtension) {
    throw new Error(`Office safe-copy output must use ${outputExtension}`)
  }
  const output = await resolveCreation(
    input.scopeRoots,
    { ...input.arguments, path: requestedOutput }
  )
  return toJsonObject(
    await service.create({
      sourceCanonicalPath: source.targetPath,
      sourceRelativePath: source.relativePath,
      expectedSourceChecksum,
      outputCanonicalPath: output.targetPath,
      outputRelativePath: output.relativePath,
      sourceFormat,
      confirmMacroRemoval: confirmMacroRemoval ?? false,
      signal: input.signal
    })
  )
}

function targetFormat(
  format: OfficeSafeCopyFormat
): 'docx' | 'xlsx' | 'pptx' {
  if (format === 'dotx' || format === 'docm' || format === 'dotm') {
    return 'docx'
  }
  if (format === 'xltx' || format === 'xlsm' || format === 'xltm') {
    return 'xlsx'
  }
  return 'pptx'
}

function optionalBoolean(
  input: JsonObject,
  key: string
): boolean | undefined {
  const value = input[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`Office safe copy ${key} is invalid`)
  }
  return value
}

function toJsonObject(value: unknown): JsonObject {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown
  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error('Office safe-copy Tool returned an invalid result')
  }
  return normalized as JsonObject
}
