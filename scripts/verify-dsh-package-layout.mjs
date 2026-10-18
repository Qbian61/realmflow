import { constants } from 'node:fs'
import { access, lstat, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parse } from 'yaml'

import {
  targetForDshRuntime,
  verifyDshRuntime
} from './verify-dsh-runtime.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultBuilderConfigPath = join(projectRoot, 'build/electron-builder.yml')
const defaultNoticesPath = join(projectRoot, 'THIRD_PARTY_NOTICES.md')
const defaultResourcesRoot = join(projectRoot, 'resources/dsh')
const EXPECTED_TARGETS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64'
]
const REQUIRED_DSH_WORKSPACE_ENTRY_BUNDLES = [
  '@deepseek-ai/cordis-plugin-group',
  '@deepseek-ai/dsh-typert-registry',
  '@deepseek-ai/dsh-api-gateway'
]
const FORBIDDEN_RUNTIME_DEV_DIRECTORIES = new Set([
  '__tests__',
  'snapshots',
  'tests'
])

export async function verifyDshPackageLayout({
  all = false,
  builderConfigPath = defaultBuilderConfigPath,
  noticesPath = defaultNoticesPath,
  resourcesRoot = defaultResourcesRoot,
  runCommand,
  target
} = {}) {
  const targets = all ? EXPECTED_TARGETS : [target ?? targetForDshRuntime()]
  await verifyBuilderConfig(builderConfigPath)
  await verifyNotices(noticesPath)
  await verifySbom(join(resourcesRoot, 'runtime-sbom.cyclonedx.json'))
  for (const selectedTarget of targets) {
    await verifyTargetLayout(resourcesRoot, selectedTarget)
    await verifyDshRuntime({
      assetsRoot: resourcesRoot,
      manifestPath: join(resourcesRoot, 'runtime-manifest.json'),
      ...(runCommand === undefined ? {} : { runCommand }),
      target: selectedTarget
    })
  }
  return targets
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDshPackageLayout(parseArguments(process.argv.slice(2)))
    .then((targets) => {
      process.stdout.write(`Verified DSH package layout: ${targets.join(', ')}\n`)
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      )
      process.exitCode = 1
    })
}

async function verifyTargetLayout(resourcesRoot, target) {
  const [platform] = splitTarget(target)
  const nodeBinary =
    platform === 'win32'
      ? `runtime/${target}/node/node.exe`
      : `runtime/${target}/node/bin/node`
  const requiredFiles = [
    'runtime-manifest.json',
    'runtime-sbom.cyclonedx.json',
    nodeBinary,
    `runtime/${target}/dsh/apps/cli/lib/bin.js`,
    ...REQUIRED_DSH_WORKSPACE_ENTRY_BUNDLES.flatMap((packageName) =>
      requiredDshWorkspacePackageFiles(target, packageName)
    ),
    'profile/package.json',
    'profile/cordis.patch.yml'
  ]
  for (const file of requiredFiles) {
    await requireFile(join(resourcesRoot, file), file)
  }
  await verifyNodeAddonSystemPackage(resourcesRoot, target)
  await verifyRuntimeSymlinks(resourcesRoot, target)
  if (platform !== 'win32') {
    await access(join(resourcesRoot, nodeBinary), constants.X_OK)
    await access(
      join(resourcesRoot, `runtime/${target}/dsh/apps/cli/lib/bin.js`),
      constants.X_OK
    )
  }
}

async function verifyNodeAddonSystemPackage(resourcesRoot, target) {
  const [platform, arch] = splitTarget(target)
  if (platform === 'win32') return

  const packageName = `@deepseek-ai/node-addon-system-${platform}-${arch}`
  const packageRoot = join(
    resourcesRoot,
    `runtime/${target}/dsh/apps/cli/node_modules/${packageName}`
  )
  const packageLabel = `runtime/${target}/dsh/apps/cli/node_modules/${packageName}`
  await requireFile(join(packageRoot, 'package.json'), `${packageLabel}/package.json`)
  await requireFile(join(packageRoot, 'prebuilds.json'), `${packageLabel}/prebuilds.json`)

  let prebuilds
  try {
    prebuilds = JSON.parse(await readFile(join(packageRoot, 'prebuilds.json'), 'utf8'))
  } catch {
    throw new Error(`DSH package layout has invalid native prebuild metadata: ${packageLabel}/prebuilds.json`)
  }
  const binaries = Array.isArray(prebuilds?.binaries) ? prebuilds.binaries : []
  if (binaries.length === 0) {
    throw new Error(`DSH package layout native prebuild metadata is empty: ${packageLabel}/prebuilds.json`)
  }

  for (const binary of binaries) {
    if (typeof binary?.path !== 'string' || binary.path.trim() === '') {
      throw new Error(`DSH package layout native prebuild path is invalid: ${packageLabel}/prebuilds.json`)
    }
    const label = `${packageLabel}/${binary.path}`
    const absolutePath = join(packageRoot, binary.path)
    await requireFile(absolutePath, label)
    if (binary.kind === 'static-musl') {
      await access(absolutePath, constants.X_OK)
    }
  }
}

function requiredDshWorkspacePackageFiles(target, packageName) {
  return [
    `runtime/${target}/dsh/apps/cli/node_modules/${packageName}/package.json`,
    `runtime/${target}/dsh/apps/cli/node_modules/${packageName}/lib/index.js`
  ]
}

