import { describe, expect, it, vi } from 'vitest'
import {
  SandboxUnavailableError
} from '../tools/platform-sandbox-driver'
import { NodeConnectorProcessHost } from './node-connector-process-host'

describe('NodeConnectorProcessHost', () => {
  it('wraps CLI execution in the platform sandbox and exposes only explicit environment values', async () => {
    process.env.REALMFLOW_CONNECTOR_HOST_SECRET = 'must-not-leak'
    const sandbox = {
      wrap: vi.fn(async (input) => ({
        executable: input.executable,
        arguments: input.arguments
      }))
    }
    const host = new NodeConnectorProcessHost({ sandbox })
    try {
      const result = await host.spawn({
        executable: process.execPath,
        arguments: [
          '-e',
          `process.stdout.write(JSON.stringify({
            explicit: process.env.CONNECTOR_TOKEN ?? null,
            host: process.env.REALMFLOW_CONNECTOR_HOST_SECRET ?? null,
            home: process.env.HOME ?? null,
            path: process.env.PATH ?? null
          }))`
        ],
        cwd: process.cwd(),
        environment: { CONNECTOR_TOKEN: 'token-value' },
        shell: false,
        timeoutMs: 2_000,
        maxOutputBytes: 4_096
      })

      expect(sandbox.wrap).toHaveBeenCalledWith({
        executable: process.execPath,
        arguments: expect.any(Array),
        cwd: process.cwd()
      })
      expect(JSON.parse(result.stdout)).toEqual({
        explicit: 'token-value',
        host: null,
        home: null,
        path: null
      })
    } finally {
      delete process.env.REALMFLOW_CONNECTOR_HOST_SECRET
    }
  })

  it('fails closed when platform process isolation is unavailable', async () => {
    const host = new NodeConnectorProcessHost({
      sandbox: {
        wrap: vi.fn().mockRejectedValue(new SandboxUnavailableError())
      }
    })

    await expect(
      host.spawn({
        executable: process.execPath,
        arguments: ['--version'],
        cwd: process.cwd(),
        environment: {},
        shell: false,
        timeoutMs: 2_000,
        maxOutputBytes: 4_096
      })
    ).rejects.toMatchObject({
      code: 'connector_sandbox_unavailable',
      retryable: false,
      dispatched: false
    })
  })
})
