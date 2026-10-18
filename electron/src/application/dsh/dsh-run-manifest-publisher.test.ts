import { describe, expect, it } from 'vitest'
import type { SkillDefinition } from '../../../../domain/skill-definition'
import type { ToolCatalogState } from '../../../../domain/tool-catalog'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import type { DshRunManifestPublication } from './dsh-run-manifest-publisher'
import { DshRunManifestPublisher } from './dsh-run-manifest-publisher'

describe('DshRunManifestPublisher', () => {
  it('publishes an authorized Skill with its declared required Tools', async () => {
    const saved: DshRunManifestPublication[] = []
    const publisher = new DshRunManifestPublisher({
      catalog: {
        getCatalog: async () => catalog()
      },
      publications: {
        save: async (publication) => {
          saved.push(publication)
        }
      },
      now: () => 1_700,
      createId: () => 'manifest-1'
    })

    const publication = await publisher.publish({
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
        options: {}
      },
      selectedToolIds: [],
      selectedSkillIds: ['builtin.skills.summarize'],
      authorizedToolRefs: [],
      authorizedSkillRefs: [
        {
          kind: 'skill',
          id: 'builtin.skills.summarize',
          version: '1.0.0',
          digest: 'c'.repeat(64)
        }
      ],
      agents: [],
      mcpServers: [],
      connectors: [],
      context: context(),
      knowledge: knowledge(),
      policy: policy(),
      budget: budget(),
      productCommands: [productCommand()],
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-openai',
          purpose: 'model'
        }
      ]
    })

    expect(publication.manifest.manifestId).toBe('manifest-1')
    expect(publication.manifest.tools).toEqual([
      expect.objectContaining({
        id: 'builtin.files.read',
        definitionDigest: 'a'.repeat(64),
        package: expect.objectContaining({
          digest: 'b'.repeat(64)
        })
      })
    ])
    expect(publication.manifest.skills).toEqual([
      expect.objectContaining({
        id: 'builtin.skills.summarize',
        definitionDigest: 'c'.repeat(64),
        package: expect.objectContaining({
          digest: 'd'.repeat(64)
        })
      })
    ])
    expect(publication.publishedAt).toBe(1_700)
    expect(publication.runtime).toEqual({
      dshPackage: '@deepseek-ai/dsh',
      dshVersion: '0.2.1-alpha.3',
      acpSdkVersion: '1.4.0'
    })
    expect(saved).toEqual([publication])
  })

  it('rejects selected capabilities that are not in the exact run authorization set', async () => {
    const publisher = new DshRunManifestPublisher({
      catalog: {
        getCatalog: async () => catalog()
      },
      publications: {
        save: async () => {}
      },
      createId: () => 'manifest-1'
    })

    await expect(
      publisher.publish({
        runId: 'run-1',
        sessionId: 'session-1',
        owner: {
          workspaceId: 'workspace-1'
        },
        model: {
          kind: 'model',
          providerId: 'provider-local',
          providerType: 'local',
          profileId: 'profile-local',
          modelId: 'local-model',
          options: {}
        },
        selectedToolIds: ['builtin.files.read'],
        selectedSkillIds: [],
        authorizedToolRefs: [],
        authorizedSkillRefs: [],
        agents: [],
        mcpServers: [],
        connectors: [],
        context: context(),
        knowledge: knowledge(),
        policy: policy(),
        budget: budget(),
        productCommands: [],
        credentialReferences: []
      })
    ).rejects.toThrow(/not authorized/)
  })

  it('compiles model, agent, MCP, and Connector management state into secret-free runtime manifests', async () => {
    const publisher = new DshRunManifestPublisher({
      catalog: {
        getCatalog: async () => catalog()
      },
      publications: {
        save: async () => {}
      },
      createId: () => 'manifest-1'
    })

    const publication = await publisher.publish({
      runId: 'run-1',
      sessionId: 'session-1',
      owner: {
        workspaceId: 'workspace-1'
      },
      modelSelection: {
        provider: {
          id: 'provider-openai',
          type: 'openai_responses',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          enabled: true,
          revision: 3
        },
        profile: {
          id: 'profile-gpt',
          providerId: 'provider-openai',
          modelId: 'gpt-4.1',
          displayName: 'GPT',
          enabled: true,
          capabilities: {
            text: true,
            vision: false,
            toolCalling: true,
            structuredOutput: true
          },
          reasoning: true,
          contextWindow: 128_000,
          maxOutputTokens: 32_000,
          timeoutMs: 120_000,
          maxRetries: 2,
          maxConcurrency: 4,
          inputCostPerMillionTokens: 2,
          outputCostPerMillionTokens: 8,
          revision: 5
        },
        credentialRef: 'credential-openai',
        reasoningEffort: 'high'
      },
      selectedToolIds: ['builtin.files.read'],
      selectedSkillIds: [],
      authorizedToolRefs: [
        {
          kind: 'tool',
          id: 'builtin.files.read',
          version: '1.0.0',
          digest: 'a'.repeat(64)
        }
      ],
      authorizedSkillRefs: [],
      authorizedAgentIds: ['builtin.general'],
      authorizedMcpServerIds: ['mcp.docs'],
      authorizedConnectorIds: ['connector-docs'],
      agentProfiles: [effectiveAgentProfile()],
      mcpServerRecords: [mcpRecord()],
      connectorRecords: [connectorRecord()],
      context: context(),
      knowledge: knowledge(),
      policy: policy(),
      budget: budget(),
      productCommands: [],
      credentialReferences: [
        {
          kind: 'credential-reference',
          ref: 'credential-openai',
          purpose: 'model'
        },
        {
          kind: 'credential-reference',
          ref: 'credential-mcp-token',
          purpose: 'mcp'
        },
        {
          kind: 'credential-reference',
          ref: 'credential-connector-docs',
          purpose: 'connector'
        }
      ]
    })

    expect(publication.manifest.model).toMatchObject({
      providerId: 'provider-openai',
      providerType: 'openai_responses',
      profileId: 'profile-gpt',
      credentialRef: 'credential-openai',
      reasoningEffort: 'high'
    })
    expect(publication.manifest.agents).toEqual([
      expect.objectContaining({
        id: 'builtin.general',
        profileDigest: 'e'.repeat(64)
      })
    ])
    expect(publication.manifest.mcpServers).toEqual([
      expect.objectContaining({
        id: 'mcp.docs',
        credentialRefs: ['credential-mcp-token']
      })
    ])
    expect(publication.manifest.connectors).toEqual([
      expect.objectContaining({
        id: 'connector-docs',
        authentication: {
          kind: 'credential-reference',
          ref: 'credential-connector-docs'
        }
      })
    ])
    expect(JSON.stringify(publication.manifest)).not.toContain('raw-secret')
  })

  it('rejects selected Agent, MCP, and Connector entries outside the exact run authorization set', async () => {
    const publisher = new DshRunManifestPublisher({
      catalog: {
        getCatalog: async () => catalog()
      },
      publications: {
        save: async () => {}
      },
      createId: () => 'manifest-1'
    })

    await expect(
      publisher.publish({
        runId: 'run-1',
        sessionId: 'session-1',
        owner: {
          workspaceId: 'workspace-1'
        },
        model: {
          kind: 'model',
          providerId: 'provider-local',
          providerType: 'local',
          profileId: 'profile-local',
          modelId: 'local-model',
          options: {}
        },
        selectedToolIds: [],
        selectedSkillIds: [],
        authorizedToolRefs: [],
        authorizedSkillRefs: [],
        authorizedAgentIds: [],
        authorizedMcpServerIds: ['mcp.docs'],
        authorizedConnectorIds: ['connector-docs'],
        agentProfiles: [effectiveAgentProfile()],
        mcpServerRecords: [mcpRecord()],
        connectorRecords: [connectorRecord()],
        context: context(),
        knowledge: knowledge(),
        policy: policy(),
        budget: budget(),
        productCommands: [],
        credentialReferences: []
      })
    ).rejects.toThrow(/Agent is not authorized/)
  })
})

