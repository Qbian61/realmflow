import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat
} from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import {
  classifyLocalFileCapability,
  type LocalFileCapability
} from '../../../../domain/local-file-capability'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { validateTextFileContent } from '../files/adapters/text-adapter'
import { inspectLocalFileCapability } from '../files/local-file-capability-service'
import type {
  BuiltinToolHandler,
  BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import {
  assertExpectedChecksum,
  assertNotAborted,
  atomicWriteText,
  checksumPath,
  normalizeRelative,
  requireInteger,
  requireExpectedAbsent,
  requireString,
  resolveCreation,
  resolveExisting
} from './builtin-file-tool-support'
import { searchFiles } from './builtin-file-search'

const VERSION = '1.0.0'
const MAX_READ_BYTES = 1024 * 1024

export type FileToolDependencies = {
  trashItem(path: string): Promise<void>
}

export function createFileToolHandlers(
  dependencies: FileToolDependencies
): BuiltinToolHandler[] {
  const handlers: Record<
    string,
    (input: BuiltinToolHandlerInput) => Promise<JsonObject>
  > = {
    'files.list': listFiles,
    'files.read': readText,
    'files.search': searchFiles,
    'files.stat': inspectPath,
    'files.create_directory': createDirectory,
    'files.write': writeText,
    'files.apply_patch': applyPatch,
    'files.copy': copyPath,
    'files.move': movePath,
    'files.trash': (input) => trashPath(input, dependencies),
    'files.delete_permanently': deletePermanently
  }
  return Object.entries(handlers).map(([name, execute]) => ({
    name,
    version: VERSION,
    execute
  }))
}

async function listFiles(input: BuiltinToolHandlerInput): Promise<JsonObject> {
  const resolved = await resolveExisting(
    input.scopeRoots,
    input.arguments,
    'path',
    true
  )
  assertNotAborted(input.signal)
  const entries = await readdir(resolved.targetPath, { withFileTypes: true })
  const result = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const metadata = await lstat(`${resolved.targetPath}/${entry.name}`)
        const capability = entry.isFile()
          ? await inspectLocalFileCapability({
              path: `${resolved.targetPath}/${entry.name}`,
              fileName: entry.name
            })
          : undefined
        return {
          name: entry.name,
          path: normalizeRelative(resolved.relativePath, entry.name),
          type: entryType(entry),
          size: metadata.size,
          ...(capability ? capabilitySummary(capability) : {})
        }
      })
  )
  return { path: resolved.relativePath, entries: result }
}

async function readText(input: BuiltinToolHandlerInput): Promise<JsonObject> {
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  const offset = requireInteger(
    input.arguments,
    'offset',
    0,
    Number.MAX_SAFE_INTEGER
  )
  const limit = requireInteger(
    input.arguments,
    'limit',
    64 * 1024,
    MAX_READ_BYTES
  )
  if (limit < 1) throw new Error('File Tool limit is invalid')
  assertNotAborted(input.signal)
  const content = await readFile(resolved.targetPath)
  const capability = classifyLocalFileCapability({
    fileName: resolved.relativePath,
    head: content.subarray(0, 8 * 1024)
  })
  if (capability.readMode !== 'text') {
    throw new Error(
      capability.preferredTool
        ? `Use ${capability.preferredTool} for this file`
        : 'File Tool only reads text files'
    )
  }
  const { text, end } = decodeUtf8Chunk(content, offset, limit)
  return {
    path: resolved.relativePath,
    content: text,
    offset,
    nextOffset: end,
    truncated: end < content.byteLength,
    totalBytes: content.byteLength
  }
}

async function inspectPath(
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  if (Array.isArray(input.arguments.paths)) {
    const paths = normalizePaths(input.arguments.paths)
    assertNotAborted(input.signal)
    const files = []
    for (const path of paths) {
      try {
        files.push(await inspectOnePath(input, path))
      } catch (error) {
        files.push({
          path,
          error: fileErrorSummary(error)
        })
      }
    }
    return { files }
  }
  if (input.arguments.paths !== undefined) {
    throw new Error('File Tool paths are invalid')
  }
  return inspectOnePath(input)
}

