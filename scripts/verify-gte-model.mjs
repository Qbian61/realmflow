import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultAssetRoot = join(
  root,
  'python-service',
  'model-assets',
  'gte-multilingual-base'
)

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyGteModel(
  assetRoot = defaultAssetRoot,
  { manifestOnly = false } = {}
) {
  const manifest = JSON.parse(
    await readFile(join(assetRoot, 'manifest.json'), 'utf8')
  )
  if (
    manifest.schemaVersion !== 1 ||
    manifest.model !== 'Alibaba-NLP/gte-multilingual-base' ||
    manifest.revision !==
      '9bbca17d9273fd0d03d5725c7a4b0f6b45142062' ||
    manifest.dimensions !== 768 ||
    manifest.runtime !== 'onnxruntime-cpu' ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error('GTE model manifest is incompatible')
  }
  if (manifestOnly) return manifest.files.map(({ path }) => path)

  for (const asset of manifest.files) {
    const path = join(assetRoot, asset.path)
    const metadata = await stat(path)
    if (
      !metadata.isFile() ||
      metadata.size !== asset.size ||
      (await sha256(path)) !== asset.sha256
    ) {
      throw new Error(`GTE model asset is invalid: ${asset.path}`)
    }
  }
  return manifest.files.map(({ path }) => path)
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const manifestOnly = process.argv.includes('--manifest-only')
  verifyGteModel(defaultAssetRoot, { manifestOnly })
    .then((files) => {
      process.stdout.write(`Verified ${files.length} GTE model assets\n`)
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      )
      process.exitCode = 1
    })
}
