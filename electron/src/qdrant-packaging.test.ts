import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectPath = (...parts: string[]) => join(process.cwd(), ...parts)

function readProjectFile(...parts: string[]): string {
  try {
    return readFileSync(projectPath(...parts), 'utf8')
  } catch {
    return ''
  }
}

describe('Qdrant packaging', () => {
  it('pins every supported platform to official v1.19.1 release assets', () => {
    const manifestSource = readProjectFile('build', 'qdrant-assets.json')
    const manifest = manifestSource ? JSON.parse(manifestSource) : {}

    expect(manifest.version).toBe('v1.19.1')
    expect(manifest.releaseBaseUrl).toBe(
      'https://github.com/qdrant/qdrant/releases/download/v1.19.1'
    )
    expect(Object.keys(manifest.assets ?? {}).sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-x64'
    ])

    for (const asset of Object.values<Record<string, string>>(
      manifest.assets ?? {}
    )) {
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('does not use latest release URLs in the manifest or scripts', () => {
    const packagingSources = [
      readProjectFile('build', 'qdrant-assets.json'),
      readProjectFile('scripts', 'download-qdrant.mjs'),
      readProjectFile('scripts', 'verify-qdrant-assets.mjs')
    ].join('\n')

    expect(packagingSources).toContain(
      'https://github.com/qdrant/qdrant/releases/download/v1.19.1'
    )
    expect(packagingSources).not.toMatch(
      /releases\/(?:latest|download\/latest)(?:\/|$)/i
    )
    expect(packagingSources).not.toContain('/releases/latest')
  })

  it('packages the downloaded target as an Electron extra resource', () => {
    const builderConfig = readProjectFile('build', 'electron-builder.yml')

    expect(builderConfig).toContain(
      'from: resources/qdrant/${platform}-${arch}'
    )
    expect(builderConfig).not.toContain('${os}')
    expect(builderConfig).toContain('to: qdrant')
  })

  it('rejects asset content whose digest does not match the manifest', () => {
    const scriptUrl = pathToFileURL(
      projectPath('scripts', 'download-qdrant.mjs')
    ).href
    const expectedDigest = createHash('sha256')
      .update('official qdrant archive')
      .digest('hex')
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { assertSha256 } from ${JSON.stringify(scriptUrl)}; assertSha256(Buffer.from('tampered qdrant archive'), ${JSON.stringify(expectedDigest)}, 'qdrant-test.tar.gz')`
      ],
      { encoding: 'utf8' }
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'SHA-256 mismatch for qdrant-test.tar.gz'
    )
  })

  it('documents the bundled Qdrant version and Apache-2.0 license', () => {
    const notices = readProjectFile('THIRD_PARTY_NOTICES.md')
    const license = readProjectFile(
      'resources',
      'qdrant',
      'LICENSE.qdrant'
    )

    expect(notices).toContain('Qdrant v1.19.1')
    expect(notices).toContain('Apache License 2.0')
    expect(license).toContain('Apache License')
    expect(license).toContain('Version 2.0, January 2004')
  })
})
