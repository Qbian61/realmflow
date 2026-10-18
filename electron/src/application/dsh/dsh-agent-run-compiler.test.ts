import { describe, expect, it } from 'vitest'
import {
  sealDshRunManifest,
  type KnowledgeRuntimeManifest
} from '../../../../domain/dsh-run-manifest'
import type { PreparedConversationAttachment } from '../../../../domain/conversation-input'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type { ConversationContext } from '../../ai-run/application/ports'
import { DshAgentRunAdmissionCompiler } from './dsh-agent-run-compiler'

describe('DshAgentRunAdmissionCompiler', () => {
  it('compiles product run context through the DSH input envelope and prompt builder without leaking model secrets', async () => {
    const compiler = new DshAgentRunAdmissionCompiler({
      defaultCwd: '/workspace/default',
      knowledge: {
        resolve: async () => knowledgeManifest()
      }
    })

    const admission = await compiler.compile({
      runId: 'run-1',
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      context: conversationContext(),
      model: modelConfig()
    })

    expect(admission.cwd).toBe('/workspace/one')
    expect(admission.prompt).toEqual([
      {
        type: 'text',
        text: 'Ship this feature'
      },
      {
        type: 'image',
        data: 'ignored',
        mimeType: 'image/png'
      }
    ])
    expect(admission.manifestInput.model).toMatchObject({
      kind: 'model',
      providerId: 'provider-openai',
      providerType: 'openai_responses',
      profileId: 'profile-gpt',
      modelId: 'gpt-4.1',
      reasoningEffort: 'high',
      credentialRef: 'credential-model-provider:provider-openai'
    })
    expect(admission.manifestInput.credentialReferences).toEqual([
      {
        kind: 'credential-reference',
        ref: 'credential-model-provider:provider-openai',
        purpose: 'model'
      }
    ])
    expect(admission.manifestInput.model).toBeDefined()
    expect(admission.configOptions).toContainEqual({
      configId: 'model',
      value: JSON.stringify(['realmflow-model', 'gpt-4.1'])
    })
    expect(() =>
      sealDshRunManifest({
        schemaVersion: 1,
        manifestId: 'manifest-run-1',
        runId: 'run-1',
        sessionId: 'session-1',
        owner: { conversationId: 'conversation-1', workspaceId: 'workspace-1' },
        model: admission.manifestInput.model!,
        tools: [],
        skills: [],
        agents: [],
        mcpServers: [],
        connectors: [],
        context: {
          ...admission.manifestInput.context,
          attachments: []
        },
        knowledge: admission.manifestInput.knowledge,
        policy: admission.manifestInput.policy,
        budget: admission.manifestInput.budget,
        productCommands: [],
        credentialReferences: admission.manifestInput.credentialReferences
      })
    ).not.toThrow()
    expect(admission.manifestInput.context).toMatchObject({
      kind: 'context-access',
      scope: {
        kind: 'workspace',
        workspaceId: 'workspace-1'
      },
      roots: [
        {
          rootId: 'workspace-1',
          path: '/workspace/one',
          access: 'read-write'
        }
      ],
      attachments: [
        {
          attachmentId: 'doc-1',
          kind: 'file',
          digest: '1'.repeat(64)
        },
        {
          attachmentId: 'image-1',
          kind: 'image',
          digest: '3'.repeat(64)
        }
      ]
    })
    expect(admission.manifestInput.policy.approvalMode).toBe('cautious')
    expect(admission.manifestInput.knowledge).toEqual(knowledgeManifest())
    const serialized = JSON.stringify(admission)
    expect(serialized).not.toContain('sk-live-secret')
    expect(serialized).not.toContain('dsh-session-1')
    expect(serialized).not.toContain('LIVE-KNOWLEDGE-CHUNK')
  })

  it('carries selected MCP and Connector runtime records into session admission and manifest publication', async () => {
    const mcpRecord = {
      configuration: {
        id: 'mcp.tc-p1-local',
        name: 'Local mock MCP',
        identity: 'a'.repeat(64),
        enabled: true,
        transport: {
          kind: 'stdio' as const,
          command: '/usr/bin/node',
          arguments: ['/test-space/scripts/mock-mcp-server.mjs'],
          environmentCredentialIds: {}
        }
      },
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      hasCredentials: {}
    }
    const connectorRecord = {
      connector: {
        id: 'connector.tc-p1-local',
        name: 'Local HTTP connector',
        type: 'http' as const,
        baseUrl: 'http://127.0.0.1:43118',
        authentication: { type: 'none' as const },
        enabled: true,
        timeoutMs: 5_000,
        maxRetries: 0,
        revision: 1,
        createdAt: 1,
        updatedAt: 1
      },
      hasCredential: false
    }
    const compiler = new DshAgentRunAdmissionCompiler({
      defaultCwd: '/workspace/default',
      runtime: {
        resolve: async () => ({
          mcpServerIds: ['mcp.tc-p1-local'],
          connectorIds: ['connector.tc-p1-local'],
          mcpServerRecords: [mcpRecord],
          connectorRecords: [connectorRecord]
        })
      }
    })

    const admission = await compiler.compile({
      runId: 'run-connectors',
      owner: { conversationId: 'conversation-connectors' },
      context: {
        conversationId: 'conversation-connectors',
        messages: [{ role: 'user', content: 'Call MCP ping' }],
        mcpServerIds: ['mcp.tc-p1-local'],
        connectorBindings: [
          { service: 'http', connectorId: 'connector.tc-p1-local' }
        ]
      },
      model: modelConfig()
    })

    expect(admission.mcpServers).toEqual([
      {
        name: 'Local mock MCP',
        command: '/usr/bin/node',
        args: ['/test-space/scripts/mock-mcp-server.mjs'],
        env: []
      }
    ])
    expect(admission.manifestInput).toMatchObject({
      authorizedMcpServerIds: ['mcp.tc-p1-local'],
      authorizedConnectorIds: ['connector.tc-p1-local'],
      mcpServerRecords: [mcpRecord],
      connectorRecords: [connectorRecord]
    })
  })

  it('compiles a Streamable HTTP MCP record into the complete ACP declaration', async () => {
    const compiler = new DshAgentRunAdmissionCompiler({
      runtime: {
        resolve: async () => ({
          mcpServerIds: ['mcp.tc-p1-http'],
          mcpServerRecords: [
            {
              configuration: {
                id: 'mcp.tc-p1-http',
                name: 'Local HTTP MCP',
                identity: 'b'.repeat(64),
                enabled: true,
                transport: {
                  kind: 'streamable_http',
                  url: 'http://127.0.0.1:43119/mcp',
                  headerCredentialIds: {}
                }
              },
              revision: 1,
              createdAt: 1,
              updatedAt: 1,
              hasCredentials: {}
            }
          ]
        })
      }
    })

    const admission = await compiler.compile({
      runId: 'run-http-mcp',
      owner: { conversationId: 'conversation-http-mcp' },
      context: {
        conversationId: 'conversation-http-mcp',
        messages: [{ role: 'user', content: 'Call HTTP MCP' }],
        mcpServerIds: ['mcp.tc-p1-http']
      },
      model: modelConfig()
    })

    expect(admission.mcpServers).toEqual([
      {
        name: 'Local HTTP MCP',
        type: 'http',
        url: 'http://127.0.0.1:43119/mcp',
        headers: []
      }
    ])
  })

  it('preserves namespaced catalog model profile IDs in accepted run manifests', async () => {
    const compiler = new DshAgentRunAdmissionCompiler({
      defaultCwd: '/workspace/default',
      knowledge: {
        resolve: async () => knowledgeManifest()
      }
    })

    const admission = await compiler.compile({
      runId: 'run-1',
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      context: conversationContext(),
      model: {
        ...modelConfig(),
        providerId: 'builtin-deepseek',
        catalogProviderId: 'deepseek',
        modelProfileId: 'builtin-deepseek:deepseek-flash',
        modelId: 'deepseek-flash',
        displayName: 'DeepSeek-V4.1-Flash',
        capabilities: {
          text: true,
          vision: true,
          toolCalling: true,
          structuredOutput: true
        }
      }
    })

    expect(admission.manifestInput.model).toMatchObject({
      providerId: 'builtin-deepseek',
      profileId: 'builtin-deepseek:deepseek-flash',
      modelId: 'deepseek-flash',
      options: {
        capabilities: {
          vision: true
        }
      }
    })
    expect(admission.configOptions).toContainEqual({
      configId: 'model',
      value: JSON.stringify(['deepseek-official', 'deepseek-flash'])
    })
    expect(() =>
      sealDshRunManifest({
        schemaVersion: 1,
        manifestId: 'manifest-run-1',
        runId: 'run-1',
        sessionId: 'session-1',
        owner: { conversationId: 'conversation-1', workspaceId: 'workspace-1' },
        model: admission.manifestInput.model!,
        tools: [],
        skills: [],
        agents: [],
        mcpServers: [],
        connectors: [],
        context: {
          ...admission.manifestInput.context,
          attachments: []
        },
        knowledge: admission.manifestInput.knowledge,
        policy: admission.manifestInput.policy,
        budget: admission.manifestInput.budget,
        productCommands: [],
        credentialReferences: admission.manifestInput.credentialReferences
      })
    ).not.toThrow()
  })

  it('admits a non-vision image attachment as local OCR text without manifest image access', async () => {
    const compiler = new DshAgentRunAdmissionCompiler({
      defaultCwd: '/workspace/default',
      knowledge: {
        resolve: async () => ({ ...knowledgeManifest(), enabled: false })
      }
    })

    const admission = await compiler.compile({
      runId: 'run-ocr-image',
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      context: {
        ...conversationContext(),
        attachmentContext: {
          attachments: [
            {
              attachmentId: 'image-ocr-1',
              fileName: 'scan.png',
              mimeType: 'image/png',
              kind: 'image',
              status: 'ready',
              extraction: 'ocr',
              content: '[内容单元 content: scan.png]\nTC-P0-049 OCR text'
            }
          ],
          contextText:
            '[附件 image-ocr-1: scan.png]\n[内容单元 content: scan.png]\nTC-P0-049 OCR text',
          imageParts: [],
          errors: []
        }
      },
      model: {
        ...modelConfig(),
        capabilities: {
          text: true,
          vision: false,
          toolCalling: false,
          structuredOutput: false
        }
      }
    })

    expect(admission.prompt).toEqual([
      {
        type: 'text',
        text: [
          '## Local attachment context',
          '[附件 image-ocr-1: scan.png，已本地 OCR]',
          '[内容单元 content: scan.png]',
          'TC-P0-049 OCR text',
          '',
          '## User request',
          'Ship this feature'
        ].join('\n')
      }
    ])
    expect(admission.manifestInput.context.attachments).toEqual([])
    expect(() =>
      sealDshRunManifest({
        schemaVersion: 1,
        manifestId: 'manifest-run-ocr-image',
        runId: 'run-ocr-image',
        sessionId: 'session-1',
        owner: { conversationId: 'conversation-1', workspaceId: 'workspace-1' },
        model: admission.manifestInput.model!,
        tools: [],
        skills: [],
        agents: [],
        mcpServers: [],
        connectors: [],
        context: admission.manifestInput.context,
        knowledge: admission.manifestInput.knowledge,
        policy: admission.manifestInput.policy,
        budget: admission.manifestInput.budget,
        productCommands: [],
        credentialReferences: admission.manifestInput.credentialReferences
      })
    ).not.toThrow()
  })

  it('grants only the managed file path for a locally extracted document attachment', async () => {
    const managedPath = '/managed/conversation-attachments/blobs/document-1'
    const compiler = new DshAgentRunAdmissionCompiler({
      defaultCwd: '/workspace/default',
      knowledge: {
        resolve: async () => ({ ...knowledgeManifest(), enabled: false })
      }
    })
    const context = conversationContext()
    context.attachmentContext = {
      attachments: [
        {
          attachmentId: 'document-1',
          fileName: 'requirements.txt',
          mimeType: 'text/plain',
          kind: 'document',
          status: 'ready',
          extraction: 'text',
          content: 'TC-P1-009-DOCUMENT-MARKER',
          digest: '4'.repeat(64),
          path: managedPath
        } as unknown as PreparedConversationAttachment
      ],
      contextText:
        '[附件 document-1: requirements.txt]\nTC-P1-009-DOCUMENT-MARKER',
      imageParts: [],
      errors: []
    }

    const admission = await compiler.compile({
      runId: 'run-document-attachment',
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      context,
      model: modelConfig()
    })

    expect(admission.manifestInput.context.roots).toContainEqual({
      rootId: expect.stringMatching(/^attachment-root-/),
      path: managedPath,
      access: 'read-only'
    })
    expect(admission.manifestInput.context.attachments).toEqual([
      {
        attachmentId: 'document-1',
        kind: 'file',
        path: managedPath,
        digest: '4'.repeat(64)
      }
    ])
    expect(() =>
      sealDshRunManifest({
        schemaVersion: 1,
        manifestId: 'manifest-run-document-attachment',
        runId: 'run-document-attachment',
        sessionId: 'session-1',
        owner: { conversationId: 'conversation-1', workspaceId: 'workspace-1' },
        model: admission.manifestInput.model!,
        tools: [],
        skills: [],
        agents: [],
        mcpServers: [],
        connectors: [],
        context: admission.manifestInput.context,
        knowledge: admission.manifestInput.knowledge,
        policy: admission.manifestInput.policy,
        budget: admission.manifestInput.budget,
        productCommands: [],
        credentialReferences: admission.manifestInput.credentialReferences
      })
    ).not.toThrow()
  })

  it('authorizes the DSH shell tool through the RealmFlow process runtime manifest entry', async () => {
    const compiler = new DshAgentRunAdmissionCompiler({
      defaultCwd: '/workspace/default',
      knowledge: {
        resolve: async () => knowledgeManifest()
      }
    })

    const admission = await compiler.compile({
      runId: 'run-1',
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      context: conversationContext(),
      model: modelConfig()
    })

    expect(admission.manifestInput.selectedToolIds).toContain(
      'builtin.process.run'
    )
    expect(admission.manifestInput.authorizedToolRefs).toContainEqual({
      kind: 'tool',
      id: 'builtin.process.run',
      version: '1.0.4',
      digest: 'd1c24c0ca22034b1e63771ec94f8aa10a1033d36914593f0754d05cc8798b86b'
    })
  })

  it('authorizes the builtin conversational Agent profile for DSH subagent delegation', async () => {
    const compiler = new DshAgentRunAdmissionCompiler({
      defaultCwd: '/workspace/default',
      knowledge: {
        resolve: async () => knowledgeManifest()
      }
    })

    const admission = await compiler.compile({
      runId: 'run-1',
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      context: conversationContext(),
      model: modelConfig()
    })

    expect(admission.manifestInput.authorizedAgentIds).toEqual([
      'builtin.general'
    ])
    expect(admission.manifestInput.agentProfiles).toEqual([
      expect.objectContaining({
        profileId: 'builtin.general',
        budgets: expect.objectContaining({
          maxSubagents: expect.any(Number)
        })
      })
    ])
  })

  it('injects processed space knowledge context into the DSH prompt without embedding unrelated raw context text', async () => {
    const compiler = new DshAgentRunAdmissionCompiler({
      defaultCwd: '/workspace/default',
      knowledge: {
        resolve: async () => ({
          ...knowledgeManifest(),
          enabled: true,
          scope: { kind: 'workspace', workspaceId: 'workspace-1' },
          workspaceIds: ['workspace-1'],
          generationIds: ['generation-1'],
          sourceKinds: ['file'],
          limits: {
            maxQueries: 8,
            topKPerQuery: 8,
            maxReturnedChunks: 8,
            maxContextCharacters: 32_768
          }
        })
      }
    })

    const admission = await compiler.compile({
      runId: 'run-knowledge',
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      context: {
        ...conversationContext(),
        context: 'RAW-CONTEXT-SHOULD-NOT-BE-EMBEDDED',
        processing: {
          knowledgeContext: {
            content:
              '## Space knowledge: Private note\nTC-P0-044-SPACE-KNOWLEDGE-CODEWORD\n',
            allowedReferenceIds: ['point-1'],
            insufficientKnowledge: false
          }
        } as ConversationContext['processing']
      },
      model: modelConfig()
    })

    expect(admission.prompt).toEqual([
      {
        type: 'text',
        text: [
          '## Space knowledge',
          '## Space knowledge: Private note',
          'TC-P0-044-SPACE-KNOWLEDGE-CODEWORD',
          '',
          '## User request',
          'Ship this feature'
        ].join('\n')
      },
      {
        type: 'image',
        data: 'ignored',
        mimeType: 'image/png'
      }
    ])
    expect(JSON.stringify(admission.prompt)).not.toContain(
      'RAW-CONTEXT-SHOULD-NOT-BE-EMBEDDED'
    )
  })
})

