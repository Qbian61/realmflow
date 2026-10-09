import { createHash } from 'node:crypto'
import { basename, isAbsolute, join, relative, resolve, win32 } from 'node:path'
import type { ToolEffect } from '../../../../domain/tool-authorization'
import type { ToolCapability } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { AdapterEffectPlan } from './tool-adapter'
import { ScopePathResolver } from './scope-path-resolver'

export type ToolSessionFamily =
  | 'word'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'image'

export type BuiltinToolEffectPlannerDependencies = {
  resolveSessionPath?: (
    family: ToolSessionFamily,
    sessionId: string
  ) => Promise<string> | string
  pathResolver?: Pick<ScopePathResolver, 'plan'>
  webSearch?: {
    searxngBaseUrl?: string
  }
}

type PlanInput = {
  handlerName: string
  capabilities: readonly ToolCapability[]
  arguments: JsonObject
  scopeRoots: readonly string[]
}

type PathEffectKind =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'filesystem.delete'

const DIRECT_READ_HANDLERS = new Set([
  'files.list',
  'files.read',
  'files.search',
  'files.stat',
  'documents.read',
  'document.inspect',
  'spreadsheet.inspect',
  'presentation.inspect',
  'pdf.inspect',
  'image.inspect',
  'archives.list',
  'fixed_layout.inspect',
  'fixed_layout.ocr',
  'office.inspect_original'
])

const DIRECT_WRITE_HANDLERS = new Set([
  'files.create_directory',
  'files.write'
])

const SESSION_READ_HANDLERS = new Set([
  'document.find',
  'spreadsheet.read_range',
  'pdf.thumbnail',
  'pdf.ocr',
  'image.ocr'
])

const SESSION_FAMILIES: Array<[prefix: string, family: ToolSessionFamily]> = [
  ['document.', 'word'],
  ['spreadsheet.', 'spreadsheet'],
  ['presentation.', 'presentation'],
  ['pdf.', 'pdf'],
  ['image.', 'image']
]

const PROCESS_HANDLERS = new Set([
  'process.discover',
  'process.run',
  'process.start',
  'process.list',
  'process.stop'
])

const USER_ADDRESSABLE_CAPABILITIES = new Set<ToolCapability>([
  'filesystem.read',
  'filesystem.write',
  'filesystem.delete',
  'process.discover',
  'process.execute',
  'process.manage',
  'repository.read',
  'repository.modify'
])

export async function planBuiltinToolEffects(
  input: PlanInput,
  dependencies: BuiltinToolEffectPlannerDependencies = {}
): Promise<AdapterEffectPlan> {
  try {
    const effects = await plan(input, {
      ...dependencies,
      pathResolver: dependencies.pathResolver ?? new ScopePathResolver()
    })
    return { outcome: 'planned', effects }
  } catch (error) {
    return unresolved(error)
  }
}

