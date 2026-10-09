import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAppIconPath } from './app-icon'

describe('application icon', () => {
  it('uses logo.png in development and packaged builds', () => {
    expect(
      resolveAppIconPath({
        isPackaged: false,
        resourcesPath: '/Applications/RealmFlow.app/Contents/Resources',
        cwd: '/workspace/realmflow'
      })
    ).toBe(join('/workspace/realmflow', 'logo.png'))

    expect(
      resolveAppIconPath({
        isPackaged: true,
        resourcesPath: '/Applications/RealmFlow.app/Contents/Resources',
        cwd: '/workspace/realmflow',
        exists: () => true
      })
    ).toBe(
      join('/Applications/RealmFlow.app/Contents/Resources', 'logo.png')
    )
  })

  it('falls back to the development icon when packaged resources are absent', () => {
    expect(
      resolveAppIconPath({
        isPackaged: true,
        resourcesPath: '/Applications/Electron.app/Contents/Resources',
        cwd: '/workspace/realmflow',
        exists: (path) => path === '/workspace/realmflow/logo.png'
      })
    ).toBe(join('/workspace/realmflow', 'logo.png'))
  })

  it('configures logo.png as the packaged macOS icon and resource', () => {
    const builderConfig = readFileSync(
      join(process.cwd(), 'build/electron-builder.yml'),
      'utf8'
    )

    expect(builderConfig).toContain('icon: logo.png')
    expect(builderConfig).toContain('from: logo.png')
    expect(builderConfig).toContain('to: logo.png')
  })
})
