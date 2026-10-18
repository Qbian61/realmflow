import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { parse } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'

import { verifyDshPackageLayout } from './verify-dsh-package-layout.mjs'

describe('DSH package layout registration', () => {
  it('ships build and verification scripts through package.json', () => {
    expect(existsSync(resolve('scripts/build-dsh-runtime.sh'))).toBe(true)
    expect(existsSync(resolve('scripts/generate-dsh-runtime-sbom.mjs'))).toBe(true)
    expect(existsSync(resolve('scripts/verify-dsh-package-layout.mjs'))).toBe(true)

    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    expect(packageJson.scripts?.['build:dsh-runtime']).toBe(
      'bash scripts/build-dsh-runtime.sh'
    )
    expect(packageJson.scripts?.['generate:dsh-runtime-sbom']).toBe(
      'node scripts/generate-dsh-runtime-sbom.mjs'
    )
    expect(packageJson.scripts?.['verify:dsh-package-layout']).toBe(
      'node scripts/verify-dsh-package-layout.mjs'
    )
  })

  it('packages DSH runtime resources outside ASAR for the current platform target', () => {
    const config = parse(readFileSync(resolve('build/electron-builder.yml'), 'utf8'))

    expect(config.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'resources/dsh/runtime/${platform}-${arch}',
          to: 'dsh/runtime/${platform}-${arch}'
        }),
        expect.objectContaining({
          from: 'resources/dsh/profile',
          to: 'dsh/profile'
        }),
        expect.objectContaining({
          from: 'resources/dsh/runtime-manifest.json',
          to: 'dsh/runtime-manifest.json'
        }),
        expect.objectContaining({
          from: 'resources/dsh/runtime-sbom.cyclonedx.json',
          to: 'dsh/runtime-sbom.cyclonedx.json'
        })
      ])
    )
    expect(config.asar).toBe(true)
  })

  it('builds and verifies DSH runtime assets before mac packaging', () => {
    const script = readFileSync(resolve('scripts/build-mac-installer.sh'), 'utf8')
    const buildIndex = script.indexOf('bash scripts/build-dsh-runtime.sh --target darwin-arm64')
    const sbomIndex = script.indexOf('npm run generate:dsh-runtime-sbom')
    const verifyIndex = script.indexOf('npm run verify:dsh-package-layout')
    const electronBuilderIndex = script.indexOf('npx electron-builder')

    expect(buildIndex).toBeGreaterThan(-1)
    expect(sbomIndex).toBeGreaterThan(buildIndex)
    expect(verifyIndex).toBeGreaterThan(sbomIndex)
    expect(electronBuilderIndex).toBeGreaterThan(verifyIndex)
  })

  it('builds DSH with bundled Node 22 and complete pnpm deploy output', () => {
    const script = readFileSync(resolve('scripts/build-dsh-runtime.sh'), 'utf8')

    expect(script).toContain('node/lib/node_modules/corepack/dist/corepack.js')
    expect(script).toContain('run build:lib:host')
    expect(script).toContain('run build:lib:client')
    expect(script).toContain('build_dsh_native_system')
    expect(script).toContain('run build:native')
    expect(script).toContain('deploy')
    expect(script).toContain(
      'dsh_pnpm --filter @deepseek-ai/dsh deploy --ignore-scripts "$DSH_CLI_ROOT"'
    )
    expect(script).not.toContain('deploy --prod')
    expect(script).not.toContain(
      'rsync -a --delete "$DEPLOY_DIR/" "$DSH_CLI_ROOT/"'
    )
  })

  it('materializes only missing DSH workspace packages discovered from package metadata', () => {
    const script = readFileSync(resolve('scripts/build-dsh-runtime.sh'), 'utf8')

    expect(script).toContain('discover_dsh_workspace_packages')
    expect(script).toContain('materialize_missing_dsh_workspace_packages')
    expect(script).toContain('"$destination_path/package.json"')
    expect(script).not.toContain('DSH_SUPPLEMENTAL_WORKSPACE_PACKAGES')
    expect(
      script.indexOf('materialize_missing_dsh_workspace_packages')
    ).toBeLessThan(
      script.indexOf('npm run verify:dsh-package-layout')
    )
  })

  it('prunes DSH development fixtures before package layout verification', () => {
    const script = readFileSync(resolve('scripts/build-dsh-runtime.sh'), 'utf8')

    expect(script).toContain('prune_dsh_runtime_dev_artifacts')
    expect(script).toContain('-name tests')
    expect(script.indexOf('prune_dsh_runtime_dev_artifacts')).toBeLessThan(
      script.indexOf('npm run verify:dsh-package-layout')
    )
  })

  it('generates the runtime SBOM before package layout verification', () => {
    const script = readFileSync(resolve('scripts/build-dsh-runtime.sh'), 'utf8')

    expect(script).toContain('npm run generate:dsh-runtime-sbom')
    expect(script.indexOf('npm run generate:dsh-runtime-sbom')).toBeLessThan(
      script.indexOf('npm run verify:dsh-package-layout')
    )
  })
})

