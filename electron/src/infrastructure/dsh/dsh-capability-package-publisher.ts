import { createHash } from 'node:crypto'
import {
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat
} from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import {
  requireDigest,
  requireIdentifier,
  requireSafeRelativePath,
  requireSemver
} from '../../../../domain/tool-protocol-validation'

export type DshCapabilityArtifactKind =
  | 'tool-adapter'
  | 'skill-instructions'
  | 'skill-adapter'
  | 'agent-preset'
  | 'mcp-descriptor'
  | 'connector-adapter'

export type DshCapabilityPackageSource = {
  packageId: string
  version: string
  packageDigest: string
  sourcePath: string
  status: 'enabled' | 'disabled' | 'superseded' | 'dependency_disabled' | 'corrupted'
  verification: {
    signature: 'verified' | 'missing' | 'invalid'
    checksum: 'verified' | 'missing' | 'mismatch'
    permissions: 'verified' | 'invalid'
    runtimeCompatibility: 'compatible' | 'incompatible'
    dependencyLock: 'locked' | 'missing' | 'stale'
  }
  artifacts: DshCapabilityArtifactSource[]
}

export type DshCapabilityArtifactSource = {
  kind: DshCapabilityArtifactKind
  capabilityId: string
  relativePath: string
}

export type PublishedDshCapabilityArtifact = {
  kind: DshCapabilityArtifactKind
  capabilityId: string
  sourceRelativePath: string
  digest: string
  path: string
}

export type PublishedDshCapabilityPackage = {
  packageId: string
  version: string
  packageDigest: string
  sourcePath: string
  packagePath: string
  mount: {
    path: string
    readOnly: true
  }
  artifacts: PublishedDshCapabilityArtifact[]
}

export type PublishDshCapabilityPackagesResult = {
  packages: PublishedDshCapabilityPackage[]
}

export class DshCapabilityPackagePublisher {
  constructor(private readonly options: { storeRoot: string }) {}

  async publish(
    sources: readonly DshCapabilityPackageSource[]
  ): Promise<PublishDshCapabilityPackagesResult> {
    const packages: PublishedDshCapabilityPackage[] = []
    await mkdir(this.options.storeRoot, { recursive: true })
    for (const source of sources) {
      if (source.status !== 'enabled') continue
      packages.push(await this.publishOne(source))
    }
    return { packages }
  }

  async garbageCollect(input: {
    activePackageDigests: readonly string[]
  }): Promise<string[]> {
    const packagesRoot = join(this.options.storeRoot, 'packages')
    const artifactsRoot = join(this.options.storeRoot, 'artifacts')
    const active = new Set(input.activePackageDigests.map((digest) =>
      requireDigest(digest, 'active package digest')
    ))
    let entries: string[]
    try {
      entries = await readdir(packagesRoot)
    } catch {
      return []
    }
    const removed: string[] = []
    for (const entry of entries.sort()) {
      const digest = requireDigest(entry, 'package digest')
      if (active.has(digest)) continue
      await makeWritable(join(packagesRoot, digest))
      await rm(join(packagesRoot, digest), { recursive: true, force: true })
      await makeWritable(join(artifactsRoot, digest))
      await rm(join(artifactsRoot, digest), { recursive: true, force: true })
      removed.push(digest)
    }
    return removed
  }

  private async publishOne(
    source: DshCapabilityPackageSource
  ): Promise<PublishedDshCapabilityPackage> {
    const normalized = await this.normalizeAndVerifySource(source)
    const packagePath = join(
      this.options.storeRoot,
      'packages',
      normalized.packageDigest
    )
    await rm(packagePath, { recursive: true, force: true })
    await mkdir(packagePath, { recursive: true })
    await cp(normalized.sourcePath, packagePath, { recursive: true })
    const artifacts = await this.publishArtifacts(normalized)
    await makeFilesReadOnly(packagePath)
    for (const artifact of artifacts) await chmod(artifact.path, 0o444)
    return {
      packageId: normalized.packageId,
      version: normalized.version,
      packageDigest: normalized.packageDigest,
      sourcePath: normalized.sourcePath,
      packagePath,
      mount: {
        path: packagePath,
        readOnly: true
      },
      artifacts
    }
  }