function catalog(): ToolCatalogState {
  const tool = toolDefinition()
  const skill = skillDefinition()
  return {
    packages: [
      {
        packageId: 'realmflow.builtin.files',
        version: '1.0.0',
        packageDigest: 'b'.repeat(64),
        origin: 'builtin',
        name: 'Files',
        description: 'Built-in file tools.',
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      },
      {
        packageId: 'realmflow.builtin.core-skills',
        version: '1.0.0',
        packageDigest: 'd'.repeat(64),
        origin: 'builtin',
        name: 'Core Skills',
        description: 'Built-in skills.',
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      }
    ],
    tools: [
      {
        kind: 'tool',
        id: tool.id,
        version: tool.version,
        definitionDigest: tool.definitionDigest,
        definition: tool,
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      }
    ],
    skills: [
      {
        kind: 'skill',
        id: skill.id,
        version: skill.version,
        definitionDigest: skill.definitionDigest,
        definition: skill,
        enabledPreference: true,
        status: 'enabled',
        dependencyIssues: [],
        revision: 1,
        updatedAt: 1
      }
    ]
  }
}

function toolDefinition(): ToolDefinition {
  return {
    schemaVersion: 1,
    id: 'builtin.files.read',
    version: '1.0.0',
    definitionDigest: 'a'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.files',
      packageVersion: '1.0.0',
      packageDigest: 'b'.repeat(64)
    },
    origin: 'builtin',
    name: 'Read File',
    description: 'Read a file.',
    tags: ['files'],
    executor: {
      kind: 'builtin',
      handler: 'files.read',
      handlerVersion: '1.0.0'
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: ['filesystem.read'],
    effects: ['filesystem.read'],
    risk: 'low',
    invocation: {
      mode: 'unary',
      idempotency: 'none',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
      maxAttempts: 1
    },
    discovery: {
      intents: ['read'],
      contexts: ['general', 'space']
    }
  }
}

