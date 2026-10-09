import type { ToolCapability } from './tool-definition'

export type SkillPermission = Extract<
  ToolCapability,
  | 'filesystem.read'
  | 'filesystem.write'
  | 'process.execute'
  | 'repository.modify'
>

export type SkillEntry = {
  kind: 'prompt' | 'python'
  path: string
}

export type SkillNetworkRequirement = {
  required: boolean
  services: string[]
}

export type SkillResourceLimits = {
  timeoutMs: number
  maxMemoryMb: number
  maxOutputBytes: number
}

export type JsonObject = Record<string, unknown>

export type SkillManifest = {
  schemaVersion: 1
  id: string
  version: string
  name: string
  description: string
  entry: SkillEntry
  inputSchema: JsonObject
  outputSchema: JsonObject
  permissions: SkillPermission[]
  network: SkillNetworkRequirement
  resources: SkillResourceLimits
}

export type SkillVersionSource = {
  type: 'local_directory'
  displayName: string
}

export type SkillVersion = Omit<
  SkillManifest,
  'schemaVersion' | 'id'
> & {
  id: string
  skillId: string
  source: SkillVersionSource
  managedRelativePath: string
  checksum: string
  byteSize: number
  fileCount: number
  installedAt: number
}

export type SkillIntegrityStatus = 'verified' | 'corrupted' | 'missing'

export type SkillIntegrity = {
  status: SkillIntegrityStatus
  checkedAt: number
  message: string
}

export type SkillCatalogEntry = {
  id: string
  enabled: boolean
  currentVersionId: string
  revision: number
  createdAt: number
  updatedAt: number
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/
const PERMISSIONS = new Set<SkillPermission>([
  'filesystem.read',
  'filesystem.write',
  'process.execute',
  'repository.modify'
])
const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'id',
  'version',
  'name',
  'description',
  'entry',
  'inputSchema',
  'outputSchema',
  'permissions',
  'network',
  'resources'
])

export function normalizeSkillManifest(value: unknown): SkillManifest {
  const manifest = requireObject(value, 'manifest')
  requireExactKeys(manifest, MANIFEST_KEYS)
  if (manifest.schemaVersion !== 1) {
    throw new Error('Skill schema version is invalid')
  }
  const id = requireIdentifier(manifest.id, 'ID')
  const version = requireSemver(manifest.version)
  const name = requireNonEmptyString(manifest.name, 'name')
  const description = requireString(manifest.description, 'description').trim()
  const entry = normalizeEntry(manifest.entry)
  const inputSchema = requireJsonObject(manifest.inputSchema, 'input schema')
  const outputSchema = requireJsonObject(
    manifest.outputSchema,
    'output schema'
  )
  const permissions = normalizePermissions(manifest.permissions)
  const network = normalizeNetwork(manifest.network)
  const resources = normalizeResources(manifest.resources)
  return {
    schemaVersion: 1,
    id,
    version,
    name,
    description,
    entry,
    inputSchema,
    outputSchema,
    permissions,
    network,
    resources
  }
}

export function compareSkillVersions(left: string, right: string): number {
  const leftParts = semverParts(left)
  const rightParts = semverParts(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return difference
  }
  return 0
}

export function createSkillVersion(input: {
  id: string
  manifest: SkillManifest
  source: SkillVersionSource
  managedRelativePath: string
  checksum: string
  byteSize: number
  fileCount: number
  installedAt: number
}): SkillVersion {
  const id = requireIdentifier(input.id, 'version ID')
  const managedRelativePath = requireSafeRelativePath(
    input.managedRelativePath,
    'managed path'
  )
  if (!CHECKSUM_PATTERN.test(input.checksum)) {
    throw new Error('Skill checksum is invalid')
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0) {
    throw new Error('Skill byte size is invalid')
  }
  if (!Number.isSafeInteger(input.fileCount) || input.fileCount < 1) {
    throw new Error('Skill file count is invalid')
  }
  requireTimestamp(input.installedAt)
  const displayName = requireNonEmptyString(
    input.source.displayName,
    'source name'
  )
  return {
    id,
    skillId: input.manifest.id,
    version: input.manifest.version,
    name: input.manifest.name,
    description: input.manifest.description,
    entry: { ...input.manifest.entry },
    inputSchema: cloneJson(input.manifest.inputSchema),
    outputSchema: cloneJson(input.manifest.outputSchema),
    permissions: [...input.manifest.permissions],
    network: {
      required: input.manifest.network.required,
      services: [...input.manifest.network.services]
    },
    resources: { ...input.manifest.resources },
    source: {
      type: 'local_directory',
      displayName
    },
    managedRelativePath,
    checksum: input.checksum,
    byteSize: input.byteSize,
    fileCount: input.fileCount,
    installedAt: input.installedAt
  }
}

