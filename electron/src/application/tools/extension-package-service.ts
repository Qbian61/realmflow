import { createHash, randomUUID } from 'node:crypto'
import { lstatSync } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import extractZip from 'extract-zip'
import {
  calculateExtensionPackageDigest,
  normalizeExtensionPackageManifest,
  type ExtensionPackageManifest,
  type ExtensionPackagePlatform,
} from '../../../../domain/extension-package'
import {
  normalizeSkillDefinition,
  type SkillDefinition,
} from '../../../../domain/skill-definition'
import {
  normalizeSkillManifest,
  type SkillManifest,
} from '../../../../domain/skill'
import {
  normalizeToolDefinition,
  type ToolDefinition,
} from '../../../../domain/tool-definition'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { PendingManagedDirectory } from '../ports/business-repositories'

const DEFAULT_MAX_FILES = 1_000
const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024
const DIGEST_PATTERN = /^[a-f0-9]{64}$/
const SENSITIVE_FILE_NAMES = new Set([
  '.env',
  'credentials.json',
  'id_dsa',
  'id_ed25519',
  'id_rsa',
])

type ExtensionPackageServiceOptions = {
  userDataPath: string
  realmFlowVersion: string
  platform: ExtensionPackagePlatform
  architecture: string
  createId?: () => string
  extractArchive?: (sourcePath: string, targetPath: string) => Promise<void>
  maxFiles?: number
  maxFileBytes?: number
  maxTotalBytes?: number
}

type PackageFile = {
  relativePath: string
  absolutePath: string
  content: Buffer
}

type PackageSnapshot = {
  files: PackageFile[]
  packageDigest: string
  byteSize: number
}

export type PreparedExtensionPackage = {
  manifest: ExtensionPackageManifest
  packageDigest: string
  tools: ToolDefinition[]
  skills: SkillDefinition[]
  source: {
    type: 'directory' | 'archive'
    displayName: string
  }
  byteSize: number
  fileCount: number
  managedRelativePath: string
  pending: PendingManagedDirectory
}

export class ExtensionPackageService {
  private readonly extensionsRoot: string
  private readonly createId: () => string
  private readonly extractArchive: (
    sourcePath: string,
    targetPath: string,
  ) => Promise<void>
  private readonly maxFiles: number
  private readonly maxFileBytes: number
  private readonly maxTotalBytes: number

  constructor(private readonly options: ExtensionPackageServiceOptions) {
    this.extensionsRoot = join(options.userDataPath, 'extensions')
    this.createId = options.createId ?? randomUUID
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
    this.extractArchive =
      options.extractArchive ??
      ((sourcePath, targetPath) =>
        extractZip(sourcePath, {
          dir: targetPath,
          onEntry: (entry) => {
            if (entry.uncompressedSize > this.maxFileBytes) {
              throw new Error('Extension package file is too large')
            }
          },
        }))
  }

