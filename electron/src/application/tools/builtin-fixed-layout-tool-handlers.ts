import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { FixedLayoutService } from '../files/fixed-layout-service'
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

export function createFixedLayoutToolHandlers(dependencies: {
  fixedLayout: Pick<FixedLayoutService, 'inspect' | 'ocr'>
}): BuiltinToolHandler[] {
  return [
    {
      name: 'fixed_layout.inspect',
      version: VERSION,
      execute: (input) => inspectFixedLayout(input, dependencies.fixedLayout)
    },
    {
      name: 'fixed_layout.ocr',
      version: VERSION,
      execute: (input) => recognizeFixedLayout(input, dependencies.fixedLayout)
    }
  ]
}

async function inspectFixedLayout(
  input: BuiltinToolHandlerInput,
  service: Pick<FixedLayoutService, 'inspect'>
): Promise<JsonObject> {
  const source = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: source.targetPath,
    fileName: source.relativePath
  })
  if (
    capability.format !== 'ofd' ||
    capability.preferredTool !== 'fixed_layout.inspect'
  ) {
    throw new Error('Fixed-layout inspection requires an OFD file')
  }
  return toJsonObject(
    await service.inspect({
      sourceCanonicalPath: source.targetPath,
      sourceRelativePath: source.relativePath,
      signal: input.signal
    })
  )
}

async function recognizeFixedLayout(
  input: BuiltinToolHandlerInput,
  service: Pick<FixedLayoutService, 'ocr'>
): Promise<JsonObject> {
  const source = await resolveOfdSource(input)
  const language = requireString(input.arguments, 'language', {
    optional: true
  })
  return toJsonObject(
    await service.ocr({
      sourceCanonicalPath: source.targetPath,
      sourceRelativePath: source.relativePath,
      pageNumber: requireInteger(input.arguments, 'pageNumber', -1, 2_000),
      ...(language ? { language } : {}),
      maxDimension: requireInteger(
        input.arguments,
        'maxDimension',
        2_000,
        2_400
      ),
      signal: input.signal
    })
  )
}

async function resolveOfdSource(input: BuiltinToolHandlerInput) {
  const source = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: source.targetPath,
    fileName: source.relativePath
  })
  if (
    capability.format !== 'ofd' ||
    capability.preferredTool !== 'fixed_layout.inspect'
  ) {
    throw new Error('Fixed-layout inspection requires an OFD file')
  }
  return source
}

function toJsonObject(value: unknown): JsonObject {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown
  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error('Fixed-layout Tool returned an invalid result')
  }
  return normalized as JsonObject
}
