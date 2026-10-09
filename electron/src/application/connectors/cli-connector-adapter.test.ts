import { describe, expect, it, vi } from 'vitest'
import type { EffectiveConnectorSnapshot } from './connector-gateway'
import { CliConnectorAdapter } from './cli-connector-adapter'

describe('CliConnectorAdapter', () => {
  it('spawns a fixed executable without a shell and maps declared arguments', async () => {
    const spawn = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"clean":true}',
      stderr: ''
    }))
    const adapter = new CliConnectorAdapter({
      processes: { spawn },
      resolveWorkingDirectory: () => '/workspace',
      resolveCredential: async () => 'secret'
    })

    const result = await adapter.invoke({
      snapshot: snapshot(),
      arguments: { short: true },
      correlationId: 'run-1',
      causationId: 'call-1'
    })

    expect(spawn).toHaveBeenCalledWith({
      executable: '/usr/bin/git',
      arguments: ['status', '--short'],
      cwd: '/workspace',
      environment: { GIT_TOKEN: 'secret' },
      shell: false,
      timeoutMs: 2_000,
      maxOutputBytes: 4_096,
      signal: undefined
    })
    expect(result.output).toEqual({
      exitCode: 0,
      stdout: '{"clean":true}',
      stderr: ''
    })
  })

  it('rejects undeclared arguments before spawning', async () => {
    const spawn = vi.fn()
    const adapter = new CliConnectorAdapter({
      processes: { spawn },
      resolveWorkingDirectory: () => '/workspace',
      resolveCredential: async () => 'secret'
    })

    await expect(
      adapter.invoke({
        snapshot: snapshot(),
        arguments: { command: 'status; rm -rf /' },
        correlationId: 'run-1',
        causationId: 'call-1'
      })
    ).rejects.toThrow('arguments')
    expect(spawn).not.toHaveBeenCalled()
  })
})

function snapshot(): EffectiveConnectorSnapshot {
  return {
    capabilityId: 'connector.cli',
    capabilityVersion: '1.0.0',
    capabilityDigest: 'b'.repeat(64),
    installationId: 'installation-2',
    scope: { kind: 'workspace', workspaceId: 'workspace-1' },
    credentialHandles: { git: 'credential-git' },
    permissionCeiling: {
      capabilities: ['connector.use', 'process.execute', 'credential.use'],
      maximumRisk: 'medium',
      pathPrefixes: ['/usr/bin', '/workspace'],
      networkTargets: []
    },
    action: {
      id: 'git-status',
      name: 'Git status',
      description: 'Read repository status.',
      operation: 'read',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'medium',
      effects: [],
      timeoutMs: 2_000,
      maxOutputBytes: 4_096,
      protocol: {
        kind: 'cli',
        executable: '/usr/bin/git',
        subcommand: ['status'],
        argumentNames: ['short'],
        workingDirectory: 'workspace',
        environmentCredentialRefs: {
          GIT_TOKEN: 'git'
        }
      }
    }
  }
}