describe('DSH package layout verification', () => {
  let directory

  afterEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('accepts a complete staged DSH runtime package layout', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-package-'))
    await writePackageFixture(directory)

    await expect(
      verifyDshPackageLayout({
        builderConfigPath: join(directory, 'electron-builder.yml'),
        noticesPath: join(directory, 'THIRD_PARTY_NOTICES.md'),
        resourcesRoot: join(directory, 'resources/dsh'),
        runCommand: async () => ({ stdout: '0.2.1-alpha.3\n', stderr: '' }),
        target: 'darwin-arm64'
      })
    ).resolves.toEqual(['darwin-arm64'])
  })

  it('rejects a layout that omits the DSH CLI entrypoint', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-package-missing-'))
    await writePackageFixture(directory, {
      omit: 'runtime/darwin-arm64/dsh/apps/cli/lib/bin.js'
    })

    await expect(
      verifyDshPackageLayout({
        builderConfigPath: join(directory, 'electron-builder.yml'),
        noticesPath: join(directory, 'THIRD_PARTY_NOTICES.md'),
        resourcesRoot: join(directory, 'resources/dsh'),
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH package layout is missing')
  })

  it('rejects a layout that omits the generated runtime SBOM', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-package-sbom-'))
    await writePackageFixture(directory, {
      omit: 'runtime-sbom.cyclonedx.json'
    })

    await expect(
      verifyDshPackageLayout({
        builderConfigPath: join(directory, 'electron-builder.yml'),
        noticesPath: join(directory, 'THIRD_PARTY_NOTICES.md'),
        resourcesRoot: join(directory, 'resources/dsh'),
        runCommand: async () => ({ stdout: '0.2.1-alpha.3\n', stderr: '' }),
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH package layout is missing')
  })

  it('rejects a layout that omits the DSH supplemental peer package', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-package-peer-'))
    await writePackageFixture(directory, {
      omit:
        'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/cordis-plugin-group/package.json'
    })

    await expect(
      verifyDshPackageLayout({
        builderConfigPath: join(directory, 'electron-builder.yml'),
        noticesPath: join(directory, 'THIRD_PARTY_NOTICES.md'),
        resourcesRoot: join(directory, 'resources/dsh'),
        runCommand: async () => ({ stdout: '0.2.1-alpha.3\n', stderr: '' }),
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH package layout is missing')
  })

  it('rejects a layout missing ACP profile package entry bundles', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-package-acp-'))
    await writePackageFixture(directory, {
      omit:
        'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/dsh-api-gateway/lib/index.js'
    })

    await expect(
      verifyDshPackageLayout({
        builderConfigPath: join(directory, 'electron-builder.yml'),
        noticesPath: join(directory, 'THIRD_PARTY_NOTICES.md'),
        resourcesRoot: join(directory, 'resources/dsh'),
        runCommand: async () => ({ stdout: '0.2.1-alpha.3\n', stderr: '' }),
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH package layout is missing')
  })

  it('rejects a layout missing the platform node-addon-system native binary', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-package-native-'))
    await writePackageFixture(directory, {
      omit:
        'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/bin/system.node'
    })

    await expect(
      verifyDshPackageLayout({
        builderConfigPath: join(directory, 'electron-builder.yml'),
        noticesPath: join(directory, 'THIRD_PARTY_NOTICES.md'),
        resourcesRoot: join(directory, 'resources/dsh'),
        runCommand: async () => ({ stdout: '0.2.1-alpha.3\n', stderr: '' }),
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH package layout is missing')
  })

  it('rejects deployed runtime symlinks that escape the selected runtime root', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-package-link-'))
    await writePackageFixture(directory)
    const externalPackage = join(directory, 'external-dsh-package')
    await mkdir(externalPackage, { recursive: true })
    await symlink(
      externalPackage,
      join(
        directory,
        'resources/dsh/runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/escape'
      ),
      'dir'
    )

    await expect(
      verifyDshPackageLayout({
        builderConfigPath: join(directory, 'electron-builder.yml'),
        noticesPath: join(directory, 'THIRD_PARTY_NOTICES.md'),
        resourcesRoot: join(directory, 'resources/dsh'),
        runCommand: async () => ({ stdout: '0.2.1-alpha.3\n', stderr: '' }),
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH package layout symlink escapes runtime root')
  })

  it('rejects deployed runtime packages that still contain development test fixtures', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-package-dev-'))
    await writePackageFixture(directory)
    await writeFileFixture(
      join(
        directory,
        'resources/dsh/runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/dsh/tests/profile.spec.ts'
      ),
      'test fixture'
    )

    await expect(
      verifyDshPackageLayout({
        builderConfigPath: join(directory, 'electron-builder.yml'),
        noticesPath: join(directory, 'THIRD_PARTY_NOTICES.md'),
        resourcesRoot: join(directory, 'resources/dsh'),
        runCommand: async () => ({ stdout: '0.2.1-alpha.3\n', stderr: '' }),
        target: 'darwin-arm64'
      })
    ).rejects.toThrow('DSH package layout contains development fixture')
  })
})

async function writePackageFixture(directory, { omit } = {}) {
  const resourcesRoot = join(directory, 'resources/dsh')
  const files = [
    ['runtime/darwin-arm64/node/bin/node', 'node-runtime', true],
    ['runtime/darwin-arm64/dsh/apps/cli/lib/bin.js', 'dsh-entrypoint', true],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/cordis-plugin-group/package.json',
      '{"name":"@deepseek-ai/cordis-plugin-group"}'
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/cordis-plugin-group/lib/index.js',
      'export {}'
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/dsh-typert-registry/package.json',
      '{"name":"@deepseek-ai/dsh-typert-registry"}'
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/dsh-typert-registry/lib/index.js',
      'export {}'
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/dsh-typert-registry/lib/client.node.js',
      'export {}'
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/dsh-api-gateway/package.json',
      '{"name":"@deepseek-ai/dsh-api-gateway"}'
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/dsh-api-gateway/lib/index.js',
      'export {}'
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/dsh-api-gateway/lib/client.node.js',
      'export {}'
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/package.json',
      '{"name":"@deepseek-ai/node-addon-system-darwin-arm64"}'
    ],
    [
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
    ],
    [
      'runtime/darwin-arm64/dsh/apps/cli/node_modules/@deepseek-ai/node-addon-system-darwin-arm64/bin/system.node',
      'native-addon',
      true
    ],
    ['profile/package.json', '{"name":"@realmflow/dsh-profile"}'],
    ['profile/cordis.patch.yml', '- id: acp\n'],
    ['runtime-sbom.cyclonedx.json', JSON.stringify(validSbom())]
  ]
  for (const [path, content, executable] of files) {
    if (path === omit) continue
    await writeFileFixture(join(resourcesRoot, path), content, executable)
  }
  await writeFileFixture(
    join(resourcesRoot, 'runtime-manifest.json'),
    JSON.stringify(validManifest(files.filter(([path]) => path !== omit)))
  )
  await writeFileFixture(
    join(directory, 'electron-builder.yml'),
    [
      'asar: true',
      'extraResources:',
      '  - from: resources/dsh/runtime/${platform}-${arch}',
      '    to: dsh/runtime/${platform}-${arch}',
      '  - from: resources/dsh/profile',
      '    to: dsh/profile',
      '  - from: resources/dsh/runtime-manifest.json',
      '    to: dsh/runtime-manifest.json',
      '  - from: resources/dsh/runtime-sbom.cyclonedx.json',
      '    to: dsh/runtime-sbom.cyclonedx.json'
    ].join('\n')
  )
  await writeFileFixture(
    join(directory, 'THIRD_PARTY_NOTICES.md'),
    [
      '# Third-Party Notices',
      '',
      '## DeepSeek Harness v0.2.1-alpha.3',
      '',
      '- Package: @deepseek-ai/dsh',
      '- License: MIT',
      ''
    ].join('\n')
  )
}

async function writeFileFixture(path, content, executable = false) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  if (executable) await chmod(path, 0o755)
}

function validManifest(files) {
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
            platform: target.startsWith('win32-') ? 'win32' : target.split('-')[0],
            arch: target.startsWith('win32-') ? 'x64' : target.split('-')[1],
            runtimeRoot: `runtime/${target}`,
            nodeBinary:
              target === 'win32-x64'
                ? `runtime/${target}/node/node.exe`
                : `runtime/${target}/node/bin/node`,
            dshEntrypoint: `runtime/${target}/dsh/apps/cli/lib/bin.js`,
            profilePath: 'profile/package.json',
            files:
              target === 'darwin-arm64'
                ? files
                    .filter(([path]) => path !== 'profile/cordis.patch.yml')
                    .map(([path, content, executable]) =>
                      artifact(path, content, Boolean(executable))
                    )
                : []
          }
        ]
      )
    )
  }
}

function validSbom() {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: 'realmflow-dsh-runtime',
        version: 'dsh-v0.2.1-alpha.3-16-g571902028a'
      }
    },
    components: [
      {
        type: 'library',
        name: '@deepseek-ai/dsh',
        version: '0.2.1-alpha.3'
      },
      {
        type: 'library',
        name: '@agentclientprotocol/sdk',
        version: '1.4.0'
      },
      {
        type: 'framework',
        name: 'node',
        version: '22.19.0'
      }
    ]
  }
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
