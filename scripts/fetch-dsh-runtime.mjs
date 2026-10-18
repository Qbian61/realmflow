import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  targetForDshRuntime,
  validateDshRuntimeManifest
} from './verify-dsh-runtime.mjs'

const execFile = promisify(execFileCallback)

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultSourceRoot = resolve(projectRoot, '../deepseek-harness')
const defaultAssetsRoot = join(projectRoot, 'resources/dsh')
const defaultManifestPath = join(defaultAssetsRoot, 'runtime-manifest.json')
const PINNED_DSH_COMMIT = '571902028a'
const PINNED_DSH_VERSION = '0.2.1-alpha.3'
const PINNED_ACP_SDK_VERSION = '1.4.0'
const PINNED_NODE_VERSION = '22.19.0'
const EXPECTED_TARGETS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64'
]

export async function inspectDshSource({
  allowDirty = false,
  runCommand = runShellCommand,
  sourceRoot = defaultSourceRoot
} = {}) {
  const rootPackage = await readJson(join(sourceRoot, 'package.json'))
  const cliPackage = await readJson(join(sourceRoot, 'apps/cli/package.json'))
  const commit = (
    await runCommand('git', ['-C', sourceRoot, 'rev-parse', '--short=10', 'HEAD'])
  ).trim()
  const status = (
    await runCommand('git', ['-C', sourceRoot, 'status', '--short'])
  ).trim()

  if (commit !== PINNED_DSH_COMMIT) {
    throw new Error(`DSH source commit must be ${PINNED_DSH_COMMIT}`)
  }
  if (rootPackage.version !== PINNED_DSH_VERSION) {
    throw new Error(`DSH source root version must be ${PINNED_DSH_VERSION}`)
  }
  if (cliPackage.name !== '@deepseek-ai/dsh') {
    throw new Error('DSH CLI package must be @deepseek-ai/dsh')
  }
  if (cliPackage.version !== PINNED_DSH_VERSION) {
    throw new Error(`DSH CLI version must be ${PINNED_DSH_VERSION}`)
  }
  const acpSdkVersion =
    cliPackage.dependencies?.['@agentclientprotocol/sdk'] ??
    cliPackage.devDependencies?.['@agentclientprotocol/sdk']
  if (acpSdkVersion !== PINNED_ACP_SDK_VERSION) {
    throw new Error(`ACP SDK version must be ${PINNED_ACP_SDK_VERSION}`)
  }
  const nodeEngine = rootPackage.engines?.node
  if (typeof nodeEngine !== 'string' || !nodeEngine.includes(PINNED_NODE_VERSION)) {
    throw new Error(`DSH source Node engine must include ${PINNED_NODE_VERSION}`)
  }
  if (status && !allowDirty) {
    throw new Error('DSH source must be clean before runtime manifest generation')
  }

  return {
    acpSdkVersion,
    commit,
    dirty: Boolean(status),
    dshVersion: cliPackage.version,
    nodeEngine,
    sourceRoot,
    status
  }
}

