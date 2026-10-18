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
  it('records the effective risk even when a public read is automatically allowed', () => {
    expect(authorizeToolEffects({
      effects: [{ kind: 'network.public_read', resourceKey: 'https://example.com' }] as ToolEffect[],
      risk: 'low', context: { sessionId: 'chat-1' }, appSessionId: 'app-1',
      boundScopes: [], explicitGrants: [], approvalProfile: 'protected'
    })).toMatchObject({ outcome: 'authorized', effectiveRisk: 'L0' })
  })

  it.each(['cautious', 'protected', 'trusted'] as const)('allows public browser reads in %s and gates publication once', (approvalProfile) => {
    const common = { risk: 'high' as const, context: { sessionId: 'conversation-1', workspaceId: 'workspace-1' },
      appSessionId: 'app-session-1', boundScopes: [activeScope], explicitGrants: [], approvalProfile }
    expect(authorizeToolEffects({ ...common, effects: [{
      kind: 'browser.page.read', sessionId: 'browser-one', origin: 'https://example.com', privateSession: false,
      targetDigest: 'a'.repeat(64)
    }] as unknown as ToolEffect[] })).toMatchObject({ outcome: 'authorized' })
    expect(authorizeToolEffects({ ...common, effects: [{
      kind: 'browser.page.control', sessionId: 'browser-one', origin: 'https://example.com',
      semantic: 'publish', targetDigest: 'b'.repeat(64)
    }] as unknown as ToolEffect[] })).toMatchObject({ outcome: 'ask', effectiveRisk: 'L4', maxGrant: 'once' })
  })

  it('authorizes ordinary writes inside an active bound root regardless of static risk', () => {
    expect(
      decide(
        [{ kind: 'filesystem.write', path: '/workspace/output/report.pdf' }],
        { risk: 'medium' }
      )
    ).toEqual({
      outcome: 'authorized',
      source: 'bound_scope',
      authorizationIds: ['scope-1'],
      effectiveRisk: 'L1'
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

  it('authorizes classified safe sandbox execution inside an active bound root', () => {
    expect(
      decide([
        {
          kind: 'process.execute',
          executableDigest: 'a'.repeat(64),
          executableDisplayName: 'node',
          argsFingerprint: 'b'.repeat(64),
          workingDirectory: '/workspace',
          execution: 'sandboxed',
          commandClass: 'safe',
        }
      ])
    ).toEqual({
      outcome: 'authorized',
      source: 'bound_scope',
      authorizationIds: ['scope-1'],
      effectiveRisk: 'L1'
    })
  })

  it('requests folder-scoped process approval for local folder conversations', () => {
    expect(
      authorizeToolEffects({
        effects: [
          {
            kind: 'process.execute',
            executableDigest: 'a'.repeat(64),
            executableDisplayName: 'python3',
            argsFingerprint: 'b'.repeat(64),
            workingDirectory: '/workspace'
          }
        ],
        risk: 'high',
        context: {
          sessionId: 'conversation-folder',
          folderSessionId: 'conversation-folder'
        },
        appSessionId: 'conversation-folder',
        boundScopes: [
          {
            ...activeScope,
            source: {
              kind: 'folder',
              folderSessionId: 'conversation-folder'
            }
          }
        ],
        explicitGrants: [],
        approvalProfile: 'protected'
      })
    ).toMatchObject({
      outcome: 'ask',
      reason: 'process',
      requests: [
        {
          capability: 'process.execute',
          resource: {
            kind: 'process',
            workingDirectoryScope: {
              kind: 'folder',
              folderSessionId: 'conversation-folder'
            }
          },
          context: {
            sessionId: 'conversation-folder',
            folderSessionId: 'conversation-folder'
          }
        }
      ]
    })
  })

  it('authorizes owner-scoped managed process inspection without a bound file root', () => {
    expect(
      authorizeToolEffects({
        effects: [
          {
            kind: 'process.inspect',
            owner: { type: 'conversation', id: 'conversation-1' }
          }
        ] as unknown as ToolEffect[],
        risk: 'low',
        context: { sessionId: 'conversation-1' },
        appSessionId: 'app-session-1',
        boundScopes: [],
        explicitGrants: [],
        approvalProfile: 'protected'
      })
    ).toEqual({
      outcome: 'authorized',
      source: 'bound_scope',
      effectiveRisk: 'L0',
      authorizationIds: []
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

  it('does not reuse an explicit grant for deletion', () => {
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
    ).toMatchObject({
      outcome: 'ask',
      reason: 'delete',
      maxGrant: 'once',
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