  private async publishArtifacts(
    source: DshCapabilityPackageSource
  ): Promise<PublishedDshCapabilityArtifact[]> {
    const artifacts: PublishedDshCapabilityArtifact[] = []
    for (const artifact of source.artifacts) {
      const normalized = normalizeArtifact(artifact)
      const sourceFile = await resolveInside(
        source.sourcePath,
        normalized.relativePath,
        'artifact path'
      )
      const content = await readFile(sourceFile)
      const digest = digestBuffer(content)
      const targetPath = join(
        this.options.storeRoot,
        'artifacts',
        source.packageDigest,
        normalized.kind,
        normalized.capabilityId,
        `${digest}-${basename(normalized.relativePath)}`
      )
      await mkdir(join(targetPath, '..'), { recursive: true })
      await cp(sourceFile, targetPath)
      artifacts.push({
        kind: normalized.kind,
        capabilityId: normalized.capabilityId,
        sourceRelativePath: normalized.relativePath,
        digest,
        path: targetPath
      })
    }
    return artifacts
  }

  private async normalizeAndVerifySource(
    source: DshCapabilityPackageSource
  ): Promise<DshCapabilityPackageSource> {
    const normalized: DshCapabilityPackageSource = {
      packageId: requireIdentifier(source.packageId, 'package ID'),
      version: requireSemver(source.version, 'package version'),
      packageDigest: requireDigest(source.packageDigest, 'package digest'),
      sourcePath: await realpath(source.sourcePath),
      status: source.status,
      verification: { ...source.verification },
      artifacts: source.artifacts.map(normalizeArtifact)
    }
    await assertDirectory(normalized.sourcePath)
    if (normalized.verification.signature !== 'verified') {
      throw new Error('DSH capability package signature is not verified')
    }
    if (normalized.verification.checksum !== 'verified') {
      throw new Error('DSH capability package checksum is not verified')
    }
    if (normalized.verification.permissions !== 'verified') {
      throw new Error('DSH capability package permissions are not verified')
    }
    if (normalized.verification.runtimeCompatibility !== 'compatible') {
      throw new Error('DSH capability package runtime compatibility is invalid')
    }
    if (normalized.verification.dependencyLock !== 'locked') {
      throw new Error('DSH capability package dependency lock is invalid')
    }
    const actualDigest = await digestDirectory(normalized.sourcePath)
    if (actualDigest !== normalized.packageDigest) {
      throw new Error('DSH capability package checksum mismatch')
    }
    for (const artifact of normalized.artifacts) {
      await resolveInside(normalized.sourcePath, artifact.relativePath, 'artifact path')
    }
    return normalized
  }
}

function normalizeArtifact(
  artifact: DshCapabilityArtifactSource
): DshCapabilityArtifactSource {
  return {
    kind: artifact.kind,
    capabilityId: requireIdentifier(artifact.capabilityId, 'capability ID'),
    relativePath: requireSafeRelativePath(
      artifact.relativePath,
      'artifact path'
    )
  }
}

async function assertDirectory(path: string): Promise<void> {
  const metadata = await stat(path)
  if (!metadata.isDirectory()) {
    throw new Error('DSH capability package source must be a directory')
  }
}

async function resolveInside(
  root: string,
  relativePath: string,
  label: string
): Promise<string> {
  const absolute = await realpath(join(root, relativePath))
  const rootPath = await realpath(root)
  const relativeToRoot = relative(rootPath, absolute)
  if (relativeToRoot.startsWith('..') || relativeToRoot === '') {
    throw new Error(`DSH capability package ${label} is invalid`)
  }
  const metadata = await stat(absolute)
  if (!metadata.isFile()) {
    throw new Error(`DSH capability package ${label} must be a file`)
  }
  return absolute
}

async function digestDirectory(root: string): Promise<string> {
  const files = await listFiles(root)
  const hash = createHash('sha256')
  for (const file of files) {
    const content = await readFile(join(root, file))
    hash.update(`${file.length}:${file}`)
    hash.update(`${content.byteLength}:`)
    hash.update(content)
  }
  return hash.digest('hex')
}

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, path))
    } else if (entry.isFile()) {
      files.push(path)
    }
  }
  return files.sort()
}

async function makeFilesReadOnly(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      await makeFilesReadOnly(path)
    } else if (entry.isFile()) {
      await chmod(path, 0o444)
    }
  }
}

async function makeWritable(path: string): Promise<void> {
  let metadata
  try {
    metadata = await stat(path)
  } catch {
    return
  }
  if (metadata.isDirectory()) {
    await chmod(path, 0o755)
    const entries = await readdir(path)
    for (const entry of entries) await makeWritable(join(path, entry))
  } else {
    await chmod(path, 0o644)
  }
}

function digestBuffer(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}