async function verifyRuntimeSymlinks(resourcesRoot, target) {
  const runtimeRoot = join(resourcesRoot, `runtime/${target}`)
  const runtimeRootReal = await realpath(runtimeRoot)
  await walkRuntimeSymlinks({
    directory: runtimeRoot,
    labelRoot: `runtime/${target}`,
    runtimeRoot,
    runtimeRootReal
  })
}

async function walkRuntimeSymlinks({
  directory,
  labelRoot,
  runtimeRoot,
  runtimeRootReal
}) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name)
    const metadata = await lstat(absolutePath)
    const label = join(labelRoot, relative(runtimeRoot, absolutePath))
    if (
      FORBIDDEN_RUNTIME_DEV_DIRECTORIES.has(entry.name) &&
      (metadata.isDirectory() || metadata.isSymbolicLink())
    ) {
      throw new Error(
        `DSH package layout contains development fixture: ${label}`
      )
    }
    if (metadata.isSymbolicLink()) {
      let targetReal
      try {
        targetReal = await realpath(absolutePath)
      } catch {
        throw new Error(`DSH package layout symlink is broken: ${label}`)
      }
      const targetRelative = relative(runtimeRootReal, targetReal)
      if (targetRelative.startsWith('..') || isAbsolute(targetRelative)) {
        throw new Error(
          `DSH package layout symlink escapes runtime root: ${label}`
        )
      }
      continue
    }
    if (metadata.isDirectory()) {
      await walkRuntimeSymlinks({
        directory: absolutePath,
        labelRoot,
        runtimeRoot,
        runtimeRootReal
      })
    }
  }
}

async function verifyBuilderConfig(builderConfigPath) {
  const config = parse(await readFile(builderConfigPath, 'utf8'))
  if (config?.asar !== true) {
    throw new Error('Electron builder must keep ASAR enabled')
  }
  const resources = Array.isArray(config?.extraResources)
    ? config.extraResources
    : []
  const requiredResources = [
    {
      from: 'resources/dsh/runtime/${platform}-${arch}',
      to: 'dsh/runtime/${platform}-${arch}'
    },
    {
      from: 'resources/dsh/profile',
      to: 'dsh/profile'
    },
    {
      from: 'resources/dsh/runtime-manifest.json',
      to: 'dsh/runtime-manifest.json'
    },
    {
      from: 'resources/dsh/runtime-sbom.cyclonedx.json',
      to: 'dsh/runtime-sbom.cyclonedx.json'
    }
  ]
  for (const expected of requiredResources) {
    if (
      !resources.some(
        (resource) =>
          resource?.from === expected.from && resource?.to === expected.to
      )
    ) {
      throw new Error(
        `Electron builder is missing DSH resource mapping: ${expected.from}`
      )
    }
  }
}

async function verifySbom(sbomPath) {
  let sbom
  try {
    sbom = JSON.parse(await readFile(sbomPath, 'utf8'))
  } catch {
    throw new Error('DSH package layout is missing: runtime-sbom.cyclonedx.json')
  }
  if (sbom?.bomFormat !== 'CycloneDX' || sbom?.specVersion !== '1.5') {
    throw new Error('DSH runtime SBOM must be CycloneDX 1.5')
  }
  if (sbom?.metadata?.component?.name !== 'realmflow-dsh-runtime') {
    throw new Error('DSH runtime SBOM metadata is missing runtime component')
  }
  const components = Array.isArray(sbom?.components) ? sbom.components : []
  for (const expected of [
    { name: '@deepseek-ai/dsh', version: '0.2.1-alpha.3' },
    { name: '@agentclientprotocol/sdk', version: '1.4.0' },
    { name: 'node', version: '22.19.0' }
  ]) {
    if (
      !components.some(
        (component) =>
          component?.name === expected.name &&
          component?.version === expected.version
      )
    ) {
      throw new Error(
        `DSH runtime SBOM is missing component: ${expected.name}@${expected.version}`
      )
    }
  }
}

async function verifyNotices(noticesPath) {
  const notices = await readFile(noticesPath, 'utf8')
  for (const token of [
    'DeepSeek Harness v0.2.1-alpha.3',
    '@deepseek-ai/dsh',
    'MIT'
  ]) {
    if (!notices.includes(token)) {
      throw new Error(`Third-party notices are missing DSH entry: ${token}`)
    }
  }
}

async function requireFile(path, label) {
  let metadata
  try {
    metadata = await stat(path)
  } catch {
    throw new Error(`DSH package layout is missing: ${label}`)
  }
  if (!metadata.isFile()) {
    throw new Error(`DSH package layout entry must be a file: ${label}`)
  }
}

function parseArguments(argv) {
  const options = {
    all: false,
    builderConfigPath: defaultBuilderConfigPath,
    noticesPath: defaultNoticesPath,
    resourcesRoot: defaultResourcesRoot,
    target: undefined
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--all') {
      options.all = true
    } else if (argument === '--builder-config') {
      options.builderConfigPath = resolve(argv[++index])
    } else if (argument === '--notices') {
      options.noticesPath = resolve(argv[++index])
    } else if (argument === '--resources-dir') {
      options.resourcesRoot = resolve(argv[++index])
    } else if (argument === '--target') {
      options.target = argv[++index]
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (options.all && options.target) {
    throw new Error('--all and --target cannot be used together')
  }
  return options
}

function splitTarget(target) {
  const [platform, arch] = target.startsWith('win32-')
    ? ['win32', target.slice('win32-'.length)]
    : target.split('-')
  return [platform, arch]
}
