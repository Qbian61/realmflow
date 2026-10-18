import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultManifestPath = join(projectRoot, 'resources/dsh/runtime-manifest.json')
const defaultAssetsRoot = join(projectRoot, 'resources/dsh')
const defaultRunCommand = promisify(execFileCallback)
const PINNED_DSH_COMMIT = '571902028a'
const PINNED_DSH_VERSION = '0.2.1-alpha.3'
const PINNED_ACP_SDK_VERSION = '1.4.0'
const PINNED_NODE_VERSION = '22.19.0'
const ACP_STARTUP_TIMEOUT_MS = 5000
const RUNTIME_STARTUP_FAILURE_PATTERN =
  /(startup failed|ERR_MODULE_NOT_FOUND|warning:\s+.*did not activate)/i
const EXPECTED_TARGETS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64'
]

export function targetForDshRuntime(
  platform = process.platform,
  arch = process.arch
) {
  const target = `${platform}-${arch}`
  if (!EXPECTED_TARGETS.includes(target)) {
    throw new Error(`Unsupported DSH runtime target: ${target}`)
  }
  return target
}

export function validateDshRuntimeManifest(manifest) {
  if (!isRecord(manifest)) {
    throw new Error('DSH runtime manifest must be an object')
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error('DSH runtime manifest schemaVersion must be 1')
  }
  if (manifest.dsh?.package !== '@deepseek-ai/dsh') {
    throw new Error('DSH runtime package must be @deepseek-ai/dsh')
  }
  if (manifest.dsh?.version !== PINNED_DSH_VERSION) {
    throw new Error(`DSH version must be ${PINNED_DSH_VERSION}`)
  }
  if (manifest.dsh?.commit !== PINNED_DSH_COMMIT) {
    throw new Error(`DSH commit must be ${PINNED_DSH_COMMIT}`)
  }
  if (manifest.acp?.package !== '@agentclientprotocol/sdk') {
    throw new Error('ACP SDK package must be @agentclientprotocol/sdk')
  }
  if (manifest.acp?.version !== PINNED_ACP_SDK_VERSION) {
    throw new Error(`ACP SDK version must be ${PINNED_ACP_SDK_VERSION}`)
  }
  if (manifest.node?.version !== PINNED_NODE_VERSION) {
    throw new Error(`DSH Node runtime version must be ${PINNED_NODE_VERSION}`)
  }
  if (/(?:^|\/)(?:latest|download\/latest)(?:[/"?]|$)/i.test(JSON.stringify(manifest))) {
    throw new Error('DSH runtime manifest must not use latest URLs')
  }
  const targets = Object.keys(manifest.assets ?? {}).sort()
  if (JSON.stringify(targets) !== JSON.stringify(EXPECTED_TARGETS)) {
    throw new Error(`DSH runtime targets must be ${EXPECTED_TARGETS.join(', ')}`)
  }
  for (const target of EXPECTED_TARGETS) {
    validateAsset(target, manifest.assets[target])
  }
  return manifest
}

export async function verifyDshRuntime({
  all = false,
  assetsRoot = defaultAssetsRoot,
  manifestOnly = false,
  manifestPath = defaultManifestPath,
  runCommand = defaultRunCommand,
  smoke = true,
  target
} = {}) {
  const manifest = validateDshRuntimeManifest(
    JSON.parse(await readFile(manifestPath, 'utf8'))
  )
  const targets = all ? EXPECTED_TARGETS : [target ?? targetForDshRuntime()]

  if (manifestOnly) return targets

  for (const selectedTarget of targets) {
    const asset = manifest.assets[selectedTarget]
    if (!asset) throw new Error(`Unsupported DSH runtime target: ${selectedTarget}`)
    if (!Array.isArray(asset.files) || asset.files.length === 0) {
      throw new Error(`DSH runtime artifact list is empty for ${selectedTarget}`)
    }
    for (const file of asset.files) {
      await verifyRuntimeFile({
        assetsRoot,
        file,
        platform: asset.platform
      })
    }
    if (shouldSmokeRuntime({ runCommand, selectedTarget, smoke })) {
      await verifyDshCliStarts({ asset, assetsRoot, runCommand })
    }
  }
  return targets
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDshRuntime(parseArguments(process.argv.slice(2)))
    .then((targets) => {
      process.stdout.write(`Verified DSH runtime assets: ${targets.join(', ')}\n`)
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
    all: false,
    assetsRoot: defaultAssetsRoot,
    manifestOnly: false,
    manifestPath: defaultManifestPath,
    target: undefined
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--all') {
      options.all = true
    } else if (argument === '--assets-dir') {
      options.assetsRoot = resolve(argv[++index])
    } else if (argument === '--manifest') {
      options.manifestPath = resolve(argv[++index])
    } else if (argument === '--manifest-only') {
      options.manifestOnly = true
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

function validateAsset(target, asset) {
  if (!isRecord(asset)) {
    throw new Error(`Invalid DSH runtime asset metadata for ${target}`)
  }
  const [platform, arch] = splitTarget(target)
  if (asset.platform !== platform || asset.arch !== arch) {
    throw new Error(`DSH runtime asset platform mismatch for ${target}`)
  }
  for (const field of ['runtimeRoot', 'nodeBinary', 'dshEntrypoint', 'profilePath']) {
    if (typeof asset[field] !== 'string' || asset[field].trim() === '') {
      throw new Error(`DSH runtime asset ${field} is required for ${target}`)
    }
  }
  if (!Array.isArray(asset.files)) {
    throw new Error(`DSH runtime asset files must be an array for ${target}`)
  }
  for (const file of asset.files) {
    if (
      !isRecord(file) ||
      typeof file.path !== 'string' ||
      typeof file.size !== 'number' ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error(`Invalid DSH runtime file metadata for ${target}`)
    }
  }
}

function shouldSmokeRuntime({ runCommand, selectedTarget, smoke }) {
  if (!smoke) return false
  return (
    selectedTarget === targetForDshRuntime() ||
    runCommand !== defaultRunCommand
  )
}

function splitTarget(target) {
  const [platform, arch] = target.startsWith('win32-')
    ? ['win32', target.slice('win32-'.length)]
    : target.split('-')
  return [platform, arch]
}

async function verifyDshCliStarts({ asset, assetsRoot, runCommand }) {
  const nodeBinary = join(assetsRoot, asset.nodeBinary)
  const dshEntrypoint = join(assetsRoot, asset.dshEntrypoint)
  const runtimeRoot = join(assetsRoot, asset.runtimeRoot)
  const profilePath = join(assetsRoot, asset.profilePath)
  const home = await mkdtemp(join(tmpdir(), 'realmflow-dsh-smoke-'))
  try {
    const env = {
      ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
      HOME: home,
      DSH_HOME: home,
      DSH_TELEMETRY_DISABLED: '1',
      DSH_SESSION_LOG_UPLOAD_DISABLED: '1',
      NODE_ENV: 'production',
      REALMFLOW_DSH_RUNTIME_ID: 'verify-dsh-runtime',
      REALMFLOW_DSH_RUNTIME_DIGEST: 'verify-dsh-runtime',
      REALMFLOW_DSH_PROFILE_PATH: profilePath,
      REALMFLOW_DSH_SESSION_ROOT: join(home, 'sessions')
    }
    const baseOptions = {
      cwd: runtimeRoot,
      env,
      maxBuffer: 1024 * 1024
    }
    await runSmokeCommand({
      args: [dshEntrypoint, '--version'],
      label: 'DSH runtime CLI smoke test',
      nodeBinary,
      options: baseOptions,
      runCommand
    })
    await runSmokeCommand({
      args: [dshEntrypoint, '--profile', 'acp'],
      label: 'DSH runtime ACP profile smoke test',
      nodeBinary,
      options: {
        ...baseOptions,
        killSignal: 'SIGTERM',
        timeout: ACP_STARTUP_TIMEOUT_MS
      },
      runCommand,
      timeoutPasses: true
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

async function runSmokeCommand({
  args,
  label,
  nodeBinary,
  options,
  runCommand,
  timeoutPasses = false
}) {
  try {
    const result = await runCommand(nodeBinary, args, options)
    assertCleanSmokeOutput(label, result)
  } catch (error) {
    if (timeoutPasses && isTimeoutTermination(error)) {
      assertCleanSmokeOutput(label, error)
      return
    }
    throw new Error(`${label} failed: ${formatCommandError(error)}`)
  }
}

function assertCleanSmokeOutput(label, result) {
  const output = commandOutput(result)
  const match = output.match(RUNTIME_STARTUP_FAILURE_PATTERN)
  if (match) {
    throw new Error(`${label} failed: ${output.slice(0, 4000)}`)
  }
}

function isTimeoutTermination(error) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      error.killed === true &&
      (error.signal === 'SIGTERM' || error.code === null)
  )
}

async function verifyRuntimeFile({ assetsRoot, file, platform }) {
  const absolutePath = join(assetsRoot, file.path)
  let metadata
  try {
    metadata = await stat(absolutePath)
  } catch {
    throw new Error(`DSH runtime artifact is missing: ${file.path}`)
  }
  if (!metadata.isFile() || metadata.size !== file.size) {
    throw new Error(`DSH runtime artifact is invalid: ${file.path}`)
  }
  if ((await sha256(absolutePath)) !== file.sha256) {
    throw new Error(`DSH runtime artifact checksum mismatch: ${file.path}`)
  }
  if (file.executable && platform !== 'win32') {
    await access(absolutePath, constants.X_OK)
  }
}

function formatCommandError(error) {
  if (!error || typeof error !== 'object') return String(error)
  const message = error instanceof Error ? error.message : String(error)
  const output = commandOutput(error)
  if (output === '') return message
  return `${message}\n${output.slice(0, 4000)}`
}

function commandOutput(result) {
  if (!result || typeof result !== 'object') return ''
  return [
    typeof result.stderr === 'string' ? result.stderr : '',
    typeof result.stdout === 'string' ? result.stdout : ''
  ]
    .join('\n')
    .trim()
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
