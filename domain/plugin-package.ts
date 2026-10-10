import type {
  ToolCapability,
  ToolRisk
} from './tool-definition'

export type PluginPlatform = 'darwin' | 'win32' | 'linux'
export type PluginSandboxRuntime = 'node' | 'python' | 'wasm'

export type PluginPermissionContract = {
  capabilities: ToolCapability[]
  maximumRisk: ToolRisk
  pathPrefixes: string[]
  networkTargets: string[]
}

export type PluginSandboxContract = {
  id: string
  runtime: PluginSandboxRuntime
  filesystem: 'none' | 'package-read'
  networkTargets: string[]
  maximumDurationMs: number
  maximumMemoryMb: number
}

export type PluginDependencyContract = {
  packageId: string
  versionRange: string
  required: boolean
  toolIds: string[]
}

export type PluginToolContract = {
  id: string
  path: string
  executable: boolean
  sandbox?: string
}

export type PluginSkillContract = {
  id: string
  path: string
}

export type PluginDescriptorContract = {
  id: string
  path: string
  credentialRefs: string[]
}

export type MediaProviderOperation =
  | 'image_generate'
  | 'video_generate'
  | 'music_generate'
  | 'tts'

export type PluginMediaProviderContract = PluginDescriptorContract & {
  operations: MediaProviderOperation[]
}

export type PluginHookContract = {
  id: string
  event:
    | 'run.started'
    | 'run.completed'
    | 'run.failed'
    | 'tool.completed'
  targetToolId: string
  filterSchemaPath?: string
}

export type PluginContributionContracts = {
  tools: PluginToolContract[]
  skills: PluginSkillContract[]
  connectors: PluginDescriptorContract[]
  modelProviders: PluginDescriptorContract[]
  webProviders: PluginDescriptorContract[]
  browserProviders: PluginDescriptorContract[]
  mediaProviders: PluginMediaProviderContract[]
  hooks: PluginHookContract[]
}

export type PluginPackageManifestSource = {
  schemaVersion: 2
  packageId: string
  version: string
  name: string
  description: string
  publisher: {
    name: string
    keyId?: string
  }
  compatibility: {
    realmflowVersionRange: string
    platforms: PluginPlatform[]
    architectures?: string[]
  }
  permissions: PluginPermissionContract
  sandboxes: PluginSandboxContract[]
  dependencies: PluginDependencyContract[]
  contributions: PluginContributionContracts
}

export type PluginPackageManifest = Readonly<PluginPackageManifestSource>

export type PluginContributionKind =
  | 'tool'
  | 'skill'
  | 'connector'
  | 'model_provider'
  | 'web_provider'
  | 'browser_provider'
  | 'media_provider'
  | 'hook'

export type PluginContributionSummary = {
  kind: PluginContributionKind
  id: string
  definitionDigest: string
  credentialRefs?: string[]
  mediaOperations?: MediaProviderOperation[]
  targetToolId?: string
  event?: PluginHookContract['event']
}

export type PluginPackageCatalogMetadata = {
  permissions: PluginPermissionContract
  sandboxes: PluginSandboxContract[]
  dependencies: PluginDependencyContract[]
  contributions: PluginContributionSummary[]
}

const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'packageId',
  'version',
  'name',
  'description',
  'publisher',
  'compatibility',
  'permissions',
  'sandboxes',
  'dependencies',
  'contributions'
])
const CONTRIBUTION_KEYS = new Set([
  'tools',
  'skills',
  'connectors',
  'modelProviders',
  'webProviders',
  'browserProviders',
  'mediaProviders',
  'hooks'
])
const CAPABILITIES = new Set<ToolCapability>([
  'filesystem.read',
  'filesystem.write',
  'filesystem.delete',
  'process.discover',
  'process.execute',
  'process.manage',
  'repository.read',
  'repository.modify',
  'realmflow.read',
  'realmflow.write',
  'knowledge.read',
  'knowledge.write',
  'network.connect',
  'connector.use',
  'credential.use',
  'computer.observe',
  'computer.control',
  'clipboard.read',
  'clipboard.write'
])
const RISKS = new Set<ToolRisk>(['low', 'medium', 'high', 'critical'])
const PLATFORMS = new Set<PluginPlatform>(['darwin', 'win32', 'linux'])
const SANDBOX_RUNTIMES = new Set<PluginSandboxRuntime>([
  'node',
  'python',
  'wasm'
])
const HOOK_EVENTS = new Set<PluginHookContract['event']>([
  'run.started',
  'run.completed',
  'run.failed',
  'tool.completed'
])
const MEDIA_PROVIDER_OPERATIONS = new Set<MediaProviderOperation>([
  'image_generate',
  'video_generate',
  'music_generate',
  'tts'
])
const CONTRIBUTION_KINDS = new Set<PluginContributionKind>([
  'tool',
  'skill',
  'connector',
  'model_provider',
  'web_provider',
  'browser_provider',
  'media_provider',
  'hook'
])
const CONTRIBUTION_KIND_ORDER: Record<PluginContributionKind, number> = {
  tool: 0,
  skill: 1,
  connector: 2,
  model_provider: 3,
  web_provider: 4,
  browser_provider: 5,
  media_provider: 6,
  hook: 7
}

