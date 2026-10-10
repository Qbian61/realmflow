import { describe, expect, it, vi } from 'vitest'
import { RuntimeSensitiveControls } from './runtime-sensitive-controls'

const definitions = [
  { id: 'local.search', version: '1.0.0', kind: 'connector', name: 'Local Search',
    description: 'Search local records', source: 'manual', definitionDigest: 'a'.repeat(64) }
] as never[]
const installations = [
  { id: 'install-search', capabilityId: 'local.search', capabilityVersion: '1.0.0',
    status: 'installed_disabled', revision: 2, scope: { kind: 'global' } }
] as never[]

function fixture() {
  const catalog = {
    listDefinitions: vi.fn(async () => definitions),
    listInstallations: vi.fn(async () => installations)
  }
  const credentials = {
    resolveHandle: vi.fn(async (name: string, service?: string) =>
      name === 'provider-1' && service === 'model' ? 'model:provider-1' : undefined)
  }
  return { service: new RuntimeSensitiveControls({ catalog, credentials }), catalog, credentials }
}

describe('RuntimeSensitiveControls', () => {
  it('returns only a credential handle and never reads secret plaintext', async () => {
    const { service, credentials } = fixture()
    await expect(service.secret({ action: 'resolve', name: 'provider-1', service: 'model' }))
      .resolves.toEqual({ status: 'available', handle: 'model:provider-1', service: 'model' })
    expect(credentials.resolveHandle).toHaveBeenCalledWith('provider-1', 'model')
    expect(JSON.stringify(await service.secret({
      action: 'request', name: 'missing', service: 'model', reason: 'Needed for search'
    }))).not.toContain('secret')
  })

  it('reports missing credentials as user input without inventing a handle', async () => {
    const { service } = fixture()
    await expect(service.secret({ action: 'request', name: 'missing', service: 'model' }))
      .resolves.toEqual({
        status: 'user_input_required', name: 'missing', service: 'model',
        nextAction: 'configure_credential'
      })
  })

  it('searches and inspects a bounded catalog without mutating it', async () => {
    const { service, catalog } = fixture()
    await expect(service.capability({ action: 'search', query: 'search', limit: 10 }, {
      runId: 'run-1', requestId: 'request-1'
    })).resolves.toMatchObject({
      status: 'completed', capabilities: [{ capabilityId: 'local.search', installationId: 'install-search' }]
    })
    await expect(service.capability({ action: 'inspect', capabilityId: 'local.search' }, {
      runId: 'run-1', requestId: 'request-2'
    })).resolves.toMatchObject({
      status: 'completed', capability: { capabilityId: 'local.search', installationId: 'install-search' }
    })
    expect(catalog.listDefinitions).toHaveBeenCalled()
  })

  it.each(['install', 'enable', 'disable', 'upgrade', 'rollback'] as const)(
    'turns %s into a deterministic approval proposal without changing the catalog', async (action) => {
      const { service, catalog } = fixture()
      const input = action === 'install'
        ? { action, proposalId: 'import-proposal' }
        : action === 'upgrade' || action === 'rollback'
          ? { action, installationId: 'install-search', targetVersion: '2.0.0', expectedRevision: 2 }
          : { action, installationId: 'install-search', expectedRevision: 2 }
      const first = await service.capability(input, { runId: 'run-1', requestId: 'request-1' })
      const replay = await service.capability(input, { runId: 'run-1', requestId: 'request-1' })
      expect(first).toEqual(replay)
      expect(first).toMatchObject({
        status: 'approval_required', action, approvalSurface: 'capabilities'
      })
      expect(first.proposalId).toMatch(/^runtime-capability-[a-f0-9]{24}$/)
      expect(catalog.listDefinitions).not.toHaveBeenCalled()
      expect(catalog.listInstallations).not.toHaveBeenCalled()
    })

  it('rejects malformed mutation proposals before returning approval state', async () => {
    const { service } = fixture()
    await expect(service.capability({ action: 'enable', installationId: 'install-search' }, {
      runId: 'run-1', requestId: 'request-1'
    })).rejects.toThrow('runtime_capability_command_invalid')
  })
})
