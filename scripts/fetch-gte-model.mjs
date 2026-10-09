import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultAssetRoot = join(
  root,
  'python-service',
  'model-assets',
  'gte-multilingual-base'
)
const sourceRevision =
  '9bbca17d9273fd0d03d5725c7a4b0f6b45142062'
const onnxRevision = '2edbf5e672aab465f9ed4c154a8b61791c082c69'
const codeRevision = '40ced75c3017eb27626c9d4ea981bde21a2662f4'

const sources = {
  'model.onnx':
    `https://huggingface.co/onnx-community/gte-multilingual-base/resolve/${onnxRevision}/onnx/model.onnx?download=true`,
  'tokenizer.json':
    `https://huggingface.co/Alibaba-NLP/gte-multilingual-base/resolve/${sourceRevision}/tokenizer.json?download=true`,
  'tokenizer_config.json':
    `https://huggingface.co/Alibaba-NLP/gte-multilingual-base/resolve/${sourceRevision}/tokenizer_config.json?download=true`,
  'special_tokens_map.json':
    `https://huggingface.co/Alibaba-NLP/gte-multilingual-base/resolve/${sourceRevision}/special_tokens_map.json?download=true`,
  'config.json':
    `https://huggingface.co/Alibaba-NLP/gte-multilingual-base/resolve/${sourceRevision}/config.json?download=true`,
  'pooling.json':
    `https://huggingface.co/Alibaba-NLP/gte-multilingual-base/resolve/${sourceRevision}/1_Pooling/config.json?download=true`,
  'configuration.py':
    `https://huggingface.co/Alibaba-NLP/new-impl/resolve/${codeRevision}/configuration.py?download=true`,
  'modeling.py':
    `https://huggingface.co/Alibaba-NLP/new-impl/resolve/${codeRevision}/modeling.py?download=true`,
  LICENSE: 'https://www.apache.org/licenses/LICENSE-2.0.txt'
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function isValid(path, asset) {
  try {
    return (
      (await stat(path)).size === asset.size &&
      (await sha256(path)) === asset.sha256
    )
  } catch {
    return false
  }
}

async function download(url, destination, asset) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`GTE asset download failed with HTTP ${response.status}`)
  }
  const temporaryPath = `${destination}.${process.pid}.tmp`
  try {
    await pipeline(response.body, createWriteStream(temporaryPath))
    if (!(await isValid(temporaryPath, asset))) {
      throw new Error(`GTE asset digest mismatch: ${asset.path}`)
    }
    await rename(temporaryPath, destination)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export async function fetchGteModel(assetRoot = defaultAssetRoot) {
  const manifest = JSON.parse(
    await readFile(join(assetRoot, 'manifest.json'), 'utf8')
  )
  await mkdir(assetRoot, { recursive: true })
  for (const asset of manifest.files) {
    const destination = join(assetRoot, asset.path)
    if (await isValid(destination, asset)) continue
    const url = sources[asset.path]
    if (!url) throw new Error(`No pinned source for GTE asset: ${asset.path}`)
    await download(url, destination, asset)
  }
  return assetRoot
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  fetchGteModel()
    .then((assetRoot) => {
      process.stdout.write(`GTE model assets installed at ${assetRoot}\n`)
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      )
      process.exitCode = 1
    })
}
