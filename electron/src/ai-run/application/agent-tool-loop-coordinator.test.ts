import { vi } from 'vitest'
import type { AiRunEvent } from '../../../../domain/ai-run'
import { createRunCheckpoint } from '../../../../domain/agent-run-recovery'
import {
  createInitialRunBudgetLedger,
  DEFAULT_AGENT_EXECUTION_POLICY,
  type AgentRuntimeRun,
} from '../../../../domain/agent-runtime'
import {
  createAgentProfile,
  getBuiltinAgentProfile,
  resolveEffectiveAgentProfile,
} from '../../../../domain/agent-profile'
import type { SkillDefinition } from '../../../../domain/skill-definition'
import type { ToolDefinition } from '../../../../domain/tool-definition'
import {
  createCapabilityDefinition,
  createCapabilityInstallation
} from '../../../../domain/capability'
import { SkillRuntimeApplicationService } from '../../application/tools/skill-runtime-application-service'
import { projectModelFacingToolCatalog } from '../../application/tools/tool-model-facing-projection'
import { AgentToolLoopCoordinator } from './agent-tool-loop-coordinator'

const digest = 'a'.repeat(64)

const definition: ToolDefinition = {
  schemaVersion: 1,
  id: 'files.read',
  version: '1.0.0',
  definitionDigest: digest,
  package: {
    packageId: 'realmflow.builtin.files',
    packageVersion: '1.0.0',
    packageDigest: 'b'.repeat(64),
  },
  origin: 'builtin',
  name: 'Read file',
  description: 'Read a workspace file',
  tags: ['files'],
  executor: {
    kind: 'builtin',
    handler: 'files.read',
    handlerVersion: '1.0.0',
  },
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
    additionalProperties: false,
  },
  outputSchema: { type: 'object' },
  capabilities: ['filesystem.read'],
  effects: ['filesystem.read'],
  risk: 'low',
  invocation: {
    mode: 'unary',
    idempotency: 'supported',
    cancellable: true,
    resumable: false,
  },
  resources: {
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    maxAttempts: 1,
  },
  discovery: {
    intents: ['read file'],
    contexts: ['requirement', 'workflow'],
  },
}

const documentDefinition: ToolDefinition = {
  ...definition,
  id: 'builtin.documents.read',
  definitionDigest: '6'.repeat(64),
  name: 'Read document',
  description: 'Extract text locally from authorized PDF and DOCX documents',
  tags: ['documents'],
  executor: {
    kind: 'builtin',
    handler: 'documents.read',
    handlerVersion: '1.0.0',
  },
  discovery: {
    intents: ['read document'],
    contexts: ['general', 'space', 'requirement', 'workflow', 'schedule'],
  },
}

const exportPdfDefinition: ToolDefinition = {
  ...documentDefinition,
  id: 'builtin.document.export_pdf',
  definitionDigest: '7'.repeat(64),
  name: 'Export document to PDF',
  description: 'Export a DOCX to PDF',
  executor: {
    kind: 'builtin',
    handler: 'document.export_pdf',
    handlerVersion: '1.0.0',
  },
  capabilities: ['filesystem.write'],
  effects: ['local_data.change'],
  discovery: {
    intents: ['export document to pdf'],
    contexts: ['general', 'space', 'requirement', 'workflow', 'schedule'],
  },
}

const createDocumentDefinition: ToolDefinition = {
  ...exportPdfDefinition,
  id: 'builtin.document.create',
  definitionDigest: '8'.repeat(64),
  name: 'Create document',
  description: 'Create a DOCX document',
  executor: {
    kind: 'builtin',
    handler: 'document.create',
    handlerVersion: '1.0.0',
  },
  discovery: {
    intents: ['create document'],
    contexts: ['general', 'space', 'requirement', 'workflow', 'schedule'],
  },
}

const skillDefinition: SkillDefinition = {
  schemaVersion: 1,
  id: 'builtin.skill.code_review',
  version: '1.0.0',
  definitionDigest: 'c'.repeat(64),
  package: {
    packageId: 'realmflow.builtin.core-skills',
    packageVersion: '1.0.0',
    packageDigest: 'd'.repeat(64),
  },
  origin: 'builtin',
  name: 'Code review',
  description: 'Review code changes',
  instructionsPath: 'instructions/code_review.md',
  runtime: { kind: 'instruction' },
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  requiredTools: [
    {
      toolId: definition.id,
      versionRange: '^1.0.0',
      required: true,
    },
  ],
  activation: {
    intents: ['review code'],
    contexts: ['workflow'],
  },
  limits: {
    maxToolCalls: 3,
    timeoutMs: 60_000,
  },
}

function event(
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data'] = {},
): AiRunEvent {
  return {
    id: `run-1:${sequence}`,
    runId: 'run-1',
    sequence,
    type,
    timestamp: new Date(sequence).toISOString(),
    data,
  }
}