function conversationContext(): ConversationContext {
  return {
    conversationId: 'conversation-1',
    workspaceId: 'workspace-1',
    folderPath: '/workspace/one',
    approvalProfileId: 'cautious',
    context:
      'Deterministic product context. LIVE-KNOWLEDGE-CHUNK must stay out of prompt text. dsh-session-1',
    messages: [
      { role: 'assistant', content: 'Previous answer' },
      { role: 'user', content: 'Ship this feature' }
    ],
    skill: {
      kind: 'skill',
      id: 'builtin.skill.review',
      version: '1.0.0',
      digest: '2'.repeat(64)
    },
    reasoning: 'high',
    attachmentContext: {
      attachments: [
        {
          attachmentId: 'doc-1',
          fileName: 'brief.md',
          mimeType: 'text/markdown',
          kind: 'document',
          status: 'ready',
          summary: {
            attachmentId: 'doc-1',
            sourceDigest: '1'.repeat(64),
            chunks: [],
            root: {
              id: 'doc-1:root',
              childIds: [],
              summary: 'Brief summary'
            }
          }
        },
        {
          attachmentId: 'image-1',
          fileName: 'screen.png',
          mimeType: 'image/png',
          kind: 'image',
          status: 'ready',
          digest: '3'.repeat(64)
        }
      ],
      contextText: 'Attachment text should not be embedded in prompt.',
      imageParts: [
        {
          attachmentId: 'image-1',
          mimeType: 'image/png',
          dataBase64: 'ignored'
        }
      ],
      errors: []
    }
  }
}

function modelConfig(): ModelExecutionConfig {
  return {
    providerType: 'openai_responses',
    providerId: 'provider-openai',
    modelProfileId: 'profile-gpt',
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-4.1',
    displayName: 'GPT',
    capabilities: {
      text: true,
      vision: true,
      toolCalling: true,
      structuredOutput: true
    },
    reasoningSupported: true,
    timeoutMs: 120_000,
    maxRetries: 2,
    maxConcurrency: 4,
    apiKey: 'sk-live-secret'
  }
}

function knowledgeManifest(): KnowledgeRuntimeManifest {
  return {
    kind: 'knowledge-runtime',
    enabled: false,
    scope: {
      kind: 'none'
    },
    snapshotId: 'knowledge-empty',
    workspaceIds: [],
    generationIds: [],
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