export function normalizePluginPackageManifest(
  value: unknown
): PluginPackageManifest {
  const source = object(value, 'manifest')
  exactKeys(source, MANIFEST_KEYS, 'manifest')
  if (source.schemaVersion !== 2) {
    throw new Error('Plugin package schema version is unsupported')
  }
  const permissions = normalizePermissions(source.permissions)
  const sandboxes = array(source.sandboxes, 'sandboxes')
    .map(normalizeSandbox)
    .sort(byId)
  assertUniqueIds(sandboxes, 'Plugin sandbox ID is duplicated')
  for (const sandbox of sandboxes) {
    if (
      sandbox.networkTargets.some(
        (target) => !permissions.networkTargets.includes(target)
      ) ||
      (sandbox.filesystem === 'package-read' &&
        !permissions.capabilities.includes('filesystem.read'))
    ) {
      throw new Error('Plugin sandbox exceeds package permissions')
    }
  }
  const dependencies = array(source.dependencies, 'dependencies')
    .map(normalizeDependency)
    .sort((left, right) => left.packageId.localeCompare(right.packageId))
  assertUniqueIds(
    dependencies.map((item) => ({ ...item, id: item.packageId })),
    'Plugin dependency is duplicated'
  )
  const contributions = normalizeContributions(source.contributions)
  const allContributions = [
    ...contributions.tools,
    ...contributions.skills,
    ...contributions.connectors,
    ...contributions.modelProviders,
    ...contributions.webProviders,
    ...contributions.browserProviders,
    ...contributions.mediaProviders,
    ...contributions.hooks
  ]
  assertUniqueIds(allContributions, 'Plugin contribution ID is duplicated')
  const paths = [
    ...contributions.tools.map(({ path }) => path),
    ...contributions.skills.map(({ path }) => path),
    ...contributions.connectors.map(({ path }) => path),
    ...contributions.modelProviders.map(({ path }) => path),
    ...contributions.webProviders.map(({ path }) => path),
    ...contributions.browserProviders.map(({ path }) => path),
    ...contributions.mediaProviders.map(({ path }) => path),
    ...contributions.hooks.flatMap(({ filterSchemaPath }) =>
      filterSchemaPath ? [filterSchemaPath] : []
    )
  ]
  if (new Set(paths).size !== paths.length) {
    throw new Error('Plugin contribution path is duplicated')
  }
  const sandboxIds = new Set(sandboxes.map(({ id }) => id))
  for (const tool of contributions.tools) {
    if (tool.executable && !tool.sandbox) {
      throw new Error(
        'Executable Plugin contribution requires a sandbox'
      )
    }
    if (tool.sandbox && !sandboxIds.has(tool.sandbox)) {
      throw new Error('Plugin contribution sandbox is unavailable')
    }
  }
  const declaredHookTools = new Set([
    ...contributions.tools.map(({ id }) => id),
    ...dependencies.flatMap(({ toolIds }) => toolIds)
  ])
  if (
    contributions.hooks.some(
      ({ targetToolId }) => !declaredHookTools.has(targetToolId)
    )
  ) {
    throw new Error('Plugin Hook target is undeclared')
  }
  if (allContributions.length === 0) {
    throw new Error('Plugin package requires a contribution')
  }
  return deepFreeze({
    schemaVersion: 2,
    packageId: identifier(source.packageId, 'package ID'),
    version: semver(source.version),
    name: text(source.name, 'name'),
    description: text(source.description, 'description', true),
    publisher: normalizePublisher(source.publisher),
    compatibility: normalizeCompatibility(source.compatibility),
    permissions,
    sandboxes,
    dependencies,
    contributions
  })
}

