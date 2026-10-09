import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBuiltinCatalog } from './generate-builtin-extension-catalog.mjs'

const root = fileURLToPath(
  new URL('../resources/extensions/builtin/', import.meta.url)
)
const catalog = buildBuiltinCatalog()
const expected = new Map([
  [
    'index.json',
    `${JSON.stringify(catalog.index, null, 2)}\n`
  ],
  ...catalog.packages.flatMap((pkg) =>
    pkg.files.map(({ path, content }) => [
      `${pkg.directory}/${path}`,
      content
    ])
  )
])
const actualPaths = await listFiles(root)
const unexpected = actualPaths.filter((path) => !expected.has(path))
const missing = [...expected.keys()].filter(
  (path) => !actualPaths.includes(path)
)
const changed = []

for (const [path, content] of expected) {
  if (missing.includes(path)) continue
  if ((await readFile(resolve(root, path), 'utf8')) !== content) {
    changed.push(path)
  }
}

if (unexpected.length || missing.length || changed.length) {
  throw new Error(
    [
      'Builtin extension catalog is stale.',
      unexpected.length ? `Unexpected: ${unexpected.join(', ')}` : '',
      missing.length ? `Missing: ${missing.join(', ')}` : '',
      changed.length ? `Changed: ${changed.join(', ')}` : '',
      'Run `npm run generate:builtin-catalog`.'
    ]
      .filter(Boolean)
      .join('\n')
  )
}

console.log(
  `Verified ${catalog.index.packages.length} builtin packages, ` +
    `${catalog.packages.flatMap(({ tools }) => tools).length} Tools, and ` +
    `${catalog.packages.flatMap(({ skills }) => skills).length} Skills.`
)

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      paths.push(
        ...(await listFiles(resolve(directory, entry.name), relativePath))
      )
    } else if (entry.isFile()) {
      paths.push(relativePath)
    } else {
      throw new Error('Builtin extension catalog contains unsupported files')
    }
  }
  return paths.sort()
}
