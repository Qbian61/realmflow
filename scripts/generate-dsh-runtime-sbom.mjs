import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultResourcesRoot = join(projectRoot, 'resources/dsh')
const defaultManifestPath = join(defaultResourcesRoot, 'runtime-manifest.json')
const defaultOutputPath = join(defaultResourcesRoot, 'runtime-sbom.cyclonedx.json')
const defaultPluginRoots = [join(projectRoot, 'dsh-plugins/realmflow-runtime')]

export async function generateDshRuntimeSbom({
  manifestPath,
  outputPath = defaultOutputPath,
  pluginRoots = defaultPluginRoots,
  recordedAt = new Date().toISOString(),
  resourcesRoot = defaultResourcesRoot,
  targets
} = {}) {
  const effectiveManifestPath = manifestPath ?? join(resourcesRoot, 'runtime-manifest.json')
  const manifest = JSON.parse(await readFile(effectiveManifestPath, 'utf8'))
  const selectedTargets =
    targets ??
    Object.entries(manifest.assets ?? {})
      .filter(([, target]) => Array.isArray(target.files) && target.files.length > 0)
      .map(([target]) => target)

  const components = new Map()
  addComponent(
    components,
    packageComponent({
      license: undefined,
      name: manifest.dsh?.package,
      type: 'library',
      version: manifest.dsh?.version
    })
  )
  addComponent(
    components,
    packageComponent({
      license: undefined,
      name: manifest.acp?.package,
      type: 'library',
      version: manifest.acp?.version
    })
  )
  addComponent(
    components,
    packageComponent({
      license: undefined,
      name: 'node',
      type: 'framework',
      version: manifest.node?.version
    })
  )

  for (const target of selectedTargets) {
    const targetManifest = manifest.assets?.[target]
    if (!targetManifest) {
      throw new Error(`DSH runtime SBOM target is not in manifest: ${target}`)
    }
    for (const artifact of targetManifest.files ?? []) {
      addComponent(components, fileComponent(artifact))
    }
    await scanPackageJsons(
      join(resourcesRoot, targetManifest.runtimeRoot, 'dsh/apps/cli'),
      components
    )
  }

  await addPackageJson(join(resourcesRoot, 'profile/package.json'), components, {
    type: 'application'
  })
  for (const pluginRoot of pluginRoots) {
    await addPackageJson(join(pluginRoot, 'package.json'), components, {
      type: 'library'
    })
  }

  const sortedComponents = [...components.values()].sort(compareComponents)
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: deterministicSerialNumber(manifest.runtimeId, sortedComponents),
    version: 1,
    metadata: {
      timestamp: recordedAt,
      component: {
        type: 'application',
        name: 'realmflow-dsh-runtime',
        version: manifest.runtimeId
      },
      properties: [
        {
          name: 'realmflow:dshCommit',
          value: manifest.dsh?.commit ?? ''
        },
        {
          name: 'realmflow:dshSourceRepository',
          value: manifest.dsh?.sourceRepository ?? ''
        },
        {
          name: 'realmflow:nodeBaseUrl',
          value: manifest.node?.baseUrl ?? ''
        },
        {
          name: 'realmflow:targets',
          value: selectedTargets.join(',')
        }
      ]
    },
    components: sortedComponents
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(sbom, null, 2)}\n`)
  return sbom
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateDshRuntimeSbom(parseArguments(process.argv.slice(2)))
    .then((sbom) => {
      process.stdout.write(
        `Generated DSH runtime SBOM with ${sbom.components.length} components\n`
      )
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      )
      process.exitCode = 1
    })
}

async function scanPackageJsons(root, components) {
  if (!(await existsAsDirectory(root))) {
    return
  }
  await walk(root, async (path, entry) => {
    if (entry.isDirectory() && shouldSkipDirectory(entry.name)) {
      return false
    }
    if (entry.isFile() && entry.name === 'package.json') {
      await addPackageJson(path, components)
    }
    return true
  })
}

async function walk(directory, visitor) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name)
    const shouldContinue = await visitor(absolutePath, entry)
    if (shouldContinue !== false && entry.isDirectory()) {
      await walk(absolutePath, visitor)
    }
  }
}

function shouldSkipDirectory(name) {
  return (
    name === '.bin' ||
    name === '.cache' ||
    name === '.turbo' ||
    name === '__tests__' ||
    name === 'snapshots' ||
    name === 'tests'
  )
}

async function addPackageJson(path, components, { type = 'library' } = {}) {
  let packageJson
  try {
    packageJson = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return
  }
  addComponent(
    components,
    packageComponent({
      license: packageJson.license,
      name: packageJson.name,
      type,
      version: packageJson.version,
      path
    })
  )
}

function packageComponent({ license, name, path, type, version }) {
  if (!name || !version) {
    return undefined
  }
  const component = {
    type,
    'bom-ref': packageRef(name, version),
    name,
    version,
    purl: packagePurl(name, version)
  }
  const licenses = normalizeLicenses(license)
  if (licenses.length > 0) {
    component.licenses = licenses
  }
  if (path) {
    component.properties = [
      {
        name: 'realmflow:sourcePath',
        value: relative(projectRoot, path)
      }
    ]
  }
  return component
}

function fileComponent(artifact) {
  return {
    type: 'file',
    'bom-ref': `file:${artifact.path}`,
    name: artifact.path,
    hashes: [
      {
        alg: 'SHA-256',
        content: artifact.sha256
      }
    ],
    properties: [
      {
        name: 'realmflow:size',
        value: String(artifact.size)
      },
      {
        name: 'realmflow:executable',
        value: String(Boolean(artifact.executable))
      }
    ]
  }
}

function normalizeLicenses(license) {
  if (typeof license === 'string' && license.trim()) {
    return [{ license: { id: license.trim() } }]
  }
  if (Array.isArray(license)) {
    return license
      .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
      .filter(Boolean)
      .map((entry) => ({ license: { id: entry } }))
  }
  return []
}

function addComponent(components, component) {
  if (!component) {
    return
  }
  components.set(component['bom-ref'], component)
}

function compareComponents(left, right) {
  return (
    left.type.localeCompare(right.type) ||
    left.name.localeCompare(right.name) ||
    String(left.version ?? '').localeCompare(String(right.version ?? '')) ||
    left['bom-ref'].localeCompare(right['bom-ref'])
  )
}

function deterministicSerialNumber(runtimeId, components) {
  const digest = createHash('sha256')
    .update(JSON.stringify({ runtimeId, components }))
    .digest('hex')
    .split('')
  digest[12] = '5'
  digest[16] = '8'
  return `urn:uuid:${[
    digest.slice(0, 8).join(''),
    digest.slice(8, 12).join(''),
    digest.slice(12, 16).join(''),
    digest.slice(16, 20).join(''),
    digest.slice(20, 32).join('')
  ].join('-')}`
}

function packageRef(name, version) {
  return `pkg:npm/${name}@${version}`
}

function packagePurl(name, version) {
  const encodedName = name
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`
}

async function existsAsDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

function parseArguments(argv) {
  const options = {
    manifestPath: defaultManifestPath,
    outputPath: defaultOutputPath,
    pluginRoots: defaultPluginRoots,
    resourcesRoot: defaultResourcesRoot,
    targets: undefined
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--manifest') {
      options.manifestPath = resolve(argv[++index])
    } else if (argument === '--output') {
      options.outputPath = resolve(argv[++index])
    } else if (argument === '--plugins-dir') {
      options.pluginRoots = [resolve(argv[++index])]
    } else if (argument === '--resources-dir') {
      options.resourcesRoot = resolve(argv[++index])
    } else if (argument === '--target') {
      options.targets = [...(options.targets ?? []), argv[++index]]
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return options
}