export function normalizePluginPackageCatalogMetadata(
  value: unknown
): PluginPackageCatalogMetadata {
  const source = object(value, 'catalog metadata')
  exactKeys(
    source,
    new Set([
      'permissions',
      'sandboxes',
      'dependencies',
      'contributions'
    ]),
    'catalog metadata'
  )
  const permissions = normalizePermissions(source.permissions)
  const sandboxes = array(source.sandboxes, 'sandboxes')
    .map(normalizeSandbox)
    .sort(byId)
  const dependencies = array(source.dependencies, 'dependencies')
    .map(normalizeDependency)
    .sort((left, right) => left.packageId.localeCompare(right.packageId))
  const contributions = array(source.contributions, 'contributions')
    .map((item) => {
      const contribution = object(item, 'contribution summary')
      exactKeys(
        contribution,
        new Set([
          'kind',
          'id',
          'definitionDigest',
          'credentialRefs',
          'mediaOperations',
          'targetToolId',
          'event'
        ]),
        'contribution summary',
        new Set([
          'credentialRefs',
          'mediaOperations',
          'targetToolId',
          'event'
        ])
      )
      if (
        typeof contribution.kind !== 'string' ||
        !CONTRIBUTION_KINDS.has(
          contribution.kind as PluginContributionKind
        )
      ) {
        throw new Error('Plugin contribution summary kind is invalid')
      }
      const credentialRefs =
        contribution.credentialRefs === undefined
          ? undefined
          : stringArray(
              contribution.credentialRefs,
              'contribution credential reference',
              identifier
            )
      const targetToolId =
        contribution.targetToolId === undefined
          ? undefined
          : identifier(
              contribution.targetToolId,
              'contribution target Tool ID'
            )
      const event =
        contribution.event === undefined
          ? undefined
          : typeof contribution.event === 'string' &&
              HOOK_EVENTS.has(
                contribution.event as PluginHookContract['event']
              )
            ? contribution.event as PluginHookContract['event']
            : undefined
      const mediaOperations =
        contribution.mediaOperations === undefined
          ? undefined
          : normalizeMediaOperations(contribution.mediaOperations)
      if (
        (contribution.kind === 'media_provider') !==
        (mediaOperations !== undefined)
      ) {
        throw new Error(
          'Plugin contribution summary media operations are invalid'
        )
      }
      if (
        contribution.event !== undefined &&
        event === undefined
      ) {
        throw new Error('Plugin contribution Hook event is invalid')
      }
      return {
        kind: contribution.kind as PluginContributionKind,
        id: identifier(contribution.id, 'contribution summary ID'),
        definitionDigest: digest(
          contribution.definitionDigest,
          'contribution definition digest'
        ),
        ...(credentialRefs ? { credentialRefs } : {}),
        ...(mediaOperations ? { mediaOperations } : {}),
        ...(targetToolId ? { targetToolId } : {}),
        ...(event ? { event } : {})
      }
    })
    .sort(
      (left, right) =>
        CONTRIBUTION_KIND_ORDER[left.kind] -
          CONTRIBUTION_KIND_ORDER[right.kind] ||
        left.id.localeCompare(right.id)
    )
  assertUniqueIds(contributions, 'Plugin contribution ID is duplicated')
  return deepFreeze({
    permissions,
    sandboxes,
    dependencies,
    contributions
  })
}

function normalizeContributions(value: unknown): PluginContributionContracts {
  const source = object(value, 'contributions')
  exactKeys(source, CONTRIBUTION_KEYS, 'contributions')
  return {
    tools: array(source.tools, 'Tools').map(normalizeTool).sort(byId),
    skills: array(source.skills, 'Skills').map(normalizeSkill).sort(byId),
    connectors: descriptors(source.connectors, 'Connector'),
    modelProviders: descriptors(source.modelProviders, 'Model Provider'),
    webProviders: descriptors(source.webProviders, 'Web Provider'),
    browserProviders: descriptors(
      source.browserProviders,
      'Browser Provider'
    ),
    mediaProviders: mediaProviderDescriptors(source.mediaProviders),
    hooks: array(source.hooks, 'Hooks').map(normalizeHook).sort(byId)
  }
}

function normalizeTool(value: unknown): PluginToolContract {
  const source = object(value, 'Tool')
  exactKeys(
    source,
    new Set(['id', 'path', 'executable', 'sandbox']),
    'Tool',
    new Set(['sandbox'])
  )
  if (typeof source.executable !== 'boolean') {
    throw new Error('Plugin Tool executable is invalid')
  }
  return {
    id: identifier(source.id, 'Tool ID'),
    path: safePath(source.path, 'Tool path'),
    executable: source.executable,
    ...(source.sandbox === undefined
      ? {}
      : { sandbox: identifier(source.sandbox, 'Tool sandbox') })
  }
}

