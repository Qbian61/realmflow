import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

describe('sandboxed preload bundles', () => {
  it('keeps both preload entries self-contained', async () => {
    await execFileAsync(
      process.execPath,
      [resolve('node_modules/electron-vite/bin/electron-vite.js'), 'build'],
      { cwd: process.cwd() }
    )

    const preloadDirectory = resolve(process.cwd(), 'out/preload')
    const entryFiles = ['preload.cjs', 'native-overlay-preload.cjs']

    for (const entryFile of entryFiles) {
      const source = await readFile(
        resolve(preloadDirectory, entryFile),
        'utf8'
      )

      expect(source).not.toMatch(/require\((['"])\.\/.*\1\)/)
    }

    expect(await readdir(preloadDirectory)).not.toContain('chunks')
  }, 120_000)
})
