import {
  CAPABILITY_KINDS,
  assertCapabilityDependencyGraph,
  assertCapabilityVersionImmutable,
  createCapabilityDefinition,
  createCapabilityInstallation,
  resolveInstalledCapabilities,
  transitionCapabilityLifecycle,
  type CapabilityDefinition,
  type CapabilityInstallation
} from './capability'

const digest = (value: string): string => value.repeat(64).slice(0, 64)

function definition(
  input: Partial<Parameters<typeof createCapabilityDefinition>[0]> = {}
): CapabilityDefinition {
  return createCapabilityDefinition({
    id: 'com.example.files.read',
    kind: 'tool',
    version: '1.0.0',
    source: 'local_upload',
    manifestDigest: digest('a'),
    name: 'Read files',
    description: 'Read files inside the granted scope.',
    runtime: {
      kind: 'tool',
      definitionId: 'files.read'
    },
    permissions: {
      capabilities: ['filesystem.read'],
      maximumRisk: 'low',
      pathPrefixes: ['/work'],
      networkTargets: []
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0 <1.0.0',
      platforms: ['darwin']
    },
    testPlan: [{ id: 'reads-file', command: 'fixture:reads-file' }],
    publishedAt: 100,
    ...input
  })
}

function installation(
  input: Partial<Parameters<typeof createCapabilityInstallation>[0]> = {}
): CapabilityInstallation {
  const capability = definition()
  return createCapabilityInstallation({
    id: 'installation-global',
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

describe('Unified Capability', () => {
  it('supports exactly four semantic kinds and Connector transport subtypes', () => {
    expect(CAPABILITY_KINDS).toEqual([
      'tool',
      'skill',
      'agent',
      'connector'
    ])
    expect(() =>
      definition({
        kind: 'connector',
        runtime: {
          kind: 'connector',
          connectorKind: 'database',
          credentialRefs: ['database-primary'],
          configurationSchema: { type: 'object' },
          actions: []
        }
      })
    ).not.toThrow()
    expect(() =>
      definition({ kind: 'trigger' as never })
    ).toThrow('Capability kind is invalid')
  })

  it('publishes immutable versions and rejects inline credentials', () => {
    const published = definition()

    expect(published.definitionDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(published)).toBe(true)
    expect(() =>
      definition({
        runtime: {
          kind: 'connector',
          connectorKind: 'http',
          credentialRefs: [],
          actions: [],
          configurationSchema: {
            type: 'object',
            properties: {
              apiKey: { type: 'string', default: 'secret-value' }
            }
          }
        },
        kind: 'connector'
      })
    ).toThrow('Capability package cannot contain inline credentials')
    expect(() =>
      assertCapabilityVersionImmutable(
        published,
        definition({
        id: published.id,
        version: published.version,
        manifestDigest: digest('b')
        })
      )
    ).toThrow('Capability immutable version digest conflicts')
  })

  it('rejects cyclic dependencies across capability kinds', () => {
    const tool = definition({
      id: 'capability.tool',
      dependencies: [
        {
          kind: 'skill',
          capabilityId: 'capability.skill',
          versionRange: '^1.0.0',
          required: true
        }
      ]
    })
    const skill = definition({
      id: 'capability.skill',
      kind: 'skill',
      runtime: {
        kind: 'skill',
        instructionsPath: 'instructions/SKILL.md',
        executable: false
      },
      dependencies: [
        {
          kind: 'tool',
          capabilityId: 'capability.tool',
          versionRange: '^1.0.0',
          required: true
        }
      ]
    })

    expect(() =>
      assertCapabilityDependencyGraph([tool, skill])
    ).toThrow('Capability dependency graph contains a cycle')
  })

  it('allows a child scope to disable or narrow an inherited installation', () => {
    const inherited = installation()
    const narrowed = createCapabilityInstallation({
      ...inherited,
      id: 'installation-workspace',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      permissionCeiling: {
        ...inherited.permissionCeiling,
        pathPrefixes: ['/work/project']
      },
      revision: 1,
      installedAt: 200,
      updatedAt: 200
    }, inherited)
    const disabled = createCapabilityInstallation({
      ...narrowed,
      id: 'installation-requirement',
      scope: {
        kind: 'requirement',
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1'
      },
      enabled: false,
      status: 'installed_disabled',
      revision: 1,
      installedAt: 300,
      updatedAt: 300
    }, narrowed)

    expect(narrowed.permissionCeiling.pathPrefixes).toEqual([
      '/work/project'
    ])
    expect(disabled.enabled).toBe(false)
    expect(() =>
      createCapabilityInstallation({
        ...narrowed,
        id: 'installation-expanded',
        permissionCeiling: {
          ...narrowed.permissionCeiling,
          capabilities: ['filesystem.read', 'filesystem.write'],
          pathPrefixes: ['/'],
          networkTargets: ['api.example.com']
        }
      }, inherited)
    ).toThrow('Capability installation cannot expand parent permissions')
  })

  it('discovers only installations in the active scope chain', () => {
    const capability = definition()
    const global = installation()
    const workspaceOne = installation({
      id: 'installation-workspace-1',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      enabled: false,
      status: 'installed_disabled',
      installedAt: 200,
      updatedAt: 200
    })
    const workspaceTwo = installation({
      id: 'installation-workspace-2',
      scope: { kind: 'workspace', workspaceId: 'workspace-2' },
      installedAt: 300,
      updatedAt: 300
    })

    expect(
      resolveInstalledCapabilities({
        definitions: [capability],
        installations: [global, workspaceOne, workspaceTwo],
        scopeChain: [
          { kind: 'global' },
          { kind: 'workspace', workspaceId: 'workspace-1' }
        ]
      })
    ).toEqual([])
    expect(
      resolveInstalledCapabilities({
        definitions: [capability],
        installations: [workspaceTwo],
        scopeChain: [
          { kind: 'global' },
          { kind: 'workspace', workspaceId: 'workspace-1' }
        ]
      })
    ).toEqual([])
  })

  it('enforces the capability lifecycle without reopening terminal states', () => {
    expect(transitionCapabilityLifecycle('draft', 'validating')).toBe(
      'validating'
    )
    expect(
      transitionCapabilityLifecycle('awaiting_approval', 'installed_disabled')
    ).toBe('installed_disabled')
    expect(transitionCapabilityLifecycle('installed_disabled', 'enabled')).toBe(
      'enabled'
    )
    expect(() =>
      transitionCapabilityLifecycle('superseded', 'enabled')
    ).toThrow('Invalid Capability lifecycle transition')
  })
})
