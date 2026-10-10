import { createHash } from 'node:crypto'
import {
  normalizePluginPackageManifest,
  type PluginPackageManifest
} from './plugin-package'

export type ExtensionPackagePlatform = 'darwin' | 'win32' | 'linux'

export type ExtensionPackageDefinitionEntry = {
  path: string
}

export type LegacyExtensionPackageManifest = {
  schemaVersion: 1
  packageId: string
  version: string
  name: string
  description: string
  publisher: {
    name: string
    keyId?: string
  }
  compatibility: {
    realmflow: string
    platforms: ExtensionPackagePlatform[]
    architectures?: string[]
  }
  tools: ExtensionPackageDefinitionEntry[]
  skills: ExtensionPackageDefinitionEntry[]
  assets: string[]
}

export type ExtensionPackageManifest =
  | LegacyExtensionPackageManifest
  | PluginPackageManifest

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const PLATFORMS = new Set<ExtensionPackagePlatform>([
  'darwin',
  'win32',
  'linux'
])
const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'packageId',
  'version',
  'name',
  'description',
  'publisher',
  'compatibility',
  'tools',
  'skills',
  'assets'
])

export function normalizeExtensionPackageManifest(
  value: unknown
): ExtensionPackageManifest {
  const manifest = requireObject(value, 'manifest')
  if (manifest.schemaVersion === 2) {
    return normalizePluginPackageManifest(value)
  }
  requireExactKeys(manifest, MANIFEST_KEYS, 'manifest')
  if (manifest.schemaVersion !== 1) {
    throw new Error('Extension package schema version is invalid')
  }
  const tools = normalizeEntries(manifest.tools, 'tools')
  const skills = normalizeEntries(manifest.skills, 'skills')
  if (tools.length === 0 && skills.length === 0) {
    throw new Error('Extension package must declare a Tool or Skill')
  }
  const assets = normalizePaths(manifest.assets, 'assets')
  assertUniquePaths([
    ...tools.map(({ path }) => path),
    ...skills.map(({ path }) => path),
    ...assets
  ])
  return {
    schemaVersion: 1,
    packageId: requireIdentifier(manifest.packageId, 'package ID'),
    version: requireSemver(manifest.version),
    name: requireText(manifest.name, 'name'),
    description: requireText(manifest.description, 'description', true),
    publisher: normalizePublisher(manifest.publisher),
    compatibility: normalizeCompatibility(manifest.compatibility),
    tools,
    skills,
    assets
  }
}

export function calculateExtensionPackageDigest(
  files: ReadonlyArray<{ path: string; content: string | Uint8Array }>
): string {
  const normalized = files.map((file) => ({
    path: requireSafeRelativePath(file.path, 'file path'),
    content:
      typeof file.content === 'string'
        ? Buffer.from(file.content, 'utf8')
        : Buffer.from(file.content)
  }))
  const paths = normalized.map(({ path }) => path)
  if (new Set(paths).size !== paths.length) {
    throw new Error('Extension package file path is duplicated')
  }
  normalized.sort((left, right) =>
    Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8'))
  )
  const hash = createHash('sha256')
  for (const file of normalized) {
    updateLengthPrefixed(hash, Buffer.from(file.path, 'utf8'))
    updateLengthPrefixed(hash, file.content)
  }
  return hash.digest('hex')
}

function normalizePublisher(
  value: unknown
): LegacyExtensionPackageManifest['publisher'] {
  const publisher = requireObject(value, 'publisher')
  requireExactKeys(
    publisher,
    new Set(['name', 'keyId']),
    'publisher',
    new Set(['keyId'])
  )
  const keyId =
    publisher.keyId === undefined
      ? undefined
      : requireIdentifier(publisher.keyId, 'publisher key ID')
  return {
    name: requireText(publisher.name, 'publisher name'),
    ...(keyId ? { keyId } : {})
  }
}

function normalizeCompatibility(
  value: unknown
): LegacyExtensionPackageManifest['compatibility'] {
  const compatibility = requireObject(value, 'compatibility')
  requireExactKeys(
    compatibility,
    new Set(['realmflow', 'platforms', 'architectures']),
    'compatibility',
    new Set(['architectures'])
  )
  if (!Array.isArray(compatibility.platforms)) {
    throw new Error('Extension package platforms are invalid')
  }
  const platforms = [...new Set(
    compatibility.platforms.map((platform) => {
      if (typeof platform !== 'string' || !PLATFORMS.has(platform as ExtensionPackagePlatform)) {
        throw new Error('Extension package platform is invalid')
      }
      return platform as ExtensionPackagePlatform
    })
  )].sort()
  if (platforms.length === 0) {
    throw new Error('Extension package platforms are required')
  }
  const architectures =
    compatibility.architectures === undefined
      ? undefined
      : normalizeIdentifiers(compatibility.architectures, 'architectures')
  return {
    realmflow: requireText(
      compatibility.realmflow,
      'RealmFlow compatibility'
    ),
    platforms,
    ...(architectures ? { architectures } : {})
  }
}

function normalizeEntries(
  value: unknown,
  field: 'tools' | 'skills'
): ExtensionPackageDefinitionEntry[] {
  if (!Array.isArray(value)) {
    throw new Error(`Extension package ${field} are invalid`)
  }
  return value
    .map((entry) => {
      const record = requireObject(entry, `${field} entry`)
      requireExactKeys(record, new Set(['path']), `${field} entry`)
      return {
        path: requireSafeRelativePath(record.path, `${field} path`)
      }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

function normalizePaths(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Extension package ${field} are invalid`)
  }
  return value
    .map((path) => requireSafeRelativePath(path, `${field} path`))
    .sort()
}

function normalizeIdentifiers(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Extension package ${field} are invalid`)
  }
  const normalized = value.map((item) => requireIdentifier(item, field))
  return [...new Set(normalized)].sort()
}

function assertUniquePaths(paths: string[]): void {
  if (new Set(paths).size !== paths.length) {
    throw new Error('Extension package definition path is duplicated')
  }
}

function requireObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Extension package ${field} is invalid`)
  }
  return value as Record<string, unknown>
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  field: string,
  optional: Set<string> = new Set()
): void {
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    [...allowed].some((key) => !optional.has(key) && !(key in value))
  ) {
    throw new Error(`Extension package ${field} fields are invalid`)
  }
}

function requireIdentifier(value: unknown, field: string): string {
  const normalized = requireText(value, field)
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`Extension package ${field} is invalid`)
  }
  return normalized
}

function requireSemver(value: unknown): string {
  const normalized = requireText(value, 'version')
  if (!SEMVER_PATTERN.test(normalized)) {
    throw new Error('Extension package version is invalid')
  }
  return normalized
}

function requireText(
  value: unknown,
  field: string,
  allowEmpty = false
): string {
  if (typeof value !== 'string') {
    throw new Error(`Extension package ${field} is invalid`)
  }
  const normalized = value.trim()
  if ((!allowEmpty && !normalized) || normalized.includes('\0')) {
    throw new Error(`Extension package ${field} is invalid`)
  }
  return normalized
}

function requireSafeRelativePath(value: unknown, field: string): string {
  const normalized = requireText(value, field).replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    parts.some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Extension package ${field} is invalid`)
  }
  return parts.join('/')
}

function updateLengthPrefixed(
  hash: ReturnType<typeof createHash>,
  value: Buffer
): void {
  const length = Buffer.allocUnsafe(8)
  length.writeBigUInt64BE(BigInt(value.byteLength))
  hash.update(length)
  hash.update(value)
}
