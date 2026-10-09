import { describe, expect, it, vi } from 'vitest'
import {
  createCapabilityDefinition,
  createCapabilityInstallation,
  type CapabilityDefinition,
  type CapabilityInstallation
} from '../../../../domain/capability'
import { CapabilityLifecycleService } from './capability-lifecycle-service'

describe('CapabilityLifecycleService', () => {
  it('enables and disables an installation with optimistic revision', async () => {
    const current = installation(definition('1.0.0'), {
      enabled: false,
      status: 'installed_disabled'
    })
    const save = vi.fn(async () => undefined)
    const service = createService({
      installations: [current],
      definitions: [definition('1.0.0')],
      save
    })

    const enabled = await service.setEnabled({
      installationId: current.id,
      enabled: true,
      expectedRevision: 1
    })

    expect(enabled).toEqual(
      expect.objectContaining({
        enabled: true,
        status: 'enabled',
        revision: 2,
        updatedAt: 200
      })
    )
    expect(save).toHaveBeenCalledWith(enabled, 1, 'capability.enabled')
  })

  it('upgrades to another immutable version of the same capability', async () => {
    const currentDefinition = definition('1.0.0')
    const targetDefinition = definition('2.0.0')
    const current = installation(currentDefinition)
    const save = vi.fn(async () => undefined)
    const service = createService({
      installations: [current],
      definitions: [currentDefinition, targetDefinition],
      save
    })

    const upgraded = await service.changeVersion({
      installationId: current.id,
      targetVersion: '2.0.0',
      expectedRevision: 1,
      operation: 'upgrade'
    })

    expect(upgraded).toEqual(
      expect.objectContaining({
        capabilityVersion: '2.0.0',
        capabilityDigest: targetDefinition.definitionDigest,
        revision: 2
      })
    )
    expect(save).toHaveBeenCalledWith(
      upgraded,
      1,
      'capability.upgraded'
    )
  })

  it('records rollback separately and rejects a missing target version', async () => {
    const currentDefinition = definition('2.0.0')
    const targetDefinition = definition('1.0.0')
    const current = installation(currentDefinition)
    const save = vi.fn(async () => undefined)
    const service = createService({
      installations: [current],
      definitions: [currentDefinition, targetDefinition],
      save
    })

    const rolledBack = await service.changeVersion({
      installationId: current.id,
      targetVersion: '1.0.0',
      expectedRevision: 1,
      operation: 'rollback'
    })

    expect(save).toHaveBeenCalledWith(
      rolledBack,
      1,
      'capability.rolled_back'
    )
    await expect(
      service.changeVersion({
        installationId: current.id,
        targetVersion: '3.0.0',
        expectedRevision: 1,
        operation: 'upgrade'
      })
    ).rejects.toThrow('Capability target version is unavailable')
  })

  it('returns reference details without deleting an in-use installation', async () => {
    const currentDefinition = definition('1.0.0')
    const current = installation(currentDefinition)
    const deleteInstallation = vi.fn().mockResolvedValue({
      status: 'referenced',
      references: [{ ownerKind: 'workflow', ownerId: 'workflow-1' }]
    })
    const service = createService({
      installations: [current],
      definitions: [currentDefinition],
      save: vi.fn(),
      deleteInstallation
    })

    await expect(
      service.delete({
        installationId: current.id,
        expectedRevision: 1
      })
    ).resolves.toEqual({
      status: 'referenced',
      references: [{ ownerKind: 'workflow', ownerId: 'workflow-1' }]
    })
    expect(deleteInstallation).toHaveBeenCalledWith(current.id, 1)
  })
})

function createService(input: {
  installations: CapabilityInstallation[]
  definitions: CapabilityDefinition[]
  save: (
    value: CapabilityInstallation,
    expectedRevision: number,
    eventType: string
  ) => Promise<void>
  deleteInstallation?: (
    installationId: string,
    expectedRevision: number
  ) => Promise<
    | { status: 'deleted'; packageDigest?: string }
    | {
        status: 'referenced'
        references: Array<{
          ownerKind:
            | 'profile'
            | 'conversation'
            | 'workflow'
            | 'schedule'
            | 'run'
          ownerId: string
        }>
      }
  >
}) {
  return new CapabilityLifecycleService({
    catalog: {
      getInstallation: async (id) =>
        input.installations.find((item) => item.id === id),
      getDefinition: async (id, version) =>
        input.definitions.find(
          (item) => item.id === id && item.version === version
        ),
      saveInstallation: input.save
      ,
      deleteInstallation:
        input.deleteInstallation ??
        (async () => ({ status: 'deleted' as const }))
    },
    now: () => 200
  })
}

function definition(version: string) {
  return createCapabilityDefinition({
    id: 'com.example.files',
    kind: 'tool',
    version,
    source: 'local_upload',
    manifestDigest: version === '1.0.0' ? 'a'.repeat(64) : 'b'.repeat(64),
    name: 'Files',
    description: 'Read files.',
    runtime: { kind: 'tool', definitionId: 'files.read' },
    permissions: {
      capabilities: ['filesystem.read'],
      maximumRisk: 'low',
      pathPrefixes: ['/workspace'],
      networkTargets: []
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0 <1.0.0',
      platforms: ['darwin']
    },
    testPlan: [],
    publishedAt: 100
  })
}

function installation(
  capability: ReturnType<typeof definition>,
  input: Partial<CapabilityInstallation> = {}
) {
  return createCapabilityInstallation({
    id: 'installation-1',
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    capabilityDigest: capability.definitionDigest,
    scope: { kind: 'global' },
    enabled: true,
    permissionCeiling: capability.permissions,
    status: 'enabled',
    revision: 1,
    installedAt: 100,
    updatedAt: 100,
    ...input
  })
}
