import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  fetchDshRuntime,
  inspectDshSource
} from './fetch-dsh-runtime.mjs'

describe('DSH runtime fetch registration', () => {
  it('ships a reproducible runtime fetch script', () => {
    expect(existsSync(resolve('scripts/fetch-dsh-runtime.mjs'))).toBe(true)
  })

  it('exposes the fetcher through package scripts', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

    expect(packageJson.scripts?.['fetch:dsh-runtime']).toBe(
      'node scripts/fetch-dsh-runtime.mjs'
    )
  })
})

describe('DSH runtime source inspection', () => {
  let directory

  afterEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('validates the local DSH source against the pinned commit, package and ACP versions', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-source-'))
    const sourceRoot = await writeDshSourceFixture(directory)

    await expect(
      inspectDshSource({
        sourceRoot,
        runCommand: pinnedGit()
      })
    ).resolves.toMatchObject({
      commit: '571902028a',
      dshVersion: '0.2.1-alpha.3',
      acpSdkVersion: '1.4.0',
      nodeEngine: '^22.19.0 || >=24.0.0'
    })
  })

  it('rejects a dirty DSH source unless explicitly allowed', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-dirty-source-'))
    const sourceRoot = await writeDshSourceFixture(directory)
    const dirtyGit = pinnedGit({ status: ' M apps/cli/src/bin.ts\n' })

    await expect(
      inspectDshSource({
        sourceRoot,
        runCommand: dirtyGit
      })
    ).rejects.toThrow('DSH source must be clean')

    await expect(
      inspectDshSource({
        allowDirty: true,
        sourceRoot,
        runCommand: dirtyGit
      })
    ).resolves.toMatchObject({ dirty: true })
  })
})

describe('DSH runtime manifest generation from staged assets', () => {
  let directory

  afterEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('writes checksummed manifest metadata from real staged runtime files', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-fetch-'))
    const sourceRoot = await writeDshSourceFixture(directory)
    const assetsRoot = join(directory, 'assets')
    const manifestPath = join(assetsRoot, 'runtime-manifest.json')
    await writeRuntimeAsset(assetsRoot, 'runtime/darwin-arm64/node/bin/node', 'node-runtime', true)
    await writeRuntimeAsset(
      assetsRoot,
      'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js',
      'dsh-entrypoint',
      true
    )
    await writeRuntimeAsset(
      assetsRoot,
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/package.json',
      '{"name":"@deepseek-ai/node-addon-system-darwin-arm64"}'
    )
    await writeRuntimeAsset(
      assetsRoot,
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/prebuilds.json',
      JSON.stringify({
        platform: 'darwin-arm64',
        binaries: [
          {
            tool: 'flock',
            kind: 'node-api',
            napi: 8,
            path: 'bin/system.node'
          }
        ]
      })
    )
    await writeRuntimeAsset(
      assetsRoot,
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/bin/system.node',
      'native-addon'
    )
    await writeRuntimeAsset(
      assetsRoot,
      'profile/package.json',
      '{"name":"@realmflow/dsh-profile"}'
    )

    const manifest = await fetchDshRuntime({
      assetsRoot,
      manifestPath,
      recordedAt: '2026-10-15T00:00:00.000Z',
      runCommand: pinnedGit(),
      sourceRoot,
      targets: ['darwin-arm64']
    })

    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual(manifest)
    expect(manifest.provenance).toMatchObject({
      buildTool: 'scripts/fetch-dsh-runtime.mjs',
      sourceDirty: false
    })
    expect(manifest.provenance.buildSource).toEqual(expect.any(String))
    expect(manifest.assets['darwin-arm64'].files).toEqual([
      artifact('runtime/darwin-arm64/node/bin/node', 'node-runtime', true),
      artifact(
        'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js',
        'dsh-entrypoint',
        true
      ),
      artifact(
        'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/package.json',
        '{"name":"@deepseek-ai/node-addon-system-darwin-arm64"}'
      ),
      artifact(
        'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/prebuilds.json',
        JSON.stringify({
          platform: 'darwin-arm64',
          binaries: [
            {
              tool: 'flock',
              kind: 'node-api',
              napi: 8,
              path: 'bin/system.node'
            }
          ]
        })
      ),
      artifact(
        'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/bin/system.node',
        'native-addon'
      ),
      artifact('profile/package.json', '{"name":"@realmflow/dsh-profile"}')
    ])
    expect(manifest.assets['linux-x64'].files).toEqual([])
  })

  it('fails before writing a manifest when required staged assets are missing', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-fetch-missing-'))
    const sourceRoot = await writeDshSourceFixture(directory)
    const assetsRoot = join(directory, 'assets')
    const manifestPath = join(assetsRoot, 'runtime-manifest.json')
    await writeRuntimeAsset(assetsRoot, 'runtime/darwin-arm64/node/bin/node', 'node-runtime', true)

    await expect(
      fetchDshRuntime({
        assetsRoot,
        manifestPath,
        runCommand: pinnedGit(),
        sourceRoot,
        targets: ['darwin-arm64']
      })
    ).rejects.toThrow('Missing staged DSH runtime asset')

    expect(existsSync(manifestPath)).toBe(false)
  })
})

async function writeDshSourceFixture(directory) {
  const sourceRoot = join(directory, 'deepseek-harness')
  await mkdir(join(sourceRoot, 'apps/cli'), { recursive: true })
  await writeFile(
    join(sourceRoot, 'package.json'),
    JSON.stringify({
      name: '@deepseek-ai/dsh-root',
      version: '0.2.1-alpha.3',
      engines: {
        node: '^22.19.0 || >=24.0.0'
      }
    })
  )
  await writeFile(
    join(sourceRoot, 'apps/cli/package.json'),
    JSON.stringify({
      name: '@deepseek-ai/dsh',
      version: '0.2.1-alpha.3',
      bin: {
        dsh: 'lib/bin.js'
      },
      dependencies: {
        '@agentclientprotocol/sdk': '1.4.0'
      }
    })
  )
  return sourceRoot
}

async function writeRuntimeAsset(assetsRoot, path, content, executable = false) {
  const absolutePath = join(assetsRoot, path)
  await mkdir(resolve(absolutePath, '..'), { recursive: true })
  await writeFile(absolutePath, content)
  if (executable) await chmod(absolutePath, 0o755)
}

function artifact(path, content, executable = false) {
  const metadata = {
    path,
    size: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex')
  }
  if (executable) metadata.executable = true
  return metadata
}

function pinnedGit({ commit = '571902028a', status = '' } = {}) {
  return async (command, args) => {
    expect(command).toBe('git')
    if (args.includes('rev-parse')) return `${commit}\n`
    if (args.includes('status')) return status
    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
  }
}