function normalizeSkill(value: unknown): PluginSkillContract {
  const source = object(value, 'Skill')
  exactKeys(source, new Set(['id', 'path']), 'Skill')
  return {
    id: identifier(source.id, 'Skill ID'),
    path: safePath(source.path, 'Skill path')
  }
}

function descriptors(
  value: unknown,
  label: string
): PluginDescriptorContract[] {
  return array(value, `${label}s`)
    .map((item) => {
      const source = object(item, label)
      exactKeys(
        source,
        new Set(['id', 'path', 'credentialRefs']),
        label
      )
      return {
        id: identifier(source.id, `${label} ID`),
        path: safePath(source.path, `${label} path`),
        credentialRefs: stringArray(
          source.credentialRefs,
          `${label} credential reference`,
          identifier
        )
      }
    })
    .sort(byId)
}

function mediaProviderDescriptors(
  value: unknown
): PluginMediaProviderContract[] {
  return array(value, 'Media Providers')
    .map((item) => {
      const source = object(item, 'Media Provider')
      exactKeys(
        source,
        new Set(['id', 'path', 'credentialRefs', 'operations']),
        'Media Provider'
      )
      return {
        id: identifier(source.id, 'Media Provider ID'),
        path: safePath(source.path, 'Media Provider path'),
        credentialRefs: stringArray(
          source.credentialRefs,
          'Media Provider credential reference',
          identifier
        ),
        operations: normalizeMediaOperations(source.operations)
      }
    })
    .sort(byId)
}

function normalizeMediaOperations(
  value: unknown
): MediaProviderOperation[] {
  const operations = stringArray(
    value,
    'Media Provider operation',
    (item, field) => {
      const operation = text(item, field)
      if (
        !MEDIA_PROVIDER_OPERATIONS.has(
          operation as MediaProviderOperation
        )
      ) {
        throw new Error('Plugin Media Provider operation is invalid')
      }
      return operation as MediaProviderOperation
    }
  )
  if (operations.length === 0) {
    throw new Error('Plugin Media Provider operations are required')
  }
  return operations
}

function normalizeHook(value: unknown): PluginHookContract {
  const source = object(value, 'Hook')
  exactKeys(
    source,
    new Set(['id', 'event', 'targetToolId', 'filterSchemaPath']),
    'Hook',
    new Set(['filterSchemaPath'])
  )
  if (
    typeof source.event !== 'string' ||
    !HOOK_EVENTS.has(source.event as PluginHookContract['event'])
  ) {
    throw new Error('Plugin Hook event is invalid')
  }
  return {
    id: identifier(source.id, 'Hook ID'),
    event: source.event as PluginHookContract['event'],
    targetToolId: identifier(source.targetToolId, 'Hook target Tool ID'),
    ...(source.filterSchemaPath === undefined
      ? {}
      : {
          filterSchemaPath: safePath(
            source.filterSchemaPath,
            'Hook filter schema path'
          )
        })
  }
}

function normalizeSandbox(value: unknown): PluginSandboxContract {
  const source = object(value, 'sandbox')
  exactKeys(
    source,
    new Set([
      'id',
      'runtime',
      'filesystem',
      'networkTargets',
      'maximumDurationMs',
      'maximumMemoryMb'
    ]),
    'sandbox'
  )
  if (
    typeof source.runtime !== 'string' ||
    !SANDBOX_RUNTIMES.has(source.runtime as PluginSandboxRuntime)
  ) {
    throw new Error('Plugin sandbox runtime is invalid')
  }
  if (source.filesystem !== 'none' && source.filesystem !== 'package-read') {
    throw new Error('Plugin sandbox filesystem is invalid')
  }
  return {
    id: identifier(source.id, 'sandbox ID'),
    runtime: source.runtime as PluginSandboxRuntime,
    filesystem: source.filesystem,
    networkTargets: stringArray(
      source.networkTargets,
      'sandbox network target',
      text
    ),
    maximumDurationMs: integer(
      source.maximumDurationMs,
      'sandbox maximum duration',
      100,
      300_000
    ),
    maximumMemoryMb: integer(
      source.maximumMemoryMb,
      'sandbox maximum memory',
      16,
      4_096
    )
  }
}

function normalizeDependency(value: unknown): PluginDependencyContract {
  const source = object(value, 'dependency')
  exactKeys(
    source,
    new Set(['packageId', 'versionRange', 'required', 'toolIds']),
    'dependency'
  )
  if (typeof source.required !== 'boolean') {
    throw new Error('Plugin dependency required state is invalid')
  }
  return {
    packageId: identifier(source.packageId, 'dependency package ID'),
    versionRange: text(source.versionRange, 'dependency version range'),
    required: source.required,
    toolIds: stringArray(
      source.toolIds,
      'dependency Tool ID',
      identifier
    )
  }
}

