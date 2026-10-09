import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  OfficeOriginalFormat,
  OfficeReadOnlySessionService
} from '../files/office-read-only-session-service'
import { inspectLocalFileCapability } from '../files/local-file-capability-service'
import type {
  BuiltinToolHandler,
  BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import { resolveExisting } from './builtin-file-tool-support'

const VERSION = '1.0.0'
const ORIGINAL_FORMATS = new Set<OfficeOriginalFormat>([
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

export function createOfficeReadOnlyToolHandlers(dependencies: {
  sessions: Pick<OfficeReadOnlySessionService, 'open'>
}): BuiltinToolHandler[] {
  return [
    {
      name: 'office.inspect_original',
      version: VERSION,
      execute: (input) => inspectOriginal(input, dependencies.sessions)
    }
  ]
}

async function inspectOriginal(
  input: BuiltinToolHandlerInput,
  sessions: Pick<OfficeReadOnlySessionService, 'open'>
): Promise<JsonObject> {
  const source = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: source.targetPath,
    fileName: source.relativePath
  })
  if (
    capability.preferredTool !== 'office.inspect_original' ||
    !ORIGINAL_FORMATS.has(capability.format as OfficeOriginalFormat)
  ) {
    throw new Error(
      'Office original reader requires a template or macro file'
    )
  }
  return toJsonObject(
    await sessions.open({
      canonicalPath: source.targetPath,
      relativePath: source.relativePath,
      sourceFormat: capability.format as OfficeOriginalFormat,
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
    throw new Error('Office original reader returned an invalid result')
  }
  return normalized as JsonObject
}
