import { randomBytes } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'

export type QdrantConfigInput = {
  directory: string
  port: number
  apiKey: string
  storagePath: string
  snapshotsPath: string
}

export function generateQdrantApiKey(): string {
  return randomBytes(32).toString('base64url')
}

export function reserveQdrantHttpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to allocate a Qdrant HTTP port'))
        return
      }
      server.close((error) =>
        error ? reject(error) : resolve(address.port)
      )
    })
  })
}

export async function writeQdrantConfig(
  input: QdrantConfigInput
): Promise<string> {
  await Promise.all([
    mkdir(input.directory, { recursive: true, mode: 0o700 }),
    mkdir(input.storagePath, { recursive: true, mode: 0o700 }),
    mkdir(input.snapshotsPath, { recursive: true, mode: 0o700 })
  ])
  const configPath = join(input.directory, 'config.yaml')
  const content = [
    'log_level: INFO',
    'telemetry_disabled: true',
    'storage:',
    `  storage_path: ${yamlString(input.storagePath)}`,
    `  snapshots_path: ${yamlString(input.snapshotsPath)}`,
    'service:',
    '  host: 127.0.0.1',
    `  http_port: ${input.port}`,
    '  grpc_port: null',
    '  enable_cors: false',
    `  api_key: ${yamlString(input.apiKey)}`,
    'cluster:',
    '  enabled: false',
    ''
  ].join('\n')

  await writeFile(configPath, content, { encoding: 'utf8', mode: 0o600 })
  if (process.platform !== 'win32') await chmod(configPath, 0o600)
  return configPath
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}