function normalizePermissions(value: unknown): PluginPermissionContract {
  const source = object(value, 'permissions')
  exactKeys(
    source,
    new Set([
      'capabilities',
      'maximumRisk',
      'pathPrefixes',
      'networkTargets'
    ]),
    'permissions'
  )
  const capabilities = stringArray(
    source.capabilities,
    'permission capability',
    (item, field) => {
      const value = text(item, field)
      if (!CAPABILITIES.has(value as ToolCapability)) {
        throw new Error('Plugin permission capability is invalid')
      }
      return value as ToolCapability
    }
  )
  if (
    typeof source.maximumRisk !== 'string' ||
    !RISKS.has(source.maximumRisk as ToolRisk)
  ) {
    throw new Error('Plugin permission maximum risk is invalid')
  }
  return {
    capabilities,
    maximumRisk: source.maximumRisk as ToolRisk,
    pathPrefixes: stringArray(
      source.pathPrefixes,
      'permission path prefix',
      absolutePath
    ),
    networkTargets: stringArray(
      source.networkTargets,
      'permission network target',
      text
    )
  }
}

function normalizePublisher(value: unknown): PluginPackageManifest['publisher'] {
  const source = object(value, 'publisher')
  exactKeys(
    source,
    new Set(['name', 'keyId']),
    'publisher',
    new Set(['keyId'])
  )
  return {
    name: text(source.name, 'publisher name'),
    ...(source.keyId === undefined
      ? {}
      : { keyId: identifier(source.keyId, 'publisher key ID') })
  }
}

function normalizeCompatibility(
  value: unknown
): PluginPackageManifest['compatibility'] {
  const source = object(value, 'compatibility')
  exactKeys(
    source,
    new Set(['realmflowVersionRange', 'platforms', 'architectures']),
    'compatibility',
    new Set(['architectures'])
  )
  const platforms = stringArray(
    source.platforms,
    'platform',
    (item, field) => {
      const value = text(item, field)
      if (!PLATFORMS.has(value as PluginPlatform)) {
        throw new Error('Plugin platform is invalid')
      }
      return value as PluginPlatform
    }
  )
  if (platforms.length === 0) {
    throw new Error('Plugin platforms are required')
  }
  return {
    realmflowVersionRange: text(
      source.realmflowVersionRange,
      'RealmFlow compatibility'
    ),
    platforms,
    ...(source.architectures === undefined
      ? {}
      : {
          architectures: stringArray(
            source.architectures,
            'architecture',
            identifier
          )
        })
  }
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Plugin package ${field} is invalid`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Plugin package ${field} are invalid`)
  }
  return value
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
  optional: ReadonlySet<string> = new Set()
): void {
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    [...allowed].some(
      (key) => !optional.has(key) && !Object.hasOwn(value, key)
    )
  ) {
    throw new Error(`Plugin package ${field} fields are invalid`)
  }
}

function text(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string') {
    throw new Error(`Plugin ${field} is invalid`)
  }
  const normalized = value.trim()
  if ((!allowEmpty && !normalized) || normalized.includes('\0')) {
    throw new Error(`Plugin ${field} is invalid`)
  }
  return normalized
}

function identifier(value: unknown, field: string): string {
  const normalized = text(value, field)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) {
    throw new Error(`Plugin ${field} is invalid`)
  }
  return normalized
}

function semver(value: unknown): string {
  const normalized = text(value, 'version')
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(normalized)) {
    throw new Error('Plugin version is invalid')
  }
  return normalized
}

function digest(value: unknown, field: string): string {
  const normalized = text(value, field)
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`Plugin ${field} is invalid`)
  }
  return normalized
}

function safePath(value: unknown, field: string): string {
  const normalized = text(value, field).replaceAll('\\', '/')
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Plugin ${field} is invalid`)
  }
  return normalized
}

function absolutePath(value: unknown, field: string): string {
  const normalized = text(value, field)
  if (!normalized.startsWith('/')) {
    throw new Error(`Plugin ${field} is invalid`)
  }
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(`Plugin ${field} is invalid`)
  }
  return value as number
}

function stringArray<T extends string>(
  value: unknown,
  field: string,
  normalize: (value: unknown, field: string) => T
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Plugin ${field}s are invalid`)
  }
  return [...new Set(value.map((item) => normalize(item, field)))].sort()
}

function assertUniqueIds(
  values: ReadonlyArray<{ id: string }>,
  message: string
): void {
  if (new Set(values.map(({ id }) => id)).size !== values.length) {
    throw new Error(message)
  }
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id)
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
