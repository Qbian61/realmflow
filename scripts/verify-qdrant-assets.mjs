import { access, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  loadManifest,
  targetForRuntime
} from './download-qdrant.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultManifestPath = join(projectRoot, 'build', 'qdrant-assets.json')
const defaultAssetsRoot = join(projectRoot, 'resources', 'qdrant')

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
    } else if (argument === '--manifest-only') {
      options.manifestOnly = true
    } else if (argument === '--manifest') {
      options.manifestPath = resolve(argv[++index])
    } else if (argument === '--assets-dir') {
      options.assetsRoot = resolve(argv[++index])
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

async function verifyBinary(binaryPath, platform) {
  const binaryStat = await stat(binaryPath)
  if (!binaryStat.isFile() || binaryStat.size === 0) {
    throw new Error(`Qdrant binary is missing or empty: ${binaryPath}`)
  }
  if (platform !== 'win32') {
    await access(binaryPath, constants.X_OK)
  }
}

export async function verifyQdrantAssets({
  all = false,
  assetsRoot = defaultAssetsRoot,
  manifestOnly = false,
  manifestPath = defaultManifestPath,
  target
} = {}) {
  const manifest = await loadManifest(manifestPath)
  const serializedManifest = await readFile(manifestPath, 'utf8')
  if (/releases\/(?:latest|download\/latest)(?:\/|$)/i.test(serializedManifest)) {
    throw new Error('Qdrant manifest must not use latest release URLs')
  }

  if (manifestOnly) {
    return Object.keys(manifest.assets)
  }

  const targets = all
    ? Object.keys(manifest.assets)
    : [target ?? targetForRuntime()]
  for (const selectedTarget of targets) {
    const asset = manifest.assets[selectedTarget]
    if (!asset) {
      throw new Error(`Unsupported Qdrant target: ${selectedTarget}`)
    }
    await verifyBinary(
      join(assetsRoot, selectedTarget, asset.binary),
      asset.platform
    )
  }
  return targets
}

async function main() {
  const targets = await verifyQdrantAssets(
    parseArguments(process.argv.slice(2))
  )
  process.stdout.write(
    `Verified Qdrant v1.19.1 assets: ${targets.join(', ')}\n`
  )
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
