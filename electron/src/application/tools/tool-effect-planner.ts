import { createHash } from 'node:crypto'
import { basename, isAbsolute, join, relative, resolve, win32 } from 'node:path'
import type { ToolEffect } from '../../../../domain/tool-authorization'
import { classifyProcessCommand } from '../../../../domain/process-command-classification'
import type { ToolCapability } from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { WebProviderConfiguration } from '../../../../shared/web-provider'
import { BRAVE_SEARCH_ORIGIN } from '../web/web-search-providers'
import type { AdapterEffectPlan } from './tool-adapter'
import { ScopePathResolver } from './scope-path-resolver'
import type { BrowserAction, BrowserCallContext, BrowserEffectEvidence } from '../browser/browser-runtime-port'
import type { ToolExecutionContext } from './tool-adapter'
import {
  FilesystemGitRepositoryResolver,
  type GitRepositoryResolverPort
} from './git-repository-resolver'
import { assertPublicUrl } from '../web/web-response'

export type ToolSessionFamily =
  | 'word'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'image'

export type BuiltinToolEffectPlannerDependencies = {
  /** Main-owned application storage; raw tool mutations cannot target it. */
  protectedRoots?: readonly string[]
  resolveSessionPath?: (
    family: ToolSessionFamily,
    sessionId: string
  ) => Promise<string> | string
  pathResolver?: Pick<ScopePathResolver, 'plan'>
  webConfiguration?: { get(): WebProviderConfiguration }
  processIsolation?: {
    describe(input: { executable: string; arguments: string[]; cwd: string }): Promise<{ execution: 'sandboxed' | 'host' }>
  }
  browser?: {
    describe(
      id: string,
      action: BrowserAction,
      args: JsonObject,
      call?: BrowserCallContext
    ): Promise<BrowserEffectEvidence>
    describeCurrent?(
      action: BrowserAction,
      args: JsonObject,
      call: BrowserCallContext
    ): Promise<BrowserEffectEvidence>
    resolveCurrentSessionId?(
      call: BrowserCallContext
    ): Promise<string>
  }
  managedProcesses?: {
    describeManaged(input: { owner: ToolExecutionContext['owner']; processId: string; runId?: string }): Promise<{ currentRun: boolean; fingerprint: string }>
  }
  gitRepositoryResolver?: GitRepositoryResolverPort
}

