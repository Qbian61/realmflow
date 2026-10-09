import { describe, expect, it } from 'vitest'
import {
  createSandboxManifest,
  SandboxPolicyError
} from './sandbox-manifest'

describe('SandboxManifest', () => {
  it('derives a deterministic least-privilege manifest without secret values', () => {
    const manifest = createSandboxManifest({
      executionId: 'execution-1',
      runtime: 'process',
      capabilities: [
        'filesystem.read',
        'filesystem.write',
        'process.execute',
        'network.connect',
        'connector.use'
      ],
      effects: ['local_data.write'],
      risk: 'high',
      packageRoot: '/managed/packages/example',
      scopeRoots: ['/workspace/project'],
      connectorGrants: [
        {
          service: 'docs',
          url: 'http://127.0.0.1:43123/v1/skills/connectors/docs',
          token: 'must-not-enter-manifest'
        }
      ],
      resources: {
        timeoutMs: 2_000,
        maxMemoryMb: 128,
        maxOutputBytes: 4_096
      },
      platform: {
        name: 'darwin',
        processIsolation: 'sandbox-exec'
      }
    })

    expect(manifest).toEqual({
      schemaVersion: 1,
      executionId: 'execution-1',
      executionLevel: 'controlled_network',
      enforcement: 'enforced',
      platformIsolation: 'sandbox-exec',
      packageRoot: '/managed/packages/example',
      readOnlyRoots: ['/managed/packages/example'],
      readWriteRoots: ['/workspace/project'],
      environmentVariables: [
        'LANG',
        'LC_ALL',
        'REALMFLOW_TOOL_CONNECTORS'
      ],
      networkTargets: [
        {
          service: 'docs',
          origin: 'http://127.0.0.1:43123',
          pathPrefix: '/v1/skills/connectors/docs'
        }
      ],
      resources: {
        timeoutMs: 2_000,
        maxMemoryMb: 128,
        maxOutputBytes: 4_096
      },
      policyDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(JSON.stringify(manifest)).not.toContain('must-not-enter-manifest')
  })

  it('defaults to no filesystem, environment, or network authority', () => {
    expect(
      createSandboxManifest({
        executionId: 'execution-pure',
        runtime: 'process',
        capabilities: [],
        effects: [],
        risk: 'low',
        packageRoot: '/managed/packages/pure',
        scopeRoots: ['/workspace/must-not-be-visible'],
        connectorGrants: [],
        resources: {
          timeoutMs: 500,
          maxMemoryMb: 32,
          maxOutputBytes: 512
        },
        platform: {
          name: 'darwin',
          processIsolation: 'sandbox-exec'
        }
      })
    ).toMatchObject({
      executionLevel: 'pure_function',
      readOnlyRoots: ['/managed/packages/pure'],
      readWriteRoots: [],
      environmentVariables: ['LANG', 'LC_ALL'],
      networkTargets: []
    })
  })

  it('records Linux bwrap as the fixed process isolation mechanism', () => {
    expect(
      createSandboxManifest({
        executionId: 'execution-linux',
        runtime: 'process',
        capabilities: ['process.execute'],
        effects: [],
        risk: 'medium',
        packageRoot: '/managed/packages/linux',
        scopeRoots: [],
        connectorGrants: [],
        resources: {
          timeoutMs: 2_000,
          maxMemoryMb: 128,
          maxOutputBytes: 4_096
        },
        platform: {
          name: 'linux',
          processIsolation: 'bwrap'
        }
      })
    ).toMatchObject({
      enforcement: 'enforced',
      platformIsolation: 'bwrap'
    })
  })

  it('rejects process and higher execution levels when OS isolation is unavailable', () => {
    expect(() =>
      createSandboxManifest({
        executionId: 'execution-unsafe',
        runtime: 'process',
        capabilities: ['process.execute'],
        effects: [],
        risk: 'medium',
        packageRoot: '/managed/packages/example',
        scopeRoots: [],
        connectorGrants: [],
        resources: {
          timeoutMs: 2_000,
          maxMemoryMb: 128,
          maxOutputBytes: 4_096
        },
        platform: {
          name: 'darwin',
          processIsolation: 'unavailable'
        }
      })
    ).toThrow(
      expect.objectContaining<Partial<SandboxPolicyError>>({
        code: 'platform_isolation_required'
      })
    )
  })
})
