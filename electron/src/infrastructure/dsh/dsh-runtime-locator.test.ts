import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DshRuntimeLocator } from './dsh-runtime-locator'

let directory: string
let projectRoot: string
let resourcesPath: string
let userDataPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-locator-'))
  projectRoot = join(directory, 'project')
  resourcesPath = join(directory, 'packaged-resources')
  userDataPath = join(directory, 'user-data')
  await writeRuntimeFixture(join(projectRoot, 'resources', 'dsh'))
  await writeRuntimeFixture(join(resourcesPath, 'dsh'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('DshRuntimeLocator', () => {
  it('resolves development runtime paths from the pinned manifest and creates a managed DSH home outside assets', async () => {
    const locator = new DshRuntimeLocator({
      arch: 'arm64',
      isPackaged: false,
      platform: 'darwin',
      projectRoot,
      resourcesPath,
      userDataPath
    })

    const resolved = await locator.resolve()

    expect(resolved).toMatchObject({
      target: 'darwin-arm64',
      runtimeId: 'dsh-v0.2.1-alpha.3-16-g571902028a',
      runtimeRoot: join(projectRoot, 'resources', 'dsh', 'runtime', 'darwin-arm64'),
      nodeBinaryPath: join(
        projectRoot,
        'resources',
        'dsh',
        'runtime',
        'darwin-arm64',
        'node',
        'bin',
        'node'
      ),
      dshEntrypointPath: join(
        projectRoot,
        'resources',
        'dsh',
        'runtime',
        'darwin-arm64',
        'dsh',
        'apps',
        'cli',
        'lib',
        'bin.js'
      ),
      profilePath: join(projectRoot, 'resources', 'dsh', 'profile', 'package.json'),
      dshHome: join(userDataPath, 'dsh', 'home')
    })
    expect(resolved.runtimeBuildDigest).toBe(
      sha256(await readFile(join(projectRoot, 'resources', 'dsh', 'runtime-manifest.json')))
    )
    expect((await stat(resolved.dshHome)).isDirectory()).toBe(true)
    expect(resolved.dshHome.startsWith(join(projectRoot, 'resources'))).toBe(false)
  })

  it('resolves packaged runtime paths under process resources instead of ASAR', async () => {
    const locator = new DshRuntimeLocator({
      arch: 'arm64',
      isPackaged: true,
      platform: 'darwin',
      projectRoot,
      resourcesPath,
      userDataPath
    })

    const resolved = await locator.resolve()

    expect(resolved.assetsRoot).toBe(join(resourcesPath, 'dsh'))
    expect(resolved.nodeBinaryPath).toBe(
      join(resourcesPath, 'dsh', 'runtime', 'darwin-arm64', 'node', 'bin', 'node')
    )
    expect(resolved.dshEntrypointPath).toBe(
      join(resourcesPath, 'dsh', 'runtime', 'darwin-arm64', 'dsh', 'apps', 'cli', 'lib', 'bin.js')
    )
  })

  it('syncs the immutable ACP profile into the managed DSH home and replaces stale profile files', async () => {
    const staleProfileRoot = join(userDataPath, 'dsh', 'home', 'profiles', 'acp')
    await writeFileFixture(join(staleProfileRoot, 'package.json'), '{"name":"stale"}')
    await writeFileFixture(join(staleProfileRoot, 'cordis.patch.yml'), '[]')
    await writeFileFixture(join(staleProfileRoot, 'stale-only.yml'), 'stale: true')

    await new DshRuntimeLocator({
      arch: 'arm64',
      isPackaged: false,
      platform: 'darwin',
      projectRoot,
      userDataPath
    }).resolve()

    const sourceProfileRoot = join(projectRoot, 'resources', 'dsh', 'profile')
    await expect(readFile(join(staleProfileRoot, 'package.json'), 'utf8')).resolves.toBe(
      await readFile(join(sourceProfileRoot, 'package.json'), 'utf8')
    )
    await expect(readFile(join(staleProfileRoot, 'cordis.patch.yml'), 'utf8')).resolves.toBe(
      await readFile(join(sourceProfileRoot, 'cordis.patch.yml'), 'utf8')
    )
    await expect(readFile(join(staleProfileRoot, 'profile-extra.yml'), 'utf8')).resolves.toBe(
      'extra: true'
    )
    await expect(readFile(join(staleProfileRoot, 'stale-only.yml'), 'utf8')).rejects.toThrow()
  })

  it('rejects manifest drift, unsupported targets, and unsafe runtime paths', async () => {
    await writeRuntimeFixture(join(directory, 'drift'), {
      acpVersion: '1.5.0'
    })
    await expect(
      new DshRuntimeLocator({
        arch: 'arm64',
        assetsRoot: join(directory, 'drift'),
        isPackaged: false,
        platform: 'darwin',
        userDataPath
      }).resolve()
    ).rejects.toThrow(/ACP SDK version/)

    await expect(
      new DshRuntimeLocator({
        arch: 'arm64',
        assetsRoot: join(projectRoot, 'resources', 'dsh'),
        isPackaged: false,
        platform: 'freebsd',
        userDataPath
      }).resolve()
    ).rejects.toThrow(/Unsupported DSH runtime target/)

    await writeRuntimeFixture(join(directory, 'unsafe'), {
      nodeBinary: '../outside-node'
    })
    await expect(
      new DshRuntimeLocator({
        arch: 'arm64',
        assetsRoot: join(directory, 'unsafe'),
        isPackaged: false,
        platform: 'darwin',
        userDataPath
      }).resolve()
    ).rejects.toThrow(/unsafe DSH runtime path/)
  })
})

async function writeRuntimeFixture(
  assetsRoot: string,
  overrides: { acpVersion?: string; nodeBinary?: string } = {}
): Promise<void> {
  const manifest = runtimeManifest(overrides)
  await writeFileFixture(
    join(assetsRoot, 'runtime-manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  await writeFileFixture(
    join(assetsRoot, manifest.assets['darwin-arm64'].nodeBinary),
    'node'
  )
  await writeFileFixture(
    join(assetsRoot, manifest.assets['darwin-arm64'].dshEntrypoint),
    'dsh'
  )
  await writeFileFixture(join(assetsRoot, 'profile', 'package.json'), '{"name":"fixture-profile"}')
  await writeFileFixture(
    join(assetsRoot, 'profile', 'cordis.patch.yml'),
    'provider: realmflow-model-gateway'
  )
  await writeFileFixture(join(assetsRoot, 'profile', 'profile-extra.yml'), 'extra: true')
}

function runtimeManifest(overrides: { acpVersion?: string; nodeBinary?: string }) {
  return {
    schemaVersion: 1,
    runtimeId: 'dsh-v0.2.1-alpha.3-16-g571902028a',
    dsh: {
      package: '@deepseek-ai/dsh',
      version: '0.2.1-alpha.3',
      commit: '571902028a'
    },
    acp: {
      package: '@agentclientprotocol/sdk',
      version: overrides.acpVersion ?? '1.4.0'
    },
    node: {
      version: '22.19.0'
    },
    assets: {
      'darwin-arm64': {
        platform: 'darwin',
        arch: 'arm64',
        runtimeRoot: 'runtime/darwin-arm64',
        nodeBinary: overrides.nodeBinary ?? 'runtime/darwin-arm64/node/bin/node',
        dshEntrypoint: 'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js',
        profilePath: 'profile/package.json',
        files: []
      }
    }
  }
}

async function writeFileFixture(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}