async function plan(
  input: PlanInput,
  dependencies: Required<
    Pick<BuiltinToolEffectPlannerDependencies, 'pathResolver'>
  > &
    Omit<BuiltinToolEffectPlannerDependencies, 'pathResolver'>
): Promise<ToolEffect[]> {
  const name = input.handlerName
  if (name === 'document.create') {
    return [
      await pathEffect(
        'filesystem.write',
        requiredPath(input.arguments, 'outputPath'),
        input,
        dependencies
      )
    ]
  }
  if (name === 'document.export_pdf') {
    return [
      await pathEffect(
        'filesystem.read',
        requiredPath(input.arguments, 'sourcePath'),
        input,
        dependencies
      ),
      await pathEffect(
        'filesystem.write',
        requiredPath(input.arguments, 'outputPath'),
        input,
        dependencies
      )
    ]
  }
  if (name === 'artifact.verify') {
    return [
      await pathEffect(
        'filesystem.read',
        requiredPath(input.arguments, 'path'),
        input,
        dependencies
      )
    ]
  }
  if (name === 'files.stat' && Array.isArray(input.arguments.paths)) {
    return Promise.all(
      requiredPaths(input.arguments, 'paths').map((path) =>
        pathEffect('filesystem.read', path, input, dependencies, {
          allowMissing: true
        })
      )
    )
  }
  if (DIRECT_READ_HANDLERS.has(name)) {
    return [
      await pathEffect(
        'filesystem.read',
        optionalPath(input.arguments, 'path') ?? '',
        input,
        dependencies
      )
    ]
  }
  if (DIRECT_WRITE_HANDLERS.has(name)) {
    return [
      await pathEffect(
        'filesystem.write',
        requiredPath(input.arguments, 'path'),
        input,
        dependencies
      )
    ]
  }
  if (name === 'files.apply_patch') {
    const path = requiredPath(input.arguments, 'path')
    return [
      await pathEffect('filesystem.read', path, input, dependencies),
      await pathEffect('filesystem.write', path, input, dependencies)
    ]
  }
  if (name === 'files.copy' || name === 'files.move') {
    return [
      await pathEffect(
        'filesystem.read',
        requiredPath(input.arguments, 'sourcePath'),
        input,
        dependencies
      ),
      await pathEffect(
        'filesystem.write',
        requiredPath(input.arguments, 'targetPath'),
        input,
        dependencies
      )
    ]
  }
  if (name === 'files.trash' || name === 'files.delete_permanently') {
    return [
      {
        ...(await pathEffect(
          'filesystem.delete',
          requiredPath(input.arguments, 'path'),
          input,
          dependencies
        )),
        permanent: name === 'files.delete_permanently'
      } as ToolEffect
    ]
  }
  if (name === 'archives.extract') {
    return [
      await pathEffect(
        'filesystem.read',
        requiredPath(input.arguments, 'path'),
        input,
        dependencies
      ),
      await pathEffect(
        'filesystem.write',
        requiredPath(input.arguments, 'outputPath'),
        input,
        dependencies
      )
    ]
  }
  if (name === 'archives.create') {
    const sources = recordArray(input.arguments.sources, 'sources')
    return [
      ...(await Promise.all(
        sources.map((source) =>
          pathEffect(
            'filesystem.read',
            requiredPath(source, 'path'),
            input,
            dependencies
          )
        )
      )),
      await pathEffect(
        'filesystem.write',
        requiredPath(input.arguments, 'outputPath'),
        input,
        dependencies
      )
    ]
  }
  if (
    name === 'office.import_legacy' ||
    name === 'office.create_safe_copy'
  ) {
    return [
      await pathEffect(
        'filesystem.read',
        requiredPath(input.arguments, 'path'),
        input,
        dependencies
      ),
      await pathEffect(
        'filesystem.write',
        requiredPath(input.arguments, 'outputPath'),
        input,
        dependencies
      )
    ]
  }
  if (PROCESS_HANDLERS.has(name)) {
    return [await processEffect(input, dependencies)]
  }
  if (name === 'web.fetch') {
    return [
      {
        kind: 'external',
        capability: 'network.connect',
        resourceKey: sanitizedWebOrigin(input.arguments.url)
      }
    ]
  }
  if (name === 'web.search') {
    return [
      {
        kind: 'external',
        capability: 'network.connect',
        resourceKey: configuredWebSearchOrigin(dependencies)
      }
    ]
  }
  if (name.startsWith('git.')) {
    const repositoryRoot = await selectedRoot(input, dependencies)
    return name === 'git.commit'
      ? [{ kind: 'repository.publish', repositoryRoot }]
      : [{ kind: 'filesystem.read', path: repositoryRoot }]
  }

  const family = sessionFamily(name)
  if (family) {
    const sessionPath = await requireSessionPath(
      family,
      input.arguments,
      dependencies
    )
    const effects: ToolEffect[] = [
      await pathEffect(
        SESSION_READ_HANDLERS.has(name)
          ? 'filesystem.read'
          : 'filesystem.write',
        sessionPath,
        input,
        dependencies
      )
    ]
    if (name === 'pdf.merge') {
      for (const source of stringArray(input.arguments.paths, 'paths')) {
        effects.push(
          await pathEffect(
            'filesystem.read',
            source,
            input,
            dependencies
          )
        )
      }
    }
    if (
      name === 'presentation.add_image' ||
      name === 'presentation.replace_image'
    ) {
      effects.push(
        await pathEffect(
          'filesystem.read',
          requiredPath(input.arguments, 'imagePath'),
          input,
          dependencies
        )
      )
    }
    if (name === 'image.save' && optionalPath(input.arguments, 'path')) {
      effects.push(
        await pathEffect(
          'filesystem.write',
          requiredPath(input.arguments, 'path'),
          input,
          dependencies
        )
      )
    }
    if (name === 'image.composite') {
      for (const overlay of recordArray(input.arguments.overlays, 'overlays')) {
        effects.push(
          await pathEffect(
            'filesystem.read',
            requiredPath(overlay, 'path'),
            input,
            dependencies
          )
        )
      }
    }
    return effects
  }

  if (
    input.capabilities.some((capability) =>
      USER_ADDRESSABLE_CAPABILITIES.has(capability)
    )
  ) {
    throw new Error('Tool effects are unresolved')
  }
  return []
}