type PlanInput = {
  handlerName: string
  capabilities: readonly ToolCapability[]
  arguments: JsonObject
  scopeRoots: readonly string[]
  webConfiguration?: WebProviderConfiguration
  context?: ToolExecutionContext
  executionId?: string
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
  'process.inspect',
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
  if (name.startsWith('browser.')) {
    const action = name.slice('browser.'.length)
    if (action === 'create') return [{ kind: 'browser.session.create', profile: 'isolated' }]
    if (action === 'attach') {
      const profileId = requiredPath(input.arguments, 'profileId')
      if (!/^browser-[a-zA-Z0-9-]+$/.test(profileId)) throw new Error('Invalid browser profile')
      return [{ kind: 'browser.profile.attach', profileId }]
    }
    if (!dependencies.browser) throw new Error('Browser evidence unavailable')
    const currentRun = isCurrentRunTarget(input.arguments)
    const call = input.context
      ? browserCallContext(input.context, input.executionId, input.scopeRoots)
      : undefined
    if (action === 'close') {
      const sessionId = currentRun
        ? await requireCurrentSessionId(dependencies.browser, call)
        : requiredPath(input.arguments, 'sessionId')
      return [{ kind: 'browser.session.close', sessionId }]
    }
    let sessionId: string
    let evidence: BrowserEffectEvidence
    if (currentRun) {
      evidence = await requireCurrentEvidence(
        dependencies.browser,
        action as BrowserAction,
        input.arguments,
        call
      )
      sessionId = requiredEvidenceSessionId(evidence)
    } else {
      sessionId = requiredPath(input.arguments, 'sessionId')
      evidence = await dependencies.browser.describe(
        sessionId,
        action as BrowserAction,
        input.arguments,
        call
      )
    }
    const effects: ToolEffect[] = [evidence.semantic === 'read' ? {
      kind: 'browser.page.read', sessionId, origin: browserOrigin(evidence.url),
      privateSession: evidence.privateSession, targetDigest: evidence.targetDigest
    } : {
      kind: 'browser.page.control', sessionId, origin: browserOrigin(evidence.url),
      semantic: evidence.semantic, targetDigest: evidence.targetDigest
    }]
    if (action === 'navigate' || action === 'download') {
      effects.push({ kind: 'network.public_read', origin: publicWebOrigin(input.arguments.url), localDataEgress: false })
    }
    if (action === 'upload') {
      effects.push(await pathEffect('filesystem.read', requiredPath(input.arguments, 'path'), input, dependencies))
    }
    if (action === 'screenshot' || action === 'download') {
      const path = requiredPath(input.arguments, 'path')
      effects.push(await pathEffect('filesystem.write', path, input, dependencies))
      effects.push(await pathEffect('filesystem.write', `${path}.realmflow-browser.json`, input, dependencies))
    }
    return effects
  }
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
    if (name === 'process.list') {
      if (!input.context) throw new Error('Process owner is unavailable')
      return [{ kind: 'process.inspect', owner: input.context.owner }]
    }
    if (name === 'process.discover') {
      return [{ kind: 'process.inspect', workingDirectory: await selectedRoot(input, dependencies) }]
    }
    if (name === 'process.stop') {
      if (!dependencies.managedProcesses || !input.context) throw new Error('Managed process evidence unavailable')
      const processId = requiredPath(input.arguments, 'processId')
      const evidence = await dependencies.managedProcesses.describeManaged({
        owner: input.context.owner, processId, runId: input.context.parentExecutionId
      })
      return [{ kind: 'process.manage', processId, ...evidence }]
    }
    return [await processEffect(input, dependencies)]
  }
  if (name === 'web.fetch') {
    return [
      {
        kind: 'network.public_read',
        localDataEgress: false,
        origin: publicWebOrigin(input.arguments.url)
      }
    ]
  }
  if (name === 'web.search') {
    const config = input.webConfiguration
    if (!config || config.searchProvider === 'disabled') {
      throw Object.assign(new Error('Web search provider is not configured'), {
        code: 'provider_unconfigured'
      })
    }
    const effects: ToolEffect[] = [{
      kind: 'network.public_read', localDataEgress: false,
      providerId: config.searchProvider,
      origin: config.searchProvider === 'brave'
        ? BRAVE_SEARCH_ORIGIN : sanitizedWebOrigin(config.searxngBaseUrl)
    }]
    if (config.searchProvider === 'brave') {
      if (!config.hasBraveCredential || !config.braveCredentialHandle) throw new Error('Web credential unavailable')
    }
    return effects
  }
  if (name.startsWith('git.')) {
    const repositoryRoot = await gitRepositoryRoot(input, dependencies)
    return name === 'git.commit'
      ? [{ kind: 'repository.local_write', repositoryRoot }]
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

function browserCallContext(
  context: ToolExecutionContext,
  executionId: string | undefined,
  scopeRoots: readonly string[]
): BrowserCallContext {
  const ownerKey = JSON.stringify([
    context.owner.type,
    context.owner.id,
    context.workspaceId ?? null
  ])
  const runId = context.parentExecutionId
  return {
    ownerKey,
    executionId: executionId ?? 'planning',
    ...(runId
      ? {
          runId,
          authorityDigest: createHash('sha256')
            .update(JSON.stringify({ ownerKey, runId }))
            .digest('hex')
        }
      : {}),
    ...(context.conversationId
      ? { conversationId: context.conversationId }
      : {}),
    scopeRoots: [...scopeRoots],
    signal: new AbortController().signal
  }
}

function isCurrentRunTarget(arguments_: JsonObject): boolean {
  const target = arguments_.target
  return (
    typeof target === 'object' &&
    target !== null &&
    !Array.isArray(target) &&
    (target as Record<string, unknown>).kind === 'current_run'
  )
}

async function requireCurrentSessionId(
  browser: NonNullable<BuiltinToolEffectPlannerDependencies['browser']>,
  call: BrowserCallContext | undefined
): Promise<string> {
  if (!call || !browser.resolveCurrentSessionId) {
    throw Object.assign(
      new Error('Current Run browser is unavailable'),
      { code: 'runtime_resource_stale' }
    )
  }
  return browser.resolveCurrentSessionId(call)
}

async function requireCurrentEvidence(
  browser: NonNullable<BuiltinToolEffectPlannerDependencies['browser']>,
  action: BrowserAction,
  arguments_: JsonObject,
  call: BrowserCallContext | undefined
): Promise<BrowserEffectEvidence> {
  if (!call || !browser.describeCurrent) {
    throw Object.assign(
      new Error('Current Run browser is unavailable'),
      { code: 'runtime_resource_stale' }
    )
  }
  return browser.describeCurrent(action, arguments_, call)
}

function requiredEvidenceSessionId(
  evidence: BrowserEffectEvidence
): string {
  if (
    !evidence.sessionId ||
    !/^browser-[a-zA-Z0-9-]+$/.test(evidence.sessionId)
  ) {
    throw Object.assign(
      new Error('Current Run browser evidence is stale'),
      { code: 'runtime_resource_stale' }
    )
  }
  return evidence.sessionId
}

function browserOrigin(url: string): string {
  return url === 'about:blank' ? 'about:blank' : sanitizedWebOrigin(url)
}

async function pathEffect(
  kind: PathEffectKind,
  path: string,
  input: PlanInput,
  dependencies: Required<
    Pick<BuiltinToolEffectPlannerDependencies, 'pathResolver'>
  > & Pick<BuiltinToolEffectPlannerDependencies, 'protectedRoots'>,
  options: { allowMissing?: boolean } = {}
): Promise<ToolEffect> {
  const roots = selectedRoots(input)
  const resolved = await dependencies.pathResolver.plan({
    path,
    roots,
    operation:
      kind === 'filesystem.read' && !options.allowMissing ? 'read' : 'write'
  })
  const segments = resolved.canonicalPath.replaceAll('\\', '/').toLowerCase().split('/')
  const protectedPath = segments.some(segment =>
    ['.git', '.realmflow', '.trae', '.agents', '.cursor'].includes(segment))
    || dependencies.protectedRoots?.some(root =>
      pathIsInside(normalizeScopeRoot(root), resolved.canonicalPath))
  if (kind !== 'filesystem.read' && protectedPath) {
    throw new Error('Raw mutation of a protected path is forbidden')
  }
  if (kind === 'filesystem.delete') {
    return {
      kind,
      path: resolved.canonicalPath,
      permanent: false
    }
  }
  const sensitive = protectedPath || segments.some(segment =>
    ['.ssh', '.aws', '.gnupg', 'keychains', 'cookies', 'login data'].includes(segment)
    || /^\.env(?:\.|$)/.test(segment) || /\.(?:pem|p12|pfx|key)$/.test(segment))
  return { kind, path: resolved.canonicalPath,
    ...(kind === 'filesystem.read' && sensitive ? { sensitivity: 'sensitive' as const } : {}) }
}

async function processEffect(
  input: PlanInput,
  dependencies: Required<
    Pick<BuiltinToolEffectPlannerDependencies, 'pathResolver'>
  > & Pick<BuiltinToolEffectPlannerDependencies, 'processIsolation'>
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
  const arguments_ = args.filter((value): value is string => typeof value === 'string')
  const isolation = await dependencies.processIsolation?.describe({
    executable, arguments: arguments_, cwd: workingDirectory
  })
  return {
    kind: 'process.execute',
    execution: isolation?.execution ?? 'host',
    commandClass: classifyProcessCommand(executable, arguments_),
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

async function gitRepositoryRoot(
  input: PlanInput,
  dependencies: Required<
    Pick<BuiltinToolEffectPlannerDependencies, 'pathResolver'>
  > &
    Pick<BuiltinToolEffectPlannerDependencies, 'gitRepositoryResolver'>
): Promise<string> {
  const selected = await selectedRoot(input, dependencies)
  return (
    await (
      dependencies.gitRepositoryResolver ??
      new FilesystemGitRepositoryResolver()
    ).resolve({
      selectedRoot: selected,
      authorizedRoots: input.scopeRoots
    })
  ).repositoryRoot
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

function publicWebOrigin(value: unknown): string {
  const origin = sanitizedWebOrigin(value)
  const url = new URL(value as string)
  if (url.username || url.password) throw new Error('Public URL must not contain credentials')
  assertPublicUrl(url)
  return origin
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
      code: error instanceof Error && 'code' in error && error.code === 'provider_unconfigured'
        ? 'provider_unconfigured' : 'tool_effects_unresolved',
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
  if ('code' in error && error.code === 'provider_unconfigured') return message
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
