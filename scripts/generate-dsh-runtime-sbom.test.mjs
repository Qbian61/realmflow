import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { generateDshRuntimeSbom } from './generate-dsh-runtime-sbom.mjs'

describe('DSH runtime SBOM generation', () => {
  let directory

  afterEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('writes a deterministic CycloneDX SBOM for bundled DSH runtime packages and assets', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-sbom-'))
    const resourcesRoot = join(directory, 'resources/dsh')
    const pluginRoot = join(directory, 'dsh-plugins/realmflow-runtime')
    const outputPath = join(resourcesRoot, 'runtime-sbom.cyclonedx.json')

    await writeRuntimeFixture(resourcesRoot)
    await writeJson(join(pluginRoot, 'package.json'), {
      name: '@realmflow/dsh-runtime-plugin',
      version: '0.1.0',
      license: 'UNLICENSED'
    })

    const sbom = await generateDshRuntimeSbom({
      outputPath,
      pluginRoots: [pluginRoot],
      recordedAt: '2026-10-16T00:00:00.000Z',
      resourcesRoot,
      targets: ['darwin-arm64']
    })

    expect(existsSync(outputPath)).toBe(true)
    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual(sbom)
    expect(sbom).toMatchObject({
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      metadata: {
        timestamp: '2026-10-16T00:00:00.000Z',
        component: {
          type: 'application',
          name: 'realmflow-dsh-runtime',
          version: 'dsh-v0.2.1-alpha.3-16-g571902028a'
        }
      }
    })
    expect(component(sbom, '@deepseek-ai/dsh')).toMatchObject({
      type: 'library',
      version: '0.2.1-alpha.3'
    })
    expect(component(sbom, '@agentclientprotocol/sdk')).toMatchObject({
      type: 'library',
      version: '1.4.0'
    })
    expect(component(sbom, 'node')).toMatchObject({
      type: 'framework',
      version: '22.19.0'
    })
    expect(component(sbom, '@realmflow/dsh-profile')).toMatchObject({
      type: 'application',
      version: '0.1.0'
    })
    expect(component(sbom, '@realmflow/dsh-runtime-plugin')).toMatchObject({
      type: 'library',
      version: '0.1.0'
    })
    expect(component(sbom, 'runtime/darwin-arm64/node/bin/node')).toMatchObject({
      type: 'file',
      hashes: [
        {
          alg: 'SHA-256',
          content: sha256('node-runtime')
        }
      ]
    })
  })
})

async function writeRuntimeFixture(resourcesRoot) {
  const nodePath = 'runtime/darwin-arm64/node/bin/node'
  const dshPath = 'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js'
  const profilePath = 'profile/package.json'

  await writeFileFixture(join(resourcesRoot, nodePath), 'node-runtime', true)
  await writeFileFixture(join(resourcesRoot, dshPath), 'dsh-entrypoint', true)
  await writeJson(
    join(resourcesRoot, 'runtime/darwin-arm64/dsh/apps/cli/package.json'),
    {
      name: '@deepseek-ai/dsh',
      version: '0.2.1-alpha.3',
      license: 'MIT',
      dependencies: {
        '@agentclientprotocol/sdk': '1.4.0'
      }
    }
  )
  await writeJson(
    join(
      resourcesRoot,
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@agentclientprotocol/sdk/package.json'
    ),
    {
      name: '@agentclientprotocol/sdk',
      version: '1.4.0',
      license: 'Apache-2.0'
    }
  )
  await writeJson(join(resourcesRoot, profilePath), {
    name: '@realmflow/dsh-profile',
    version: '0.1.0',
    license: 'UNLICENSED'
  })
  await writeFileFixture(join(resourcesRoot, 'profile/cordis.patch.yml'), '- id: acp\n')
  await writeJson(join(resourcesRoot, 'runtime-manifest.json'), {
    schemaVersion: 1,
    runtimeId: 'dsh-v0.2.1-alpha.3-16-g571902028a',
    dsh: {
      package: '@deepseek-ai/dsh',
      version: '0.2.1-alpha.3',
      commit: '571902028a',
      sourceRepository: 'https://github.com/deepseek-ai/deepseek-harness.git'
    },
    acp: {
      package: '@agentclientprotocol/sdk',
      version: '1.4.0'
    },
    node: {
      version: '22.19.0',
      source: 'nodejs.org-dist',
      baseUrl: 'https://nodejs.org/dist/v22.19.0'
    },
    provenance: {
      buildTool: 'scripts/fetch-dsh-runtime.mjs',
      buildSource: '../deepseek-harness',
      recordedAt: '2026-10-15T00:00:00.000Z'
    },
    assets: {
      'darwin-arm64': {
        platform: 'darwin',
        arch: 'arm64',
        runtimeRoot: 'runtime/darwin-arm64',
        nodeBinary: nodePath,
        dshEntrypoint: dshPath,
        profilePath,
        files: [
          artifact(nodePath, 'node-runtime', true),
          artifact(dshPath, 'dsh-entrypoint', true),
          artifact(profilePath, JSON.stringify({
            name: '@realmflow/dsh-profile',
            version: '0.1.0',
            license: 'UNLICENSED'
          }))
        ]
      }
    }
  })
}

async function writeFileFixture(path, content, executable = false) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  if (executable) await chmod(path, 0o755)
}

async function writeJson(path, value) {
  await writeFileFixture(path, `${JSON.stringify(value, null, 2)}\n`)
}

function artifact(path, content, executable = false) {
  const metadata = {
    path,
    size: Buffer.byteLength(content),
    sha256: sha256(content)
  }
  if (executable) metadata.executable = true
  return metadata
}

function component(sbom, name) {
  return sbom.components.find((candidate) => candidate.name === name)
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}