export async function fetchDshRuntime({
  allowDirty = false,
  assetsRoot = defaultAssetsRoot,
  manifestPath = defaultManifestPath,
  recordedAt = new Date().toISOString(),
  runCommand = runShellCommand,
  sourceRoot = defaultSourceRoot,
  targets = [targetForDshRuntime()]
} = {}) {
  const source = await inspectDshSource({
    allowDirty,
    runCommand,
    sourceRoot
  })
  const manifest = await buildRuntimeManifest({
    assetsRoot,
    recordedAt,
    source,
    targets
  })
  validateDshRuntimeManifest(manifest)
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export async function buildRuntimeManifest({
  assetsRoot = defaultAssetsRoot,
  recordedAt = new Date().toISOString(),
  source,
  targets = [targetForDshRuntime()]
} = {}) {
  if (!source) {
    throw new Error('DSH source metadata is required')
  }
  const selectedTargets = normalizeTargets(targets)
  const assets = {}
  for (const target of EXPECTED_TARGETS) {
    assets[target] = {
      ...assetPathsForTarget(target),
      files: selectedTargets.includes(target)
        ? await collectRequiredFilesForTarget({ assetsRoot, target })
        : []
    }
  }

  return {
    schemaVersion: 1,
    runtimeId: 'dsh-v0.2.1-alpha.3-16-g571902028a',
    dsh: {
      package: '@deepseek-ai/dsh',
      version: PINNED_DSH_VERSION,
      commit: PINNED_DSH_COMMIT,
      sourceRepository: 'https://github.com/deepseek-ai/deepseek-harness.git'
    },
    acp: {
      package: '@agentclientprotocol/sdk',
      version: PINNED_ACP_SDK_VERSION
    },
    node: {
      version: PINNED_NODE_VERSION,
      source: 'nodejs.org-dist',
      baseUrl: `https://nodejs.org/dist/v${PINNED_NODE_VERSION}`
    },
    provenance: {
      buildTool: 'scripts/fetch-dsh-runtime.mjs',
      buildSource: portablePath(relative(projectRoot, source.sourceRoot)),
      recordedAt,
      sourceDirty: source.dirty,
      sourceStatus: source.status
    },
    assets
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchDshRuntime(parseArguments(process.argv.slice(2)))
    .then((manifest) => {
      const indexedTargets = Object.entries(manifest.assets)
        .filter(([, asset]) => asset.files.length > 0)
        .map(([target]) => target)
      process.stdout.write(
        `Fetched DSH runtime manifest for: ${indexedTargets.join(', ')}\n`
      )
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      )
      process.exitCode = 1
    })
}

function parseArguments(argv) {
  const options = {
    allowDirty: false,
    assetsRoot: defaultAssetsRoot,
    manifestPath: defaultManifestPath,
    sourceRoot: defaultSourceRoot,
    targets: undefined
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--allow-dirty-source') {
      options.allowDirty = true
    } else if (argument === '--all') {
      options.targets = EXPECTED_TARGETS
    } else if (argument === '--assets-dir') {
      options.assetsRoot = resolve(argv[++index])
    } else if (argument === '--manifest') {
      options.manifestPath = resolve(argv[++index])
    } else if (argument === '--source') {
      options.sourceRoot = resolve(argv[++index])
    } else if (argument === '--target') {
      options.targets = [argv[++index]]
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return options
}

async function collectRequiredFilesForTarget({ assetsRoot, target }) {
  const paths = assetPathsForTarget(target)
  const [nodeBinary, dshEntrypoint, nativeSystemFiles, profile] = await Promise.all([
    artifactMetadata(assetsRoot, paths.nodeBinary, { executable: true }),
    artifactMetadata(assetsRoot, paths.dshEntrypoint, { executable: true }),
    nativeSystemArtifactMetadata({ assetsRoot, target }),
    artifactMetadata(assetsRoot, paths.profilePath)
  ])
  return [
    nodeBinary,
    dshEntrypoint,
    ...nativeSystemFiles,
    profile
  ]
}

function assetPathsForTarget(target) {
  const [platform, arch] = splitTarget(target)
  const nodeBinary =
    platform === 'win32'
      ? `runtime/${target}/node/node.exe`
      : `runtime/${target}/node/bin/node`
  return {
    platform,
    arch,
    runtimeRoot: `runtime/${target}`,
    nodeBinary,
    dshEntrypoint: `runtime/${target}/dsh/apps/cli/lib/bin.js`,
    profilePath: 'profile/package.json'
  }
}

async function artifactMetadata(assetsRoot, path, { executable = false } = {}) {
  const absolutePath = join(assetsRoot, path)
  let metadata
  try {
    metadata = await stat(absolutePath)
  } catch {
    throw new Error(`Missing staged DSH runtime asset: ${path}`)
  }
  if (!metadata.isFile()) {
    throw new Error(`Staged DSH runtime asset must be a file: ${path}`)
  }
  const artifact = {
    path,
    size: metadata.size,
    sha256: await sha256(absolutePath)
  }
  if (executable) artifact.executable = true
  return artifact
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('At least one DSH runtime target is required')
  }
  for (const target of targets) {
    if (!EXPECTED_TARGETS.includes(target)) {
      throw new Error(`Unsupported DSH runtime target: ${target}`)
    }
  }
  return [...new Set(targets)]
}

function splitTarget(target) {
  const [platform, arch] = target.startsWith('win32-')
    ? ['win32', target.slice('win32-'.length)]
    : target.split('-')
  return [platform, arch]
}


async function nativeSystemArtifactMetadata({ assetsRoot, target }) {
  const [platform, arch] = splitTarget(target)
  if (platform === 'win32') return []

  const packageRoot = `runtime/${target}/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-${platform}-${arch}`
  const packageJsonPath = `${packageRoot}/package.json`
  const prebuildsPath = `${packageRoot}/prebuilds.json`
  const packageJson = await artifactMetadata(assetsRoot, packageJsonPath)
  const prebuilds = await artifactMetadata(assetsRoot, prebuildsPath)
  const prebuildsJson = await readJson(join(assetsRoot, prebuildsPath))
  const binaries = Array.isArray(prebuildsJson?.binaries) ? prebuildsJson.binaries : []
  if (binaries.length === 0) {
    throw new Error(`DSH native system prebuild metadata is empty: ${prebuildsPath}`)
  }
  const binaryArtifacts = await Promise.all(
    binaries.map((binary) => {
      if (typeof binary?.path !== 'string' || binary.path.trim() === '') {
        throw new Error(`DSH native system prebuild path is invalid: ${prebuildsPath}`)
      }
      return artifactMetadata(assetsRoot, `${packageRoot}/${binary.path}`, {
        executable: binary.kind === 'static-musl'
      })
    })
  )
  return [packageJson, prebuilds, ...binaryArtifacts]
}
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `Unable to read DSH source metadata at ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

async function runShellCommand(command, args) {
  const { stdout } = await execFile(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  })
  return stdout
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function portablePath(path) {
  return path.split('/').join('/')
}
