import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { APPROVAL_PROFILES, createApprovalProfileSnapshot } from './approval-profile'
import { authorizeToolEffects, type ToolEffect } from './tool-authorization'
import type { BoundScopeAuthorization } from './capability-permission'

const scope: BoundScopeAuthorization = {
  authorizationId: 'scope', source: { kind: 'space', workspaceId: 'space' },
  roots: [{ canonicalPath: '/workspace', access: 'read-write' }],
  bindingRevision: 1, status: 'active', createdAt: 1,
}

function decide(profile: 'cautious' | 'protected' | 'trusted', effects: ToolEffect[]) {
  return authorizeToolEffects({
    effects, risk: 'low', context: { sessionId: 'chat', workspaceId: 'space' },
    appSessionId: 'app', boundScopes: [scope], explicitGrants: [],
    approvalProfile: profile,
  } as Parameters<typeof authorizeToolEffects>[0])
}

describe('approval profiles', () => {
  it.each(APPROVAL_PROFILES)('%s has the exact SHA-256 digest of its versioned policy', id => {
    const { digest, ...payload } = createApprovalProfileSnapshot(id)
    expect(digest).toBe(createHash('sha256').update(JSON.stringify(payload)).digest('hex'))
  })
  it.each(['cautious', 'protected', 'trusted'] as const)(
    '%s reads public network data directly', profile => {
      expect(decide(profile, [{
        kind: 'network.public_read', origin: 'https://example.com',
        localDataEgress: false,
      } as ToolEffect])).toMatchObject({ outcome: 'authorized' })
    },
  )

  it.each([
    ['cautious', 'ask'], ['protected', 'authorized'], ['trusted', 'authorized'],
  ] as const)('%s handles an isolated browser creation as %s', (profile, outcome) => {
    expect(decide(profile, [{
      kind: 'browser.session.create', profile: 'isolated',
    } as ToolEffect])).toMatchObject({ outcome })
  })

  it.each(['cautious', 'protected', 'trusted'] as const)(
    '%s requires one-time approval for permanent deletion', profile => {
      expect(decide(profile, [{
        kind: 'filesystem.delete', path: '/workspace/old.txt', permanent: true,
      }])).toMatchObject({ outcome: 'ask', effectiveRisk: 'L4', maxGrant: 'once' })
    },
  )

  it.each([
    ['protected', 'safe', 'authorized'],
    ['protected', 'unknown', 'ask'],
    ['trusted', 'unknown', 'authorized'],
    ['trusted', 'dangerous', 'ask'],
  ] as const)('%s handles sandboxed %s commands as %s', (profile, commandClass, outcome) => {
    expect(decide(profile, [{
      kind: 'process.execute', executableDigest: 'a'.repeat(64),
      executableDisplayName: 'node', argsFingerprint: 'b'.repeat(64),
      workingDirectory: '/workspace', execution: 'sandboxed', commandClass,
    } as ToolEffect])).toMatchObject({ outcome })
  })

  it('does not treat a host command as a safe sandbox command', () => {
    expect(decide('trusted', [{
      kind: 'process.execute', executableDigest: 'a'.repeat(64),
      executableDisplayName: 'node', argsFingerprint: 'b'.repeat(64),
      workingDirectory: '/workspace', execution: 'host', commandClass: 'safe',
    } as ToolEffect])).toMatchObject({ outcome: 'ask', effectiveRisk: 'L3' })
  })

  it('automatically authorizes local Git writes in protected mode', () => {
    expect(decide('protected', [{ kind: 'repository.local_write', repositoryRoot: '/workspace' }]))
      .toMatchObject({ outcome: 'authorized' })
  })

  it('asks before an in-scope write in cautious mode', () => {
    expect(decide('cautious', [{ kind: 'filesystem.write', path: '/workspace/report.md' }]))
      .toMatchObject({ outcome: 'ask', reason: 'write' })
  })

  it.each(['cautious', 'protected', 'trusted'] as const)(
    '%s reads an authorized file without asking', profile => {
      expect(decide(profile, [{ kind: 'filesystem.read', path: '/workspace/report.md' }]))
        .toMatchObject({ outcome: 'authorized' })
    },
  )

  it('does not approve an unclassified process merely because cwd is authorized', () => {
    expect(decide('protected', [{
      kind: 'process.execute', executableDigest: 'a'.repeat(64),
      executableDisplayName: 'sh', argsFingerprint: 'b'.repeat(64),
      workingDirectory: '/workspace',
    }])).toMatchObject({ outcome: 'ask', reason: 'process' })
  })

  it.each(['cautious', 'protected', 'trusted'] as const)(
    '%s asks before accessing a file outside the scope', profile => {
      expect(decide(profile, [{ kind: 'filesystem.write', path: '/outside/report.md' }]))
        .toMatchObject({ outcome: 'ask', reason: 'out_of_scope' })
    },
  )
})
