import { createHash } from 'node:crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultManifestPath = join(projectRoot, 'build', 'qdrant-assets.json')
const defaultOutputRoot = join(projectRoot, 'resources', 'qdrant')

export function targetForRuntime(platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`

  if (!['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64', 'linux-arm64'].includes(target)) {
    throw new Error(`Unsupported Qdrant target: ${platform}-${arch}`)
  }

  return target
}

export function assertSha256(content, expectedDigest, assetName) {
  const actualDigest = createHash('sha256').update(content).digest('hex')
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `SHA-256 mismatch for ${assetName}: expected ${expectedDigest}, received ${actualDigest}`
    )
  }
}

export function validateManifest(manifest) {
  if (manifest.version !== 'v1.19.1') {
    throw new Error(`Qdrant version must be v1.19.1, received ${manifest.version}`)
  }

  const expectedBaseUrl =
    'https://github.com/qdrant/qdrant/releases/download/v1.19.1'
  if (manifest.releaseBaseUrl !== expectedBaseUrl) {
    throw new Error(`Qdrant release URL must be ${expectedBaseUrl}`)
  }
  if (/\/(?:latest|download\/latest)(?:\/|$)/i.test(manifest.releaseBaseUrl)) {
    throw new Error('Qdrant release URL must not use latest')
  }

  const expectedTargets = [
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64',
    'linux-x64',
    'win32-x64'
  ]
  const actualTargets = Object.keys(manifest.assets ?? {}).sort()
  if (JSON.stringify(actualTargets) !== JSON.stringify(expectedTargets)) {
    throw new Error(`Qdrant manifest targets must be ${expectedTargets.join(', ')}`)
  }

  for (const [target, asset] of Object.entries(manifest.assets)) {
    if (!asset.archive || !asset.binary || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      throw new Error(`Invalid Qdrant asset metadata for ${target}`)
    }
  }

  return manifest
}

export async function loadManifest(manifestPath = defaultManifestPath) {
  return validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
}

function parseArguments(argv) {
  const options = {
    manifestPath: defaultManifestPath,
    outputRoot: defaultOutputRoot,
    target: targetForRuntime()
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--manifest') {
      options.manifestPath = resolve(argv[++index])
    } else if (argument === '--output-dir') {
      options.outputRoot = resolve(argv[++index])
    } else if (argument === '--target') {
      options.target = argv[++index]
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  return options
}

async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
      } else {
        reject(
          new Error(
            `${command} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`
          )
        )
      }
    })
  })
}

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Qdrant download failed with HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function findBinary(directory, binaryName) {
  const directPath = join(directory, binaryName)
  try {
    if ((await stat(directPath)).isFile()) {
      return directPath
    }
  } catch {
    // Some release archives wrap their contents in a directory.
  }

  const { readdir } = await import('node:fs/promises')
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const nestedPath = await findBinary(join(directory, entry.name), binaryName)
      if (nestedPath) {
        return nestedPath
      }
    } else if (entry.isFile() && entry.name === binaryName) {
      return join(directory, entry.name)
    }
  }
  return undefined
}

export async function downloadQdrant({
  manifestPath = defaultManifestPath,
  outputRoot = defaultOutputRoot,
  target = targetForRuntime()
} = {}) {
  const manifest = await loadManifest(manifestPath)
  const asset = manifest.assets[target]
  if (!asset) {
    throw new Error(`Unsupported Qdrant target: ${target}`)
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'realmflow-qdrant-'))
  try {
    const archiveUrl = `${manifest.releaseBaseUrl}/${asset.archive}`
    const archiveContent = await download(archiveUrl)
    assertSha256(archiveContent, asset.sha256, asset.archive)

    const archivePath = join(temporaryRoot, basename(asset.archive))
    const extractedPath = join(temporaryRoot, 'extracted')
    await mkdir(extractedPath)
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(archivePath, archiveContent)
    )
    await run('tar', ['-xf', archivePath, '-C', extractedPath])

    const extractedBinary = await findBinary(extractedPath, asset.binary)
    if (!extractedBinary) {
      throw new Error(`${asset.binary} was not found in ${asset.archive}`)
    }

    const stagedPath = join(outputRoot, `.${target}-${process.pid}`)
    const targetPath = join(outputRoot, target)
    await mkdir(stagedPath, { recursive: true })
    await rename(extractedBinary, join(stagedPath, asset.binary))
    if (asset.platform !== 'win32') {
      await chmod(join(stagedPath, asset.binary), 0o755)
    }
    await rm(targetPath, { recursive: true, force: true })
    await rename(stagedPath, targetPath)
    return join(targetPath, asset.binary)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function main() {
  const binaryPath = await downloadQdrant(parseArguments(process.argv.slice(2)))
  process.stdout.write(`Qdrant v1.19.1 installed at ${binaryPath}\n`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