  async readSkillInstructions(definition: SkillDefinition): Promise<string> {
    if (definition.origin !== 'local_upload') {
      throw new Error('Skill instructions are not locally managed')
    }
    const packageRoot = join(
      this.extensionsRoot,
      'packages',
      definition.package.packageDigest,
    )
    const path = resolvePackagePath(packageRoot, definition.instructionsPath)
    const metadata = await lstat(path)
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > this.maxFileBytes
    ) {
      throw new Error('Skill instructions file is invalid')
    }
    return readFile(path, 'utf8')
  }

  async prepare(sourcePath: string): Promise<PreparedExtensionPackage> {
    const source = await this.resolveSource(sourcePath)
    const stagingPath = join(this.extensionsRoot, '.staging', this.createId())
    await mkdir(stagingPath, { recursive: true })
    try {
      if (source.type === 'directory') {
        await this.copyDirectory(source.path, stagingPath)
      } else {
        await this.extractArchive(source.path, stagingPath)
      }
      await this.synthesizeLegacySkillPackage(stagingPath)
      const snapshot = await this.scan(stagingPath)
      const manifest = await this.readManifest(stagingPath)
      this.assertCompatible(manifest)
      const { tools, skills } = await this.readDefinitions(
        stagingPath,
        manifest,
        snapshot.packageDigest,
      )
      this.assertReferencedFiles(stagingPath, manifest, tools, skills)
      const finalPath = join(
        this.extensionsRoot,
        'packages',
        snapshot.packageDigest,
      )
      return {
        manifest,
        packageDigest: snapshot.packageDigest,
        tools,
        skills,
        source: {
          type: source.type,
          displayName: basename(source.path),
        },
        byteSize: snapshot.byteSize,
        fileCount: snapshot.files.length,
        managedRelativePath: `extensions/packages/${snapshot.packageDigest}`,
        pending: createPendingDirectory(
          stagingPath,
          finalPath,
          snapshot.packageDigest,
        ),
      }
    } catch (error) {
      await rm(stagingPath, { recursive: true, force: true })
      throw error
    }
  }

  async recover(
    referencedDigests: ReadonlySet<string>,
  ): Promise<{ stagingRemoved: number; orphansRemoved: number }> {
    const stagingRemoved = await removeEntries(
      join(this.extensionsRoot, '.staging'),
    )
    const packagesRoot = join(this.extensionsRoot, 'packages')
    let entries
    try {
      entries = await readdir(packagesRoot, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { stagingRemoved, orphansRemoved: 0 }
      }
      throw error
    }
    const orphans = entries.filter(({ name }) => !referencedDigests.has(name))
    await Promise.all(
      orphans.map(({ name }) =>
        rm(join(packagesRoot, name), { recursive: true, force: true }),
      ),
    )
    return { stagingRemoved, orphansRemoved: orphans.length }
  }

  private async resolveSource(sourcePath: string): Promise<{
    path: string
    type: 'directory' | 'archive'
  }> {
    let path: string
    try {
      path = await realpath(sourcePath)
    } catch {
      throw new Error('Extension package source is unavailable')
    }
    const metadata = await lstat(path)
    if (metadata.isDirectory()) return { path, type: 'directory' }
    if (metadata.isFile() && extname(path).toLowerCase() === '.zip') {
      return { path, type: 'archive' }
    }
    throw new Error('Extension package source type is unsupported')
  }

  private async copyDirectory(
    sourceRoot: string,
    targetRoot: string,
  ): Promise<void> {
    const files: Array<{ source: string; relativePath: string }> = []
    await this.collectSourceFiles(sourceRoot, sourceRoot, files)
    for (const file of files) {
      const target = join(targetRoot, ...file.relativePath.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(file.source, target)
    }
  }

  private async collectSourceFiles(
    rootPath: string,
    currentPath: string,
    files: Array<{ source: string; relativePath: string }>,
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(currentPath, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) {
        throw new Error('Extension package contains an unsupported file')
      }
      if (metadata.isDirectory()) {
        await this.collectSourceFiles(rootPath, path, files)
        continue
      }
      if (!metadata.isFile()) {
        throw new Error('Extension package contains an unsupported file')
      }
      if (files.length >= this.maxFiles) {
        throw new Error('Extension package contains too many files')
      }
      if (metadata.size > this.maxFileBytes) {
        throw new Error('Extension package file is too large')
      }
      files.push({
        source: path,
        relativePath: toPortableRelativePath(rootPath, path),
      })
    }
  }

  private async scan(rootPath: string): Promise<PackageSnapshot> {
    const files: PackageFile[] = []
    await this.walkStaging(rootPath, rootPath, files)
    let byteSize = 0
    for (const file of files) {
      byteSize += file.content.byteLength
      if (byteSize > this.maxTotalBytes) {
        throw new Error('Extension package is too large')
      }
    }
    return {
      files,
      packageDigest: calculateExtensionPackageDigest(
        files.map(({ relativePath: path, content }) => ({ path, content })),
      ),
      byteSize,
    }
  }

  private async walkStaging(
    rootPath: string,
    currentPath: string,
    files: PackageFile[],
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(currentPath, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) {
        throw new Error('Extension package contains an unsupported file')
      }
      if (metadata.isDirectory()) {
        await this.walkStaging(rootPath, path, files)
        continue
      }
      if (!metadata.isFile()) {
        throw new Error('Extension package contains an unsupported file')
      }
      if (files.length >= this.maxFiles) {
        throw new Error('Extension package contains too many files')
      }
      if (metadata.size > this.maxFileBytes) {
        throw new Error('Extension package file is too large')
      }
      const relativePath = toPortableRelativePath(rootPath, path)
      if (SENSITIVE_FILE_NAMES.has(basename(relativePath).toLowerCase())) {
        throw new Error('Extension package contains a sensitive file')
      }
      const content = await readFile(path)
      if (content.byteLength > this.maxFileBytes) {
        throw new Error('Extension package file is too large')
      }
      files.push({ relativePath, absolutePath: path, content })
    }
  }

  private async readManifest(
    stagingPath: string,
  ): Promise<ExtensionPackageManifest> {
    const value = await readJson(
      join(stagingPath, 'extension.json'),
      'Extension package manifest is missing',
      'Extension package manifest is invalid',
    )
    return normalizeExtensionPackageManifest(value)
  }

  private async synthesizeLegacySkillPackage(
    stagingPath: string,
  ): Promise<void> {
    try {
      await lstat(join(stagingPath, 'extension.json'))
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const legacy = normalizeSkillManifest(
      await readJson(
        join(stagingPath, 'skill.json'),
        'Extension package manifest is missing',
        'Skill manifest is invalid',
      ),
    )
    const generatedRoot = join(stagingPath, '.realmflow-import')
    try {
      await lstat(generatedRoot)
      throw new Error('Extension package reserved path is unavailable')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await mkdir(generatedRoot, { recursive: true })

    const toolPath = '.realmflow-import/tool.json'
    const skillPath = '.realmflow-import/skill.json'
    const instructionsPath =
      legacy.entry.kind === 'prompt'
        ? legacy.entry.path
        : '.realmflow-import/instructions.md'
    const toolSource =
      legacy.entry.kind === 'python'
        ? createLegacyPythonToolSource(legacy)
        : undefined
    if (toolSource) {
      await writeFile(
        join(generatedRoot, 'tool.json'),
        JSON.stringify(toolSource, null, 2),
      )
      await writeFile(
        join(generatedRoot, 'instructions.md'),
        `Use ${toolSource.id} to complete this Skill.\n`,
      )
    }
    await writeFile(
      join(generatedRoot, 'skill.json'),
      JSON.stringify(
        createLegacySkillDefinitionSource(
          legacy,
          instructionsPath,
          toolSource?.id,
        ),
        null,
        2,
      ),
    )
    await writeFile(
      join(stagingPath, 'extension.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          packageId: legacy.id,
          version: legacy.version,
          name: legacy.name,
          description: legacy.description,
          publisher: { name: 'Legacy Skill Import' },
          compatibility: {
            realmflow: this.options.realmFlowVersion,
            platforms: [this.options.platform],
            architectures: [this.options.architecture],
          },
          tools: toolSource ? [{ path: toolPath }] : [],
          skills: [{ path: skillPath }],
          assets: [],
        },
        null,
        2,
      ),
    )
  }

  private assertCompatible(manifest: ExtensionPackageManifest): void {
    if (!manifest.compatibility.platforms.includes(this.options.platform)) {
      throw new Error('Extension package platform is incompatible')
    }
    if (
      manifest.compatibility.architectures &&
      !manifest.compatibility.architectures.includes(this.options.architecture)
    ) {
      throw new Error('Extension package architecture is incompatible')
    }
    if (
      !satisfiesVersion(
        this.options.realmFlowVersion,
        manifest.compatibility.realmflow,
      )
    ) {
      throw new Error('Extension package RealmFlow version is incompatible')
    }
  }

  private async readDefinitions(
    rootPath: string,
    manifest: ExtensionPackageManifest,
    packageDigest: string,
  ): Promise<{ tools: ToolDefinition[]; skills: SkillDefinition[] }> {
    const packageReference = {
      packageId: manifest.packageId,
      packageVersion: manifest.version,
      packageDigest,
    }
    const tools = await Promise.all(
      manifest.tools.map(async ({ path }) => {
        const source = asJsonObject(
          await readJson(
            resolvePackagePath(rootPath, path),
            'Tool definition is missing',
            'Tool definition is invalid',
          ),
          'Tool definition',
        )
        const definition = normalizeToolDefinition({
          ...source,
          package: packageReference,
          origin: 'local_upload',
          definitionDigest: digestDefinition({
            ...source,
            package: packageReference,
            origin: 'local_upload',
          }),
        })
        if (definition.executor.kind !== 'sandbox') {
          throw new Error('Local Extension Tool executor must use the sandbox')
        }
        compileSchema(definition.inputSchema, 'Tool input')
        compileSchema(definition.outputSchema, 'Tool output')
        return definition
      }),
    )
    const skills = await Promise.all(
      manifest.skills.map(async ({ path }) => {
        const source = asJsonObject(
          await readJson(
            resolvePackagePath(rootPath, path),
            'Skill definition is missing',
            'Skill definition is invalid',
          ),
          'Skill definition',
        )
        const definition = normalizeSkillDefinition({
          ...source,
          package: packageReference,
          origin: 'local_upload',
          definitionDigest: digestDefinition({
            ...source,
            package: packageReference,
            origin: 'local_upload',
          }),
        })
        compileSchema(definition.inputSchema, 'Skill input')
        compileSchema(definition.outputSchema, 'Skill output')
        return definition
      }),
    )
    assertUniqueDefinitionIds(tools, skills)
    return { tools, skills }
  }

  private assertReferencedFiles(
    rootPath: string,
    manifest: ExtensionPackageManifest,
    tools: ToolDefinition[],
    skills: SkillDefinition[],
  ): void {
    for (const tool of tools) {
      if (tool.executor.kind === 'sandbox') {
        assertRegularFile(
          rootPath,
          tool.executor.entryPath,
          'Tool sandbox entry file is missing',
        )
      }
    }
    for (const skill of skills) {
      assertRegularFile(
        rootPath,
        skill.instructionsPath,
        'Skill instructions file is missing',
      )
      if (skill.runtime.kind === 'executable') {
        assertRegularFile(
          rootPath,
          skill.runtime.entryPath,
          'Skill executable entry file is missing',
        )
      }
    }
    for (const path of manifest.assets) {
      assertRegularFile(rootPath, path, 'Extension package resource is missing')
    }
  }
}

