import { createHash, randomUUID } from 'node:crypto'
import {
  link,
  open,
  readFile,
  rename,
  rm,
  stat
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32
} from 'node:path'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { checksumPath } from '../files/path-checksum'
import {
  SecurePathService,
  type ResolvedSecurePath
} from '../../workspace/secure-path-service'

export const securePaths = new SecurePathService()

export class FileToolError extends Error {
  readonly name = 'FileToolError'

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export function requireString(
  input: JsonObject,
  key: string,
  options: { optional?: boolean; allowEmpty?: boolean } = {}
): string | undefined {
  const value = input[key]
  if (value === undefined && options.optional) return undefined
  if (
    typeof value !== 'string' ||
    (!options.allowEmpty && !value.length)
  ) {
    throw new Error(`File Tool ${key} is invalid`)
  }
  return value
}

export function requireInteger(
  input: JsonObject,
  key: string,
  fallback: number,
  maximum: number,
  minimum = 0
): number {
  const value = input[key] ?? fallback
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`File Tool ${key} is invalid`)
  }
  return value
}

export async function resolveExisting(
  scopeRoots: string[],
  input: JsonObject,
  key = 'path',
  allowRoot = false
): Promise<ResolvedSecurePath> {
  const root = selectRoot(scopeRoots, input)
  const requestedPath =
    requireString(input, key, {
      optional: allowRoot,
      allowEmpty: allowRoot
    }) ?? ''
  if (isAbsolute(requestedPath) || win32.isAbsolute(requestedPath)) {
    return resolveAbsoluteExisting(root, requestedPath, allowRoot)
  }
  return securePaths.resolveExistingPath(root, requestedPath, allowRoot)
}

export async function resolveCreation(
  scopeRoots: string[],
  input: JsonObject,
  key = 'path'
): Promise<ResolvedSecurePath> {
  const root = selectRoot(scopeRoots, input)
  const requestedPath = requireString(input, key)!
  if (isAbsolute(requestedPath) || win32.isAbsolute(requestedPath)) {
    return resolveAbsoluteCreation(root, requestedPath)
  }
  return securePaths.resolvePathForCreation(
    root,
    requestedPath
  )
}

export function selectRoot(
  scopeRoots: string[],
  input: JsonObject
): string {
  if (scopeRoots.length === 0) {
    throw new Error('File Tool requires an authorized scope root')
  }
  const requestedRoot = requireString(input, 'scopeRoot', {
    optional: true
  })
  if (!requestedRoot) {
    if (scopeRoots.length !== 1) {
      throw new Error('File Tool scopeRoot is required')
    }
    return scopeRoots[0]!
  }
  if (requestedRoot === '.' && scopeRoots.length === 1) {
    return scopeRoots[0]!
  }
  if (!scopeRoots.includes(requestedRoot)) {
    const normalizedRoot = selectNormalizedScopeRoot(scopeRoots, requestedRoot)
    if (normalizedRoot) return normalizedRoot
    const absolutePathRoot = selectRootForAbsolutePaths(scopeRoots, input)
    if (absolutePathRoot) return absolutePathRoot
    const relativeRoot = selectRelativeScopeRoot(
      scopeRoots,
      requestedRoot,
      input
    )
    if (relativeRoot) return relativeRoot
    throw new Error('File Tool scopeRoot is not authorized')
  }
  return requestedRoot
}

function selectNormalizedScopeRoot(
  scopeRoots: string[],
  requestedRoot: string
): string | undefined {
  if (!isAbsolute(requestedRoot) && !win32.isAbsolute(requestedRoot)) {
    return undefined
  }
  const normalizedRequestedRoot = normalizeScopeRoot(requestedRoot)
  return scopeRoots.find(
    (scopeRoot) => normalizeScopeRoot(scopeRoot) === normalizedRequestedRoot
  )
}

function selectRootForAbsolutePaths(
  scopeRoots: string[],
  input: JsonObject
): string | undefined {
  const paths = absoluteRequestedPaths(input)
  if (paths.length === 0) return undefined
  return scopeRoots.find((scopeRoot) =>
    paths.every((path) => pathIsInside(normalizeScopeRoot(scopeRoot), path))
  )
}

function absoluteRequestedPaths(input: JsonObject): string[] {
  const paths: string[] = []
  for (const key of ['path', 'sourcePath', 'targetPath', 'outputPath']) {
    const value = input[key]
    if (typeof value === 'string' && isAbsolutePath(value)) {
      paths.push(normalizeSystemPathAlias(resolve(value)).normalize('NFC'))
    }
  }
  if (Array.isArray(input.paths)) {
    for (const value of input.paths) {
      if (typeof value === 'string' && isAbsolutePath(value)) {
        paths.push(normalizeSystemPathAlias(resolve(value)).normalize('NFC'))
      }
    }
  }
  return paths
}

