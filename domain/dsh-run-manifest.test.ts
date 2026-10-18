import { describe, expect, it } from 'vitest'
import {
  sealDshRunManifest,
  validateDshRunManifest,
  type DshRunManifestDraft
} from './dsh-run-manifest'

describe('DshRunManifest', () => {
  it('seals a deterministic digest and deep-freezes the accepted manifest', () => {
    const manifest = sealDshRunManifest(validDraft())
    const resealed = sealDshRunManifest(validDraft())

    expect(manifest.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(resealed.digest).toBe(manifest.digest)
    expect(validateDshRunManifest(manifest)).toEqual(manifest)
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.budget)).toBe(true)
    expect(() => {
      ;(manifest.budget as { maxToolCalls: number }).maxToolCalls = 999
    }).toThrow()
  })

  it('rejects unknown schema versions and digest mutation', () => {
    const manifest = sealDshRunManifest(validDraft())

    expect(() =>
      validateDshRunManifest({
        ...manifest,
        schemaVersion: 2
      })
    ).toThrow(/schemaVersion/)
    expect(() =>
      validateDshRunManifest({
        ...manifest,
        budget: {
          ...manifest.budget,
          maxToolCalls: manifest.budget.maxToolCalls + 1
        }
      })
    ).toThrow(/digest mismatch/)
  })

  it('rejects raw secrets and keeps credentials as opaque references', () => {
    expect(() =>
      sealDshRunManifest(
        validDraft({
          model: {
            ...validModel(),
            options: {
              apiKey: 'sk-test-secret'
            }
          }
        })
      )
    ).toThrow(/secret/i)
    expect(() =>
      sealDshRunManifest(
        validDraft({
          credentialReferences: [
            {
              kind: 'credential-reference',
              ref: 'credential-openai',
              purpose: 'model',
              value: 'raw-secret'
            } as never
          ]
        })
      )
    ).toThrow(/secret/i)
  })

  it('rejects non-content-addressed executables, wildcard commands, and unbounded budgets', () => {
    const toolWithoutDigest = validTool() as Record<string, unknown>
    toolWithoutDigest.package = {
      packageId: 'realmflow.builtin.files',
      version: '1.0.0'
    }

    expect(() =>
      sealDshRunManifest(
        validDraft({
          tools: [toolWithoutDigest as never]
        })
      )
    ).toThrow(/package digest/)
    expect(() =>
      sealDshRunManifest(
        validDraft({
          productCommands: [
            {
              ...validProductCommand(),
              command: 'realmflow.*'
            }
          ]
        })
      )
    ).toThrow(/wildcard/)
    expect(() =>
      sealDshRunManifest(
        validDraft({
          budget: {
            ...validBudget(),
            maxToolCalls: Number.MAX_SAFE_INTEGER
          }
        })
      )
    ).toThrow(/budget/)
  })

  it('rejects context paths outside granted roots', () => {
    expect(() =>
      sealDshRunManifest(
        validDraft({
          context: {
            ...validContext(),
            attachments: [
              {
                attachmentId: 'attachment-1',
                kind: 'file',
                path: '/outside/brief.md',
                digest: 'f'.repeat(64)
              }
            ]
          }
        })
      )
    ).toThrow(/outside granted roots/)
  })

  it('accepts digest-addressed inline images without a filesystem path', () => {
    expect(() =>
      sealDshRunManifest(
        validDraft({
          context: {
            ...validContext(),
            attachments: [
              {
                attachmentId: 'image-1',
                kind: 'image',
                digest: '9'.repeat(64)
              }
            ]
          }
        })
      )
    ).not.toThrow()

    expect(() =>
      sealDshRunManifest(
        validDraft({
          context: {
            ...validContext(),
            attachments: [
              {
                attachmentId: 'file-1',
                kind: 'file',
                digest: '9'.repeat(64)
              }
            ]
          }
        })
      )
    ).toThrow(/attachment path is required/)
  })

  it('accepts scoped RealmFlow attachment IDs without treating them as paths', () => {
    const manifest = sealDshRunManifest(
      validDraft({
        context: {
          ...validContext(),
          attachments: [
            {
              attachmentId: 'conversation-1:message-1:attachment:1',
              kind: 'image',
              digest: '9'.repeat(64)
            }
          ]
        }
      })
    )

    expect(manifest.context.attachments[0]?.attachmentId).toBe(
      'conversation-1:message-1:attachment:1'
    )
  })
})

function validDraft(
  overrides: Partial<DshRunManifestDraft> = {}
): DshRunManifestDraft {
  return {
    schemaVersion: 1,
    manifestId: 'manifest-1',
    runId: 'run-1',
    sessionId: 'session-1',
    owner: {
      conversationId: 'conversation-1',
      workspaceId: 'workspace-1'
    },
    model: validModel(),
    tools: [validTool()],
    skills: [validSkill()],
    agents: [validAgent()],
    mcpServers: [validMcpServer()],
    connectors: [validConnector()],
    context: validContext(),
    knowledge: validKnowledge(),
    policy: validPolicy(),
    budget: validBudget(),
    productCommands: [validProductCommand()],
    credentialReferences: [
      {
        kind: 'credential-reference',
        ref: 'credential-openai',
        purpose: 'model'
      }
    ],
    ...overrides
  }
}

