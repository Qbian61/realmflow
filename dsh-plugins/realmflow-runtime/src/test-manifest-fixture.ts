import {
  sealDshRunManifest,
  type DshRunManifest,
  type DshRunManifestDraft
} from '../../../domain/dsh-run-manifest'

export function createDshRunManifest(
  overrides: Partial<DshRunManifestDraft> = {}
): DshRunManifest {
  return sealDshRunManifest(createDshRunManifestDraft(overrides))
}

export function createDshRunManifestDraft(
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
    model: {
      kind: 'model',
      providerId: 'provider-local',
      providerType: 'local',
      profileId: 'profile-local',
      modelId: 'local-model',
      reasoningEffort: 'medium',
      options: {
        temperature: 0.2
      }
    },
    tools: [
      {
        kind: 'tool',
        id: 'builtin.files.read',
        version: '1.0.0',
        definitionDigest: 'a'.repeat(64),
        package: {
          packageId: 'realmflow.builtin.files',
          version: '1.0.0',
          digest: 'b'.repeat(64)
        },
        entrypoint: {
          kind: 'builtin',
          handler: 'files.read',
          handlerVersion: '1.0.0'
        },
        capabilities: ['filesystem.read'],
        risk: 'low'
      }
    ],
    skills: [
      {
        kind: 'skill',
        id: 'builtin.skills.summarize',
        version: '1.0.0',
        definitionDigest: 'c'.repeat(64),
        package: {
          packageId: 'realmflow.builtin.core-skills',
          version: '1.0.0',
          digest: 'd'.repeat(64)
        },
        entrypoint: {
          kind: 'instruction',
          instructionsPath: 'skills/summarize.md'
        },
        requiredToolRefs: [
          {
            kind: 'tool',
            id: 'builtin.files.read',
            version: '1.0.0',
            digest: 'a'.repeat(64)
          }
        ]
      }
    ],
    agents: [
      {
        kind: 'agent',
        id: 'builtin.general',
        version: '1.0.0',
        profileDigest: 'e'.repeat(64),
        promptDigest: 'f'.repeat(64),
        policyDigest: '1'.repeat(64),
        maxDelegationDepth: 1
      }
    ],
    mcpServers: [
      {
        kind: 'mcp-server',
        id: 'mcp.docs',
        identityDigest: '2'.repeat(64),
        transport: {
          kind: 'streamable_http',
          url: 'https://mcp.example.com'
        },
        credentialRefs: ['credential-openai']
      }
    ],
    connectors: [
      {
        kind: 'connector',
        id: 'connector-docs',
        type: 'http',
        baseUrl: 'https://api.example.com',
        adapter: {
          adapterId: 'realmflow.http',
          version: '1.0.0',
          digest: '3'.repeat(64),
          entrypoint: 'connectors/http.js'
        },
        authentication: {
          kind: 'credential-reference',
          ref: 'credential-openai'
        }
      }
    ],
    context: {
      kind: 'context-access',
      scope: {
        kind: 'workspace',
        workspaceId: 'workspace-1'
      },
      roots: [
        {
          rootId: 'root-1',
          path: '/workspace',
          access: 'read-write'
        }
      ],
      attachments: [
        {
          attachmentId: 'attachment-1',
          kind: 'file',
          path: '/workspace/brief.md',
          digest: '4'.repeat(64)
        }
      ],
      customInstructionsDigest: '5'.repeat(64)
    },
    knowledge: {
      kind: 'knowledge-runtime',
      enabled: true,
      scope: {
        kind: 'workspace',
        workspaceId: 'workspace-1'
      },
      snapshotId: 'knowledge-snapshot-1',
      workspaceIds: ['workspace-1'],
      generationIds: ['generation-1'],
      sourceKinds: ['document'],
      embeddingProfile: {
        provider: 'local',
        model: 'Alibaba-NLP/gte-multilingual-base',
        revision: '2024-08-01',
        dimensions: 768,
        normalization: 'L2',
        distance: 'Cosine',
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
    },
    policy: {
      kind: 'runtime-policy',
      approvalMode: 'protected',
      defaultDecision: 'deny',
      allowRuntimeWidening: false,
      toolPolicyDigest: '7'.repeat(64),
      maximumRisk: 'critical'
    },
    budget: {
      kind: 'runtime-budget',
      maxModelRequests: 32,
      maxToolCalls: 64,
      maxSubagents: 4,
      maxRuntimeMs: 900_000,
      maxRetries: 2,
      maxInputTokens: 256_000,
      maxOutputTokens: 32_000,
      maxCostUsd: 0
    },
    productCommands: [
      {
        kind: 'product-command',
        grantId: 'grant-requirements-get',
        command: 'realmflow.requirements.get',
        scope: {
          kind: 'workspace',
          workspaceId: 'workspace-1'
        },
        inputSchemaDigest: '8'.repeat(64),
        maxInvocations: 8
      }
    ],
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
