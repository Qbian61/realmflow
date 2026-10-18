import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  targetForDshRuntime,
  validateDshRuntimeManifest,
  verifyDshRuntime
} from './verify-dsh-runtime.mjs'

const sha256 = (content) =>
  createHash('sha256').update(content).digest('hex')

describe('DSH runtime verification registration', () => {
  it('ships the pinned runtime manifest and verifier script', () => {
    expect(existsSync(resolve('resources/dsh/runtime-manifest.json'))).toBe(
      true
    )
    expect(existsSync(resolve('scripts/verify-dsh-runtime.mjs'))).toBe(true)
  })

  it('exposes the verifier through package scripts', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

    expect(packageJson.scripts?.['verify:dsh-runtime']).toBe(
      'node scripts/verify-dsh-runtime.mjs'
    )
  })

  it('exports a testable verifier contract', async () => {
    const verifier = await import('./verify-dsh-runtime.mjs')

    expect(typeof verifier.targetForDshRuntime).toBe('function')
    expect(typeof verifier.validateDshRuntimeManifest).toBe('function')
    expect(typeof verifier.verifyDshRuntime).toBe('function')
  })
})

describe('DSH runtime manifest verification', () => {
  let directory

  afterEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('pins DSH, ACP, Node and platform assets in the repository manifest', () => {
    const manifest = validateDshRuntimeManifest(
      JSON.parse(
        readFileSync(resolve('resources/dsh/runtime-manifest.json'), 'utf8')
      )
    )

    expect(manifest.dsh).toMatchObject({
      package: '@deepseek-ai/dsh',
      version: '0.2.1-alpha.3',
      commit: '571902028a'
    })
    expect(manifest.acp).toEqual({
      package: '@agentclientprotocol/sdk',
      version: '1.4.0'
    })
    expect(manifest.node.version).toBe('22.19.0')
    expect(Object.keys(manifest.assets).sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-x64'
    ])
  })

  it('rejects unpinned or drifting manifest metadata', () => {
    const manifest = validManifest()

    expect(() =>
      validateDshRuntimeManifest({
        ...manifest,
        dsh: { ...manifest.dsh, commit: 'latest' }
      })
    ).toThrow('DSH commit must be 571902028a')
    expect(() =>
      validateDshRuntimeManifest({
        ...manifest,
        acp: { ...manifest.acp, version: '1.5.0' }
      })
    ).toThrow('ACP SDK version must be 1.4.0')
    expect(() =>
      validateDshRuntimeManifest({
        ...manifest,
        node: { ...manifest.node, baseUrl: 'https://nodejs.org/dist/latest' }
      })
    ).toThrow('DSH runtime manifest must not use latest URLs')
  })

  it('rejects unsupported runtime targets', () => {
    expect(targetForDshRuntime('darwin', 'arm64')).toBe('darwin-arm64')
    expect(() => targetForDshRuntime('freebsd', 'x64')).toThrow(
      'Unsupported DSH runtime target'
    )
  })

  it('rejects missing or checksum-mismatched runtime artifacts', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-runtime-'))
    const manifestPath = join(directory, 'runtime-manifest.json')
    await writeFile(manifestPath, JSON.stringify(validManifest()))

    await expect(
      verifyDshRuntime({
        assetsRoot: directory,
        manifestPath,
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH runtime artifact is missing')
  })

  it('verifies pinned runtime artifacts for a selected target', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-runtime-'))
    const manifestPath = await writeRuntimeFixture(directory)

    await expect(
      verifyDshRuntime({
        assetsRoot: directory,
        manifestPath,
        runCommand: async () => ({ stdout: '0.2.1-alpha.3\n', stderr: '' }),
        target: 'darwin-arm64'
      })
    ).resolves.toEqual(['darwin-arm64'])
  })

  it('smokes the ACP profile with isolated runtime state after version startup', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-runtime-acp-'))
    const manifestPath = await writeRuntimeFixture(directory)
    const calls = []

    await expect(
      verifyDshRuntime({
        assetsRoot: directory,
        manifestPath,
        runCommand: async (command, args, options) => {
          calls.push({ command, args, options })
          return { stdout: '', stderr: '' }
        },
        target: 'darwin-arm64'
      })
    ).resolves.toEqual(['darwin-arm64'])

    expect(calls).toHaveLength(2)
    expect(calls[0].args).toEqual([
      join(directory, 'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js'),
      '--version'
    ])
    expect(calls[1].args).toEqual([
      join(directory, 'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js'),
      '--profile',
      'acp'
    ])
    expect(calls[1].options.env.DSH_HOME).toContain('realmflow-dsh-smoke-')
    expect(calls[1].options.env.REALMFLOW_DSH_SESSION_ROOT).toContain(
      'realmflow-dsh-smoke-'
    )
  })

  it('rejects ACP startup warnings as runtime packaging failures', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-runtime-warning-'))
    const manifestPath = await writeRuntimeFixture(directory)

    await expect(
      verifyDshRuntime({
        assetsRoot: directory,
        manifestPath,
        runCommand: async (_command, args) => {
          if (args.includes('--profile')) {
            return {
              stdout: '',
              stderr: 'warning: 3 entries did not activate'
            }
          }
          return { stdout: '0.2.1-alpha.3\n', stderr: '' }
        },
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH runtime ACP profile smoke test failed')
  })

  it('rejects a runtime whose bundled CLI cannot start with bundled Node', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-runtime-smoke-'))
    const manifestPath = await writeRuntimeFixture(directory)

    await expect(
      verifyDshRuntime({
        assetsRoot: directory,
        manifestPath,
        runCommand: async () => {
          const error = new Error('Cannot find package')
          error.stderr = 'Error [ERR_MODULE_NOT_FOUND]: Cannot find package'
          throw error
        },
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH runtime CLI smoke test failed')
  })
})

async function writeRuntimeFixture(directory) {
  const nodePath = join(directory, 'runtime/darwin-arm64/node/bin/node')
  const dshPath = join(
    directory,
    'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js'
  )
  const profilePath = join(directory, 'profile/package.json')
  await mkdir(join(directory, 'runtime/darwin-arm64/node/bin'), {
    recursive: true
  })
  await mkdir(join(directory, 'runtime/darwin-arm64/dsh/apps/cli/lib'), {
    recursive: true
  })
  await mkdir(join(directory, 'profile'), { recursive: true })
  await writeFile(nodePath, 'node-runtime')
  await writeFile(dshPath, 'dsh-entrypoint')
  await writeFile(profilePath, '{"name":"@realmflow/dsh-profile"}')
  await chmod(nodePath, 0o755)
  await chmod(dshPath, 0o755)

  const manifest = validManifest({
    files: [
      artifact('runtime/darwin-arm64/node/bin/node', 'node-runtime', true),
      artifact(
        'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js',
        'dsh-entrypoint',
        true
      ),
      artifact('profile/package.json', '{"name":"@realmflow/dsh-profile"}')
    ]
  })
  const manifestPath = join(directory, 'runtime-manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest))
  return manifestPath
}

function validManifest({ files } = {}) {
  const targetFiles =
    files ??
    [
      artifact('runtime/darwin-arm64/node/bin/node', 'expected-node', true),
      artifact(
        'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js',
        'expected-dsh',
        true
      ),
      artifact('profile/package.json', 'expected-profile')
    ]
  return {
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
      recordedAt: '2026-10-15'
    },
    assets: Object.fromEntries(
      ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64'].map(
        (target) => [
          target,
          {
            platform: target.split('-')[0],
            arch: target.split('-')[1],
            runtimeRoot: `runtime/${target}`,
            nodeBinary: `runtime/${target}/node/bin/node`,
            dshEntrypoint: `runtime/${target}/dsh/apps/cli/lib/bin.js`,
            profilePath: 'profile/package.json',
            files: target === 'darwin-arm64' ? targetFiles : []
          }
        ]
      )
    )
  }
}

function artifact(path, content, executable = false) {
  return {
    path,
    size: Buffer.byteLength(content),
    sha256: sha256(content),
    executable
  }
}
