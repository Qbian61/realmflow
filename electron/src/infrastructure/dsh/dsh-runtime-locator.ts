import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PINNED_DSH_PACKAGE = '@deepseek-ai/dsh'
const PINNED_DSH_VERSION = '0.2.1-alpha.3'
const PINNED_DSH_COMMIT = '571902028a'
const PINNED_ACP_PACKAGE = '@agentclientprotocol/sdk'
const PINNED_ACP_VERSION = '1.4.0'
const PINNED_NODE_VERSION = '22.19.0'

export type DshRuntimeLocatorOptions = {
  assetsRoot?: string
  manifestPath?: string
  projectRoot?: string
  resourcesPath?: string
  userDataPath: string
  isPackaged: boolean
  platform?: NodeJS.Platform | string
  arch?: NodeJS.Architecture | string
}

export type DshRuntimeLocation = {
  target: string
  runtimeId: string
  runtimeBuildDigest: string
  assetsRoot: string
  manifestPath: string
  runtimeRoot: string
  nodeBinaryPath: string
  dshEntrypointPath: string
  profilePath: string
  dshHome: string
}

export type DshRuntimeLocatorPort = {
  resolve(): Promise<DshRuntimeLocation>
}

type DshRuntimeManifest = {
  schemaVersion: number
  runtimeId: string
  dsh?: {
    package?: string
    version?: string
    commit?: string
  }
  acp?: {
    package?: string
    version?: string
  }
  node?: {
    version?: string
  }
  assets?: Record<string, DshRuntimeAsset>
}

type DshRuntimeAsset = {
  platform?: string
  arch?: string
  runtimeRoot?: string
  nodeBinary?: string
  dshEntrypoint?: string
  profilePath?: string
}

export class DshRuntimeLocator implements DshRuntimeLocatorPort {
  constructor(private readonly options: DshRuntimeLocatorOptions) {}

  async resolve(): Promise<DshRuntimeLocation> {
    const assetsRoot = this.assetsRoot()
    const manifestPath = this.options.manifestPath ?? join(assetsRoot, 'runtime-manifest.json')
    const manifestContent = await readFile(manifestPath)
    const manifest = validateManifest(
      JSON.parse(manifestContent.toString('utf8')) as DshRuntimeManifest
    )
    const target = targetForRuntime(this.options.platform, this.options.arch)
    const asset = manifest.assets?.[target]
    if (asset === undefined) {
      throw new Error(`Unsupported DSH runtime target: ${target}`)
    }
    validateAsset(target, asset)
    const dshHome = join(this.options.userDataPath, 'dsh', 'home')
    const profilePath = resolveInside(assetsRoot, asset.profilePath!, 'profilePath')
    await mkdir(dshHome, { recursive: true })
    await syncManagedAcpProfile(dirname(profilePath), join(dshHome, 'profiles', 'acp'))
    return {
      target,
      runtimeId: manifest.runtimeId,
      runtimeBuildDigest: createHash('sha256').update(manifestContent).digest('hex'),
      assetsRoot,
      manifestPath,
      runtimeRoot: resolveInside(assetsRoot, asset.runtimeRoot!, 'runtimeRoot'),
      nodeBinaryPath: resolveInside(assetsRoot, asset.nodeBinary!, 'nodeBinary'),
      dshEntrypointPath: resolveInside(
        assetsRoot,
        asset.dshEntrypoint!,
        'dshEntrypoint'
      ),
      profilePath,
      dshHome
    }
  }

  private assetsRoot(): string {
    if (this.options.assetsRoot !== undefined) return this.options.assetsRoot
    if (this.options.isPackaged) {
      const resourcesPath = this.options.resourcesPath ?? electronResourcesPath()
      return join(resourcesPath, 'dsh')
    }
    return join(this.options.projectRoot ?? defaultProjectRoot(), 'resources', 'dsh')
  }
}

function validateManifest(manifest: DshRuntimeManifest): DshRuntimeManifest {
  if (!isRecord(manifest)) {
    throw new Error('DSH runtime manifest must be an object')
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error('DSH runtime manifest schemaVersion must be 1')
  }
  if (manifest.runtimeId.trim() === '') {
    throw new Error('DSH runtime manifest runtimeId is required')
  }
  if (manifest.dsh?.package !== PINNED_DSH_PACKAGE) {
    throw new Error(`DSH runtime package must be ${PINNED_DSH_PACKAGE}`)
  }
  if (manifest.dsh.version !== PINNED_DSH_VERSION) {
    throw new Error(`DSH version must be ${PINNED_DSH_VERSION}`)
  }
  if (manifest.dsh.commit !== PINNED_DSH_COMMIT) {
    throw new Error(`DSH commit must be ${PINNED_DSH_COMMIT}`)
  }
  if (manifest.acp?.package !== PINNED_ACP_PACKAGE) {
    throw new Error(`ACP SDK package must be ${PINNED_ACP_PACKAGE}`)
  }
  if (manifest.acp.version !== PINNED_ACP_VERSION) {
    throw new Error(`ACP SDK version must be ${PINNED_ACP_VERSION}`)
  }
  if (manifest.node?.version !== PINNED_NODE_VERSION) {
    throw new Error(`DSH Node runtime version must be ${PINNED_NODE_VERSION}`)
  }
  if (!isRecord(manifest.assets)) {
    throw new Error('DSH runtime manifest assets are required')
  }
  if (/(?:^|\/)(?:latest|download\/latest)(?:[/"?]|$)/i.test(JSON.stringify(manifest))) {
    throw new Error('DSH runtime manifest must not use latest URLs')
  }
  return manifest
}

function validateAsset(target: string, asset: DshRuntimeAsset): void {
  const [platform, arch] = splitTarget(target)
  if (asset.platform !== platform || asset.arch !== arch) {
    throw new Error(`DSH runtime asset platform mismatch for ${target}`)
  }
  for (const field of ['runtimeRoot', 'nodeBinary', 'dshEntrypoint', 'profilePath'] as const) {
    if (typeof asset[field] !== 'string' || asset[field]!.trim() === '') {
      throw new Error(`DSH runtime asset ${field} is required for ${target}`)
    }
  }
}

function targetForRuntime(
  platform: string | undefined = process.platform,
  arch: string | undefined = process.arch
): string {
  const target = `${platform}-${arch}`
  if (
    ![
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-x64'
    ].includes(target)
  ) {
    throw new Error(`Unsupported DSH runtime target: ${target}`)
  }
  return target
}

function splitTarget(target: string): [string, string] {
  if (target.startsWith('win32-')) return ['win32', target.slice('win32-'.length)]
  const [platform, arch] = target.split('-')
  return [platform, arch]
}

function resolveInside(root: string, relativePath: string, label: string): string {
  if (
    isAbsolute(relativePath)
    || relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error(`unsafe DSH runtime path for ${label}`)
  }
  return join(root, relativePath)
}

async function syncManagedAcpProfile(sourceRoot: string, targetRoot: string): Promise<void> {
  await rm(targetRoot, { recursive: true, force: true })
  await mkdir(dirname(targetRoot), { recursive: true })
  await cp(sourceRoot, targetRoot, { recursive: true })
}

function defaultProjectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
}

function electronResourcesPath(): string {
  const processWithResources = process as NodeJS.Process & { resourcesPath?: string }
  return processWithResources.resourcesPath ?? join(defaultProjectRoot(), 'resources')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