function skillDefinition(): SkillDefinition {
  return {
    schemaVersion: 1,
    id: 'builtin.skills.summarize',
    version: '1.0.0',
    definitionDigest: 'c'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.core-skills',
      packageVersion: '1.0.0',
      packageDigest: 'd'.repeat(64)
    },
    origin: 'builtin',
    name: 'Summarize',
    description: 'Summarize a file.',
    instructionsPath: 'skills/summarize.md',
    runtime: { kind: 'instruction' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    examples: [],
    requiredTools: [
      {
        toolId: 'builtin.files.read',
        versionRange: '^1.0.0',
        required: true
      }
    ],
    activation: {
      intents: ['summarize'],
      contexts: ['general', 'space']
    },
    limits: {
      maxToolCalls: 4,
      timeoutMs: 120_000
    }
  }
}

function context() {
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
    attachments: [],
    customInstructionsDigest: '5'.repeat(64)
  }
}

function knowledge() {
  return {
    kind: 'knowledge-runtime' as const,
    enabled: false,
    scope: {
      kind: 'none' as const
    },
    snapshotId: 'knowledge-snapshot-empty',
    workspaceIds: [],
    generationIds: [],
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
      leaseId: 'lease-empty',
      collection: 'realmflow-empty',
      expiresAt: 2_000
    },
    limits: {
      maxQueries: 0,
      topKPerQuery: 0,
      maxReturnedChunks: 0,
      maxContextCharacters: 0
    }
  }
}

function policy() {
  return {
    kind: 'runtime-policy' as const,
    approvalMode: 'protected' as const,
    defaultDecision: 'deny' as const,
    allowRuntimeWidening: false as const,
    toolPolicyDigest: '7'.repeat(64),
    maximumRisk: 'critical' as const
  }
}

function budget() {
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

function productCommand() {
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

function effectiveAgentProfile() {
  return {
    schemaVersion: 1 as const,
    profileId: 'builtin.general',
    profileVersion: '1.0.0',
    profileDigest: 'e'.repeat(64),
    prompt: 'Assist.',
    promptDigest: 'f'.repeat(64),
    policy: {
      defaultEffect: 'deny' as const,
      maximumRisk: 'critical' as const,
      rules: [],
      scope: {},
      perRunLimits: {
        tool: 64,
        skill: 4,
        agent: 2,
        connector: 2
      }
    },
    policyDigest: '1'.repeat(64),
    capabilities: [],
    budgets: {
      maxToolCalls: 64,
      maxSubagents: 2,
      timeoutMs: 900_000,
      maxRetries: 2
    },
    rejectedOverrides: []
  }
}

function mcpRecord() {
  return {
    configuration: {
      id: 'mcp.docs',
      name: 'Docs MCP',
      identity: '2'.repeat(64),
      enabled: true,
      transport: {
        kind: 'streamable_http' as const,
        url: 'https://mcp.example.com',
        headerCredentialIds: {
          Authorization: 'credential-mcp-token'
        }
      }
    },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    hasCredentials: {
      Authorization: true
    }
  }
}

function connectorRecord() {
  return {
    connector: {
      id: 'connector-docs',
      name: 'Docs',
      type: 'http' as const,
      baseUrl: 'https://api.example.com',
      authentication: {
        type: 'bearer' as const
      },
      enabled: true,
      timeoutMs: 30_000,
      maxRetries: 2,
      revision: 4,
      createdAt: 1,
      updatedAt: 1
    },
    hasCredential: true
  }
}
