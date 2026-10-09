import { describe, expect, it, vi } from 'vitest'
import {
  createCapabilityDefinition,
  createCapabilityInstallation
} from '../../../../domain/capability'
import {
  createCapabilitySpec,
  type CapabilityGenerationSession
} from '../../../../domain/capability-builder'
import {
  CapabilityBuilderService,
  type CapabilityBuilderSessionRepository
} from './capability-builder-service'
import type { PreparedCapabilityPackage } from './capability-package-service'

describe('CapabilityBuilderService', () => {
  it('validates a draft without publishing or installing it', async () => {
    const fixture = createFixture()

    const session = await fixture.service.createDraft({
      request: 'Create an issue lookup connector.',
      spec: connectorSpec()
    })

    expect(session.status).toBe('awaiting_approval')
    expect(session.conversationId).toBe('capability-builder:generated-1')
    expect(session.requestedBy).toBe('local-user')
    expect(session.proposal).toMatchObject({
      packageDigest: 'c'.repeat(64),
      definitionDigest: generatedDefinition().definitionDigest,
      draftRevision: 1,
      fileNames: ['README.md', 'capability.yaml']
    })
    expect(fixture.installer.install).not.toHaveBeenCalled()
    expect(fixture.pending.rollback).toHaveBeenCalledOnce()
    expect(fixture.repository.current?.revision).toBe(3)
  })

  it('keeps a failed validation in draft state with a stable diagnostic', async () => {
    const fixture = createFixture({
      prepare: vi.fn().mockRejectedValue(
        new Error('Capability package test failed: contract')
      )
    })

    const session = await fixture.service.createDraft({
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue lookup connector.',
      spec: connectorSpec()
    })

    expect(session).toMatchObject({
      status: 'draft',
      revision: 3,
      diagnostics: ['Capability package test failed: contract']
    })
    expect(session.proposal).toBeUndefined()
    expect(fixture.installer.install).not.toHaveBeenCalled()
  })

  it('installs only the approved digest and scope', async () => {
    const fixture = createFixture()
    const proposal = await fixture.service.createDraft({
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue lookup connector.',
      spec: connectorSpec()
    })

    const result = await fixture.service.confirmInstall({
      sessionId: proposal.id,
      proposalId: proposal.proposal!.id,
      revision: proposal.revision,
      packageDigest: proposal.proposal!.packageDigest,
      scope: proposal.proposal!.scope,
      enable: false
    })

    expect(result.installation.status).toBe('installed_disabled')
    expect(fixture.installer.install).toHaveBeenCalledOnce()
    expect(fixture.installer.install).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        enable: false
      })
    )
    expect(fixture.repository.current).toMatchObject({
      status: 'installed',
      revision: 4,
      proposal: undefined,
      installedResult: result
    })
  })

  it('rejects digest and scope drift before calling the installer', async () => {
    const fixture = createFixture()
    const proposal = await fixture.service.createDraft({
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue lookup connector.',
      spec: connectorSpec()
    })

    await expect(
      fixture.service.confirmInstall({
        sessionId: proposal.id,
        proposalId: proposal.proposal!.id,
        revision: proposal.revision,
        packageDigest: 'd'.repeat(64),
        scope: proposal.proposal!.scope,
        enable: false
      })
    ).rejects.toThrow('Capability approval digest changed')
    await expect(
      fixture.service.confirmInstall({
        sessionId: proposal.id,
        proposalId: proposal.proposal!.id,
        revision: proposal.revision,
        packageDigest: proposal.proposal!.packageDigest,
        scope: { kind: 'global' },
        enable: false
      })
    ).rejects.toThrow('Capability approval scope changed')
    expect(fixture.installer.install).not.toHaveBeenCalled()
  })

  it('invalidates approval when the revalidated package changed', async () => {
    const prepare = vi
      .fn()
      .mockResolvedValueOnce(preparedPackage())
      .mockResolvedValueOnce(
        preparedPackage({ packageDigest: 'd'.repeat(64) })
      )
    const fixture = createFixture({ prepare })
    const proposal = await fixture.service.createDraft({
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue lookup connector.',
      spec: connectorSpec()
    })

    await expect(
      fixture.service.confirmInstall({
        sessionId: proposal.id,
        proposalId: proposal.proposal!.id,
        revision: proposal.revision,
        packageDigest: proposal.proposal!.packageDigest,
        scope: proposal.proposal!.scope,
        enable: false
      })
    ).rejects.toThrow('Capability draft changed after validation')
    expect(fixture.installer.install).not.toHaveBeenCalled()
  })

  it('rejects enabling a high-risk generated capability', async () => {
    const fixture = createFixture()
    const proposal = await fixture.service.createDraft({
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue writer.',
      spec: {
        ...connectorSpec(),
        runtime: {
          ...connectorSpec().runtime,
          method: 'POST',
          externalWrite: true
        },
        permissions: {
          ...connectorSpec().permissions,
          maximumRisk: 'high'
        }
      }
    })

    await expect(
      fixture.service.confirmInstall({
        sessionId: proposal.id,
        proposalId: proposal.proposal!.id,
        revision: proposal.revision,
        packageDigest: proposal.proposal!.packageDigest,
        scope: proposal.proposal!.scope,
        enable: true
      })
    ).rejects.toThrow(
      'High-risk Capability cannot be enabled during installation'
    )
    expect(fixture.installer.install).not.toHaveBeenCalled()
  })

  it('returns the original installation for an identical confirmation replay', async () => {
    const fixture = createFixture()
    const proposal = await fixture.service.createDraft({
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue lookup connector.',
      spec: connectorSpec()
    })
    const command = {
      sessionId: proposal.id,
      proposalId: proposal.proposal!.id,
      revision: proposal.revision,
      packageDigest: proposal.proposal!.packageDigest,
      scope: proposal.proposal!.scope,
      enable: false
    }

    const first = await fixture.service.confirmInstall(command)
    const replay = await fixture.service.confirmInstall(command)

    expect(replay).toEqual(first)
    expect(fixture.installer.install).toHaveBeenCalledOnce()
  })

  it('cancels without installing and removes the draft workspace', async () => {
    const fixture = createFixture()
    const proposal = await fixture.service.createDraft({
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue lookup connector.',
      spec: connectorSpec()
    })

    const cancelled = await fixture.service.cancel({
      sessionId: proposal.id,
      expectedRevision: proposal.revision
    })

    expect(cancelled.status).toBe('cancelled')
    expect(fixture.workspace.remove).toHaveBeenCalledWith(proposal.id)
    expect(fixture.installer.install).not.toHaveBeenCalled()
  })
})

