import { describe, expect, it, vi } from 'vitest'
import { GatewayRuntimeService } from './gateway-runtime-service'

function fixture() {
  const health = vi.fn(async () => ({
    sidecar: 'ready' as const,
    adapters: {
      builtin: 'ready' as const,
      sandbox: 'ready' as const,
      mcp: 'degraded' as const,
      computer: 'ready' as const,
      connector: 'ready' as const
    }
  }))
  const configuration = vi.fn(async () => ({
    application: { version: '0.1.0', schemaVersion: 107 },
    workspace: { configured: true, count: 2 },
    web: {
      searchProvider: 'searxng' as const,
      browserContinuation: true,
      endpointConfigured: true,
      credentialConfigured: false
    }
  }))
  const checkForUpdates = vi.fn(async ({ requestId }: { requestId: string }) => ({
    requestId,
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    status: 'update_available' as const,
    checkedAt: 1_791_600_000_000
  }))
  return {
    health,
    configuration,
    checkForUpdates,
    service: new GatewayRuntimeService({
      health,
      configuration,
      checkForUpdates,
      now: () => 1_791_600_000_000
    })
  }
}

const context = { runId: 'run-1', requestId: 'request-1' }

describe('GatewayRuntimeService', () => {
  it('returns sanitized runtime health without internal paths or errors', async () => {
    const { service } = fixture()

    const result = await service.execute({ action: 'health' }, context)

    expect(result).toEqual({
      status: 'degraded',
      components: {
        sidecar: 'ready',
        builtin: 'ready',
        sandbox: 'ready',
        mcp: 'degraded',
        computer: 'ready',
        connector: 'ready'
      }
    })
    expect(JSON.stringify(result)).not.toMatch(/path|url|error|pid|argument/i)
  })

  it('returns only a path-scoped configuration subtree and stable hash', async () => {
    const { service } = fixture()

    const first = await service.execute({
      action: 'config_get',
      path: '/web'
    }, context)
    const second = await service.execute({
      action: 'config_get',
      path: '/web'
    }, { ...context, requestId: 'request-2' })

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      status: 'completed',
      path: '/web',
      value: {
        searchProvider: 'searxng',
        browserContinuation: true,
        endpointConfigured: true,
        credentialConfigured: false
      }
    })
    expect(first.configHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(first)).not.toContain('http')
  })

  it('returns one path-scoped schema subtree', async () => {
    const { service } = fixture()

    await expect(service.execute({
      action: 'config_schema_lookup',
      path: '/web/searchProvider'
    }, context)).resolves.toEqual({
      status: 'completed',
      path: '/web/searchProvider',
      schema: {
        type: 'string',
        enum: ['disabled', 'searxng', 'brave']
      },
      patchable: true
    })
  })

  it.each([
    '/credentials',
    '/security',
    '/permissions',
    '/sandbox',
    '/paths/userData',
    '/web/searxngBaseUrl',
    '/unknown'
  ])('denies protected or unknown config path %s', async (path) => {
    const { service } = fixture()

    await expect(service.execute({
      action: 'config_get',
      path
    }, context)).rejects.toThrow('gateway_path_denied')
  })

  it('creates a deterministic bounded patch proposal without saving configuration', async () => {
    const { service, configuration } = fixture()
    const input = {
      action: 'config_patch_proposal',
      patches: [
        { op: 'replace', path: '/web/searchProvider', value: 'disabled' },
        { op: 'replace', path: '/web/browserContinuation', value: false }
      ]
    } as const

    const first = await service.execute(input, context)
    const replay = await service.execute(input, context)

    expect(first).toEqual(replay)
    expect(first).toMatchObject({
      status: 'approval_required',
      action: 'config_patch',
      approvalSurface: 'settings',
      patches: input.patches,
      runId: 'run-1',
      requestId: 'request-1',
      expiresAt: 1_791_600_900_000
    })
    expect(first.proposalId).toMatch(/^gateway-config-[a-f0-9]{24}$/)
    expect(first.configHash).toMatch(/^[a-f0-9]{64}$/)
    expect(configuration).toHaveBeenCalledTimes(2)
  })

  it.each([
    [{ op: 'replace', path: '/web/credentialConfigured', value: true }],
    [{ op: 'replace', path: '/web/searchProvider', value: 'unknown' }],
    [{ op: 'copy', path: '/web/searchProvider', value: 'disabled' }],
    [{ op: 'replace', path: '/security/toolPolicy', value: 'full' }]
  ])('rejects an invalid or protected patch', async (patches) => {
    const { service } = fixture()

    await expect(service.execute({
      action: 'config_patch_proposal',
      patches
    }, context)).rejects.toThrow('gateway_patch_denied')
  })

  it('creates a restart proposal without invoking an Electron lifecycle API', async () => {
    const { service } = fixture()

    await expect(service.execute({
      action: 'restart_proposal',
      reason: 'Recover the local sidecar'
    }, context)).resolves.toMatchObject({
      status: 'approval_required',
      action: 'restart',
      approvalSurface: 'application',
      reason: 'Recover the local sidecar',
      runId: 'run-1',
      requestId: 'request-1',
      expiresAt: 1_791_600_900_000
    })
  })

  it('delegates update checks to the existing audited support service', async () => {
    const { service, checkForUpdates } = fixture()

    await expect(service.execute({
      action: 'update_check'
    }, context)).resolves.toEqual({
      status: 'update_available',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      checkedAt: 1_791_600_000_000
    })
    expect(checkForUpdates).toHaveBeenCalledWith({
      requestId: 'gateway-update-request-1'
    })
  })

  it('rejects unknown actions and client-owned identity fields', async () => {
    const { service } = fixture()

    await expect(service.execute({
      action: 'restart',
      runId: 'forged'
    }, context)).rejects.toThrow('gateway_command_invalid')
  })
})
