import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatformSandboxDriver } from './platform-sandbox-driver'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('PlatformSandboxDriver', () => {
  it('allows reading configured absolute argument paths without granting writes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'realmflow-mcp-fixture-'))
    directories.push(directory)
    const scriptPath = join(directory, 'mock-mcp-server.mjs')
    await writeFile(scriptPath, 'export {}')
    const canonicalScriptPath = await realpath(scriptPath)
    const driver = new PlatformSandboxDriver({
      platform: 'darwin',
      sandboxExecutable: '/usr/bin/sandbox-exec'
    })

    const command = await driver.wrap({
      executable: process.execPath,
      arguments: [scriptPath],
      cwd: process.cwd()
    })

    expect(command.executable).toBe('/usr/bin/sandbox-exec')
    expect(command.arguments.at(-2)).toBe(process.execPath)
    expect(command.arguments.at(-1)).toBe(scriptPath)
    expect(command.arguments[1]).toContain(
      `(allow file-read* (subpath ${JSON.stringify(canonicalScriptPath)}))`
    )
    expect(command.arguments[1]).not.toContain(
      `(allow file-write* (subpath ${JSON.stringify(directory)}))`
    )
  })
})