function createFixture(options: {
  prepare?: ReturnType<typeof vi.fn>
} = {}) {
  const repository = new MemoryGenerationRepository()
  const pending = {
    path: '/managed/staging',
    directoryName: 'staging',
    commit: vi.fn().mockResolvedValue({
      path: '/managed/package',
      directoryName: 'package'
    }),
    rollback: vi.fn()
  }
  const prepare =
    options.prepare ?? vi.fn().mockImplementation(async () => preparedPackage({
      pending
    }))
  const workspace = {
    publish: vi.fn().mockResolvedValue('/managed/draft'),
    resolve: vi.fn().mockReturnValue('/managed/draft'),
    remove: vi.fn()
  }
  const compiler = {
    compile: vi.fn().mockReturnValue({
      specDigest: createCapabilitySpec(connectorSpec()).specDigest,
      files: {
        'README.md': '# Issue lookup\n',
        'capability.yaml': 'schemaVersion: 1\n'
      }
    })
  }
  const installer = {
    install: vi.fn().mockImplementation(async (input: {
      onCatalogTransaction?: (
        result: ReturnType<typeof installedResult>
      ) => void
    }) => {
      const result = installedResult()
      input.onCatalogTransaction?.(result)
      return result
    })
  }
  const service = new CapabilityBuilderService({
    sessions: repository,
    workspace,
    compiler,
    packages: { prepare },
    installer,
    createId: (() => {
      let id = 0
      return () => `generated-${++id}`
    })(),
    now: (() => {
      let now = 100
      return () => now++
    })()
  })
  return {
    service,
    repository,
    workspace,
    installer,
    pending
  }
}