async function inspectOnePath(
  input: BuiltinToolHandlerInput,
  path?: string
): Promise<JsonObject> {
  const target = path
    ? await resolveExisting(input.scopeRoots, {
        ...input.arguments,
        path
      })
    : await resolveExisting(input.scopeRoots, input.arguments)
  assertNotAborted(input.signal)
  const metadata = await stat(target.targetPath)
  const capability = metadata.isFile()
    ? await inspectLocalFileCapability({
        path: target.targetPath,
        fileName: target.relativePath
      })
    : undefined
  return {
    path: target.relativePath,
    type: metadata.isFile()
      ? 'file'
      : metadata.isDirectory()
        ? 'directory'
        : 'other',
    size: metadata.size,
    modifiedAt: Math.round(metadata.mtimeMs),
    createdAt: Math.round(metadata.birthtimeMs),
    checksum: await checksumPath(target.targetPath),
    ...(capability
      ? {
          ...capabilitySummary(capability)
        }
      : {})
  }
}

function normalizePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error('File Tool paths are invalid')
  }
  const paths = value.map((path) => {
    if (typeof path !== 'string' || !path) {
      throw new Error('File Tool paths are invalid')
    }
    return path
  })
  if (new Set(paths).size !== paths.length) {
    throw new Error('File Tool paths are duplicated')
  }
  return paths
}

function capabilitySummary(capability: LocalFileCapability): JsonObject {
  return {
    format: capability.format,
    readMode: capability.readMode,
    writable: capability.writable,
    preferredTool: capability.preferredTool,
    conversionRequired: capability.conversionRequired
  }
}

function fileErrorSummary(error: unknown): JsonObject {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    const code =
      error.code === 'ENOENT'
        ? 'file_not_found'
        : error.code.startsWith('file_')
          ? error.code
          : error.code === 'PATH_OUTSIDE_ROOT' || error.code === 'INVALID_PATH'
            ? 'file_path_outside_root'
            : 'file_inspection_failed'
    return {
      code,
      message: publicFileErrorMessage(code)
    }
  }
  return {
    code: 'file_inspection_failed',
    message: 'File inspection failed'
  }
}

function publicFileErrorMessage(code: string): string {
  if (code === 'file_not_found') return 'File does not exist'
  if (code === 'file_path_outside_root') {
    return 'Path is outside the bound workspace'
  }
  if (code === 'file_conflict') return 'File checksum conflict'
  if (code === 'file_already_exists') return 'File already exists'
  return 'File inspection failed'
}

async function createDirectory(
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  requireExpectedAbsent(input.arguments)
  const resolved = await resolveCreation(input.scopeRoots, input.arguments)
  assertNotAborted(input.signal)
  await mkdir(resolved.targetPath, { recursive: true })
  return { path: resolved.relativePath, created: true }
}

async function writeText(input: BuiltinToolHandlerInput): Promise<JsonObject> {
  const resolved = await resolveCreation(input.scopeRoots, input.arguments)
  const content = requireString(input.arguments, 'content', {
    allowEmpty: true
  })!
  const mode = requireWriteMode(input.arguments.mode)
  const expectedChecksum = requireString(
    input.arguments,
    'expectedChecksum',
    { optional: true }
  )
  if (mode === 'create') requireExpectedAbsent(input.arguments)
  assertNotAborted(input.signal)
  validateTextFileContent(resolved.relativePath, content)
  const written = await atomicWriteText({
    target: resolved,
    content,
    mode,
    expectedChecksum
  })
  return { path: resolved.relativePath, ...written }
}

async function applyPatch(input: BuiltinToolHandlerInput): Promise<JsonObject> {
  const existing = await resolveExisting(input.scopeRoots, input.arguments)
  const target = await resolveCreation(input.scopeRoots, input.arguments)
  const expectedChecksum = requireString(
    input.arguments,
    'expectedChecksum'
  )!
  const edits = normalizeEdits(input.arguments.edits)
  assertNotAborted(input.signal)
  let content = await readFile(existing.targetPath, 'utf8')
  let replacements = 0
  for (const edit of edits) {
    const occurrences = countOccurrences(content, edit.oldText)
    if (occurrences === 0) {
      throw new Error('Patch prior content does not match')
    }
    if (!edit.replaceAll && occurrences !== 1) {
      throw new Error('Patch prior content is ambiguous')
    }
    content = edit.replaceAll
      ? content.split(edit.oldText).join(edit.newText)
      : content.replace(edit.oldText, edit.newText)
    replacements += edit.replaceAll ? occurrences : 1
  }
  validateTextFileContent(target.relativePath, content)
  const written = await atomicWriteText({
    target,
    content,
    mode: 'replace',
    expectedChecksum
  })
  return { path: target.relativePath, replacements, ...written }
}