async function pathEffect(
  kind: PathEffectKind,
  path: string,
  input: PlanInput,
  dependencies: Required<
    Pick<BuiltinToolEffectPlannerDependencies, 'pathResolver'>
  >,
  options: { allowMissing?: boolean } = {}
): Promise<ToolEffect> {
  const roots = selectedRoots(input)
  const resolved = await dependencies.pathResolver.plan({
    path,
    roots,
    operation:
      kind === 'filesystem.read' && !options.allowMissing ? 'read' : 'write'
  })
  if (kind === 'filesystem.delete') {
    return {
      kind,
      path: resolved.canonicalPath,
      permanent: false
    }
  }
  return { kind, path: resolved.canonicalPath }
}

async function processEffect(
  input: PlanInput,
  dependencies: Required<
    Pick<BuiltinToolEffectPlannerDependencies, 'pathResolver'>
  >
): Promise<ToolEffect> {
  const executable =
    optionalPath(input.arguments, 'executable') ?? input.handlerName
  const args = Array.isArray(input.arguments.arguments)
    ? input.arguments.arguments
    : []
  const cwd = optionalPath(input.arguments, 'cwd') ?? ''
  const workingDirectory = (
    await dependencies.pathResolver.plan({
      path: cwd,
      roots: selectedRoots(input),
      operation: 'read'
    })
  ).canonicalPath
  return {
    kind: 'process.execute',
    executableDigest: digest(executable),
    executableDisplayName: basename(executable),
    argsFingerprint: digest(JSON.stringify(args)),
    workingDirectory
  }
}

async function selectedRoot(
  input: PlanInput,
  dependencies: Required<
    Pick<BuiltinToolEffectPlannerDependencies, 'pathResolver'>
  >
): Promise<string> {
  return (
    await dependencies.pathResolver.plan({
      path: '',
      roots: selectedRoots(input),
      operation: 'read'
    })
  ).canonicalPath
}

function selectedRoots(input: PlanInput): readonly string[] {
  const requested = optionalPath(input.arguments, 'scopeRoot')
  if (!requested) return input.scopeRoots
  if (requested === '.' && input.scopeRoots.length === 1) {
    return input.scopeRoots
  }
  if (!input.scopeRoots.includes(requested)) {
    const normalizedRoot = selectedNormalizedScopeRoot(
      input.scopeRoots,
      requested
    )
    if (normalizedRoot) return [normalizedRoot]
    const absolutePathRoot = selectedRootForAbsolutePaths(
      input.scopeRoots,
      input.arguments
    )
    if (absolutePathRoot) return [absolutePathRoot]
    const relativeRoot = selectedRelativeScopeRoot(
      input.scopeRoots,
      requested,
      input.arguments,
    )
    if (relativeRoot) return [relativeRoot]
    throw new Error(scopeRootNotBoundMessage(input.scopeRoots, requested))
  }
  return [requested]
}

function selectedNormalizedScopeRoot(
  scopeRoots: readonly string[],
  requested: string
): string | undefined {
  if (!isAbsolute(requested) && !win32.isAbsolute(requested)) {
    return undefined
  }
  const normalizedRequested = normalizeScopeRoot(requested)
  return scopeRoots.find(
    (scopeRoot) => normalizeScopeRoot(scopeRoot) === normalizedRequested
  )
}

function selectedRootForAbsolutePaths(
  scopeRoots: readonly string[],
  arguments_: JsonObject
): string | undefined {
  const paths = absoluteRequestedPaths(arguments_)
  if (paths.length === 0) return undefined
  return scopeRoots.find((scopeRoot) =>
    paths.every((path) => pathIsInside(normalizeScopeRoot(scopeRoot), path))
  )
}

function absoluteRequestedPaths(arguments_: JsonObject): string[] {
  const paths: string[] = []
  for (const key of ['path', 'sourcePath', 'targetPath', 'outputPath']) {
    const value = arguments_[key]
    if (typeof value === 'string' && isAbsoluteToolPath(value)) {
      paths.push(normalizeScopeRoot(value))
    }
  }
  if (Array.isArray(arguments_.paths)) {
    for (const value of arguments_.paths) {
      if (typeof value === 'string' && isAbsoluteToolPath(value)) {
        paths.push(normalizeScopeRoot(value))
      }
    }
  }
  return paths
}