function createPendingDirectory(
  stagingPath: string,
  finalPath: string,
  digest: string,
): PendingManagedDirectory {
  let ownsFinal = false
  return {
    path: stagingPath,
    directoryName: digest,
    async commit() {
      await mkdir(dirname(finalPath), { recursive: true })
      try {
        await lstat(finalPath)
        await rm(stagingPath, { recursive: true, force: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await rename(stagingPath, finalPath)
        ownsFinal = true
      }
      return { path: finalPath, directoryName: digest }
    },
    async rollback() {
      await rm(ownsFinal ? finalPath : stagingPath, {
        recursive: true,
        force: true,
      })
    },
  }
}

function createLegacyPythonToolSource(
  manifest: SkillManifest,
): JsonObject & { id: string } {
  const capabilities = [
    ...manifest.permissions,
    ...(manifest.network.required ? ['network.connect'] : []),
  ].sort()
  return {
    schemaVersion: 1,
    id: `${manifest.id}.execute`,
    version: manifest.version,
    name: `${manifest.name} executor`,
    description: manifest.description,
    tags: ['legacy'],
    executor: {
      kind: 'sandbox',
      runtime: 'python',
      entryPath: manifest.entry.path,
    },
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    capabilities,
    effects: [
      ...new Set(
        capabilities.map((capability) =>
          capability === 'filesystem.read'
            ? 'local_data.read'
            : 'local_system.change',
        ),
      ),
    ],
    risk: capabilities.some((capability) => capability !== 'filesystem.read')
      ? 'high'
      : 'medium',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false,
    },
    resources: {
      timeoutMs: manifest.resources.timeoutMs,
      maxOutputBytes: manifest.resources.maxOutputBytes,
      maxMemoryMb: manifest.resources.maxMemoryMb,
      maxAttempts: 1,
    },
    discovery: {
      intents: [manifest.name],
      contexts: ['general', 'space', 'requirement', 'workflow', 'schedule'],
    },
  }
}

function createLegacySkillDefinitionSource(
  manifest: SkillManifest,
  instructionsPath: string,
  toolId?: string,
): JsonObject {
  return {
    schemaVersion: 1,
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    instructionsPath,
    runtime: toolId
      ? {
          kind: 'workflow',
          steps: [
            {
              id: 'execute',
              instruction: `Execute ${toolId} with the Skill input.`,
              toolId,
            },
          ],
        }
      : { kind: 'instruction' },
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    requiredTools: toolId
      ? [
          {
            toolId,
            versionRange: manifest.version,
            required: true,
          },
        ]
      : [],
    activation: {
      intents: [manifest.name],
      contexts: ['general', 'space', 'requirement', 'workflow', 'schedule'],
    },
    limits: {
      maxToolCalls: toolId ? 1 : 32,
      timeoutMs: manifest.resources.timeoutMs,
    },
  }
}

async function readJson(
  path: string,
  missingMessage: string,
  invalidMessage: string,
): Promise<unknown> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(missingMessage)
    }
    throw new Error(invalidMessage)
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(invalidMessage)
  }
}

function asJsonObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} is invalid`)
  }
  return value as JsonObject
}

function digestDefinition(value: JsonObject): string {
  const { definitionDigest: _ignored, ...content } = value
  return createHash('sha256').update(canonicalJson(content)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Record<string, unknown>)[key],
          )}`,
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function compileSchema(schema: JsonObject, field: string): void {
  try {
    new Ajv2020({
      strict: true,
      allErrors: false,
      validateFormats: false,
      loadSchema: undefined,
    }).compile(schema)
  } catch {
    throw new Error(`${field} schema is invalid`)
  }
}

function assertUniqueDefinitionIds(
  tools: ToolDefinition[],
  skills: SkillDefinition[],
): void {
  const references = [
    ...tools.map(({ id, version }) => `tool:${id}@${version}`),
    ...skills.map(({ id, version }) => `skill:${id}@${version}`),
  ]
  if (new Set(references).size !== references.length) {
    throw new Error('Extension package definition is duplicated')
  }
}

function assertRegularFile(
  rootPath: string,
  relativePath: string,
  message: string,
): void {
  const path = resolvePackagePath(rootPath, relativePath)
  try {
    const metadata = lstatSync(path)
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error()
  } catch {
    throw new Error(message)
  }
}

function resolvePackagePath(rootPath: string, relativePath: string): string {
  const path = resolve(rootPath, ...relativePath.split('/'))
  if (path === rootPath || !path.startsWith(`${rootPath}${sep}`)) {
    throw new Error('Extension package path is invalid')
  }
  return path
}

