import { describe, expect, it } from 'vitest'
import {
  createPermissionGrant,
  grantCoversRequest,
  normalizePermissionRequest,
  permissionResourceKey,
  selectCoveringGrant,
  type PermissionGrant,
  type PermissionRequest
} from './capability-permission'

const requirementRequest: PermissionRequest = {
  capability: 'filesystem.write',
  resource: {
    kind: 'requirement',
    requirementId: 'requirement-1'
  },
  context: {
    sessionId: 'session-1',
    requirementId: 'requirement-1',
    workspaceId: 'workspace-1'
  },
  risk: 'medium'
}

describe('Tool permission requests', () => {
  it('normalizes bounded resources and risk', () => {
    expect(
      normalizePermissionRequest({
        capability: 'filesystem.read',
        resource: {
          kind: 'path',
          canonicalPath: ' /tmp/realmflow/spec.md ',
          access: 'file'
        },
        context: {
          sessionId: ' session-1 ',
          requirementId: ' requirement-1 ',
          workspaceId: ' workspace-1 '
        },
        risk: 'low'
      })
    ).toEqual({
      capability: 'filesystem.read',
      resource: {
        kind: 'path',
        canonicalPath: '/tmp/realmflow/spec.md',
        access: 'file'
      },
      context: {
        sessionId: 'session-1',
        requirementId: 'requirement-1',
        workspaceId: 'workspace-1'
      },
      risk: 'low'
    })

    expect(
      normalizePermissionRequest({
        capability: 'process.execute',
        resource: {
          kind: 'process',
          executableDigest: 'a'.repeat(64),
          executableDisplayName: ' git ',
          argsFingerprint: 'b'.repeat(64),
          workingDirectoryScope: {
            kind: 'workspace',
            workspaceId: ' workspace-1 '
          }
        },
        context: { workspaceId: 'workspace-1' },
        risk: 'high'
      }).resource
    ).toEqual({
      kind: 'process',
      executableDigest: 'a'.repeat(64),
      executableDisplayName: 'git',
      argsFingerprint: 'b'.repeat(64),
      workingDirectoryScope: {
        kind: 'workspace',
        workspaceId: 'workspace-1'
      }
    })

    expect(
      normalizePermissionRequest({
        capability: 'network.connect',
        resource: {
          kind: 'network',
          service: ' api.example.com ',
          connectorId: ' connector-1 '
        },
        context: {},
        risk: 'high'
      }).resource
    ).toEqual({
      kind: 'network',
      service: 'api.example.com',
      connectorId: 'connector-1'
    })
  })

  it.each([
    {
      name: 'unknown capability',
      input: { ...requirementRequest, capability: 'terminal.execute' }
    },
    {
      name: 'unknown risk',
      input: { ...requirementRequest, risk: 'safe' }
    },
    {
      name: 'relative path',
      input: {
        ...requirementRequest,
        resource: {
          kind: 'path',
          canonicalPath: 'notes/spec.md',
          access: 'file'
        }
      }
    },
    {
      name: 'invalid process digest',
      input: {
        capability: 'process.execute',
        resource: {
          kind: 'process',
          executableDigest: 'bad',
          executableDisplayName: 'git',
          argsFingerprint: 'b'.repeat(64),
          workingDirectoryScope: {
            kind: 'workspace',
            workspaceId: 'workspace-1'
          }
        },
        context: { workspaceId: 'workspace-1' },
        risk: 'high'
      }
    },
    {
      name: 'mismatched requirement context',
      input: {
        ...requirementRequest,
        resource: {
          kind: 'requirement',
          requirementId: 'requirement-2'
        }
      }
    },
    {
      name: 'unknown resource field',
      input: {
        ...requirementRequest,
        resource: {
          kind: 'requirement',
          requirementId: 'requirement-1',
          secret: 'hidden'
        }
      }
    }
  ])('rejects $name', ({ input }) => {
    expect(() => normalizePermissionRequest(input)).toThrow(/Permission/)
  })

  it.each([
    {
      capability: 'process.execute',
      resource: {
        kind: 'workspace',
        workspaceId: 'workspace-1'
      }
    },
    {
      capability: 'repository.modify',
      resource: {
        kind: 'clipboard'
      }
    },
    {
      capability: 'computer.control',
      resource: {
        kind: 'network',
        service: 'example.com'
      }
    }
  ])(
    'rejects incompatible $capability and $resource.kind',
    ({ capability, resource }) => {
      expect(() =>
        normalizePermissionRequest({
          capability,
          resource,
          context: { workspaceId: 'workspace-1' },
          risk: 'high'
        })
      ).toThrow('Permission capability does not support this resource')
    }
  )

  it('produces stable resource keys without secret values', () => {
    const process = normalizePermissionRequest({
      capability: 'process.execute',
      resource: {
        kind: 'process',
        executableDigest: 'a'.repeat(64),
        executableDisplayName: 'git',
        argsFingerprint: 'b'.repeat(64),
        workingDirectoryScope: {
          kind: 'workspace',
          workspaceId: 'workspace-1'
        }
      },
      context: { workspaceId: 'workspace-1' },
      risk: 'high'
    })

    expect(permissionResourceKey(process.resource)).toBe(
      `process:workspace:workspace-1:${'a'.repeat(64)}:${'b'.repeat(64)}`
    )
    expect(permissionResourceKey({ kind: 'clipboard' })).toBe('clipboard')
  })
})