function pathIsInside(rootPath: string, targetPath: string): boolean {
  const child = relative(rootPath, targetPath)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function isAbsoluteToolPath(path: string): boolean {
  return isAbsolute(path) || win32.isAbsolute(path)
}

function normalizeScopeRoot(scopeRoot: string): string {
  return normalizeSystemPathAlias(resolve(scopeRoot)).normalize('NFC')
}

function normalizeSystemPathAlias(path: string): string {
  return path.startsWith('/var/') ? `/private${path}` : path
}

function scopeRootNotBoundMessage(
  scopeRoots: readonly string[],
  requested: string,
): string {
  const currentRoot =
    scopeRoots.length === 1 ? ` Current authorized root: ${scopeRoots[0]}.` : ''
  return `Tool scope root is not bound: ${requested}.${currentRoot} Use scopeRoot "." or omit scopeRoot to use the current folder.`
}

function selectedRelativeScopeRoot(
  scopeRoots: readonly string[],
  requested: string,
  arguments_: JsonObject,
): string | undefined {
  if (
    scopeRoots.length !== 1 ||
    isAbsolute(requested) ||
    win32.isAbsolute(requested)
  ) {
    return undefined
  }
  const normalized = requested.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || normalized === '.') return scopeRoots[0]
  const segments = normalized.split('/')
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith(' ') ||
        segment.endsWith('.')
    )
  ) {
    return undefined
  }
  return pathAlreadyIncludesScopeRoot(arguments_, normalized)
    ? scopeRoots[0]
    : join(scopeRoots[0]!, normalized)
}

function sanitizedWebOrigin(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Web URL is unavailable')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Web URL is invalid')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported')
  }
  if (url.username || url.password) {
    url.username = ''
    url.password = ''
  }
  return `${url.protocol}//${url.host}`
}

function configuredWebSearchOrigin(
  dependencies: BuiltinToolEffectPlannerDependencies
): string {
  const baseUrl =
    dependencies.webSearch?.searxngBaseUrl ??
    process.env.REALMFLOW_SEARXNG_URL ??
    process.env.SEARXNG_URL
  if (!baseUrl) {
    throw new Error('Web search provider is not configured')
  }
  return sanitizedWebOrigin(baseUrl)
}

function pathAlreadyIncludesScopeRoot(
  arguments_: JsonObject,
  relativeRoot: string,
): boolean {
  const candidate =
    typeof arguments_.path === 'string' ? arguments_.path : undefined
  if (!candidate) return false
  const normalized = candidate.replaceAll('\\', '/')
  return normalized === relativeRoot || normalized.startsWith(`${relativeRoot}/`)
}

async function requireSessionPath(
  family: ToolSessionFamily,
  arguments_: JsonObject,
  dependencies: BuiltinToolEffectPlannerDependencies
): Promise<string> {
  if (!dependencies.resolveSessionPath) {
    throw new Error('Tool session path resolver is unavailable')
  }
  return dependencies.resolveSessionPath(
    family,
    requiredPath(arguments_, 'sessionId')
  )
}

function sessionFamily(name: string): ToolSessionFamily | undefined {
  return SESSION_FAMILIES.find(([prefix]) => name.startsWith(prefix))?.[1]
}

function requiredPath(input: JsonObject, key: string): string {
  const value = optionalPath(input, key)
  if (value === undefined || value.includes('\0')) {
    throw new Error(`Tool ${key} is invalid`)
  }
  return value
}

function optionalPath(input: JsonObject, key: string): string | undefined {
  const value = input[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new Error(`Tool ${key} is invalid`)
  }
  return value
}

function requiredPaths(input: JsonObject, key: string): string[] {
  const value = input[key]
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error(`Tool ${key} is invalid`)
  }
  return value.map((item) => {
    if (typeof item !== 'string' || item.includes('\0') || item.length === 0) {
      throw new Error(`Tool ${key} is invalid`)
    }
    return item
  })
}

function recordArray(value: unknown, name: string): JsonObject[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => !isRecord(item))
  ) {
    throw new Error(`Tool ${name} is invalid`)
  }
  return value as JsonObject[]
}

function stringArray(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || !item)
  ) {
    throw new Error(`Tool ${name} is invalid`)
  }
  return value as string[]
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function unresolved(error?: unknown): AdapterEffectPlan {
  return {
    outcome: 'unresolved',
    error: {
      code: 'tool_effects_unresolved',
      message: safePlanningMessage(error),
      retryable: false
    }
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safePlanningMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message) {
    return 'Tool effects could not be resolved'
  }
  const message = error.message
  if (
    /scope root|scopeRoot|authorized scope|outside the authorized scope/i.test(
      message
    )
  ) {
    return message
  }
  if (/requires exactly one scope root/i.test(message)) {
    return 'Tool requires a selected workspace scope'
  }
  return 'Tool effects could not be resolved'
}