class MemoryGenerationRepository
  implements CapabilityBuilderSessionRepository
{
  current?: CapabilityGenerationSession

  async create(session: CapabilityGenerationSession): Promise<void> {
    this.current = structuredClone(session)
  }

  async get(): Promise<CapabilityGenerationSession | undefined> {
    return this.current ? structuredClone(this.current) : undefined
  }

  async save(
    session: CapabilityGenerationSession,
    expectedRevision: number
  ): Promise<void> {
    if (this.current?.revision !== expectedRevision) {
      throw new Error('Capability generation revision conflict')
    }
    this.current = structuredClone(session)
  }

  saveInTransaction(
    session: CapabilityGenerationSession,
    expectedRevision: number
  ): void {
    if (this.current?.revision !== expectedRevision) {
      throw new Error('Capability generation revision conflict')
    }
    this.current = structuredClone(session)
  }
}

function preparedPackage(
  overrides: Partial<PreparedCapabilityPackage> = {}
): PreparedCapabilityPackage {
  const definition = generatedDefinition()
  return {
    definition,
    packageDigest: 'c'.repeat(64),
    validationReport: {
      compatible: true,
      dependencyStatus: 'resolved',
      tests: [{ id: 'contract', status: 'passed' }]
    },
    source: { type: 'directory', displayName: '1' },
    byteSize: 128,
    fileCount: 2,
    managedRelativePath: `capabilities/packages/${'c'.repeat(64)}`,
    pending: {
      path: '/managed/staging',
      directoryName: 'staging',
      commit: vi.fn().mockResolvedValue({
        path: '/managed/package',
        directoryName: 'package'
      }),
      rollback: vi.fn()
    },
    ...overrides
  }
}

function installedResult() {
  const definition = generatedDefinition()
  return {
    definition,
    installation: createCapabilityInstallation({
      id: 'installation-1',
      capabilityId: definition.id,
      capabilityVersion: definition.version,
      capabilityDigest: definition.definitionDigest,
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      enabled: false,
      permissionCeiling: definition.permissions,
      status: 'installed_disabled',
      revision: 1,
      installedAt: 200,
      updatedAt: 200
    })
  }
}

function generatedDefinition() {
  return createCapabilityDefinition({
    id: 'com.example.issue-lookup',
    kind: 'connector',
    version: '1.0.0',
    source: 'generated',
    manifestDigest: 'a'.repeat(64),
    name: 'Issue lookup',
    description: 'Reads issue details.',
    runtime: {
      kind: 'connector',
      connectorKind: 'http',
      credentialRefs: ['issue-api-key'],
      configurationSchema: { type: 'object' },
      actions: [
        {
          id: 'invoke',
          name: 'Issue lookup',
          description: 'Reads issue details.',
          operation: 'read',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          risk: 'medium',
          effects: ['external.read'],
          timeoutMs: 30_000,
          maxOutputBytes: 1_024,
          protocol: {
            kind: 'http',
            baseUrl: 'https://api.example.com',
            method: 'GET',
            pathTemplate: '/issues/{issueId}',
            authentication: {
              type: 'bearer',
              credentialRef: 'issue-api-key'
            },
            allowedRedirectOrigins: []
          }
        }
      ]
    },
    permissions: connectorSpec().permissions,
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0',
      platforms: ['darwin']
    },
    testPlan: [{ id: 'contract', command: 'fixture:contract' }],
    publishedAt: 100
  })
}

function connectorSpec() {
  return {
    schemaVersion: 1 as const,
    id: 'com.example.issue-lookup',
    kind: 'connector' as const,
    version: '1.0.0',
    name: 'Issue lookup',
    description: 'Reads issue details.',
    scope: { kind: 'workspace' as const, workspaceId: 'workspace-1' },
    runtime: {
      kind: 'connector' as const,
      connectorKind: 'http' as const,
      baseUrl: 'https://api.example.com',
      method: 'GET' as const,
      path: '/issues/{issueId}',
      credentialRefs: ['issue-api-key'],
      externalWrite: false
    },
    permissions: {
      capabilities: ['network.connect' as const, 'credential.use' as const],
      maximumRisk: 'medium' as const,
      pathPrefixes: [],
      networkTargets: ['api.example.com']
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0',
      platforms: ['darwin' as const]
    }
  }
}