function validModel() {
  return {
    kind: 'model' as const,
    providerId: 'provider-local',
    providerType: 'local' as const,
    profileId: 'profile-local',
    modelId: 'local-model',
    reasoningEffort: 'medium' as const,
    options: {
      temperature: 0.2
    }
  }
}

function validTool() {
  return {
    kind: 'tool' as const,
    id: 'builtin.files.read',
    version: '1.0.0',
    definitionDigest: 'a'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.files',
      version: '1.0.0',
      digest: 'b'.repeat(64)
    },
    entrypoint: {
      kind: 'builtin' as const,
      handler: 'files.read',
      handlerVersion: '1.0.0'
    },
    capabilities: ['filesystem.read' as const],
    risk: 'low' as const
  }
}

function validSkill() {
  return {
    kind: 'skill' as const,
    id: 'builtin.skills.summarize',
    version: '1.0.0',
    definitionDigest: 'c'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.core-skills',
      version: '1.0.0',
      digest: 'd'.repeat(64)
    },
    entrypoint: {
      kind: 'instruction' as const,
      instructionsPath: 'skills/summarize.md'
    },
    requiredToolRefs: [
      {
        kind: 'tool' as const,
        id: 'builtin.files.read',
        version: '1.0.0',
        digest: 'a'.repeat(64)
      }
    ]
  }
}

function validAgent() {
  return {
    kind: 'agent' as const,
    id: 'builtin.general',
    version: '1.0.0',
    profileDigest: 'e'.repeat(64),
    promptDigest: 'f'.repeat(64),
    policyDigest: '1'.repeat(64),
    maxDelegationDepth: 1
  }
}

function validMcpServer() {
  return {
    kind: 'mcp-server' as const,
    id: 'mcp.docs',
    identityDigest: '2'.repeat(64),
    transport: {
      kind: 'streamable_http' as const,
      url: 'https://mcp.example.com'
    },
    credentialRefs: ['credential-openai']
  }
}

function validConnector() {
  return {
    kind: 'connector' as const,
    id: 'connector-docs',
    type: 'http' as const,
    baseUrl: 'https://api.example.com',
    adapter: {
      adapterId: 'realmflow.http',
      version: '1.0.0',
      digest: '3'.repeat(64),
      entrypoint: 'connectors/http.js'
    },
    authentication: {
      kind: 'credential-reference' as const,
      ref: 'credential-openai'
    }
  }
}

function validContext() {
  return {
    kind: 'context-access' as const,
    scope: {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1'
    },
    roots: [
      {
        rootId: 'root-1',
        path: '/workspace',
        access: 'read-write' as const
      }
    ],
    attachments: [
      {
        attachmentId: 'attachment-1',
        kind: 'file' as const,
        path: '/workspace/brief.md',
        digest: '4'.repeat(64)
      }
    ],
    customInstructionsDigest: '5'.repeat(64)
  }
}

function validKnowledge() {
  return {
    kind: 'knowledge-runtime' as const,
    enabled: true,
    scope: {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1'
    },
    snapshotId: 'knowledge-snapshot-1',
    workspaceIds: ['workspace-1'],
    generationIds: ['generation-1'],
    sourceKinds: ['document'],
    embeddingProfile: {
      provider: 'local' as const,
      model: 'Alibaba-NLP/gte-multilingual-base',
      revision: '2024-08-01',
      dimensions: 768,
      normalization: 'L2' as const,
      distance: 'Cosine' as const,
      profileDigest: '6'.repeat(64)
    },
    indexLease: {
      leaseId: 'lease-1',
      collection: 'realmflow-workspace-1',
      expiresAt: 2_000
    },
    limits: {
      maxQueries: 12,
      topKPerQuery: 8,
      maxReturnedChunks: 48,
      maxContextCharacters: 80_000
    }
  }
}

function validPolicy() {
  return {
    kind: 'runtime-policy' as const,
    approvalMode: 'protected' as const,
    defaultDecision: 'deny' as const,
    allowRuntimeWidening: false,
    toolPolicyDigest: '7'.repeat(64),
    maximumRisk: 'critical' as const
  }
}

function validBudget() {
  return {
    kind: 'runtime-budget' as const,
    maxModelRequests: 32,
    maxToolCalls: 64,
    maxSubagents: 4,
    maxRuntimeMs: 900_000,
    maxRetries: 2,
    maxInputTokens: 256_000,
    maxOutputTokens: 32_000,
    maxCostUsd: 0
  }
}

function validProductCommand() {
  return {
    kind: 'product-command' as const,
    grantId: 'grant-requirements-get',
    command: 'realmflow.requirements.get',
    scope: {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1'
    },
    inputSchemaDigest: '8'.repeat(64),
    maxInvocations: 8
  }
}
