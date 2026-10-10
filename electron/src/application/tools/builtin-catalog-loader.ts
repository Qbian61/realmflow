import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  calculateExtensionPackageDigest,
  normalizeExtensionPackageManifest,
  type LegacyExtensionPackageManifest
} from '../../../../domain/extension-package'
import {
  normalizeSkillDefinition,
  type SkillDefinition
} from '../../../../domain/skill-definition'
import {
  normalizeToolDefinition,
  type ToolDefinition
} from '../../../../domain/tool-definition'
import {
  requireDigest,
  requireExactKeys,
  requireIdentifier,
  requireObject,
  requireSafeRelativePath,
  requireSemver
} from '../../../../domain/tool-protocol-validation'

export type BuiltinCatalogPackage = {
  manifest: LegacyExtensionPackageManifest
  packageDigest: string
  tools: ToolDefinition[]
  skills: SkillDefinition[]
  rootPath: string
}

type BuiltinIndexEntry = {
  packageId: string
  version: string
  path: string
  sourceDigest: string
  toolDefinitions: Array<{ id: string; version: string }>
  skillDefinitions: Array<{ id: string; version: string }>
}

export class BuiltinCatalogLoader {
  constructor(private readonly catalogRoot: string) {}

  async load(): Promise<BuiltinCatalogPackage[]> {
    const canonicalRoot = await realpath(this.catalogRoot)
    const entries = normalizeIndex(
      await readJson(join(canonicalRoot, 'index.json'), 'Builtin catalog index')
    )
    const packages = await Promise.all(
      entries.map((entry) => this.loadPackage(canonicalRoot, entry))
    )
    assertGlobalContract(packages)
    return packages.sort((left, right) =>
      left.manifest.packageId.localeCompare(right.manifest.packageId)
    )
  }

  private async loadPackage(
    catalogRoot: string,
    entry: BuiltinIndexEntry
  ): Promise<BuiltinCatalogPackage> {
    const manifestPath = resolveContained(catalogRoot, entry.path)
    const rootPath = dirname(manifestPath)
    const manifest = normalizeExtensionPackageManifest(
      await readJson(manifestPath, 'Builtin extension manifest')
    )
    if (manifest.schemaVersion !== 1) {
      throw new Error('Builtin extension manifest schema is unsupported')
    }
    if (
      manifest.packageId !== entry.packageId ||
      manifest.version !== entry.version
    ) {
      throw new Error('Builtin catalog package identity conflicts')
    }
    const files = await scanFiles(rootPath)
    const packageDigest = calculateExtensionPackageDigest(files)
    if (packageDigest !== entry.sourceDigest) {
      throw new Error('Builtin catalog package digest conflicts')
    }
    const packageReference = {
      packageId: manifest.packageId,
      packageVersion: manifest.version,
      packageDigest
    }
    const tools = await Promise.all(
      manifest.tools.map(async ({ path }) => {
        const source = requireObject(
          await readJson(
            resolveContained(rootPath, path),
            'Builtin Tool definition'
          ),
          'Builtin Tool definition'
        )
        return normalizeToolDefinition({
          ...source,
          package: packageReference,
          origin: 'builtin',
          definitionDigest: digestDefinition({
            ...source,
            package: packageReference,
            origin: 'builtin'
          })
        })
      })
    )
    const skills = await Promise.all(
      manifest.skills.map(async ({ path }) => {
        const source = requireObject(
          await readJson(
            resolveContained(rootPath, path),
            'Builtin Skill definition'
          ),
          'Builtin Skill definition'
        )
        return normalizeSkillDefinition({
          ...source,
          package: packageReference,
          origin: 'builtin',
          definitionDigest: digestDefinition({
            ...source,
            package: packageReference,
            origin: 'builtin'
          })
        })
      })
    )
    if (
      !sameDefinitionReferences(entry.toolDefinitions, tools) ||
      !sameDefinitionReferences(entry.skillDefinitions, skills)
    ) {
      throw new Error('Builtin catalog definition index conflicts')
    }
    for (const path of manifest.assets) {
      await requireRegularFile(rootPath, path)
    }
    return { manifest, packageDigest, tools, skills, rootPath }
  }
}

