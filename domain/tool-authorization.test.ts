import { describe, expect, it } from 'vitest'
import type { PermissionGrant } from './capability-permission'
import {
  authorizeToolEffects,
  type BoundScopeAuthorization,
  type ToolEffect
} from './tool-authorization'

const activeScope: BoundScopeAuthorization = {
  authorizationId: 'scope-1',
  source: { kind: 'space', workspaceId: 'workspace-1' },
  roots: [{ canonicalPath: '/workspace', access: 'read-write' }],
  bindingRevision: 3,
  status: 'active',
  createdAt: 100
}

describe('authorizeToolEffects', () => {
  it('authorizes ordinary writes inside an active bound root regardless of static risk', () => {
    expect(
      decide(
        [{ kind: 'filesystem.write', path: '/workspace/output/report.pdf' }],
        { risk: 'medium' }
      )
    ).toEqual({
      outcome: 'authorized',
      source: 'bound_scope',
      authorizationIds: ['scope-1']
    })
  })

  it('requires approval for an out-of-root write even when static risk is low', () => {
    expect(
      decide(
        [{ kind: 'filesystem.write', path: '/outside/report.pdf' }],
        { risk: 'low' }
      )
    ).toMatchObject({
      outcome: 'ask',
      reason: 'out_of_scope',
      requests: [
        {
          capability: 'filesystem.write',
          resource: {
            kind: 'path',
            canonicalPath: '/outside/report.pdf',
            access: 'file'
          }
        }
      ]
    })
  })

  it('authorizes process execution inside an active bound root', () => {
    expect(
      decide([
        {
          kind: 'process.execute',
          executableDigest: 'a'.repeat(64),
          executableDisplayName: 'node',
          argsFingerprint: 'b'.repeat(64),
          workingDirectory: '/workspace'
        }
      ])
    ).toEqual({
      outcome: 'authorized',
      source: 'bound_scope',
      authorizationIds: ['scope-1']
    })
  })

  it('requires approval for delete, out-of-root process, and computer effects', () => {
    const cases: Array<{
      effect: ToolEffect
      reason: 'delete' | 'process' | 'system'
    }> = [
      {
        effect: {
          kind: 'filesystem.delete',
          path: '/workspace/old.txt',
          permanent: false
        },
        reason: 'delete'
      },
      {
        effect: {
          kind: 'process.execute',
          executableDigest: 'a'.repeat(64),
          executableDisplayName: 'pandoc',
          argsFingerprint: 'b'.repeat(64),
          workingDirectory: '/outside'
        },
        reason: 'process'
      },
      {
        effect: {
          kind: 'computer.control',
          application: {
            bundleId: 'com.example.Editor',
            displayName: 'Editor'
          }
        },
        reason: 'system'
      }
    ]

    for (const { effect, reason } of cases) {
      expect(decide([effect])).toMatchObject({
        outcome: 'ask',
        reason
      })
    }
  })

  it('uses an explicit grant for an otherwise sensitive exact resource', () => {
    const grant: PermissionGrant = {
      id: 'grant-1',
      grantKey: 'grant-key-1',
      capability: 'filesystem.delete',
      resource: {
        kind: 'path',
        canonicalPath: '/workspace/old.txt',
        access: 'file'
      },
      context: {
        sessionId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      risk: 'high',
      mode: 'session',
      appSessionId: 'app-session-1',
      status: 'active',
      revision: 1,
      createdAt: 90,
      updatedAt: 90
    }

    expect(
      decide(
        [
          {
            kind: 'filesystem.delete',
            path: '/workspace/old.txt',
            permanent: false
          }
        ],
        { grants: [grant] }
      )
    ).toEqual({
      outcome: 'authorized',
      source: 'explicit_grant',
      grantIds: ['grant-1']
    })
  })

  it('fails closed when a matching bound authorization was revoked', () => {
    expect(
      decide(
        [{ kind: 'filesystem.read', path: '/workspace/README.md' }],
        {
          boundScopes: [
            {
              ...activeScope,
              status: 'revoked',
              revokedAt: 110
            }
          ]
        }
      )
    ).toEqual({
      outcome: 'denied',
      code: 'authorization_revoked',
      message: 'The bound scope authorization was revoked'
    })
  })
})

function decide(
  effects: ToolEffect[],
  overrides: {
    risk?: 'low' | 'medium' | 'high' | 'critical'
    boundScopes?: BoundScopeAuthorization[]
    grants?: PermissionGrant[]
  } = {}
) {
  return authorizeToolEffects({
    effects,
    risk: overrides.risk ?? 'high',
    context: {
      sessionId: 'conversation-1',
      workspaceId: 'workspace-1'
    },
    appSessionId: 'app-session-1',
    boundScopes: overrides.boundScopes ?? [activeScope],
    explicitGrants: overrides.grants ?? []
  })
}
