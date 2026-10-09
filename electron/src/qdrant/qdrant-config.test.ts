import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  generateQdrantApiKey,
  reserveQdrantHttpPort,
  writeQdrantConfig
} from './qdrant-config'

describe('Qdrant local configuration', () => {
  let temporaryDirectory: string | undefined

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true })
      temporaryDirectory = undefined
    }
  })

  it('allocates an available loopback HTTP port', async () => {
    const port = await reserveQdrantHttpPort()
    const server = createServer()

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    expect(port).toBeGreaterThan(0)
  })

  it('generates an opaque high-entropy API key', () => {
    const first = generateQdrantApiKey()
    const second = generateQdrantApiKey()

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).not.toBe(first)
  })

  it('writes a restricted loopback-only Qdrant configuration', async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'realmflow-qdrant-config-')
    )
    const configPath = await writeQdrantConfig({
      directory: temporaryDirectory,
      port: 43177,
      apiKey: 'local-secret',
      storagePath: join(temporaryDirectory, 'storage'),
      snapshotsPath: join(temporaryDirectory, 'snapshots')
    })

    const [content, metadata] = await Promise.all([
      readFile(configPath, 'utf8'),
      stat(configPath)
    ])

    expect(configPath).toBe(join(temporaryDirectory, 'config.yaml'))
    expect(content).toContain('host: 127.0.0.1')
    expect(content).toContain('http_port: 43177')
    expect(content).toContain('api_key: "local-secret"')
    expect(content).toContain('telemetry_disabled: true')
    expect(content).toContain('enabled: false')
    expect(content).not.toContain('0.0.0.0')
    expect(content).toContain('grpc_port: null')
    if (process.platform !== 'win32') {
      expect(metadata.mode & 0o777).toBe(0o600)
    }
  })
})
