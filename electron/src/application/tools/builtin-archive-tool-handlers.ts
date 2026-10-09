import { lstat, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  ArchiveFormat,
  ArchiveSourceEntry
} from '../files/archive-adapter'
import type { ArchiveService } from '../files/archive-service'
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
const ARCHIVE_FORMATS = new Set<ArchiveFormat>(['zip', 'tar', 'tgz', 'gz'])

export function createArchiveToolHandlers(dependencies: {
  archives: Pick<ArchiveService, 'list' | 'extract' | 'create'>
}): BuiltinToolHandler[] {
  return [
    {
      name: 'archives.list',
      version: VERSION,
      execute: (input) => listArchive(input, dependencies.archives)
    },
    {
      name: 'archives.extract',
      version: VERSION,
      execute: (input) => extractArchive(input, dependencies.archives)
    },
    {
      name: 'archives.create',
      version: VERSION,
      execute: (input) => createArchive(input, dependencies.archives)
    }
  ]
}

async function listArchive(
  input: BuiltinToolHandlerInput,
  service: Pick<ArchiveService, 'list'>
): Promise<JsonObject> {
  const source = await resolveArchiveSource(input)
  return toJsonObject(
    await service.list({
      sourceCanonicalPath: source.targetPath,
      sourceRelativePath: source.relativePath,
      format: source.format,
      signal: input.signal
    })
  )
}

async function extractArchive(
  input: BuiltinToolHandlerInput,
  service: Pick<ArchiveService, 'extract'>
): Promise<JsonObject> {
  const source = await resolveArchiveSource(input)
  const outputPath = requireString(input.arguments, 'outputPath')!
  const expectedSourceChecksum = requireString(
    input.arguments,
    'expectedChecksum'
  )!
  requireExpectedAbsent(input.arguments)
  await assertExpectedChecksum(source.targetPath, expectedSourceChecksum)
  const output = await resolveCreation(
    input.scopeRoots,
    { ...input.arguments, path: outputPath }
  )
  return toJsonObject(
    await service.extract({
      sourceCanonicalPath: source.targetPath,
      sourceRelativePath: source.relativePath,
      expectedSourceChecksum,
      outputCanonicalPath: output.targetPath,
      outputRelativePath: output.relativePath,
      format: source.format,
      signal: input.signal
    })
  )
}

async function createArchive(
  input: BuiltinToolHandlerInput,
  service: Pick<ArchiveService, 'create'>
): Promise<JsonObject> {
  const outputPath = requireString(input.arguments, 'outputPath')!
  const format = formatFromOutputPath(outputPath)
  const sources = sourceInputs(input.arguments, 'sources')
  requireExpectedAbsent(input.arguments)
  const output = await resolveCreation(
    input.scopeRoots,
    { ...input.arguments, path: outputPath }
  )
  const entries: ArchiveSourceEntry[] = []
  const sourceChecksums: Array<{
    canonicalPath: string
    expectedChecksum: string
  }> = []
  for (const sourceInput of sources) {
    const source = await resolveExisting(
      input.scopeRoots,
      { ...input.arguments, path: sourceInput.path }
    )
    await assertExpectedChecksum(
      source.targetPath,
      sourceInput.expectedChecksum
    )
    sourceChecksums.push({
      canonicalPath: source.targetPath,
      expectedChecksum: sourceInput.expectedChecksum
    })
    await collectSourceEntries(
      source.targetPath,
      source.relativePath,
      entries
    )
  }
  if (
    format === 'gz' &&
    (entries.length !== 1 || entries[0]?.type !== 'file')
  ) {
    throw new Error('GZ creation requires exactly one regular file')
  }
  return toJsonObject(
    await service.create({
      outputCanonicalPath: output.targetPath,
      outputRelativePath: output.relativePath,
      format,
      entries,
      sourceChecksums,
      signal: input.signal
    })
  )
}

async function resolveArchiveSource(input: BuiltinToolHandlerInput) {
  const source = await resolveExisting(input.scopeRoots, input.arguments)
  const capability = await inspectLocalFileCapability({
    path: source.targetPath,
    fileName: source.relativePath
  })
  if (
    capability.preferredTool !== 'archives.list' ||
    !ARCHIVE_FORMATS.has(capability.format as ArchiveFormat)
  ) {
    throw new Error('Archive format is not supported')
  }
  return {
    ...source,
    format: capability.format as ArchiveFormat
  }
}

async function collectSourceEntries(
  canonicalPath: string,
  archivePath: string,
  entries: ArchiveSourceEntry[]
): Promise<void> {
  const metadata = await lstat(canonicalPath)
  if (metadata.isSymbolicLink()) {
    throw new Error('Archive source links are not supported')
  }
  if (metadata.isFile()) {
    entries.push({ canonicalPath, path: archivePath, type: 'file' })
    return
  }
  if (!metadata.isDirectory()) {
    throw new Error('Archive source type is not supported')
  }
  entries.push({ canonicalPath, path: archivePath, type: 'directory' })
  const children = await readdir(canonicalPath, { withFileTypes: true })
  children.sort((left, right) => left.name.localeCompare(right.name))
  for (const child of children) {
    await collectSourceEntries(
      join(canonicalPath, child.name),
      `${archivePath}/${child.name}`,
      entries
    )
  }
}

function formatFromOutputPath(path: string): ArchiveFormat {
  const lower = basename(path).toLowerCase()
  const format = lower.endsWith('.tgz')
    ? 'tgz'
    : lower.endsWith('.tar')
      ? 'tar'
      : lower.endsWith('.zip')
        ? 'zip'
        : lower.endsWith('.gz')
          ? 'gz'
          : undefined
  if (!format) throw new Error('Archive format is not supported')
  return format
}

function sourceInputs(
  input: JsonObject,
  key: string
): Array<{ path: string; expectedChecksum: string }> {
  const value = input[key]
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 100 ||
    value.some(
      (item) =>
        !isRecord(item) ||
        typeof item.path !== 'string' ||
        item.path.length === 0 ||
        typeof item.expectedChecksum !== 'string' ||
        !/^[a-f0-9]{64}$/.test(item.expectedChecksum)
    )
  ) {
    throw new Error(`Archive Tool ${key} is invalid`)
  }
  return value as Array<{ path: string; expectedChecksum: string }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toJsonObject(value: unknown): JsonObject {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown
  if (
    typeof normalized !== 'object' ||
    normalized === null ||
    Array.isArray(normalized)
  ) {
    throw new Error('Archive Tool returned an invalid result')
  }
  return normalized as JsonObject
}