function normalizeIndex(value: unknown): BuiltinIndexEntry[] {
  const index = requireObject(value, 'Builtin catalog index')
  requireExactKeys(
    index,
    new Set(['schemaVersion', 'catalogVersion', 'packages']),
    'Builtin catalog index'
  )
  if (index.schemaVersion !== 1 || !Array.isArray(index.packages)) {
    throw new Error('Builtin catalog index is invalid')
  }
  requireSemver(index.catalogVersion, 'Builtin catalog version')
  return index.packages.map((value) => {
    const entry = requireObject(value, 'Builtin catalog package')
    requireExactKeys(
      entry,
      new Set([
        'packageId',
        'version',
        'path',
        'sourceDigest',
        'toolDefinitions',
        'skillDefinitions'
      ]),
      'Builtin catalog package'
    )
    return {
      packageId: requireIdentifier(
        entry.packageId,
        'Builtin package ID'
      ),
      version: requireSemver(entry.version, 'Builtin package version'),
      path: requireSafeRelativePath(entry.path, 'Builtin package path'),
      sourceDigest: requireDigest(
        entry.sourceDigest,
        'Builtin package digest'
      ),
      toolDefinitions: normalizeDefinitionReferences(
        entry.toolDefinitions,
        'Builtin Tool definitions'
      ),
      skillDefinitions: normalizeDefinitionReferences(
        entry.skillDefinitions,
        'Builtin Skill definitions'
      )
    }
  })
}

function normalizeDefinitionReferences(
  value: unknown,
  field: string
): Array<{ id: string; version: string }> {
  if (!Array.isArray(value)) throw new Error(`${field} are invalid`)
  const references = value.map((value) => {
    const reference = requireObject(value, field)
    requireExactKeys(reference, new Set(['id', 'version']), field)
    return {
      id: requireIdentifier(reference.id, field),
      version: requireSemver(reference.version, field)
    }
  })
  const ids = references.map(({ id }) => id)
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${field} are duplicated`)
  }
  return references.sort((left, right) => left.id.localeCompare(right.id))
}

async function scanFiles(
  rootPath: string
): Promise<Array<{ path: string; content: Uint8Array }>> {
  const files: Array<{ path: string; content: Uint8Array }> = []
  await walk(rootPath, rootPath, files)
  return files
}

async function walk(
  rootPath: string,
  currentPath: string,
  files: Array<{ path: string; content: Uint8Array }>
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(currentPath, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
      throw new Error('Builtin catalog contains an unsupported file')
    }
    if (metadata.isDirectory()) {
      await walk(rootPath, path, files)
    } else {
      files.push({
        path: relative(rootPath, path).split(sep).join('/'),
        content: await readFile(path)
      })
    }
  }
}

async function readJson(path: string, field: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error(`${field} is invalid`)
  }
}

function resolveContained(rootPath: string, relativePath: string): string {
  const path = resolve(
    rootPath,
    ...requireSafeRelativePath(relativePath, 'Builtin path').split('/')
  )
  if (path === rootPath || !path.startsWith(`${rootPath}${sep}`)) {
    throw new Error('Builtin catalog path escapes its root')
  }
  return path
}

async function requireRegularFile(
  rootPath: string,
  relativePath: string
): Promise<void> {
  try {
    const metadata = await lstat(resolveContained(rootPath, relativePath))
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error()
  } catch {
    throw new Error('Builtin catalog resource is missing')
  }
}

function digestDefinition(
  value: Record<string, unknown>
): string {
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
            (value as Record<string, unknown>)[key]
          )}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sameDefinitionReferences(
  left: Array<{ id: string; version: string }>,
  right: Array<{ id: string; version: string }>
): boolean {
  const key = ({ id, version }: { id: string; version: string }) =>
    `${id}@${version}`
  return (
    JSON.stringify(left.map(key).sort()) ===
    JSON.stringify(right.map(key).sort())
  )
}

function assertGlobalContract(packages: BuiltinCatalogPackage[]): void {
  const tools = packages.flatMap(({ tools }) => tools)
  const skills = packages.flatMap(({ skills }) => skills)
  const toolIds = tools.map(({ id }) => id)
  const skillDefinitionKeys = skills.map(
    ({ id, version }) => `${id}@${version}`
  )
  if (
    new Set(toolIds).size !== toolIds.length ||
    new Set(skillDefinitionKeys).size !== skillDefinitionKeys.length
  ) {
    throw new Error('Builtin catalog definition ID is duplicated')
  }
  const availableTools = new Set(toolIds)
  for (const skill of skills) {
    for (const dependency of skill.requiredTools) {
      if (!availableTools.has(dependency.toolId)) {
        throw new Error('Builtin Skill dependency is unavailable')
      }
    }
  }
}
