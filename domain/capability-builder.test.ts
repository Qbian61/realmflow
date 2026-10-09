import { describe, expect, it } from 'vitest'
import { createCapabilityDefinition } from './capability'
import {
  assertCapabilityApproval,
  createCapabilityGenerationSession,
  createCapabilitySpec,
  transitionCapabilityGeneration
} from './capability-builder'

describe('Capability Builder domain', () => {
  it.each([
    ['connector', httpSpec()],
    ['skill', skillSpec()],
    ['agent', agentSpec()]
  ] as const)('creates a deterministic %s spec', (_kind, source) => {
    const first = createCapabilitySpec(source)
    const replay = createCapabilitySpec(structuredClone(source))

    expect(first).toEqual(replay)
    expect(first.specDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('rejects unsupported executable generation', () => {
    expect(() =>
      createCapabilitySpec({
        ...skillSpec(),
        runtime: {
          kind: 'skill',
          instructions: 'Run the deployment.',
          executable: true
        }
      })
    ).toThrow('Capability Builder only supports instruction Skills')

    expect(() =>
      createCapabilitySpec({
        ...httpSpec(),
        runtime: {
          ...httpSpec().runtime,
          connectorKind: 'cli'
        }
      })
    ).toThrow('Capability Builder only supports HTTP Connectors')
  })

  it('rejects inline credentials without echoing the secret', () => {
    const secret = 'top-secret-value'
    let message = ''

    try {
      createCapabilitySpec({
        ...httpSpec(),
        description: `Use apiKey="${secret}" to call the service.`
      })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toBe(
      'Capability Builder input cannot contain plaintext credentials'
    )
    expect(message).not.toContain(secret)
  })

  it('rejects schema drift and permission expansion from Builder input', () => {
    expect(() =>
      createCapabilitySpec({
        ...skillSpec(),
        schemaVersion: 2
      } as never)
    ).toThrow('Capability Builder schema version is unsupported')

    expect(() =>
      createCapabilitySpec({
        ...skillSpec(),
        permissions: {
          capabilities: ['filesystem.write'],
          maximumRisk: 'high',
          pathPrefixes: ['/Users'],
          networkTargets: ['example.com']
        }
      })
    ).toThrow('Capability Builder declarative permissions are invalid')

    expect(() =>
      createCapabilitySpec({
        ...httpSpec(),
        permissions: {
          ...httpSpec().permissions,
          networkTargets: ['other.example.com']
        }
      })
    ).toThrow('Capability Builder HTTP permissions are invalid')
  })

  it('enforces generation lifecycle terminal states', () => {
    expect(transitionCapabilityGeneration('draft', 'validating')).toBe(
      'validating'
    )
    expect(
      transitionCapabilityGeneration('validating', 'awaiting_approval')
    ).toBe('awaiting_approval')
    expect(
      transitionCapabilityGeneration('awaiting_approval', 'installed')
    ).toBe('installed')
    expect(() =>
      transitionCapabilityGeneration('installed', 'draft')
    ).toThrow(
      'Invalid Capability generation transition: installed -> draft'
    )
  })

  it('requires the approved revision, digest, and scope', () => {
    const session = createCapabilityGenerationSession({
      id: 'generation-1',
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue lookup connector',
      spec: createCapabilitySpec(httpSpec()),
      status: 'awaiting_approval',
      revision: 2,
      proposal: {
        ...proposalMetadata(),
        id: 'proposal-1',
        packageDigest: 'a'.repeat(64),
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        validatedAt: 150
      },
      createdAt: 100,
      updatedAt: 150
    })

    expect(() =>
      assertCapabilityApproval(session, {
        proposalId: 'proposal-1',
        revision: 1,
        packageDigest: 'a'.repeat(64),
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        enable: false
      })
    ).toThrow('Capability approval is stale')

    expect(() =>
      assertCapabilityApproval(session, {
        proposalId: 'proposal-1',
        revision: 2,
        packageDigest: 'c'.repeat(64),
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        enable: false
      })
    ).toThrow('Capability approval digest changed')

    expect(() =>
      assertCapabilityApproval(session, {
        proposalId: 'proposal-1',
        revision: 2,
        packageDigest: 'a'.repeat(64),
        scope: { kind: 'global' },
        enable: false
      })
    ).toThrow('Capability approval scope changed')
  })

  it('does not allow high-risk or external-write capabilities to enable by default', () => {
    const session = createCapabilityGenerationSession({
      id: 'generation-1',
      conversationId: 'conversation-1',
      requestedBy: 'local-user',
      request: 'Create an issue writer',
      spec: createCapabilitySpec({
        ...httpSpec(),
        permissions: {
          ...httpSpec().permissions,
          maximumRisk: 'high'
        },
        runtime: {
          ...httpSpec().runtime,
          method: 'POST',
          externalWrite: true
        }
      }),
      status: 'awaiting_approval',
      revision: 1,
      proposal: {
        ...proposalMetadata(),
        id: 'proposal-1',
        packageDigest: 'a'.repeat(64),
        scope: { kind: 'global' },
        validatedAt: 150
      },
      createdAt: 100,
      updatedAt: 150
    })

    expect(() =>
      assertCapabilityApproval(session, {
        proposalId: 'proposal-1',
        revision: 1,
        packageDigest: 'a'.repeat(64),
        scope: { kind: 'global' },
        enable: true
      })
    ).toThrow('High-risk Capability cannot be enabled during installation')
  })
})

function httpSpec() {
  return {
    schemaVersion: 1 as const,
    id: 'com.example.issue-lookup',
    kind: 'connector' as const,
    version: '1.0.0',
    name: 'Issue lookup',
    description: 'Reads issue details from an approved service.',
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

function skillSpec() {
  return {
    ...httpSpec(),
    id: 'com.example.review-skill',
    kind: 'skill' as const,
    name: 'Review skill',
    description: 'Reviews a change set.',
    runtime: {
      kind: 'skill' as const,
      instructions: 'Review the supplied change set and report findings.',
      executable: false as const
    },
    permissions: {
      capabilities: [],
      maximumRisk: 'low' as const,
      pathPrefixes: [],
      networkTargets: []
    }
  }
}

function agentSpec() {
  return {
    ...httpSpec(),
    id: 'com.example.review-agent',
    kind: 'agent' as const,
    name: 'Review agent',
    description: 'Coordinates a code review.',
    runtime: {
      kind: 'agent' as const,
      prompt: 'Review changes and return prioritized findings.',
      modelCapabilities: ['tool_calling'],
      reasoningModes: ['medium' as const],
      delegation: { allowed: false as const, maximumDepth: 0 }
    },
    permissions: {
      capabilities: [],
      maximumRisk: 'low' as const,
      pathPrefixes: [],
      networkTargets: []
    }
  }
}

function proposalMetadata() {
  const definition = createCapabilityDefinition({
    id: 'com.example.issue-lookup',
    kind: 'connector',
    version: '1.0.0',
    source: 'generated',
    manifestDigest: 'a'.repeat(64),
    name: 'Issue lookup',
    description: 'Reads issues.',
    runtime: {
      kind: 'connector',
      connectorKind: 'http',
      credentialRefs: [],
      configurationSchema: { type: 'object' },
      actions: []
    },
    permissions: httpSpec().permissions,
    dependencies: [],
    compatibility: httpSpec().compatibility,
    testPlan: [],
    publishedAt: 100
  })
  return {
    definitionDigest: definition.definitionDigest,
    draftRevision: 1,
    definition,
    validationReport: {
      compatible: true as const,
      dependencyStatus: 'resolved' as const,
      tests: []
    },
    fileNames: ['README.md', 'capability.yaml'],
    byteSize: 128,
    fileCount: 2
  }
}