function pathIsInside(rootPath: string, targetPath: string): boolean {
  const child = relative(rootPath, targetPath)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function isAbsolutePath(path: string): boolean {
  return isAbsolute(path) || win32.isAbsolute(path)
}

function normalizeScopeRoot(scopeRoot: string): string {
  return normalizeSystemPathAlias(resolve(scopeRoot)).normalize('NFC')
}

function selectRelativeScopeRoot(
  scopeRoots: string[],
  requestedRoot: string,
  input: JsonObject
): string | undefined {
  if (
    scopeRoots.length !== 1 ||
    isAbsolute(requestedRoot) ||
    win32.isAbsolute(requestedRoot)
  ) {
    return undefined
  }
  const normalized = requestedRoot.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || normalized === '.') return scopeRoots[0]
  try {
    const relativeRoot = securePaths.normalizeRelativePath(normalized)
    return pathAlreadyIncludesScopeRoot(input, relativeRoot)
      ? scopeRoots[0]
      : join(scopeRoots[0]!, relativeRoot)
  } catch {
    return undefined
  }
}

function pathAlreadyIncludesScopeRoot(
  input: JsonObject,
  relativeRoot: string
): boolean {
  const candidate = typeof input.path === 'string' ? input.path : undefined
  if (!candidate) return false
  const normalized = candidate.replaceAll('\\', '/')
  return normalized === relativeRoot || normalized.startsWith(`${relativeRoot}/`)
}

async function resolveAbsoluteExisting(
  rootPath: string,
  requestedPath: string,
  allowRoot: boolean
): Promise<ResolvedSecurePath> {
  const canonicalRoot = await securePaths.canonicalizeDirectory(rootPath)
  const candidate = normalizeSystemPathAlias(resolve(requestedPath))
  const targetPath = await securePaths
    .resolveExistingPath(dirname(candidate), basename(candidate), allowRoot)
    .then((resolved) => resolved.targetPath)
  securePaths.assertInside(canonicalRoot, targetPath)
  return {
    rootPath: canonicalRoot,
    targetPath,
    relativePath: relativeFromRoot(canonicalRoot, targetPath)
  }
}

async function resolveAbsoluteCreation(
  rootPath: string,
  requestedPath: string
): Promise<ResolvedSecurePath> {
  const canonicalRoot = await securePaths.canonicalizeDirectory(rootPath)
  const candidate = normalizeSystemPathAlias(resolve(requestedPath))
  securePaths.assertInside(canonicalRoot, candidate)
  const resolved = await securePaths.resolvePathForCreation(
    canonicalRoot,
    relativeFromRoot(canonicalRoot, candidate)
  )
  return resolved
}

function relativeFromRoot(rootPath: string, targetPath: string): string {
  const relativePath = relative(rootPath, targetPath)
  return relativePath === '' ? '' : relativePath.split(sep).join('/')
}

function normalizeSystemPathAlias(path: string): string {
  return path.startsWith('/var/') ? `/private${path}` : path
}

export async function checksumFile(path: string): Promise<string> {
  return checksum(await readFile(path))
}

export { checksumPath }

export async function assertExpectedChecksum(
  path: string,
  expectedChecksum: string | undefined
): Promise<void> {
  assertChecksum(expectedChecksum)
  if (!expectedChecksum || (await checksumPath(path)) !== expectedChecksum) {
    throw new FileToolError('file_conflict', 'File checksum conflict')
  }
}

export function requireExpectedAbsent(input: JsonObject): void {
  if (input.expectedAbsent !== true) {
    throw new Error('File Tool expectedAbsent must be true')
  }
}

export function checksum(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function atomicWriteText(input: {
  target: ResolvedSecurePath
  content: string
  mode: 'create' | 'replace'
  expectedChecksum?: string
}): Promise<{ bytesWritten: number; checksum: string }> {
  assertChecksum(input.expectedChecksum)
  let existingChecksum: string | undefined
  try {
    const existing = await securePaths.resolveExistingPath(
      input.target.rootPath,
      input.target.relativePath
    )
    const metadata = await stat(existing.targetPath)
    if (!metadata.isFile()) throw new Error('File Tool target is not a file')
    existingChecksum = await checksumFile(existing.targetPath)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  if (existingChecksum !== undefined) {
    if (input.mode === 'create') {
      throw new FileToolError('file_already_exists', 'File already exists')
    }
    if (!input.expectedChecksum) {
      throw new Error('Expected checksum is required for overwrite')
    }
    if (existingChecksum !== input.expectedChecksum) {
      throw new FileToolError('file_conflict', 'File checksum conflict')
    }
  } else if (input.mode === 'replace') {
    throw new FileToolError('file_not_found', 'File does not exist')
  } else if (input.expectedChecksum) {
    throw new FileToolError('file_conflict', 'File checksum conflict')
  }

  const temporaryPath = join(
    dirname(input.target.targetPath),
    `.${basename(input.target.targetPath)}.${randomUUID()}.tmp`
  )
  const bytes = Buffer.from(input.content, 'utf8')
  const handle = await open(temporaryPath, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    if (input.mode === 'create') {
      try {
        await link(temporaryPath, input.target.targetPath)
      } catch (error) {
        if (isAlreadyExists(error)) {
          throw new FileToolError('file_already_exists', 'File already exists')
        }
        throw error
      }
      await rm(temporaryPath)
    } else {
      await rename(temporaryPath, input.target.targetPath)
    }
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
  return { bytesWritten: bytes.byteLength, checksum: checksum(bytes) }
}

export function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('File Tool execution was cancelled')
    error.name = 'AbortError'
    throw error
  }
}

export function normalizeRelative(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child
}

function assertChecksum(value: string | undefined): void {
  if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('File Tool expectedChecksum is invalid')
  }
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