async function copyPath(input: BuiltinToolHandlerInput): Promise<JsonObject> {
  const source = await resolveExisting(
    input.scopeRoots,
    input.arguments,
    'sourcePath'
  )
  const target = await resolveCreation(
    input.scopeRoots,
    input.arguments,
    'targetPath'
  )
  requireExpectedAbsent(input.arguments)
  await assertExpectedChecksum(
    source.targetPath,
    requireString(input.arguments, 'expectedChecksum')
  )
  assertNotAborted(input.signal)
  await cp(source.targetPath, target.targetPath, {
    recursive: true,
    force: false,
    errorOnExist: true
  })
  return {
    sourcePath: source.relativePath,
    targetPath: target.relativePath,
    copied: true
  }
}

async function movePath(input: BuiltinToolHandlerInput): Promise<JsonObject> {
  const source = await resolveExisting(
    input.scopeRoots,
    input.arguments,
    'sourcePath'
  )
  const target = await resolveCreation(
    input.scopeRoots,
    input.arguments,
    'targetPath'
  )
  requireExpectedAbsent(input.arguments)
  await assertExpectedChecksum(
    source.targetPath,
    requireString(input.arguments, 'expectedChecksum')
  )
  assertNotAborted(input.signal)
  await assertMissing(target.targetPath)
  await rename(source.targetPath, target.targetPath)
  return {
    sourcePath: source.relativePath,
    targetPath: target.relativePath,
    moved: true
  }
}

async function trashPath(
  input: BuiltinToolHandlerInput,
  dependencies: FileToolDependencies
): Promise<JsonObject> {
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  await assertExpectedChecksum(
    resolved.targetPath,
    requireString(input.arguments, 'expectedChecksum')
  )
  assertNotAborted(input.signal)
  await dependencies.trashItem(resolved.targetPath)
  return { path: resolved.relativePath, trashed: true }
}

async function deletePermanently(
  input: BuiltinToolHandlerInput
): Promise<JsonObject> {
  if (input.requestedBy.type !== 'user') {
    throw new Error('Permanent deletion requires a local user request')
  }
  const resolved = await resolveExisting(input.scopeRoots, input.arguments)
  await assertExpectedChecksum(
    resolved.targetPath,
    requireString(input.arguments, 'expectedChecksum')
  )
  assertNotAborted(input.signal)
  await rm(resolved.targetPath, { recursive: true, force: false })
  return { path: resolved.relativePath, deleted: true }
}

function normalizeEdits(value: unknown): Array<{
  oldText: string
  newText: string
  replaceAll: boolean
}> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error('File Tool edits are invalid')
  }
  return value.map((edit) => {
    if (
      !isRecord(edit) ||
      typeof edit.oldText !== 'string' ||
      !edit.oldText ||
      typeof edit.newText !== 'string' ||
      (edit.replaceAll !== undefined && typeof edit.replaceAll !== 'boolean')
    ) {
      throw new Error('File Tool edit is invalid')
    }
    return {
      oldText: edit.oldText,
      newText: edit.newText,
      replaceAll: edit.replaceAll === true
    }
  })
}

function countOccurrences(content: string, search: string): number {
  return content.split(search).length - 1
}

function requireWriteMode(value: unknown): 'create' | 'replace' {
  if (value === 'create' || value === 'replace') return value
  throw new Error('File Tool mode is invalid')
}

function decodeUtf8Chunk(
  content: Uint8Array,
  offset: number,
  limit: number
): { text: string; end: number } {
  if (offset < content.byteLength && isUtf8ContinuationByte(content[offset]!)) {
    throw new Error('File Tool offset must be a UTF-8 boundary')
  }
  let end = Math.min(content.byteLength, offset + limit)
  while (
    end < content.byteLength &&
    isUtf8ContinuationByte(content[end]!)
  ) {
    end += 1
  }
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(
        content.subarray(offset, end)
      ),
      end
    }
  } catch {
    throw new Error('File Tool only reads UTF-8 text files')
  }
}

function isUtf8ContinuationByte(value: number): boolean {
  return (value & 0xc0) === 0x80
}

function entryType(entry: Dirent): string {
  if (entry.isFile()) return 'file'
  if (entry.isDirectory()) return 'directory'
  if (entry.isSymbolicLink()) return 'symlink'
  return 'other'
}

async function assertMissing(path: string): Promise<void> {
  try {
    await lstat(path)
    throw new Error('File Tool target already exists')
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return
    }
    throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