function toPortableRelativePath(rootPath: string, path: string): string {
  const value = relative(rootPath, path).split(sep).join('/')
  if (!value || value.startsWith('../') || value.includes('\0')) {
    throw new Error('Extension package path is invalid')
  }
  return value
}

async function removeEntries(rootPath: string): Promise<number> {
  let entries
  try {
    entries = await readdir(rootPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
  await Promise.all(
    entries.map((entry) =>
      rm(join(rootPath, entry), { recursive: true, force: true }),
    ),
  )
  return entries.length
}

function satisfiesVersion(version: string, range: string): boolean {
  if (range === '*') return true
  const clauses = range.trim().split(/\s+/)
  return clauses.every((clause) => {
    const match = /^(>=|<=|>|<|=|\^|~)?(\d+\.\d+\.\d+)$/.exec(clause)
    if (!match) return false
    const comparison = compareVersions(version, match[2])
    switch (match[1] ?? '=') {
      case '>=':
        return comparison >= 0
      case '<=':
        return comparison <= 0
      case '>':
        return comparison > 0
      case '<':
        return comparison < 0
      case '^': {
        const [major] = parseVersion(match[2])
        return comparison >= 0 && parseVersion(version)[0] === major
      }
      case '~': {
        const [major, minor] = parseVersion(match[2])
        const current = parseVersion(version)
        return comparison >= 0 && current[0] === major && current[1] === minor
      }
      default:
        return comparison === 0
    }
  })
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return difference
  }
  return 0
}

function parseVersion(value: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) return [-1, -1, -1]
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}
