import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import { ComputerToolAdapter } from './computer-tool-adapter'
import type { PreparedToolInvocation } from './tool-adapter'

describe('ComputerToolAdapter', () => {
  it('reports unavailable outside macOS without invoking the host', async () => {
    const harness = createHarness({ platform: 'linux' })

    await expect(harness.adapter.health()).resolves.toEqual({
      status: 'unavailable',
      reason: 'Computer Use is available only on macOS'
    })
    expect(harness.host.health).not.toHaveBeenCalled()
  })

  it('requires separate OS permissions and an explicit application grant', async () => {
    const harness = createHarness()
    harness.host.health.mockResolvedValue({
      screenRecording: true,
      accessibility: false
    })
    const binding = await harness.adapter.resolve(
      definition('click'),
      executionContext()
    )

    await expect(
      harness.adapter.prepare(binding, invocation())
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      error: { code: 'computer_accessibility_permission_required' }
    })

    harness.host.health.mockResolvedValue({
      screenRecording: true,
      accessibility: true
    })
    harness.isApplicationAuthorized.mockResolvedValue(false)
    await expect(
      harness.adapter.prepare(binding, invocation())
    ).resolves.toMatchObject({
      outcome: 'denied',
      error: { code: 'computer_application_not_authorized' }
    })
  })

  it('plans observation and control against the bound application', async () => {
    const harness = createHarness()
    const observe = await harness.adapter.resolve(
      definition('screenshot'),
      executionContext()
    )
    const control = await harness.adapter.resolve(
      definition('click'),
      executionContext()
    )

    await expect(
      harness.adapter.planEffects(observe, invocation())
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'computer.observe',
          application: {
            bundleId: 'com.example.Editor',
            displayName: 'com.example.Editor'
          }
        }
      ]
    })
    await expect(
      harness.adapter.planEffects(control, invocation())
    ).resolves.toMatchObject({
      outcome: 'planned',
      effects: [{ kind: 'computer.control' }]
    })
  })

  it('blocks secure text input and semantic critical actions before host execution', async () => {
    const harness = createHarness()
    const binding = await harness.adapter.resolve(
      definition('type'),
      executionContext()
    )
    harness.host.inspectTarget.mockResolvedValueOnce({
      bundleId: 'com.example.Editor',
      secureInput: true
    })

    await expect(
      harness.adapter.execute(
        binding,
        invocation({ text: 'secret' }),
        eventSink(),
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'computer_secure_input_blocked' }
    })

    harness.host.inspectTarget.mockResolvedValueOnce({
      bundleId: 'com.example.Editor',
      secureInput: false,
      actionSemantic: 'submit'
    })
    harness.isCriticalActionApproved.mockResolvedValue(false)
    await expect(
      harness.adapter.execute(
        binding,
        invocation({ text: 'publish' }),
        eventSink(),
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'computer_critical_action_requires_approval' }
    })
    expect(harness.host.perform).not.toHaveBeenCalled()
  })

  it('stores screenshots as short-lived artifacts without embedding bytes in output', async () => {
    const harness = createHarness()
    harness.host.perform.mockResolvedValue({
      output: { width: 800, height: 600 },
      screenshot: {
        mediaType: 'image/png',
        bytes: new Uint8Array([1, 2, 3])
      }
    })
    const binding = await harness.adapter.resolve(
      definition('screenshot'),
      executionContext()
    )

    await expect(
      harness.adapter.execute(
        binding,
        invocation(),
        eventSink(),
        new AbortController().signal
      )
    ).resolves.toEqual({
      outcome: 'succeeded',
      output: { width: 800, height: 600 },
      artifacts: [
        {
          artifactId: 'temporary-tool-image',
          mediaType: 'image/png',
          byteLength: 3,
          checksum: 'a'.repeat(64)
        }
      ],
      metrics: { durationMs: 0, outputBytes: 26 }
    })
    expect(harness.createTemporary).toHaveBeenCalledWith({
      executionId: 'execution-1',
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
      expiresAt: 901_000
    })
  })
})

function createHarness(options: { platform?: NodeJS.Platform } = {}) {
  const host = {
    health: vi.fn().mockResolvedValue({
      screenRecording: true,
      accessibility: true
    }),
    inspectTarget: vi.fn().mockResolvedValue({
      bundleId: 'com.example.Editor',
      secureInput: false
    }),
    perform: vi.fn().mockResolvedValue({ output: { ok: true } })
  }
  const isApplicationAuthorized = vi.fn().mockResolvedValue(true)
  const isCriticalActionApproved = vi.fn().mockResolvedValue(true)
  const createTemporary = vi.fn().mockResolvedValue({
    artifactId: 'temporary-tool-image',
    mediaType: 'image/png',
    byteLength: 3,
    checksum: 'a'.repeat(64)
  })
  return {
    host,
    isApplicationAuthorized,
    isCriticalActionApproved,
    createTemporary,
    adapter: new ComputerToolAdapter({
      host,
      grants: { isApplicationAuthorized },
      criticalGate: { isApproved: isCriticalActionApproved },
      artifacts: { createTemporary },
      platform: options.platform ?? 'darwin',
      now: () => 1_000
    })
  }
}

function invocation(
  arguments_: Record<string, unknown> = {}
): PreparedToolInvocation {
  return {
    executionId: 'execution-1',
    idempotencyKey: 'request-1',
    attemptId: 'attempt-1',
    attempt: 1,
    requestedBy: { type: 'model', id: 'model-1' },
    arguments: {
      bundleId: 'com.example.Editor',
      ...arguments_
    },
    scopeRoots: [],
    connectorGrants: []
  }
}

function executionContext() {
  return {
    owner: { type: 'application' as const, id: 'realmflow' },
    correlationId: 'correlation-1',
    causationId: 'command-1'
  }
}

function eventSink() {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

function definition(action: string): ToolDefinition {
  return {
    schemaVersion: 1,
    id: `builtin.computer.${action}`,
    version: '1.0.0',
    definitionDigest: 'a'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.computer',
      packageVersion: '1.0.0',
      packageDigest: 'b'.repeat(64)
    },
    origin: 'builtin',
    name: action,
    description: action,
    tags: ['computer'],
    executor: {
      kind: 'computer',
      actionSet: action,
      actionSetVersion: '1.0.0'
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities:
      action === 'screenshot'
        ? ['computer.observe']
        : ['computer.control'],
    effects: ['user_interface.change'],
    risk: 'high',
    invocation: {
      mode: 'unary',
      idempotency: 'supported',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 120_000,
      maxOutputBytes: 4_194_304,
      maxAttempts: 1
    },
    discovery: { intents: [action], contexts: ['general'] }
  }
}