export function createSkillCatalogEntry(
  version: SkillVersion
): SkillCatalogEntry {
  return {
    id: version.skillId,
    enabled: true,
    currentVersionId: version.id,
    revision: 1,
    createdAt: version.installedAt,
    updatedAt: version.installedAt
  }
}

function normalizeEntry(value: unknown): SkillEntry {
  const entry = requireObject(value, 'entry')
  requireExactKeys(entry, new Set(['kind', 'path']))
  if (entry.kind !== 'prompt' && entry.kind !== 'python') {
    throw new Error('Skill entry kind is invalid')
  }
  return {
    kind: entry.kind,
    path: requireSafeRelativePath(entry.path, 'entry path')
  }
}

function normalizePermissions(value: unknown): SkillPermission[] {
  if (!Array.isArray(value)) {
    throw new Error('Skill permissions are invalid')
  }
  const permissions = value.map((permission) => {
    if (typeof permission !== 'string' || !PERMISSIONS.has(permission as SkillPermission)) {
      throw new Error('Skill permission is invalid')
    }
    return permission as SkillPermission
  })
  if (new Set(permissions).size !== permissions.length) {
    throw new Error('Skill permissions contain duplicates')
  }
  return permissions
}

function normalizeNetwork(value: unknown): SkillNetworkRequirement {
  const network = requireObject(value, 'network')
  requireExactKeys(network, new Set(['required', 'services']))
  if (typeof network.required !== 'boolean' || !Array.isArray(network.services)) {
    throw new Error('Skill network requirement is invalid')
  }
  const services = network.services.map((service) =>
    requireIdentifier(service, 'network service')
  )
  if (new Set(services).size !== services.length) {
    throw new Error('Skill network services contain duplicates')
  }
  if (!network.required && services.length > 0) {
    throw new Error('Skill network services require network access')
  }
  return { required: network.required, services }
}

function normalizeResources(value: unknown): SkillResourceLimits {
  const resources = requireObject(value, 'resources')
  requireExactKeys(
    resources,
    new Set(['timeoutMs', 'maxMemoryMb', 'maxOutputBytes'])
  )
  const timeoutMs = requireIntegerInRange(
    resources.timeoutMs,
    1,
    600_000,
    'timeout'
  )
  const maxMemoryMb = requireIntegerInRange(
    resources.maxMemoryMb,
    16,
    4096,
    'memory limit'
  )
  const maxOutputBytes = requireIntegerInRange(
    resources.maxOutputBytes,
    1,
    16_777_216,
    'output limit'
  )
  return { timeoutMs, maxMemoryMb, maxOutputBytes }
}

function requireJsonObject(value: unknown, field: string): JsonObject {
  const object = requireObject(value, field)
  try {
    return cloneJson(object)
  } catch {
    throw new Error(`Skill ${field} is invalid`)
  }
}

function cloneJson<T>(value: T): T {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('Value is not JSON serializable')
  return JSON.parse(encoded) as T
}

function requireObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Skill ${field} is invalid`)
  }
  return value as Record<string, unknown>
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>
): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('Skill manifest contains unknown fields')
  }
}

function requireIdentifier(value: unknown, field: string): string {
  const identifier = requireString(value, field).trim()
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Skill ${field} is invalid`)
  }
  return identifier
}

function requireSemver(value: unknown): string {
  const version = requireString(value, 'version')
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error('Skill version is invalid')
  }
  return version
}

function semverParts(value: string): [number, number, number] {
  const version = requireSemver(value)
  const [major, minor, patch] = version.split('.').map(Number)
  return [major, minor, patch]
}

function requireSafeRelativePath(value: unknown, field: string): string {
  const path = requireNonEmptyString(value, field).replaceAll('\\', '/')
  const segments = path.split('/')
  if (
    path.startsWith('/') ||
    path.includes('\0') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Skill ${field} is invalid`)
  }
  return path
}

function requireNonEmptyString(value: unknown, field: string): string {
  const normalized = requireString(value, field).trim()
  if (!normalized) throw new Error(`Skill ${field} is required`)
  return normalized
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Skill ${field} is invalid`)
  }
  return value
}

function requireIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(`Skill ${field} is invalid`)
  }
  return value as number
}

function requireTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Skill timestamp is invalid')
  }
}
