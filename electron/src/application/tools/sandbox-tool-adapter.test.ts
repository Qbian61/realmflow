import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import { SandboxToolAdapter } from './sandbox-tool-adapter'
import type {
  PreparedToolInvocation,
  ToolExecutionContext
} from './tool-adapter'

const context: ToolExecutionContext = {
  owner: { type: 'node_run', id: 'node-run-1' },
  nodeRunId: 'node-run-1',
  correlationId: 'correlation-1',
  causationId: 'command-1'
}

const invocation: PreparedToolInvocation = {
  executionId: 'execution-1',
  idempotencyKey: 'request-1',
  attemptId: 'attempt-1',
  attempt: 1,
  requestedBy: { type: 'model', id: 'model-1' },
  arguments: { value: 7 },
  scopeRoots: ['/workspace'],
  connectorGrants: [
    {
      service: 'github',
      url: 'http://127.0.0.1:48100/v1/skills/connectors/github',
      token: 'grant-token'
    }
  ]
}

describe('SandboxToolAdapter', () => {
  let temporaryDirectory: string
  let packageRoot: string
  let sidecar: {
    getHealth: ReturnType<typeof vi.fn>
    getSandboxCapabilities: ReturnType<typeof vi.fn>
    executeTool: ReturnType<typeof vi.fn>
    cancelToolExecution: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-sandbox-'))
    packageRoot = join(temporaryDirectory, 'package')
    await mkdir(join(packageRoot, 'tools'), { recursive: true })
    await writeFile(join(packageRoot, 'tools', 'main.py'), 'print("ok")')
    sidecar = {
      getHealth: vi.fn().mockResolvedValue({
        status: 'ok',
        service: 'realmflow-agent'
      }),
      getSandboxCapabilities: vi.fn().mockResolvedValue({
        platform: 'darwin',
        processIsolation: 'sandbox-exec'
      }),
      executeTool: vi.fn().mockResolvedValue({
        output: { answer: 7 },
        metrics: { durationMs: 10, outputBytes: 12 }
      }),
      cancelToolExecution: vi.fn().mockResolvedValue(true)
    }
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('resolves a package-contained entry and delegates bounded execution', async () => {
    const adapter = createAdapter()
    const binding = await adapter.resolve(definition(), context)
    const signal = new AbortController().signal
    const scopedInvocation = {
      ...invocation,
      scopeRoots: [temporaryDirectory]
    }

    await expect(adapter.prepare(binding, scopedInvocation)).resolves.toEqual({
      outcome: 'ready',
      sandboxAudit: {
        policyDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        executionLevel: 'controlled_network',
        enforcement: 'enforced',
        platformIsolation: 'sandbox-exec',
        readOnlyRootCount: 1,
        readWriteRootCount: 1,
        networkTargets: ['github@http://127.0.0.1:48100'],
        resources: {
          timeoutMs: 2_000,
          maxMemoryMb: 128,
          maxOutputBytes: 4_096
        }
      }
    })
    await expect(
      adapter.planEffects(binding, scopedInvocation)
    ).resolves.toMatchObject({
      outcome: 'planned',
      effects: [
        { kind: 'filesystem.write' },
        { kind: 'process.execute' },
        {
          kind: 'external',
          capability: 'connector.use',
          resourceKey: 'github@http://127.0.0.1:48100'
        }
      ]
    })
    await expect(
      adapter.execute(binding, scopedInvocation, { emit: vi.fn() }, signal)
    ).resolves.toEqual({
      outcome: 'succeeded',
      output: { answer: 7 },
      metrics: { durationMs: 10, outputBytes: 12 }
    })
    expect(sidecar.executeTool).toHaveBeenCalledWith(
      {
        executionId: 'execution-1',
        manifest: {
          schemaVersion: 1,
          executionId: 'execution-1',
          executionLevel: 'controlled_network',
          enforcement: 'enforced',
          platformIsolation: 'sandbox-exec',
          packageRoot: expect.stringMatching(/\/package$/),
          readOnlyRoots: [expect.stringMatching(/\/package$/)],
          readWriteRoots: [temporaryDirectory],
          environmentVariables: [
            'LANG',
            'LC_ALL',
            'PYTHONHASHSEED',
            'REALMFLOW_SKILL_CONNECTORS'
          ],
          networkTargets: [
            {
              service: 'github',
              origin: 'http://127.0.0.1:48100',
              pathPrefix: '/v1/skills/connectors/github'
            }
          ],
          resources: {
            timeoutMs: 2_000,
            maxMemoryMb: 128,
            maxOutputBytes: 4_096
          },
          policyDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
        },
        runtime: 'python',
        packageRoot: expect.stringMatching(/\/package$/),
        entryPath: expect.stringMatching(/\/package\/tools\/main\.py$/),
        arguments: ['--mode', 'safe', '7'],
        input: { value: 7 },
        capabilities: [
          'filesystem.write',
          'process.execute',
          'network.connect',
          'connector.use'
        ],
        scopeRoots: [temporaryDirectory],
        network: invocation.connectorGrants,
        timeoutMs: 2_000,
        maxMemoryMb: 128,
        maxOutputBytes: 4_096
      },
      signal
    )
  })

  it('rejects missing package digests and entry path escapes', async () => {
    const missing = new SandboxToolAdapter({
      packages: { resolveRoot: vi.fn().mockResolvedValue(undefined) },
      sidecar
    })
    await expect(missing.resolve(definition(), context)).rejects.toThrow(
      'Sandbox Tool package is unavailable'
    )

    const escaped = definition()
    if (escaped.executor.kind !== 'sandbox') throw new Error('invalid fixture')
    escaped.executor.entryPath = '../outside.py'
    await expect(createAdapter().resolve(escaped, context)).rejects.toThrow(
      'Sandbox Tool entry is invalid'
    )
  })

  it('reports unavailable health and delegates cancellation by execution id', async () => {
    sidecar.getHealth.mockRejectedValue(new Error('offline'))
    const adapter = createAdapter()

    await expect(adapter.health()).resolves.toEqual({
      status: 'unavailable',
      reason: 'Sandbox Sidecar is unavailable'
    })
    const binding = await adapter.resolve(definition(), context)
    await adapter.cancel(binding, 'execution-1')
    expect(sidecar.cancelToolExecution).toHaveBeenCalledWith('execution-1')
  })

  it('denies process execution when the platform isolation is unavailable', async () => {
    sidecar.getSandboxCapabilities.mockResolvedValue({
      platform: 'darwin',
      processIsolation: 'unavailable'
    })
    const adapter = createAdapter()
    const binding = await adapter.resolve(definition(), context)

    await expect(adapter.prepare(binding, invocation)).resolves.toEqual({
      outcome: 'denied',
      error: {
        code: 'tool_sandbox_unavailable',
        message: 'OS process isolation is unavailable',
        retryable: false
      }
    })
    expect(sidecar.executeTool).not.toHaveBeenCalled()
  })

  function createAdapter() {
    return new SandboxToolAdapter({
      packages: {
        resolveRoot: vi.fn().mockImplementation(async (digest: string) =>
          digest === 'b'.repeat(64) ? packageRoot : undefined
        )
      },
      sidecar
    })
  }
})

function definition(): ToolDefinition {
  return {
    schemaVersion: 1,
    id: 'local.example.python',
    version: '1.0.0',
    definitionDigest: 'a'.repeat(64),
    package: {
      packageId: 'local.example',
      packageVersion: '1.0.0',
      packageDigest: 'b'.repeat(64)
    },
    origin: 'local_upload',
    name: 'Example',
    description: '',
    tags: [],
    executor: {
      kind: 'sandbox',
      runtime: 'python',
      entryPath: 'tools/main.py',
      argumentsTemplate: ['--mode', 'safe', '{{value}}']
    },
    inputSchema: {},
    outputSchema: {},
    capabilities: [
      'filesystem.write',
      'process.execute',
      'network.connect',
      'connector.use'
    ],
    effects: [],
    risk: 'medium',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 2_000,
      maxOutputBytes: 4_096,
      maxMemoryMb: 128,
      maxAttempts: 1
    },
    discovery: { intents: [], contexts: ['general'] }
  }
}