describe('Tool permission grants', () => {
  it.each([
    { mode: 'session' as const },
    { mode: 'requirement' as const },
    { mode: 'space' as const },
    { mode: 'persistent' as const }
  ])('creates a bounded $mode grant', ({ mode }) => {
    const grant = createPermissionGrant({
      id: `grant-${mode}`,
      request: requirementRequest,
      mode,
      appSessionId: 'app-session-1',
      at: 100
    })

    expect(grant).toMatchObject({
      id: `grant-${mode}`,
      capability: 'filesystem.write',
      resource: requirementRequest.resource,
      risk: 'medium',
      mode,
      status: 'active',
      revision: 1,
      createdAt: 100,
      updatedAt: 100
    })
  })

  it('rejects persistent grants for critical risk', () => {
    expect(() =>
      createPermissionGrant({
        id: 'grant-critical',
        request: { ...requirementRequest, risk: 'critical' },
        mode: 'persistent',
        appSessionId: 'app-session-1',
        at: 100
      })
    ).toThrow('Permission critical risk cannot be persistent')
  })

  it('matches capability, resource, context, and risk ceiling', () => {
    const requirementGrant = grant({
      id: 'requirement-grant',
      request: requirementRequest,
      mode: 'requirement'
    })
    const sameRequirementPath: PermissionRequest = {
      capability: 'filesystem.write',
      resource: {
        kind: 'path',
        canonicalPath: '/tmp/realmflow/spec.md',
        access: 'file'
      },
      context: requirementRequest.context,
      risk: 'medium'
    }

    expect(
      grantCoversRequest(
        requirementGrant,
        sameRequirementPath,
        'app-session-1'
      )
    ).toBe(true)
    expect(
      grantCoversRequest(
        requirementGrant,
        { ...sameRequirementPath, risk: 'high' },
        'app-session-1'
      )
    ).toBe(false)
    expect(
      grantCoversRequest(
        requirementGrant,
        { ...sameRequirementPath, capability: 'filesystem.read' },
        'app-session-1'
      )
    ).toBe(false)
  })

  it('requires exact path and process fingerprints', () => {
    const pathGrant = grant({
      id: 'path-grant',
      request: {
        capability: 'filesystem.read',
        resource: {
          kind: 'path',
          canonicalPath: '/tmp/realmflow/spec.md',
          access: 'file'
        },
        context: {},
        risk: 'low'
      },
      mode: 'persistent'
    })

    expect(
      grantCoversRequest(
        pathGrant,
        {
          capability: 'filesystem.read',
          resource: {
            kind: 'path',
            canonicalPath: '/tmp/realmflow/other.md',
            access: 'file'
          },
          context: {},
          risk: 'low'
        },
        'app-session-1'
      )
    ).toBe(false)
  })

  it('selects the narrowest, shortest, and lowest-risk grant', () => {
    const request: PermissionRequest = {
      capability: 'filesystem.read',
      resource: {
        kind: 'path',
        canonicalPath: '/tmp/realmflow/spec.md',
        access: 'file'
      },
      context: {
        sessionId: 'session-1',
        requirementId: 'requirement-1',
        workspaceId: 'workspace-1'
      },
      risk: 'low'
    }
    const grants = [
      grant({
        id: 'workspace-persistent',
        request: {
          ...request,
          resource: { kind: 'workspace', workspaceId: 'workspace-1' },
          risk: 'high'
        },
        mode: 'persistent',
        at: 10
      }),
      grant({
        id: 'path-session-medium',
        request: { ...request, risk: 'medium' },
        mode: 'session',
        at: 20
      }),
      grant({
        id: 'path-session-low',
        request,
        mode: 'session',
        at: 30
      })
    ]

    expect(
      selectCoveringGrant(request, grants, 'app-session-1')?.id
    ).toBe('path-session-low')
  })
})

function grant(input: {
  id: string
  request: PermissionRequest
  mode: PermissionGrant['mode']
  at?: number
}): PermissionGrant {
  return createPermissionGrant({
    ...input,
    appSessionId: 'app-session-1',
    at: input.at ?? 100
  })
}