describe('AgentToolLoopCoordinator', () => {
  it('routes a multi-file conversation to high reasoning and snapshots the decision', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-reasoning-high' })
    const createRuntimeRun = vi.fn().mockResolvedValue(undefined)
    const listCatalog = vi.fn().mockResolvedValue({
      packages: [],
      tools: [],
      skills: [],
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: listCatalog,
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: createRuntimeRun,
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-run-reasoning-high',
      now: () => 300,
    })

    await coordinator.createRun(
      {
        conversationId: 'conversation-reasoning-high',
        requestedReasoning: 'auto',
        messages: [{ role: 'user', content: 'Verify both changed files' }],
        processing: {
          executionBrief: {
            objective: 'Verify both changed files',
            entities: [
              { kind: 'file', id: 'src/a.ts' },
              { kind: 'file', id: 'src/b.ts' },
            ],
            constraints: ['Do not skip tests'],
            acceptanceCriteria: ['Ensure all tests pass'],
            riskLevel: 'medium',
            capabilityRestrictions: {
              allowWrites: true,
              allowExternalSideEffects: false,
            },
          },
        } as never,
      },
      {
        providerType: 'local',
        baseUrl: 'http://127.0.0.1',
        modelId: 'reasoner',
        timeoutMs: 120_000,
        maxRetries: 1,
        maxConcurrency: 1,
        reasoningSupported: true,
      },
    )

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: 'high',
        maxOutputTokens: 8_192,
      }),
      expect.objectContaining({ reasoningSupported: true }),
      expect.objectContaining({
        maxAgentTurns: 180,
        maxParallelToolsPerTurn: 16,
      }),
    )
    expect(createRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          reasoningDecision: expect.objectContaining({
            requestedMode: 'auto',
            selectedMode: 'high',
            effectiveMode: 'high',
            reasonCodes: expect.arrayContaining([
              'multi_file_scope',
              'verification_required',
            ]),
          }),
          executionPolicy: expect.objectContaining({
            maxTurnsPerSegment: 180,
            maxContinuationAttempts: 2,
          }),
          budgets: expect.objectContaining({
            maxToolCalls: 256,
            timeoutMs: 900_000,
          }),
        }),
      }),
    )
    expect(listCatalog).toHaveBeenCalledWith({ modelFacingMode: 'facade' })
  })

  it('records an explainable off downgrade when the model lacks reasoning support', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-reasoning-off' })
    const createRuntimeRun = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: createRuntimeRun,
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-run-reasoning-off',
      now: () => 300,
    })

    await coordinator.createRun(
      {
        conversationId: 'conversation-reasoning-off',
        requestedReasoning: 'high',
        messages: [{ role: 'user', content: 'Analyze the change' }],
      },
      {
        providerType: 'local',
        baseUrl: 'http://127.0.0.1',
        modelId: 'plain-model',
        timeoutMs: 120_000,
        maxRetries: 1,
        maxConcurrency: 1,
        reasoningSupported: false,
      },
    )

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning: 'off' }),
      expect.anything(),
      expect.anything(),
    )
    expect(createRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          reasoningDecision: expect.objectContaining({
            requestedMode: 'high',
            selectedMode: 'high',
            effectiveMode: 'off',
            providerAdjustment: {
              from: 'high',
              to: 'off',
              reason: 'provider_unsupported',
            },
          }),
        }),
      }),
    )
  })

  it('applies the effective Profile Prompt and hides denied capabilities', async () => {
    const system = getBuiltinAgentProfile('general')
    const denied = createAgentProfile({
      ...system,
      id: 'user.restricted',
      source: 'user',
      capabilityPolicy: {
        ...system.capabilityPolicy,
        rules: [
          {
            kind: 'tool',
            id: definition.id,
            effect: 'deny',
          },
        ],
      },
      publishedAt: 200,
    })
    const effective = resolveEffectiveAgentProfile({
      layers: [system, denied],
      scope: { kind: 'global' },
      capabilities: [
        {
          kind: 'tool',
          id: definition.id,
          version: definition.version,
          digest: definition.definitionDigest,
          risk: definition.risk,
        },
      ],
    })
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-denied' })
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const createRuntimeRun = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-denied',
              name: `rf_files_read_${digest.slice(0, 8)}`,
              arguments: '{"path":"README.md"}',
            },
          })
          yield event(2, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      profiles: {
        resolve: vi.fn().mockResolvedValue(effective),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: createRuntimeRun,
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-run-denied',
      now: () => 300,
    })

    await coordinator.createRun({
      conversationId: 'conversation-denied',
      messages: [{ role: 'user', content: 'Read README' }],
    })
    for await (const _item of coordinator.streamEvents(
      'run-denied',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining(
          'Response language policy: Use English'
        )
      }),
      undefined,
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            function: expect.objectContaining({
              name: 'rf_delegate_research',
            }),
          }),
        ],
      }),
    )
    expect(createRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          agentProfileId: effective.profileId,
          agentProfileVersion: effective.profileVersion,
          agentProfileDigest: effective.profileDigest,
          promptDigest: effective.promptDigest,
          policyDigest: effective.policyDigest,
        }),
      }),
    )
    expect(submitToolResult).toHaveBeenCalledWith(
      'run-denied',
      expect.objectContaining({
        callId: 'call-denied',
        status: 'failed',
        errorCode: 'definition_unavailable',
      }),
    )
  })

  it('exposes only the latest enabled version of each contextual Tool', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-versioned' })
    const latest = {
      ...definition,
      version: '1.0.1',
      definitionDigest: 'e'.repeat(64),
    }
    const catalogItem = (tool: ToolDefinition) => ({
      kind: 'tool' as const,
      id: tool.id,
      version: tool.version,
      definitionDigest: tool.definitionDigest,
      definition: tool,
      enabledPreference: true,
      status: 'enabled' as const,
      dependencyIssues: [],
      revision: 1,
      updatedAt: 1,
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [catalogItem(definition), catalogItem(latest)],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
    })

    await coordinator.createRun({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      nodeId: 'analysis-node',
      nodeRunId: 'node-run-1',
      workspaceId: 'workspace-1',
      workspaceName: 'shop',
      prompt: 'Analyze',
      artifactPath: 'artifacts/analysis.md',
      existingArtifacts: [],
    })

    expect(createRun.mock.calls[0]?.[2]?.tools).toEqual([
      expect.objectContaining({
        function: expect.objectContaining({
          name: `rf_files_read_${latest.definitionDigest.slice(0, 8)}`,
        }),
      }),
    ])
  })

  it('excludes scope-bound Tools and dependent Skills from an unbound conversation', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-discovery' })
    const uploadedTool = {
      ...definition,
      id: 'uploaded.project.inspect',
      definitionDigest: 'e'.repeat(64),
      origin: 'local_upload' as const,
      package: {
        packageId: 'uploaded.project-tools',
        packageVersion: '1.0.0',
        packageDigest: 'f'.repeat(64),
      },
    }
    const attachmentTool = {
      ...definition,
      id: 'builtin.attachment.read_chunk',
      definitionDigest: '3'.repeat(64),
      capabilities: ['realmflow.read'] as ToolDefinition['capabilities'],
      executor: {
        kind: 'builtin' as const,
        handler: 'attachment.read_chunk',
        handlerVersion: '1.0.0',
      },
    }
    const uploadedSkill = {
      ...skillDefinition,
      id: 'uploaded.skill.project_assistant',
      definitionDigest: '1'.repeat(64),
      origin: 'local_upload' as const,
      package: {
        packageId: 'uploaded.project-skills',
        packageVersion: '1.0.0',
        packageDigest: '2'.repeat(64),
      },
      requiredTools: [
        {
          toolId: uploadedTool.id,
          versionRange: '^1.0.0',
          required: true,
        },
      ],
      limits: { maxToolCalls: 12, timeoutMs: 60_000 },
    }
    const item = <T extends ToolDefinition | SkillDefinition>(
      definition: T,
    ) => ({
      kind:
        definition === uploadedSkill || definition === skillDefinition
          ? ('skill' as const)
          : ('tool' as const),
      id: definition.id,
      version: definition.version,
      definitionDigest: definition.definitionDigest,
      definition,
      enabledPreference: true,
      status: 'enabled' as const,
      dependencyIssues: [],
      revision: 1,
      updatedAt: 1,
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            item(definition),
            item(documentDefinition),
            item(uploadedTool),
            item(attachmentTool),
          ],
          skills: [item(skillDefinition), item(uploadedSkill)],
        }),
      },
      tools: { execute: vi.fn() },
      skills: { readInstructions: vi.fn() },
    })

    await coordinator.createRun({
      conversationId: 'conversation-general',
      messages: [{ role: 'user', content: 'Inspect the project' }],
    })

    const configuration = createRun.mock.calls[0]?.[2]
    expect(configuration?.maxAgentTurns).toBe(180)
    expect(configuration?.tools).toHaveLength(1)
    expect(
      configuration?.tools.map(
        (tool: { function: { name: string } }) => tool.function.name,
      ),
    ).toEqual(['rf_delegate_research'])
  })

  it('advertises the local document reader only in a folder-bound conversation', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-documents' })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: documentDefinition.id,
              version: documentDefinition.version,
              definitionDigest: documentDefinition.definitionDigest,
              definition: documentDefinition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
    })

    await coordinator.createRun({
      conversationId: 'conversation-folder',
      folderPath: '/workspace',
      messages: [{ role: 'user', content: 'Read the resume' }],
    })

    expect(
      createRun.mock.calls[0]?.[2]?.tools.map(
        (tool: { function: { name: string } }) => tool.function.name,
      ),
    ).toContain(
      `rf_builtin_documents_read_${documentDefinition.definitionDigest.slice(0, 8)}`,
    )
  })

  it('does not advertise Space enumeration inside a folder-bound conversation', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-folder-tools' })
    const spacesDefinition: ToolDefinition = {
      ...definition,
      id: 'builtin.realmflow.spaces.list',
      definitionDigest: '9'.repeat(64),
      name: 'List spaces',
      description: 'List RealmFlow spaces',
      executor: {
        kind: 'builtin',
        handler: 'realmflow.spaces.list',
        handlerVersion: '1.0.0',
      },
      capabilities: ['realmflow.read'],
      effects: [],
      discovery: {
        intents: ['list spaces'],
        contexts: ['general', 'space'],
      },
    }
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
            {
              kind: 'tool',
              id: spacesDefinition.id,
              version: spacesDefinition.version,
              definitionDigest: spacesDefinition.definitionDigest,
              definition: spacesDefinition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
    })

    await coordinator.createRun({
      conversationId: 'conversation-folder',
      folderPath: '/workspace/project',
      messages: [{ role: 'user', content: 'Find resumes' }],
    })

    const names = createRun.mock.calls[0]?.[2]?.tools.map(
      (tool: { function: { name: string } }) => tool.function.name,
    )
    expect(names).toContain(`rf_files_read_${digest.slice(0, 8)}`)
    expect(names).not.toContain(
      `rf_builtin_realmflow_spaces_list_${spacesDefinition.definitionDigest.slice(0, 8)}`,
    )
  })

  it('projects enabled Connector actions in the active scope as model Tools', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-connector' })
    const connector = createCapabilityDefinition({
      id: 'com.example.docs',
      kind: 'connector',
      version: '1.0.0',
      source: 'local_upload',
      manifestDigest: '8'.repeat(64),
      name: 'Docs',
      description: 'Documentation connector.',
      runtime: {
        kind: 'connector',
        connectorKind: 'http',
        credentialRefs: [],
        configurationSchema: { type: 'object' },
        actions: [
          {
            id: 'search',
            name: 'Search docs',
            description: 'Search documentation.',
            operation: 'read',
            inputSchema: { type: 'object' },
            outputSchema: { type: 'object' },
            risk: 'low',
            effects: ['external.read'],
            timeoutMs: 5_000,
            maxOutputBytes: 16_384,
            protocol: {
              kind: 'http',
              baseUrl: 'https://docs.example.com',
              method: 'GET',
              pathTemplate: '/search',
              authentication: { type: 'none' },
              allowedRedirectOrigins: []
            }
          }
        ]
      },
      permissions: {
        capabilities: ['network.connect', 'connector.use'],
        maximumRisk: 'low',
        pathPrefixes: [],
        networkTargets: ['https://docs.example.com']
      },
      dependencies: [],
      compatibility: {
        realmflowVersionRange: '>=0.1.0',
        platforms: ['darwin']
      },
      testPlan: [],
      publishedAt: 100
    })
    const installation = createCapabilityInstallation({
      id: 'installation.docs',
      capabilityId: connector.id,
      capabilityVersion: connector.version,
      capabilityDigest: connector.definitionDigest,
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      enabled: true,
      permissionCeiling: connector.permissions,
      status: 'enabled',
      revision: 1,
      installedAt: 100,
      updatedAt: 100
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn()
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: []
        })
      },
      capabilities: {
        resolve: vi.fn().mockResolvedValue([{ definition: connector, installation }])
      },
      tools: { execute: vi.fn() }
    })

    await coordinator.createRun({
      conversationId: 'conversation-space',
      workspaceId: 'workspace-1',
      messages: [{ role: 'user', content: 'Search docs' }]
    })

    expect(createRun.mock.calls[0]?.[2]?.tools).toEqual([
      expect.objectContaining({
        function: expect.objectContaining({
          name: expect.stringMatching(/^rf_com_example_docs_search_/),
          description: 'Search documentation.'
        })
      }),
      expect.objectContaining({
        function: expect.objectContaining({ name: 'rf_delegate_research' })
      })
    ])
  })

  it('discovers all enabled Tools and Skills for a workflow node', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-workflow' })
    const uploadedTool: ToolDefinition = {
      ...definition,
      id: 'uploaded.project.inspect',
      definitionDigest: 'e'.repeat(64),
      origin: 'local_upload',
      package: {
        packageId: 'uploaded.project-tools',
        packageVersion: '1.0.0',
        packageDigest: 'f'.repeat(64),
      },
      discovery: {
        intents: ['inspect project'],
        contexts: ['general'],
        requiresExplicitSelection: true,
      },
    }
    const uploadedSkill: SkillDefinition = {
      ...skillDefinition,
      id: 'uploaded.skill.project_assistant',
      definitionDigest: '1'.repeat(64),
      origin: 'local_upload',
      package: {
        packageId: 'uploaded.project-skills',
        packageVersion: '1.0.0',
        packageDigest: '2'.repeat(64),
      },
      requiredTools: [],
      limits: { maxToolCalls: 12, timeoutMs: 60_000 },
    }
    const item = <T extends ToolDefinition | SkillDefinition>(
      value: T,
      kind: 'tool' | 'skill',
    ) => ({
      kind,
      id: value.id,
      version: value.version,
      definitionDigest: value.definitionDigest,
      definition: value,
      enabledPreference: true,
      status: 'enabled' as const,
      dependencyIssues: [],
      revision: 1,
      updatedAt: 1,
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [item(definition, 'tool'), item(uploadedTool, 'tool')],
          skills: [
            item(skillDefinition, 'skill'),
            item(uploadedSkill, 'skill'),
          ],
        }),
      },
      tools: { execute: vi.fn() },
      skills: { readInstructions: vi.fn() },
    })

    await coordinator.createRun({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      nodeId: 'analysis-node',
      nodeRunId: 'node-run-1',
      workspaceId: 'workspace-1',
      workspaceName: 'shop',
      prompt: 'Inspect the project',
      artifactPath: 'artifacts/analysis.md',
      existingArtifacts: [],
    })

    const configuration = createRun.mock.calls[0]?.[2]
    expect(configuration?.maxAgentTurns).toBe(180)
    expect(
      configuration?.tools.map(
        (tool: { function: { name: string } }) => tool.function.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        `rf_files_read_${digest.slice(0, 8)}`,
        `rf_uploaded_project_inspect_${uploadedTool.definitionDigest.slice(0, 8)}`,
        `rf_skill_builtin_skill_code_review_${skillDefinition.definitionDigest.slice(0, 8)}`,
        `rf_skill_uploaded_skill_project_assistant_${uploadedSkill.definitionDigest.slice(0, 8)}`,
      ]),
    )
  })

  it('executes a version-fixed discovered Skill when the model invokes it', async () => {
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const executeSkill = vi.fn().mockResolvedValue({
      outcome: 'executed',
      execution: {
        id: 'skill-execution-1',
        skillId: skillDefinition.id,
        skillVersion: skillDefinition.version,
        skillDigest: skillDefinition.definitionDigest,
        status: 'succeeded',
        output: {
          kind: 'instruction',
          instructions: 'Inspect correctness before style.',
        },
      },
    })
    const skillCallName = `rf_skill_builtin_skill_code_review_${skillDefinition.definitionDigest.slice(0, 8)}`
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-skill-discovery' }),
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-skill',
              name: skillCallName,
              arguments: '{"focus":"correctness"}',
            },
          })
          yield event(2, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [
            {
              kind: 'skill',
              id: skillDefinition.id,
              version: skillDefinition.version,
              definitionDigest: skillDefinition.definitionDigest,
              definition: skillDefinition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
        }),
      },
      tools: { execute: vi.fn() },
      skills: { readInstructions: vi.fn() },
      skillRuntime: {
        execute: executeSkill,
        cancelByParent: vi.fn(),
      },
    })
    await coordinator.createRun({
      conversationId: 'conversation-general',
      folderPath: '/workspace',
      messages: [{ role: 'user', content: 'Review this change' }],
    })

    for await (const _event of coordinator.streamEvents(
      'run-skill-discovery',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(executeSkill).toHaveBeenCalledWith({
      definition: skillDefinition,
      parentRunId: 'run-skill-discovery',
      callId: 'call-skill',
      context: {
        scope: {
          kind: 'conversation',
          conversationId: 'conversation-general',
        },
        folderPath: '/workspace',
        conversationId: 'conversation-general',
        parentExecutionId: 'run-skill-discovery',
        toolCallId: 'call-skill',
        capabilityScopes: [{ kind: 'global' }],
      },
      input: { focus: 'correctness' },
    })
    expect(submitToolResult).toHaveBeenCalledWith(
      'run-skill-discovery',
      expect.objectContaining({
        callId: 'call-skill',
        status: 'completed',
        output: {
          kind: 'instruction',
          instructions: 'Inspect correctness before style.',
        },
        toolExecutionId: 'skill-execution-1',
        resultSummary: 'Skill execution completed',
      }),
    )
  })

  it('authorizes a version-fixed executable Skill once within the same Tool call', async () => {
    const executableSkill: SkillDefinition = {
      ...skillDefinition,
      id: 'uploaded.skill.repository_audit',
      definitionDigest: 'e'.repeat(64),
      requiredTools: [],
      runtime: {
        kind: 'executable',
        runtime: 'python',
        entryPath: 'runtime/main.py',
        capabilities: ['filesystem.read', 'process.execute'],
        connectorServices: ['docs'],
        resources: { maxMemoryMb: 128, maxOutputBytes: 4096 },
      },
    }
    const executeSandbox = vi.fn().mockResolvedValue({
      output: { summary: 'Repository audit completed' },
      metrics: { durationMs: 12, outputBytes: 39 },
    })
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const skillCallName = `rf_skill_uploaded_skill_repository_audit_${executableSkill.definitionDigest.slice(0, 8)}`
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-skill-executable' }),
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-skill-executable',
              name: skillCallName,
              arguments: '{"focus":"security"}',
            },
          })
          yield event(2, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [
            {
              kind: 'skill',
              id: executableSkill.id,
              version: executableSkill.version,
              definitionDigest: executableSkill.definitionDigest,
              definition: executableSkill,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
        }),
      },
      tools: { execute: vi.fn() },
      skills: { readInstructions: vi.fn() },
      skillRuntime: new SkillRuntimeApplicationService({
        instructions: { readInstructions: vi.fn() },
        executable: {
          execute: executeSandbox,
          cancel: vi.fn(),
        },
        createId: () => 'skill-execution-executable',
      }),
    })
    await coordinator.createRun({
      conversationId: 'conversation-general',
      messages: [{ role: 'user', content: 'Audit this repository' }],
    })

    for await (const _event of coordinator.streamEvents(
      'run-skill-executable',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(executeSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'skill-execution-executable',
        callId: 'call-skill-executable',
        permissionDecisions: [
          { capability: 'filesystem.read', allowed: true },
          { capability: 'process.execute', allowed: true },
          { capability: 'connector.use', service: 'docs', allowed: true },
        ],
      }),
      expect.any(AbortSignal),
    )
    expect(submitToolResult).toHaveBeenCalledWith(
      'run-skill-executable',
      expect.objectContaining({
        callId: 'call-skill-executable',
        status: 'completed',
        toolExecutionId: 'skill-execution-executable',
      }),
    )
  })

  it('executes a discovered Tool inside a folder conversation scope', async () => {
    const capabilityScopes = [
      { kind: 'global' as const },
      { kind: 'work-root' as const, workRootId: 'root-1' },
      {
        kind: 'folder' as const,
        workRootId: 'root-1',
        canonicalPath: '/workspace/project',
      },
    ]
    const resolveCapabilities = vi.fn().mockResolvedValue([])
    const execute = vi.fn().mockResolvedValue({
      outcome: 'executed',
      execution: {
        id: 'execution-folder',
        status: 'succeeded',
        output: { entries: [] },
      },
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-folder' }),
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-folder',
              name: `rf_files_read_${digest.slice(0, 8)}`,
              arguments: '{"path":"README.md"}',
            },
          })
          yield event(2, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      capabilityScopes: {
        resolve: vi.fn().mockResolvedValue(capabilityScopes),
      },
      capabilities: {
        resolve: resolveCapabilities,
      },
      tools: { execute },
    })
    await coordinator.createRun({
      conversationId: 'conversation-folder',
      folderPath: '/workspace/project',
      messages: [{ role: 'user', content: 'Read the file' }],
    })

    for await (const _event of coordinator.streamEvents(
      'run-folder',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(resolveCapabilities).toHaveBeenCalledWith(capabilityScopes)
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          scope: {
            kind: 'conversation',
            conversationId: 'conversation-folder',
          },
          conversationId: 'conversation-folder',
          folderPath: '/workspace/project',
          parentExecutionId: 'run-folder',
          toolCallId: 'call-folder',
          capabilityScopes,
        },
      }),
    )
  })

  it('injects selected Skill instructions into a conversation context', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-schedule' })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [
            {
              kind: 'skill',
              id: skillDefinition.id,
              version: skillDefinition.version,
              definitionDigest: skillDefinition.definitionDigest,
              definition: skillDefinition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
        }),
      },
      tools: { execute: vi.fn() },
      skills: {
        readInstructions: vi
          .fn()
          .mockResolvedValue('Inspect correctness before style.'),
      },
    })
    const context = {
      conversationId: 'schedule:schedule-run-1',
      workspaceId: 'workspace-1',
      messages: [
        {
          role: 'user' as const,
          content: '{"audience":"team"}',
        },
      ],
      context: 'Scheduled Skill execution.',
      skill: {
        kind: 'skill' as const,
        id: skillDefinition.id,
        version: skillDefinition.version,
        digest: skillDefinition.definitionDigest,
      },
    }

    await coordinator.createRun(context)

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        ...context,
        context:
          '## Skill: Code review\n\n' +
          'Inspect correctness before style.\n\n' +
          '## Context\n\nScheduled Skill execution.',
      }),
      undefined,
      expect.objectContaining({
        maxAgentTurns: 180,
        maxParallelToolsPerTurn: 16,
      }),
    )
  })

  it('injects selected Skill instructions and only its required Tools', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-skill' })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [
            {
              kind: 'skill',
              id: skillDefinition.id,
              version: skillDefinition.version,
              definitionDigest: skillDefinition.definitionDigest,
              definition: skillDefinition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
        }),
      },
      tools: { execute: vi.fn() },
      skills: {
        readInstructions: vi
          .fn()
          .mockResolvedValue('Inspect correctness before style.'),
      },
    })
    const context = {
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      nodeId: 'review-node',
      nodeRunId: 'node-run-1',
      workspaceId: 'workspace-1',
      workspaceName: 'shop',
      prompt: 'Review the checkout changes.',
      skill: {
        kind: 'skill' as const,
        id: skillDefinition.id,
        version: skillDefinition.version,
        digest: skillDefinition.definitionDigest,
      },
      artifactPath: 'artifacts/review.md',
      existingArtifacts: [],
    }

    await coordinator.createRun(context)

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        ...context,
        prompt:
          '## Skill: Code review\n\n' +
          'Inspect correctness before style.\n\n' +
          '## Task\n\nReview the checkout changes.',
      }),
      undefined,
      {
        maxAgentTurns: 180,
        maxParallelToolsPerTurn: 16,
        tools: [
          {
            type: 'function',
            function: {
              name: `rf_files_read_${digest.slice(0, 8)}`,
              description: definition.description,
              parameters: definition.inputSchema,
            },
          },
        ],
      },
    )
  })

  it('uses requirement Tools and scope for a requirement node conversation', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-1' })
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const releaseRun = vi.fn()
    const execute = vi.fn().mockResolvedValue({
      outcome: 'executed',
      execution: {
        id: 'execution-1',
        status: 'succeeded',
        output: { content: 'RealmFlow' },
      },
    })
    const requested = event(2, 'tool.call.requested', {
      toolCall: {
        index: 0,
        id: 'call-1',
        name: `rf_files_read_${digest.slice(0, 8)}`,
        arguments: '{"path":"README.md"}',
      },
    })
    const gateway = {
      createRun,
      cancelRun: vi.fn(),
      releaseRun,
      submitToolResult,
      streamEvents: vi.fn().mockImplementation(async function* () {
        yield event(1, 'run.started')
        yield requested
        yield event(3, 'tool.call.completed', {
          toolResult: {
            callId: 'call-1',
            status: 'completed',
            output: { content: 'RealmFlow' },
          },
        })
        yield event(4, 'run.completed')
      }),
    }
    const coordinator = new AgentToolLoopCoordinator({
      gateway,
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      tools: { execute },
    })
    const context = {
      conversationId: 'conversation-node-1',
      messages: [{ role: 'user' as const, content: 'Read the requirement' }],
      requirementId: 'requirement-1',
      nodeId: 'analysis-node',
      nodeRunId: 'node-run-1',
      workspaceId: 'workspace-1',
      context: '## Current node\nAnalysis',
    }

    await expect(coordinator.createRun(context)).resolves.toEqual({
      runId: 'run-1',
    })
    const observed = []
    for await (const item of coordinator.streamEvents(
      'run-1',
      new AbortController().signal,
    )) {
      observed.push(item)
    }

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        ...context,
      }),
      undefined,
      {
        maxAgentTurns: 180,
        maxParallelToolsPerTurn: 16,
        tools: [
          {
            type: 'function',
            function: {
              name: `rf_files_read_${digest.slice(0, 8)}`,
              description: definition.description,
              parameters: definition.inputSchema,
            },
          },
        ],
      },
    )
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: {
          kind: 'tool',
          id: definition.id,
          version: definition.version,
          digest,
        },
        triggerSource: 'model',
        context: {
          scope: {
            kind: 'requirement',
            requirementId: 'requirement-1',
          },
          workspaceId: 'workspace-1',
          requirementId: 'requirement-1',
          conversationId: 'conversation-node-1',
          nodeRunId: 'node-run-1',
          parentExecutionId: 'run-1',
          toolCallId: 'call-1',
          capabilityScopes: [
            { kind: 'global' },
            { kind: 'workspace', workspaceId: 'workspace-1' },
            {
              kind: 'requirement',
              workspaceId: 'workspace-1',
              requirementId: 'requirement-1',
            },
          ],
        },
        input: { path: 'README.md' },
      }),
    )
    expect(submitToolResult).toHaveBeenCalledWith('run-1', {
      callId: 'call-1',
      status: 'completed',
      output: { content: 'RealmFlow' },
      toolExecutionId: 'execution-1',
      resultSummary: 'Tool execution completed',
    })
    expect(releaseRun).toHaveBeenCalledOnce()
    expect(releaseRun).toHaveBeenCalledWith('run-1')
    expect(observed).toEqual([
      event(1, 'run.started'),
      requested,
      event(3, 'tool.call.completed', {
        toolResult: {
          callId: 'call-1',
          status: 'completed',
          output: { content: 'RealmFlow' },
        },
      }),
      event(4, 'run.completed'),
    ])
  })

  it.each([
    {
      label: 'invalid arguments',
      call: {
        index: 0,
        id: 'call-invalid',
        name: `rf_files_read_${digest.slice(0, 8)}`,
        arguments: '[]',
      },
      execution: undefined,
      expected: {
        callId: 'call-invalid',
        status: 'failed',
        errorCode: 'arguments_invalid',
        message: 'Tool arguments are invalid',
      },
    },
    {
      label: 'unknown Tool',
      call: {
        index: 0,
        id: 'call-unknown',
        name: 'rf_unknown_deadbeef',
        arguments: '{}',
      },
      execution: undefined,
      expected: {
        callId: 'call-unknown',
        status: 'failed',
        errorCode: 'definition_unavailable',
        message: 'Requested Tool is unavailable',
      },
    },
    {
      label: 'thrown argument validation failure',
      call: {
        index: 0,
        id: 'call-thrown-arguments-invalid',
        name: `rf_files_read_${digest.slice(0, 8)}`,
        arguments: '{"command":"npm test"}',
      },
      execution: Object.assign(
        new Error(
          'Tool arguments invalid: unsupported property command; missing required property executable',
        ),
        { code: 'tool_arguments_invalid' },
      ),
      expected: {
        callId: 'call-thrown-arguments-invalid',
        status: 'failed',
        errorCode: 'tool_arguments_invalid',
        message:
          'Tool arguments invalid: unsupported property command; missing required property executable',
      },
    },
    {
      label: 'actionable argument validation failure',
      call: {
        index: 0,
        id: 'call-arguments-invalid',
        name: `rf_files_read_${digest.slice(0, 8)}`,
        arguments: '{"command":"npm test"}',
      },
      execution: {
        outcome: 'executed',
        execution: {
          id: 'execution-arguments-invalid',
          status: 'failed',
          error: {
            code: 'tool_arguments_invalid',
            message:
              'Tool arguments invalid: unsupported property command; missing required property executable',
          },
        },
      },
      expected: {
        callId: 'call-arguments-invalid',
        status: 'failed',
        errorCode: 'tool_arguments_invalid',
        message:
          'Tool arguments invalid: unsupported property command; missing required property executable',
        toolExecutionId: 'execution-arguments-invalid',
      },
    },
    {
      label: 'file conflict failure',
      call: {
        index: 0,
        id: 'call-file-already-exists',
        name: `rf_files_read_${digest.slice(0, 8)}`,
        arguments: '{"path":"README.md"}',
      },
      execution: {
        outcome: 'executed',
        execution: {
          id: 'execution-file-already-exists',
          status: 'failed',
          error: {
            code: 'file_already_exists',
            message: 'File already exists',
          },
        },
      },
      expected: {
        callId: 'call-file-already-exists',
        status: 'failed',
        errorCode: 'file_already_exists',
        message: 'File already exists',
        toolExecutionId: 'execution-file-already-exists',
      },
    },
    {
      label: 'failed execution',
      call: {
        index: 0,
        id: 'call-failed',
        name: `rf_files_read_${digest.slice(0, 8)}`,
        arguments: '{"path":"README.md"}',
      },
      execution: {
        outcome: 'executed',
        execution: {
          id: 'execution-failed',
          status: 'failed',
          error: {
            code: 'tool_timeout',
            message: '/private/workspace/secret timed out',
          },
        },
      },
      expected: {
        callId: 'call-failed',
        status: 'failed',
        errorCode: 'tool_timeout',
        message: 'Tool execution timed out',
        toolExecutionId: 'execution-failed',
      },
    },
  ])(
    'submits a safe canonical result for $label',
    async ({ call, execution, expected }) => {
      const submitToolResult = vi.fn().mockResolvedValue(undefined)
      const execute = vi.fn()
      if (execution instanceof Error) {
        execute.mockRejectedValue(execution)
      } else if (execution) {
        execute.mockResolvedValue(execution)
      }
      const coordinator = new AgentToolLoopCoordinator({
        gateway: {
          createRun: vi.fn().mockResolvedValue({ runId: 'run-errors' }),
          cancelRun: vi.fn(),
          submitToolResult,
          streamEvents: vi.fn().mockImplementation(async function* () {
            yield event(1, 'tool.call.requested', { toolCall: call })
            yield event(2, 'run.completed')
          }),
        },
        catalog: {
          list: vi.fn().mockResolvedValue({
            packages: [],
            tools: [
              {
                kind: 'tool',
                id: definition.id,
                version: definition.version,
                definitionDigest: definition.definitionDigest,
                definition,
                enabledPreference: true,
                status: 'enabled',
                dependencyIssues: [],
                revision: 1,
                updatedAt: 1,
              },
            ],
            skills: [],
          }),
        },
        tools: { execute },
      })
      await coordinator.createRun({
        requirementId: 'requirement-1',
        requirementTitle: 'Checkout',
        nodeId: 'analysis-node',
        nodeRunId: 'node-run-1',
        workspaceId: 'workspace-1',
        workspaceName: 'shop',
        prompt: 'Analyze',
        artifactPath: 'artifacts/analysis.md',
        existingArtifacts: [],
      })

      for await (const _event of coordinator.streamEvents(
        'run-errors',
        new AbortController().signal,
      )) {
        // Consume the coordinated stream.
      }

      expect(submitToolResult).toHaveBeenCalledWith('run-errors', expected)
    },
  )

  it('leaves a permission-required Tool call pending without submitting a Tool result', async () => {
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const saveCheckpoint = vi.fn().mockResolvedValue(true)
    const execute = vi.fn().mockResolvedValue({
      outcome: 'permission_required',
      executionId: 'execution-permission',
      permissionRequests: [{ id: 'permission-1' }],
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-permission' }),
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-permission',
              name: `rf_files_read_${digest.slice(0, 8)}`,
              arguments: '{"path":"README.md"}',
            },
          })
          yield event(2, 'tool.call.permission_required', {
            callId: 'call-permission',
            requestId: 'permission-1',
            toolExecutionId: 'execution-permission',
          })
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      tools: { execute },
      checkpoints: {
        save: saveCheckpoint,
        getLatest: vi.fn(),
        list: vi.fn(),
      },
    })
    await coordinator.createRun({
      requirementId: 'requirement-1',
      requirementTitle: 'Checkout',
      nodeId: 'analysis-node',
      nodeRunId: 'node-run-1',
      workspaceId: 'workspace-1',
      workspaceName: 'shop',
      prompt: 'Analyze',
      artifactPath: 'artifacts/analysis.md',
      existingArtifacts: [],
    })

    for await (const _event of coordinator.streamEvents(
      'run-permission',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          parentExecutionId: 'run-permission',
          toolCallId: 'call-permission',
        }),
      }),
    )
    expect(submitToolResult).not.toHaveBeenCalled()
    expect(saveCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'permission_wait',
        pendingCalls: [
          expect.objectContaining({
            callId: 'call-permission',
            executionId: 'execution-permission',
            status: 'permission_required',
          }),
        ],
      }),
    )
  })

  it('projects provider events into the Main-owned runtime lifecycle', async () => {
    const transition = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-run-1' }),
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'run.started')
          yield event(2, 'tool.call.permission_required')
          yield event(3, 'run.progress', { progress: 0.5 })
          yield event(4, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition,
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-run-1',
      now: () => 100,
    })
    await coordinator.createRun({
      conversationId: 'conversation-1',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    for await (const _event of coordinator.streamEvents(
      'provider-run-1',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(transition.mock.calls).toEqual([
      ['agent-run-1', 'running', 100, undefined],
      ['agent-run-1', 'waiting_permission', 100, undefined],
      ['agent-run-1', 'running', 100, undefined],
      ['agent-run-1', 'completed', 100, undefined],
    ])
  })

  it('routes Tool-round prose to execution summaries before committing the final answer', async () => {
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-rounds' }),
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'run.started')
          yield event(2, 'answer.delta', {
            delta: '我会先检查相关文件。'
          })
          yield event(3, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-1',
              name: 'rf_unknown_deadbeef',
              arguments: '{}'
            }
          })
          yield event(4, 'tool.call.failed', {
            toolResult: {
              callId: 'call-1',
              status: 'failed',
              errorCode: 'tool_not_found',
              message: 'Tool is unavailable'
            }
          })
          yield event(5, 'answer.delta', { delta: '检查完成。' })
          yield event(6, 'run.completed')
        })
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: []
        })
      },
      tools: { execute: vi.fn() }
    })
    const { runId } = await coordinator.createRun({
      conversationId: 'conversation-rounds',
      messages: [{ role: 'user', content: '请检查文件' }]
    })
    const observed: AiRunEvent[] = []

    for await (const item of coordinator.streamEvents(
      runId,
      new AbortController().signal
    )) {
      observed.push(item)
    }

    expect(
      observed
        .filter(({ type }) =>
          type === 'answer.delta' || type === 'execution.summary.delta'
        )
        .map(({ type, data }) => ({ type, delta: data.delta }))
    ).toEqual([
      {
        type: 'execution.summary.delta',
        delta: '我会先检查相关文件。'
      },
      { type: 'answer.delta', delta: '检查完成。' }
    ])
  })

  it('does not publish a final answer in the wrong response language', async () => {
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-language' }),
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'run.started')
          yield event(2, 'answer.delta', {
            delta: 'The requested work is complete and ready to review.'
          })
          yield event(3, 'run.completed')
        })
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: []
        })
      },
      tools: { execute: vi.fn() }
    })
    const { runId } = await coordinator.createRun({
      conversationId: 'conversation-language',
      messages: [{ role: 'user', content: '请完成这项工作' }]
    })
    const observed: AiRunEvent[] = []

    for await (const item of coordinator.streamEvents(
      runId,
      new AbortController().signal
    )) {
      observed.push(item)
    }

    expect(observed.some(({ type }) => type === 'answer.delta')).toBe(false)
    expect(observed.at(-1)).toMatchObject({
      type: 'run.waiting_input',
      data: { recoveryReason: 'response_language_mismatch' }
    })
  })

  it('uses the runtime run id as the stable timeline id and checkpoints safe boundaries', async () => {
    const saveCheckpoint = vi.fn().mockResolvedValue(true)
    const gatewayStream = vi.fn().mockImplementation(async function* () {
      yield event(1, 'run.started')
      yield event(2, 'tool.call.permission_required')
      yield event(3, 'tool.call.completed')
      yield event(4, 'run.completed')
    })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-run-1' }),
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: gatewayStream,
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: saveCheckpoint,
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-run-stable',
      now: () => 100,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-1',
      messages: [{ role: 'user', content: 'Continue' }],
    })
    const events: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      events.push(item)
    }

    expect(created).toEqual({ runId: 'agent-run-stable' })
    expect(gatewayStream).toHaveBeenCalledWith(
      'provider-run-1',
      expect.any(AbortSignal),
    )
    expect(events.map((item) => item.runId)).toEqual([
      'agent-run-stable',
      'agent-run-stable',
      'agent-run-stable',
      'agent-run-stable',
    ])
    expect(saveCheckpoint.mock.calls.map(([value]) => ({
      ordinal: value.ordinal,
      reason: value.reason,
      projectionCursor: value.projectionCursor,
    }))).toEqual([
      { ordinal: 1, reason: 'run_started', projectionCursor: 0 },
      { ordinal: 2, reason: 'permission_wait', projectionCursor: 2 },
      { ordinal: 3, reason: 'tool_completed', projectionCursor: 3 },
      { ordinal: 4, reason: 'terminal', projectionCursor: 4 },
    ])
  })

  it('keeps the working message window mutable after saving a checkpoint', async () => {
    const saveCheckpoint = vi.fn().mockImplementation(async (checkpoint) => {
      expect(Object.isFrozen(checkpoint.messageWindow)).toBe(true)
      return true
    })
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-run-1' }),
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'run.started')
          yield event(2, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-1',
              name: 'rf_unknown_deadbeef',
              arguments: '{}',
            },
          })
          yield event(3, 'tool.call.failed', {
            toolResult: {
              callId: 'call-1',
              status: 'failed',
              errorCode: 'tool_not_found',
              message: 'Tool is unavailable',
            },
          })
          yield event(4, 'tool.call.failed', {
            toolName: 'rf_overflow_deadbeef',
            toolResult: {
              callId: 'call-2',
              status: 'failed',
              errorCode: 'tool_call_limit',
              message: 'Tool call budget exhausted',
            },
          })
          yield event(5, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      checkpoints: {
        save: saveCheckpoint,
        getLatest: vi.fn(),
        list: vi.fn(),
      },
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-tool',
      messages: [{ role: 'user', content: 'Use a Tool' }],
    })
    const events: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      events.push(item)
    }

    expect(events.map(({ type }) => type)).toEqual([
      'run.started',
      'tool.call.requested',
      'tool.call.failed',
      'tool.call.failed',
      'run.completed',
    ])
    expect(submitToolResult).toHaveBeenCalledWith(
      'provider-run-1',
      expect.objectContaining({
        callId: 'call-1',
        status: 'failed',
      }),
    )
    expect(saveCheckpoint).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messageWindow: expect.arrayContaining([
          expect.objectContaining({
            toolCallId: 'call-2',
            name: 'rf_overflow_deadbeef',
          }),
        ]),
      }),
    )
  })

  it('persists Agent Turn and Tool activity counters in every safe checkpoint', async () => {
    const saveCheckpoint = vi.fn().mockResolvedValue(true)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-ledger' }),
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'run.started')
          yield event(2, 'tool.call.requested', {
            agentTurn: 1,
            toolCall: {
              index: 0,
              id: 'call-ledger',
              name: 'rf_unknown_deadbeef',
              arguments: '{}',
            },
          })
          yield event(3, 'tool.call.failed', {
            agentTurn: 1,
            toolResult: {
              callId: 'call-ledger',
              status: 'failed',
              errorCode: 'tool_not_found',
              message: 'Tool is unavailable',
            },
          })
          yield event(4, 'run.completed', { agentTurn: 2 })
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      checkpoints: {
        save: saveCheckpoint,
        getLatest: vi.fn(),
        list: vi.fn(),
      },
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-ledger',
      messages: [{ role: 'user', content: 'Track the run' }],
    })
    for await (const _item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(saveCheckpoint).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ledger: expect.objectContaining({
          segmentIndex: 0,
          agentTurns: 2,
          toolRequests: 1,
          toolExecutions: 1,
          consecutiveFailures: 1,
          remainingContinuationAttempts: 2,
        }),
      }),
    )
  })

  it('attaches a recovered provider attempt without resetting sequence or budgets', async () => {
    const saveCheckpoint = vi.fn().mockResolvedValue(true)
    const bindProviderAttempt = vi.fn().mockResolvedValue(undefined)
    const resumeRun = vi.fn().mockResolvedValue({ runId: 'provider-recovered' })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn(),
        resumeRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-after-recovery',
              name: 'rf_unknown_deadbeef',
              arguments: '{}',
            },
          })
          yield event(2, 'tool.call.completed', {
            toolResult: {
              callId: 'call-after-recovery',
              status: 'completed',
              output: {},
            },
          })
          yield event(3, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        bindProviderAttempt,
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: saveCheckpoint,
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      now: () => 500,
    })
    const run: AgentRuntimeRun = {
      id: 'agent-run-recovered',
      status: 'retrying',
      snapshot: {
        schemaVersion: 1,
        runId: 'agent-run-recovered',
        rootRunId: 'agent-run-recovered',
        delegationDepth: 0,
        delegationOrdinal: 0,
        scenarioId: 'general',
        pipelineVersion: 'builtin.general.v1',
        agentProfileId: 'builtin.general',
        agentProfileVersion: '1.0.0',
        agentProfileDigest: getBuiltinAgentProfile('general').profileDigest,
        promptDigest: 'b'.repeat(64),
        policyDigest: 'c'.repeat(64),
        capabilityCatalogDigest: 'd'.repeat(64),
        capabilityBindingDigest: 'e'.repeat(64),
        permissionSnapshotDigest: 'f'.repeat(64),
        scope: { kind: 'global' },
        executionPolicy: { ...DEFAULT_AGENT_EXECUTION_POLICY },
        budgetLedger: createInitialRunBudgetLedger(
          DEFAULT_AGENT_EXECUTION_POLICY,
        ),
        budgets: {
          maxToolCalls: 8,
          maxSubagents: 0,
          timeoutMs: 900_000,
          maxRetries: 2,
        },
        createdAt: 100,
      },
      createdAt: 100,
      updatedAt: 400,
    }
    const checkpoint = createRunCheckpoint({
      runId: run.id,
      ordinal: 7,
      reason: 'tool_completed',
      snapshotDigest: 'a'.repeat(64),
      configurationDigests: {
        agentProfile: run.snapshot.agentProfileDigest,
        prompt: run.snapshot.promptDigest,
        policy: run.snapshot.policyDigest,
        capabilityCatalog: run.snapshot.capabilityCatalogDigest,
        capabilityBinding: run.snapshot.capabilityBindingDigest,
      },
      messageWindow: [
        { id: 'message-1', role: 'user', content: 'Continue' },
      ],
      pendingCalls: [],
      remainingBudgets: {
        toolCalls: 3,
        subagents: 0,
        retries: 1,
        timeoutMs: 800_000,
        tokens: 2_048,
      },
      projectionCursor: 4,
      createdAt: 400,
    })

    await expect(
      coordinator.attachRecoveredRun(run, checkpoint),
    ).resolves.toEqual({ runId: run.id })
    const observed: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      run.id,
      new AbortController().signal,
    )) {
      observed.push(item)
    }

    expect(resumeRun).toHaveBeenCalledWith(run, checkpoint, undefined)
    expect(bindProviderAttempt).toHaveBeenCalledWith(
      run.id,
      'provider-recovered',
      checkpoint.resumeToken,
      500,
    )
    expect(observed.map(({ sequence }) => sequence)).toEqual([5, 6, 7])
    expect(saveCheckpoint.mock.calls.map(([value]) => ({
      ordinal: value.ordinal,
      reason: value.reason,
      projectionCursor: value.projectionCursor,
      toolCalls: value.remainingBudgets.toolCalls,
    }))).toEqual([
      {
        ordinal: 8,
        reason: 'tool_completed',
        projectionCursor: 6,
        toolCalls: 2,
      },
      {
        ordinal: 9,
        reason: 'terminal',
        projectionCursor: 7,
        toolCalls: 2,
      },
    ])
  })

  it('automatically continues the same logical Run after an Agent Turn segment limit', async () => {
    const saveCheckpoint = vi.fn().mockResolvedValue(true)
    const resumeRun = vi
      .fn()
      .mockResolvedValue({ runId: 'provider-continuation-2' })
    const bindProviderAttempt = vi.fn().mockResolvedValue(undefined)
    const streamEvents = vi.fn().mockImplementation(
      async function* (providerRunId: string) {
        if (providerRunId === 'provider-continuation-1') {
          yield event(1, 'run.started')
          yield event(2, 'run.failed', {
            agentTurn: 180,
            errorCode: 'max_agent_turns' as never,
            message: 'Agent Turn segment limit reached',
            retryable: true,
          })
          return
        }
        yield event(1, 'run.started')
        yield event(2, 'answer.delta', { delta: 'Finished' })
        yield event(3, 'run.completed', { agentTurn: 1 })
      },
    )
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi
          .fn()
          .mockResolvedValue({ runId: 'provider-continuation-1' }),
        resumeRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents,
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        bindProviderAttempt,
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: saveCheckpoint,
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-continuation',
      now: () => 500,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-continuation',
      messages: [{ role: 'user', content: 'Complete a long task' }],
    })
    const observed: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      observed.push(item)
    }

    expect(resumeRun).toHaveBeenCalledOnce()
    expect(bindProviderAttempt).toHaveBeenCalledWith(
      created.runId,
      'provider-continuation-2',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      500,
    )
    expect(
      observed.some(
        (item) =>
          item.type === 'run.failed' &&
          item.data.errorCode === 'max_agent_turns',
      ),
    ).toBe(false)
    expect(observed.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        'run.retrying',
        'run.resumed',
        'answer.delta',
        'run.completed',
      ]),
    )
    expect(saveCheckpoint).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ledger: expect.objectContaining({
          segmentIndex: 1,
          agentTurns: 1,
          remainingContinuationAttempts: 1,
        }),
      }),
    )
  })

  it('automatically retries transient provider failures before failing the task', async () => {
    const resumeRun = vi
      .fn()
      .mockResolvedValue({ runId: 'provider-retry-2' })
    const bindProviderAttempt = vi.fn().mockResolvedValue(undefined)
    const streamEvents = vi.fn().mockImplementation(
      async function* (providerRunId: string) {
        if (providerRunId === 'provider-retry-1') {
          yield event(1, 'run.failed', {
            errorCode: 'provider_unavailable',
            message: 'Provider request failed',
          })
          return
        }
        yield event(1, 'answer.delta', { delta: 'Recovered' })
        yield event(2, 'run.completed')
      },
    )
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-retry-1' }),
        resumeRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents,
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        bindProviderAttempt,
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: vi.fn().mockResolvedValue(true),
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-provider-retry',
      now: () => 500,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-provider-retry',
      messages: [{ role: 'user', content: 'Finish despite a transient error' }],
    })
    const observed: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      observed.push(item)
    }

    expect(resumeRun).toHaveBeenCalledOnce()
    expect(bindProviderAttempt).toHaveBeenCalledWith(
      created.runId,
      'provider-retry-2',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      500,
    )
    expect(
      observed.some(
        (item) =>
          item.type === 'run.failed' &&
          item.data.errorCode === 'provider_unavailable',
      ),
    ).toBe(false)
    expect(observed.map(({ type }) => type)).toEqual(
      expect.arrayContaining(['run.retrying', 'run.resumed', 'run.completed']),
    )
  })

  it('completes with a degraded artifact conclusion when the provider fails after generated artifacts are ready', async () => {
    const resumeRun = vi
      .fn()
      .mockResolvedValue({ runId: 'provider-artifact-2' })
    const bindProviderAttempt = vi.fn().mockResolvedValue(undefined)
    const execute = vi.fn().mockResolvedValue({
      outcome: 'executed',
      execution: {
        id: 'execution-pdf',
        status: 'succeeded',
        output: {
          path: 'out/resume.pdf',
          format: 'pdf',
          inspection: { pageCount: 2 },
        },
      },
    })
    const pdfInspectDefinition: ToolDefinition = {
      ...definition,
      id: 'builtin.pdf.inspect',
      definitionDigest: '5'.repeat(64),
      name: 'Inspect PDF',
      description: 'Inspect a PDF artifact',
      executor: {
        kind: 'builtin',
        handler: 'pdf.inspect',
        handlerVersion: '1.0.0',
      },
      capabilities: ['filesystem.read'],
      effects: ['filesystem.read'],
      discovery: {
        intents: ['inspect pdf'],
        contexts: ['general'],
      },
    }
    const callName =
      `rf_builtin_pdf_inspect_${pdfInspectDefinition.definitionDigest.slice(0, 8)}`
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-artifact-1' }),
        resumeRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(
          async function* (providerRunId: string) {
            if (providerRunId === 'provider-artifact-1') {
              yield event(1, 'tool.call.requested', {
                toolCall: {
                  index: 0,
                  id: 'call-pdf',
                  name: callName,
                  arguments: JSON.stringify({ path: 'out/resume.pdf' }),
                },
              })
              yield event(2, 'tool.call.completed', {
                toolResult: {
                  callId: 'call-pdf',
                  status: 'completed',
                  output: {
                    path: 'out/resume.pdf',
                    format: 'pdf',
                    inspection: { pageCount: 2 },
                  },
                  toolExecutionId: 'execution-pdf',
                },
              })
              yield event(3, 'run.failed', {
                errorCode: 'provider_unavailable',
                message: 'Provider request failed',
              })
              return
            }
            yield event(1, 'run.failed', {
              errorCode: 'provider_rejected',
              message: 'Provider request failed',
            })
          },
        ),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: pdfInspectDefinition.id,
              version: pdfInspectDefinition.version,
              definitionDigest: pdfInspectDefinition.definitionDigest,
              definition: pdfInspectDefinition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      tools: { execute },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        bindProviderAttempt,
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: vi.fn().mockResolvedValue(true),
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-artifact-provider-failure',
      now: () => 550,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-artifact-provider-failure',
      folderPath: '/workspace',
      applicationLocale: 'zh-CN',
      messages: [{ role: 'user', content: '生成 PDF 简历' }],
    })
    const observed: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      observed.push(item)
    }

    expect(resumeRun).toHaveBeenCalledOnce()
    expect(bindProviderAttempt).toHaveBeenCalledWith(
      created.runId,
      'provider-artifact-2',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      550,
    )
    expect(observed.some((item) => item.type === 'run.failed')).toBe(false)
    expect(observed.slice(-2).map(({ type }) => type)).toEqual([
      'answer.delta',
      'run.completed',
    ])
    expect(observed.at(-2)?.data.delta).toContain('out/resume.pdf')
  })

  it('passes safe builtin execution failure details back to the provider', async () => {
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const execute = vi.fn().mockResolvedValue({
      outcome: 'executed',
      execution: {
        id: 'execution-outside-path',
        status: 'failed',
        error: {
          code: 'builtin_execution_failed',
          message: 'Path is outside the bound workspace',
          retryable: false,
        },
      },
    })
    const callName =
      `rf_files_read_${definition.definitionDigest.slice(0, 8)}`
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-builtin-error' }),
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-read',
              name: callName,
              arguments: JSON.stringify({ path: '/tmp/outside.txt' }),
            },
          })
          yield event(2, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      tools: { execute },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: vi.fn().mockResolvedValue(true),
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-builtin-error',
      now: () => 560,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-builtin-error',
      folderPath: '/workspace',
      messages: [{ role: 'user', content: 'Read a file' }],
    })
    for await (const _item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      // drain stream
    }

    expect(submitToolResult).toHaveBeenCalledWith(
      'provider-builtin-error',
      expect.objectContaining({
        callId: 'call-read',
        status: 'failed',
        errorCode: 'builtin_execution_failed',
        message: 'Path is outside the bound workspace',
      }),
    )
  })

  it('passes safe pre-execution failure details back to the provider', async () => {
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const execute = vi
      .fn()
      .mockRejectedValue(new Error('File already exists'))
    const callName =
      `rf_files_read_${definition.definitionDigest.slice(0, 8)}`
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-pre-error' }),
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-write',
              name: callName,
              arguments: JSON.stringify({
                path: 'report.txt',
              }),
            },
          })
          yield event(2, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: definition.id,
              version: definition.version,
              definitionDigest: definition.definitionDigest,
              definition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      tools: { execute },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: vi.fn().mockResolvedValue(true),
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-pre-error',
      now: () => 570,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-pre-error',
      folderPath: '/workspace',
      messages: [{ role: 'user', content: 'Write a file' }],
    })
    for await (const _item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      // drain stream
    }

    expect(submitToolResult).toHaveBeenCalledWith(
      'provider-pre-error',
      expect.objectContaining({
        callId: 'call-write',
        status: 'failed',
        errorCode: 'tool_execution_failed',
        message: 'File already exists',
      }),
    )
  })

  it('waits for user input after both automatic continuations are exhausted', async () => {
    const resumeRun = vi
      .fn()
      .mockResolvedValueOnce({ runId: 'provider-segment-2' })
      .mockResolvedValueOnce({ runId: 'provider-segment-3' })
    const transition = vi.fn().mockResolvedValue(undefined)
    const cancelRun = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-segment-1' }),
        resumeRun,
        cancelRun,
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(
          async function* (_providerRunId: string) {
            yield event(1, 'run.failed', {
              agentTurn: 180,
              errorCode: 'max_agent_turns',
              message: 'Agent Turn segment limit reached',
              retryable: true,
            })
          },
        ),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        bindProviderAttempt: vi.fn(),
        transition,
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: vi.fn().mockResolvedValue(true),
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-exhausted',
      now: () => 600,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-exhausted',
      messages: [{ role: 'user', content: 'Keep working' }],
    })
    const observed: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      observed.push(item)
    }

    expect(resumeRun).toHaveBeenCalledTimes(2)
    expect(observed.at(-1)).toMatchObject({
      type: 'run.waiting_input',
      data: { recoveryReason: 'continuation_limit_reached' },
    })
    expect(transition).toHaveBeenLastCalledWith(
      created.runId,
      'waiting_input',
      600,
      undefined,
    )
    expect(cancelRun).not.toHaveBeenCalled()
  })

  it('stops before executing a third equivalent Tool request', async () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined)
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-loop' }),
        cancelRun,
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          for (let index = 1; index <= 3; index += 1) {
            yield event(index * 2 - 1, 'tool.call.requested', {
              agentTurn: index,
              toolCall: {
                index: 0,
                id: `call-loop-${index}`,
                name: 'rf_unknown_deadbeef',
                arguments: '{"path":"same.txt"}',
              },
            })
            yield event(index * 2, 'tool.call.failed', {
              agentTurn: index,
              toolResult: {
                callId: `call-loop-${index}`,
                status: 'failed',
                errorCode: 'tool_not_found',
                message: 'Tool is unavailable',
              },
            })
          }
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: vi.fn().mockResolvedValue(true),
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-loop',
      now: () => 700,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-loop',
      messages: [{ role: 'user', content: 'Avoid loops' }],
    })
    const observed: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      observed.push(item)
    }

    expect(submitToolResult).toHaveBeenCalledTimes(2)
    expect(cancelRun).toHaveBeenCalledWith('provider-loop')
    expect(observed.at(-2)).toMatchObject({
      type: 'answer.delta',
      data: {
        delta: expect.stringContaining('could not complete'),
      },
    })
    expect(observed.at(-1)).toMatchObject({
      type: 'run.waiting_input',
      data: { recoveryReason: 'repeated_tool_call' },
    })
  })

  it('stops after the first non-retryable capability failure with a specific Tool result', async () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined)
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'executed',
        execution: {
          id: 'execution-docx',
          status: 'succeeded',
          output: { path: 'resume.docx', format: 'docx' },
        },
      })
      .mockResolvedValueOnce({
        outcome: 'executed',
        execution: {
          id: 'execution-export',
          status: 'failed',
          error: {
            code: 'document_export_unavailable',
            message: 'LibreOffice PDF export is unavailable',
            retryable: false,
          },
        },
      })
    const createCallName =
      `rf_builtin_document_create_${createDocumentDefinition.definitionDigest.slice(0, 8)}`
    const callName =
      `rf_builtin_document_export_pdf_${exportPdfDefinition.definitionDigest.slice(0, 8)}`
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-export' }),
        cancelRun,
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-docx',
              name: createCallName,
              arguments: JSON.stringify({
                outputPath: 'resume.docx',
                expectedAbsent: true,
                document: {
                  title: 'Resume',
                  blocks: [{ kind: 'paragraph', text: 'Resume content' }],
                },
              }),
            },
          })
          yield event(2, 'tool.call.completed', {
            toolResult: {
              callId: 'call-docx',
              status: 'completed',
              output: { path: 'resume.docx', format: 'docx' },
              toolExecutionId: 'execution-docx',
            },
          })
          yield event(3, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'call-export',
              name: callName,
              arguments: JSON.stringify({
                sourcePath: 'resume.docx',
                sourceChecksum: `sha256:${'a'.repeat(64)}`,
                outputPath: 'resume.pdf',
                expectedAbsent: true,
              }),
            },
          })
          yield event(4, 'tool.call.failed', {
            toolResult: {
              callId: 'call-export',
              status: 'failed',
              errorCode: 'document_export_unavailable',
              message: 'Tool execution failed',
              toolExecutionId: 'execution-export',
            },
          })
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [
            {
              kind: 'tool',
              id: createDocumentDefinition.id,
              version: createDocumentDefinition.version,
              definitionDigest: createDocumentDefinition.definitionDigest,
              definition: createDocumentDefinition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
            {
              kind: 'tool',
              id: exportPdfDefinition.id,
              version: exportPdfDefinition.version,
              definitionDigest: exportPdfDefinition.definitionDigest,
              definition: exportPdfDefinition,
              enabledPreference: true,
              status: 'enabled',
              dependencyIssues: [],
              revision: 1,
              updatedAt: 1,
            },
          ],
          skills: [],
        }),
      },
      tools: { execute },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: vi.fn().mockResolvedValue(true),
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-export',
      now: () => 800,
    })

    const created = await coordinator.createRun({
      conversationId: 'conversation-export',
      folderPath: '/workspace',
      applicationLocale: 'zh-CN',
      messages: [{ role: 'user', content: '把简历导出为 PDF' }],
    })
    const observed: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      observed.push(item)
    }

    expect(submitToolResult).toHaveBeenCalledWith(
      'provider-export',
      expect.objectContaining({
        callId: 'call-export',
        status: 'failed',
        errorCode: 'document_export_unavailable',
        message: 'LibreOffice PDF export is unavailable',
      }),
    )
    expect(cancelRun).toHaveBeenCalledWith('provider-export')
    expect(observed.slice(-2).map(({ type }) => type)).toEqual([
      'answer.delta',
      'run.waiting_input',
    ])
    expect(observed.at(-2)?.data.delta).toContain('PDF')
    expect(observed.at(-2)?.data.delta).toContain('resume.docx')
    expect(observed.at(-2)?.data.delta).toContain('LibreOffice')
    expect(observed.at(-1)).toMatchObject({
      type: 'run.waiting_input',
      data: { recoveryReason: 'capability_unavailable' },
    })
  })

  it('creates a new-config recovery branch linked to the source checkpoint', async () => {
    const createRuntimeRun = vi.fn().mockResolvedValue(undefined)
    const bindProviderRun = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-branch' }),
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: createRuntimeRun,
        bindProviderRun,
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn().mockResolvedValue([]),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: vi.fn().mockResolvedValue(true),
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      createRuntimeRunId: () => 'runtime-branch',
      now: () => 500,
    })
    const run: AgentRuntimeRun = {
      id: 'runtime-parent',
      status: 'recovery_blocked',
      snapshot: {
        schemaVersion: 1,
        runId: 'runtime-parent',
        conversationId: 'conversation-1',
        rootRunId: 'runtime-root',
        parentRunId: 'runtime-root',
        delegationDepth: 1,
        delegationOrdinal: 1,
        scenarioId: 'general',
        pipelineVersion: 'retired.pipeline.v1',
        agentProfileId: 'retired.profile',
        agentProfileVersion: '1.0.0',
        agentProfileDigest: 'a'.repeat(64),
        promptDigest: 'b'.repeat(64),
        policyDigest: 'c'.repeat(64),
        capabilityCatalogDigest: 'd'.repeat(64),
        capabilityBindingDigest: 'e'.repeat(64),
        permissionSnapshotDigest: 'f'.repeat(64),
        scope: { kind: 'global' },
        executionPolicy: { ...DEFAULT_AGENT_EXECUTION_POLICY },
        budgetLedger: createInitialRunBudgetLedger(
          DEFAULT_AGENT_EXECUTION_POLICY,
        ),
        budgets: {
          maxToolCalls: 8,
          maxSubagents: 0,
          timeoutMs: 900_000,
          maxRetries: 2,
        },
        createdAt: 100,
      },
      createdAt: 100,
      updatedAt: 400,
    }
    const checkpoint = createRunCheckpoint({
      runId: run.id,
      ordinal: 7,
      reason: 'tool_completed',
      snapshotDigest: '1'.repeat(64),
      configurationDigests: {
        agentProfile: run.snapshot.agentProfileDigest,
        prompt: run.snapshot.promptDigest,
        policy: run.snapshot.policyDigest,
        capabilityCatalog: run.snapshot.capabilityCatalogDigest,
        capabilityBinding: run.snapshot.capabilityBindingDigest,
      },
      messageWindow: [
        { id: 'message-1', role: 'user', content: 'Continue safely' },
      ],
      pendingCalls: [],
      remainingBudgets: {
        toolCalls: 3,
        subagents: 0,
        retries: 1,
        timeoutMs: 800_000,
        tokens: 2_048,
      },
      projectionCursor: 4,
      createdAt: 400,
    })

    await expect(
      coordinator.branchRecoveredRun(run, checkpoint),
    ).resolves.toEqual({ runId: 'runtime-branch' })
    expect(createRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'runtime-branch',
        snapshot: expect.objectContaining({
          runId: 'runtime-branch',
          rootRunId: 'runtime-root',
          parentRunId: 'runtime-parent',
          delegationDepth: 2,
          delegationOrdinal: 1,
          pipelineVersion: 'builtin.general.v1',
          sourceCheckpoint: {
            runId: 'runtime-parent',
            ordinal: 7,
            resumeToken: checkpoint.resumeToken,
          },
        }),
      }),
    )
    expect(bindProviderRun).toHaveBeenCalledWith(
      'runtime-branch',
      'provider-branch',
      500,
    )
  })

  it('compacts an oversized working window at a safe boundary', async () => {
    const saveCheckpoint = vi.fn().mockResolvedValue(true)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'provider-compact' }),
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'run.started')
          yield event(2, 'tool.call.completed')
          yield event(3, 'run.completed')
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      checkpoints: {
        save: saveCheckpoint,
        getLatest: vi.fn(),
        list: vi.fn(),
      },
      contextCompactionCharacters: 80,
      createRuntimeRunId: () => 'agent-run-compact',
      now: () => 100,
    })
    const created = await coordinator.createRun({
      conversationId: 'conversation-compact',
      messages: [{ role: 'user', content: 'x'.repeat(120) }],
      processing: {
        executionBrief: {
          objective: 'Finish recovery',
          constraints: ['Keep data local'],
          acceptanceCriteria: [],
        },
      } as never,
    })

    const events: AiRunEvent[] = []
    for await (const item of coordinator.streamEvents(
      created.runId,
      new AbortController().signal,
    )) {
      events.push(item)
    }

    expect(events.map(({ type }) => type)).toEqual([
      'run.started',
      'tool.call.completed',
      'context.compacted',
      'run.completed',
    ])
    expect(saveCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'compacted',
        compaction: expect.objectContaining({
          sourceMappings: expect.arrayContaining([
            expect.objectContaining({
              section: 'objective',
              sourceId: 'execution-brief',
            }),
          ]),
        }),
      }),
    )
  })

  it('persists one immutable runtime run before creating and binding its provider run', async () => {
    const order: string[] = []
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-snapshot' })
    createRun.mockImplementation(async () => {
      order.push('provider')
      return { runId: 'run-snapshot' }
    })
    const createRuntimeRun = vi.fn().mockImplementation(async () => {
      order.push('runtime')
    })
    const bindProviderRun = vi.fn().mockResolvedValue(undefined)
    const resolveCapabilities = vi.fn().mockResolvedValue([])
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      capabilities: {
        resolve: resolveCapabilities,
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: createRuntimeRun,
        bindProviderRun,
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-run-1',
      now: () => 100,
    })

    await coordinator.createRun({
      conversationId: 'conversation-1',
      workspaceId: 'workspace-1',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    const runtimeSnapshot = createRuntimeRun.mock.calls[0]?.[0].snapshot
    expect(runtimeSnapshot).toMatchObject({
      runId: 'agent-run-1',
      scenarioId: 'space',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      createdAt: 100,
    })
    expect(createRuntimeRun).toHaveBeenCalledWith({
      id: 'agent-run-1',
      providerRunId: undefined,
      status: 'preparing',
      snapshot: runtimeSnapshot,
      createdAt: 100,
      updatedAt: 100,
    })
    expect(bindProviderRun).toHaveBeenCalledWith(
      'agent-run-1',
      'run-snapshot',
      100,
    )
    expect(resolveCapabilities).toHaveBeenCalledWith([
      { kind: 'global' },
      { kind: 'workspace', workspaceId: 'workspace-1' },
    ])
    expect(order).toEqual(['runtime', 'provider'])
  })

  it('does not create a provider run when its runtime snapshot cannot be persisted', async () => {
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-snapshot' })
    const cancelRun = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun,
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn().mockRejectedValue(new Error('SQLite unavailable')),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
    })

    await expect(
      coordinator.createRun({
        conversationId: 'conversation-1',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ).rejects.toThrow('SQLite unavailable')
    expect(createRun).not.toHaveBeenCalled()
    expect(cancelRun).not.toHaveBeenCalled()
  })

  it('persists clarification runs as waiting input without creating a provider run', async () => {
    const createRun = vi.fn()
    const createRuntimeRun = vi.fn().mockResolvedValue(undefined)
    const transition = vi.fn().mockResolvedValue(undefined)
    const cancelRun = vi.fn()
    const cancelByParent = vi.fn().mockResolvedValue(0)
    const cancelSkillByParent = vi.fn().mockResolvedValue(0)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun,
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn(), cancelByParent },
      skillRuntime: {
        execute: vi.fn(),
        cancelByParent: cancelSkillByParent,
      },
      runtimeRuns: {
        create: createRuntimeRun,
        bindProviderRun: vi.fn(),
        transition,
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-run-waiting',
      now: () => 100,
    })

    const result = await coordinator.createWaitingInputRun(
      {
        conversationId: 'conversation-1',
        messages: [{ role: 'user', content: 'Handle this file' }],
        pipelineVersion: 'pipeline-v2',
      },
      {
        status: 'clarification_required',
        question: 'Read or write?',
        understoodObjective: 'Handle this file',
        objects: [],
        sideEffects: ['May write a file'],
      },
    )

    expect(result).toEqual({ runId: 'agent-run-waiting' })
    expect(createRun).not.toHaveBeenCalled()
    expect(createRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-run-waiting',
        status: 'waiting_input',
        snapshot: expect.objectContaining({
          pipelineVersion: 'pipeline-v2',
        }),
      }),
    )

    await coordinator.cancelRun('agent-run-waiting')
    expect(cancelByParent).toHaveBeenCalledWith('agent-run-waiting')
    expect(cancelSkillByParent).toHaveBeenCalledWith('agent-run-waiting')
    expect(cancelRun).not.toHaveBeenCalled()
    expect(transition).toHaveBeenCalledWith(
      'agent-run-waiting',
      'cancelled',
      100,
      undefined,
    )
  })

  it('cancels an unbound provider run when binding its runtime record fails', async () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined)
    const transition = vi.fn().mockResolvedValue(undefined)
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-snapshot' }),
        cancelRun,
        submitToolResult: vi.fn(),
        streamEvents: vi.fn(),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: vi.fn().mockResolvedValue(undefined),
        bindProviderRun: vi
          .fn()
          .mockRejectedValue(new Error('SQLite unavailable')),
        transition,
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-run-1',
      now: () => 100,
    })

    await expect(
      coordinator.createRun({
        conversationId: 'conversation-1',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ).rejects.toThrow('SQLite unavailable')
    expect(cancelRun).toHaveBeenCalledWith('run-snapshot')
    expect(transition).toHaveBeenCalledWith(
      'agent-run-1',
      'failed',
      100,
      'SQLite unavailable',
    )
  })

  it('exposes bounded research delegation and submits its structured result', async () => {
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const executeDelegation = vi.fn().mockResolvedValue({
      status: 'completed',
      tasks: [
        {
          taskId: 'docs',
          status: 'completed',
          summary: 'Requirements inspected',
          evidence: [],
          unresolved: [],
          artifactIds: [],
        },
        {
          taskId: 'tests',
          status: 'completed',
          summary: 'Tests inspected',
          evidence: [],
          unresolved: [],
          artifactIds: [],
        },
      ],
    })
    const cancelDelegation = vi.fn()
    const createRun = vi.fn().mockResolvedValue({ runId: 'run-1' })
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'delegate-1',
              name: 'rf_delegate_research',
              arguments: JSON.stringify({
                tasks: [
                  {
                    id: 'docs',
                    objective: 'Inspect requirements',
                    completionCriteria: ['Summarize requirements'],
                    maxToolCalls: 2,
                    resultFormat: 'research_summary',
                  },
                  {
                    id: 'tests',
                    objective: 'Inspect tests',
                    completionCriteria: ['Summarize tests'],
                    maxToolCalls: 2,
                    resultFormat: 'research_summary',
                  },
                ],
              }),
            },
          })
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      subagents: {
        execute: executeDelegation,
        cancel: cancelDelegation,
      },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-root',
      now: () => 100,
    })

    await coordinator.createRun({
      conversationId: 'conversation-1',
      workspaceId: 'workspace-1',
      messages: [{ role: 'user', content: 'Research docs and tests' }],
    })
    for await (const _event of coordinator.streamEvents(
      'run-1',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(createRun).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({
        maxAgentTurns: 180,
        maxParallelToolsPerTurn: 16,
        tools: expect.arrayContaining([
          expect.objectContaining({
            function: expect.objectContaining({
              name: 'rf_delegate_research',
            }),
          }),
        ]),
      }),
    )
    expect(executeDelegation).toHaveBeenCalledWith(
      expect.objectContaining({
        rootRunId: 'agent-root',
        policy: expect.objectContaining({
          scenarioId: 'space',
          parentScope: {
            kind: 'workspace',
            workspaceId: 'workspace-1',
          },
          rootBudgets: expect.objectContaining({
            maxSubagents: 8,
          }),
        }),
      }),
    )
    expect(submitToolResult).toHaveBeenCalledWith('run-1', {
      callId: 'delegate-1',
      status: 'completed',
      output: expect.objectContaining({
        status: 'completed',
        tasks: expect.any(Array),
      }),
      toolExecutionId: 'delegation:delegate-1',
      resultSummary: 'Delegated 2 research tasks',
    })

    await coordinator.cancelRun('run-1')
    expect(cancelDelegation).toHaveBeenCalledWith('agent-root')
  })

  it('routes the subagents runtime Tool alias through bounded delegation', async () => {
    const projected = projectModelFacingToolCatalog(
      {
        packages: [],
        tools: [],
        skills: [],
      },
      'facade',
    )
    const subagentsDefinition = projected.tools.find(
      ({ id }) => id === 'subagents',
    )!.definition
    const subagentsToolName = `rf_subagents_${subagentsDefinition.definitionDigest.slice(0, 8)}`
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const executeDelegation = vi.fn().mockResolvedValue({
      status: 'completed',
      tasks: [
        {
          taskId: 'docs',
          status: 'completed',
          summary: 'Requirements inspected',
          evidence: [],
          unresolved: [],
          artifactIds: [],
        },
      ],
    })
    const executeTool = vi.fn()
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* () {
          yield event(1, 'tool.call.requested', {
            toolCall: {
              index: 0,
              id: 'subagents-1',
              name: subagentsToolName,
              arguments: JSON.stringify({
                tasks: [
                  {
                    id: 'docs',
                    objective: 'Inspect requirements',
                    completionCriteria: ['Summarize requirements'],
                    maxToolCalls: 2,
                    resultFormat: 'research_summary',
                  },
                ],
              }),
            },
          })
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [projected.tools.find(({ id }) => id === 'subagents')!],
          skills: [],
        }),
      },
      tools: { execute: executeTool },
      subagents: {
        execute: executeDelegation,
        cancel: vi.fn(),
      },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => 'agent-root',
      now: () => 100,
    })

    await coordinator.createRun({
      conversationId: 'conversation-1',
      workspaceId: 'workspace-1',
      messages: [{ role: 'user', content: 'Delegate research' }],
    })
    for await (const _event of coordinator.streamEvents(
      'run-1',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(executeTool).not.toHaveBeenCalled()
    expect(executeDelegation).toHaveBeenCalledOnce()
    expect(submitToolResult).toHaveBeenCalledWith('run-1', {
      callId: 'subagents-1',
      status: 'completed',
      output: expect.objectContaining({
        status: 'completed',
        tasks: expect.any(Array),
      }),
      toolExecutionId: 'delegation:subagents-1',
      resultSummary: 'Delegated 1 research tasks',
    })
  })

  it('creates read-only child Runs with durable lineage and aggregates partial results', async () => {
    const writeDefinition: ToolDefinition = {
      ...definition,
      id: 'files.write',
      definitionDigest: '9'.repeat(64),
      name: 'Write file',
      description: 'Write a workspace file',
      capabilities: ['filesystem.write'],
      effects: ['filesystem.write'],
    }
    const providerRunIds = ['provider-root', 'provider-child-1', 'provider-child-2']
    const createRun = vi
      .fn()
      .mockImplementation(async () => ({ runId: providerRunIds.shift()! }))
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const createRuntimeRun = vi.fn().mockResolvedValue(undefined)
    const runtimeRunIds = ['runtime-root', 'runtime-child-1', 'runtime-child-2']
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun: vi.fn(),
        submitToolResult,
        streamEvents: vi.fn().mockImplementation((runId: string) =>
          eventsFor(runId)
        ),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [definition, writeDefinition].map((tool) => ({
            kind: 'tool' as const,
            id: tool.id,
            version: tool.version,
            definitionDigest: tool.definitionDigest,
            definition: tool,
            enabledPreference: true,
            status: 'enabled' as const,
            dependencyIssues: [],
            revision: 1,
            updatedAt: 1,
          })),
          skills: [],
        }),
      },
      tools: { execute: vi.fn() },
      runtimeRuns: {
        create: createRuntimeRun,
        bindProviderRun: vi.fn(),
        transition: vi.fn(),
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => runtimeRunIds.shift()!,
      now: () => 100,
    })

    await coordinator.createRun({
      conversationId: 'conversation-1',
      workspaceId: 'workspace-1',
      messages: [{ role: 'user', content: 'Delegate research' }],
    })
    for await (const _event of coordinator.streamEvents(
      'provider-root',
      new AbortController().signal,
    )) {
      // Consume the coordinated stream.
    }

    expect(createRun).toHaveBeenCalledTimes(3)
    for (const childCall of createRun.mock.calls.slice(1)) {
      expect(childCall[2]).toMatchObject({
        maxAgentTurns: 180,
        maxParallelToolsPerTurn: 16,
      })
      const names = childCall[2].tools.map(
        (tool: { function: { name: string } }) => tool.function.name,
      )
      expect(names).toContain(`rf_files_read_${digest.slice(0, 8)}`)
      expect(names).not.toContain(
        `rf_files_write_${writeDefinition.definitionDigest.slice(0, 8)}`,
      )
    }
    expect(createRuntimeRun.mock.calls.slice(1).map(([run]) => run.snapshot)).toEqual([
      expect.objectContaining({
        runId: 'runtime-child-1',
        rootRunId: 'runtime-root',
        parentRunId: 'runtime-root',
        delegationDepth: 1,
        delegationOrdinal: 1,
      }),
      expect.objectContaining({
        runId: 'runtime-child-2',
        rootRunId: 'runtime-root',
        parentRunId: 'runtime-root',
        delegationDepth: 1,
        delegationOrdinal: 2,
      }),
    ])
    expect(submitToolResult).toHaveBeenCalledWith(
      'provider-root',
      expect.objectContaining({
        callId: 'delegate-real',
        status: 'completed',
        output: {
          status: 'partial',
          tasks: [
            expect.objectContaining({
              taskId: 'docs',
              status: 'completed',
              summary: 'Docs summary',
              evidence: [
                {
                  title: 'Design',
                  summary: 'Relevant design',
                  referenceId: 'reference-1',
                },
              ],
            }),
            expect.objectContaining({
              taskId: 'tests',
              status: 'failed',
              errorCode: 'provider_rejected',
            }),
          ],
        },
      }),
    )

    async function* eventsFor(runId: string): AsyncIterable<AiRunEvent> {
      if (runId === 'provider-root') {
        yield runEvent(runId, 1, 'tool.call.requested', {
          toolCall: {
            index: 0,
            id: 'delegate-real',
            name: 'rf_delegate_research',
            arguments: JSON.stringify({
              tasks: [
                {
                  id: 'docs',
                  objective: 'Inspect docs',
                  completionCriteria: ['Summarize docs'],
                  maxToolCalls: 2,
                  resultFormat: 'research_summary',
                },
                {
                  id: 'tests',
                  objective: 'Inspect tests',
                  completionCriteria: ['Summarize tests'],
                  maxToolCalls: 2,
                  resultFormat: 'research_summary',
                },
              ],
            }),
          },
        })
        yield runEvent(runId, 2, 'run.completed')
        return
      }
      yield runEvent(runId, 1, 'run.started')
      if (runId === 'provider-child-1') {
        yield runEvent(runId, 2, 'answer.delta', {
          delta: 'Docs summary',
        })
        yield runEvent(runId, 3, 'reference.added', {
          reference: {
            id: 'reference-1',
            title: 'Design',
            sourceType: 'knowledge',
            summary: 'Relevant design',
          },
        })
        yield runEvent(runId, 4, 'run.completed')
        return
      }
      yield runEvent(runId, 2, 'run.failed', {
        errorCode: 'provider_rejected',
        message: 'Provider failed',
      })
    }
  })

  it('cascades root cancellation to active child Runs without submitting a stale result', async () => {
    const providerRunIds = ['provider-root', 'provider-child']
    const createRun = vi
      .fn()
      .mockImplementation(async () => ({ runId: providerRunIds.shift()! }))
    const cancelRun = vi.fn().mockResolvedValue(undefined)
    const submitToolResult = vi.fn().mockResolvedValue(undefined)
    const cancelTools = vi.fn().mockResolvedValue(0)
    const cancelSkills = vi.fn().mockResolvedValue(0)
    const transition = vi.fn().mockResolvedValue(undefined)
    const runtimeRunIds = ['runtime-root', 'runtime-child']
    const coordinator = new AgentToolLoopCoordinator({
      gateway: {
        createRun,
        cancelRun,
        submitToolResult,
        streamEvents: vi.fn().mockImplementation(async function* (
          runId: string,
          signal: AbortSignal,
        ) {
          if (runId === 'provider-root') {
            yield runEvent(runId, 1, 'tool.call.requested', {
              toolCall: {
                index: 0,
                id: 'delegate-cancel',
                name: 'rf_delegate_research',
                arguments: JSON.stringify({
                  tasks: [
                    {
                      id: 'docs',
                      objective: 'Inspect docs',
                      completionCriteria: ['Summarize docs'],
                      maxToolCalls: 2,
                      resultFormat: 'research_summary',
                    },
                  ],
                }),
              },
            })
            return
          }
          yield runEvent(runId, 1, 'run.started')
          await new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
        }),
      },
      catalog: {
        list: vi.fn().mockResolvedValue({
          packages: [],
          tools: [],
          skills: [],
        }),
      },
      tools: { execute: vi.fn(), cancelByParent: cancelTools },
      skillRuntime: {
        execute: vi.fn(),
        cancelByParent: cancelSkills,
      },
      runtimeRuns: {
        create: vi.fn(),
        bindProviderRun: vi.fn(),
        transition,
        getByProviderRunId: vi.fn(),
        listByRootRunId: vi.fn(),
        listByParentRunId: vi.fn(),
        listUnfinished: vi.fn(),
      },
      createRuntimeRunId: () => runtimeRunIds.shift()!,
      now: () => 100,
    })

    await coordinator.createRun({
      conversationId: 'conversation-1',
      messages: [{ role: 'user', content: 'Delegate research' }],
    })
    const consumption = (async () => {
      for await (const _event of coordinator.streamEvents(
        'provider-root',
        new AbortController().signal,
      )) {
        // Consume until cancellation settles.
      }
    })()
    await vi.waitFor(() => expect(createRun).toHaveBeenCalledTimes(2))

    await coordinator.cancelRun('provider-root')
    await consumption
    await vi.waitFor(() =>
      expect(cancelRun).toHaveBeenCalledWith('provider-child'),
    )

    expect(cancelRun).toHaveBeenCalledWith('provider-root')
    expect(cancelTools).toHaveBeenCalledWith('runtime-root')
    expect(cancelTools).toHaveBeenCalledWith('runtime-child')
    expect(cancelSkills).toHaveBeenCalledWith('runtime-root')
    expect(cancelSkills).toHaveBeenCalledWith('runtime-child')
    expect(transition).toHaveBeenCalledWith(
      'runtime-root',
      'cancelled',
      100,
      undefined,
    )
    expect(transition).toHaveBeenCalledWith(
      'runtime-child',
      'cancelled',
      100,
      undefined,
    )
    expect(submitToolResult).not.toHaveBeenCalled()
  })
})

function runEvent(
  runId: string,
  sequence: number,
  type: AiRunEvent['type'],
  data: AiRunEvent['data'] = {},
): AiRunEvent {
  return {
    id: `${runId}:${sequence}`,
    runId,
    sequence,
    type,
    timestamp: new Date(sequence).toISOString(),
    data,
  }
}
