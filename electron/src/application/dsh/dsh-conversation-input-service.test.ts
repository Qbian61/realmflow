import { describe, expect, it } from 'vitest'
import type { KnowledgeRuntimeManifest } from '../../../../domain/dsh-run-manifest'
import type { ModelExecutionConfig } from '../../../../domain/model'
import type { ConversationContext } from '../../ai-run/application/ports'
import { DshConversationInputService } from './dsh-conversation-input-service'

describe('DshConversationInputService', () => {
  it('compiles chat input into a structured DSH envelope without leaking runtime secrets into prompt text', () => {
    const service = new DshConversationInputService()

    const envelope = service.compile({
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      context: conversationContext(),
      model: modelConfig(),
      knowledge: knowledgeManifest(),
      runtime: {
        agentPresetId: 'agent-default',
        mcpServerIds: ['mcp-docs'],
        connectorIds: ['connector-docs'],
        enabledCapabilityIds: ['builtin.files.read'],
        budgetProfileId: 'budget-standard',
        goalObjective: 'Ship the checkout improvement',
        customInstructions: 'Keep status updates concise.',
        productPolicy: 'Use RealmFlow product commands for product mutations.'
      },
      resourceLinks: [
        {
          uri: 'https://example.test/spec',
          name: 'Product spec'
        }
      ]
    })

    expect(envelope).toMatchObject({
      schemaVersion: 1,
      conversationId: 'conversation-1',
      owner: {
        conversationId: 'conversation-1',
        workspaceId: 'workspace-1'
      },
      route: {
        modelProfileId: 'profile-gpt',
        providerId: 'provider-openai',
        modelId: 'gpt-4.1',
        reasoningEffort: 'high'
      },
      runtime: {
        agentPresetId: 'agent-default',
        skillVersionRefs: [
          {
            kind: 'skill',
            id: 'builtin.skill.review',
            version: '1.0.0',
            digest: '2'.repeat(64)
          }
        ],
        connectorIds: ['connector-docs'],
        mcpServerIds: ['mcp-docs'],
        enabledCapabilityIds: ['builtin.files.read'],
        cwd: '/workspace/one',
        contextRootIds: ['workspace-1'],
        approvalMode: 'cautious',
        budgetProfileId: 'budget-standard',
        goalObjective: 'Ship the checkout improvement',
        customInstructions: 'Keep status updates concise.',
        productPolicy: 'Use RealmFlow product commands for product mutations.',
        responseLanguage: {
          locale: 'en',
          source: 'explicit_user_instruction'
        }
      },
      knowledge: knowledgeManifest()
    })
    expect(envelope.prompt.blocks).toEqual([
      {
        type: 'text',
        text: 'Ship this feature'
      },
      {
        type: 'resource_link',
        uri: 'https://example.test/spec',
        name: 'Product spec'
      },
      {
        type: 'image',
        attachmentId: 'image-1',
        mediaType: 'image/png'
      }
    ])
    expect(envelope.attachments).toEqual([
      {
        attachmentId: 'doc-1',
        kind: 'file',
        digest: '1'.repeat(64)
      },
      {
        attachmentId: 'image-1',
        kind: 'image',
        digest: '3'.repeat(64)
      },
      {
        attachmentId: 'resource-3d7d97d14835d9e5',
        kind: 'resource_link'
      }
    ])
    const serialized = JSON.stringify(envelope)
    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain('dsh-session-1')
    expect(serialized).not.toContain('LIVE-KNOWLEDGE-CHUNK')
  })

  it('rejects unsupported audio and embedded resource prompt blocks before run admission', () => {
    const service = new DshConversationInputService()
    const base = {
      owner: { conversationId: 'conversation-1' },
      context: conversationContext(),
      model: modelConfig(),
      knowledge: knowledgeManifest()
    }

    expect(() =>
      service.compile({
        ...base,
        promptBlocks: [
          {
            type: 'audio',
            attachmentId: 'audio-1',
            mediaType: 'audio/wav'
          }
        ]
      })
    ).toThrow(/unsupported prompt input.*audio/i)
    expect(() =>
      service.compile({
        ...base,
        promptBlocks: [
          {
            type: 'resource',
            text: 'embedded resource body'
          }
        ]
      })
    ).toThrow(/embedded resource prompt blocks are unsupported/i)
  })

  it('surfaces missing model route before the DSH run starts', () => {
    const service = new DshConversationInputService()

    expect(() =>
      service.compile({
        owner: { conversationId: 'conversation-1' },
        context: conversationContext(),
        knowledge: knowledgeManifest()
      })
    ).toThrow(/model route is required/i)
  })

  it('downgrades locally extracted images into text-only prompt context', () => {
    const service = new DshConversationInputService()

    const envelope = service.compile({
      owner: { conversationId: 'conversation-1' },
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
      },
      knowledge: { ...knowledgeManifest(), enabled: false }
    })

    expect(envelope.prompt.blocks).toEqual([
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
    expect(envelope.attachments).toEqual([])
  })

  it('adds locally extracted document content to the text prompt', () => {
    const service = new DshConversationInputService()

    const envelope = service.compile({
      owner: { conversationId: 'conversation-1' },
      context: {
        ...conversationContext(),
        attachmentContext: {
          attachments: [
            {
              attachmentId: 'document-1',
              fileName: 'requirements.txt',
              mimeType: 'text/plain',
              kind: 'document',
              status: 'ready',
              extraction: 'parser',
              content:
                '[内容单元 content: requirements.txt]\nTC-P1-009-DOCUMENT-MARKER',
              path: '/managed/conversation-attachments/blobs/document-1',
              digest: '4'.repeat(64)
            }
          ],
          contextText:
            '[附件 document-1: requirements.txt]\nTC-P1-009-DOCUMENT-MARKER',
          imageParts: [],
          errors: []
        }
      },
      model: modelConfig(),
      knowledge: { ...knowledgeManifest(), enabled: false }
    })

    expect(envelope.prompt.blocks).toEqual([
      {
        type: 'text',
        text: [
          '## Local attachment context',
          '[附件 document-1: requirements.txt，已本地抽取]',
          '[内容单元 content: requirements.txt]',
          'TC-P1-009-DOCUMENT-MARKER',
          '',
          '## User request',
          'Ship this feature'
        ].join('\n')
      }
    ])
    expect(envelope.attachments).toEqual([
      {
        attachmentId: 'document-1',
        kind: 'file',
        path: '/managed/conversation-attachments/blobs/document-1',
        digest: '4'.repeat(64)
      }
    ])
  })
})

function conversationContext(): ConversationContext {
  return {
    conversationId: 'conversation-1',
    workspaceId: 'workspace-1',
    folderPath: '/workspace/one',
    approvalProfileId: 'cautious',
    systemPrompt: 'System policy: assist the user.',
    context:
      'Deterministic product context. LIVE-KNOWLEDGE-CHUNK must stay out of prompt text. dsh-session-1',
    messages: [
      { role: 'assistant', content: 'Previous reply' },
      { role: 'user', content: 'Ship this feature' }
    ],
    skill: {
      kind: 'skill',
      id: 'builtin.skill.review',
      version: '1.0.0',
      digest: '2'.repeat(64)
    },
    connectorBindings: [
      { service: 'http', connectorId: 'connector-docs' }
    ],
    reasoning: 'high',
    responseLanguage: {
      locale: 'en',
      source: 'explicit_user_instruction',
      confidence: 1,
      allowMixedLanguage: false
    },
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
    providerId: 'provider-openai',
    providerType: 'openai_responses',
    baseUrl: 'https://api.openai.com/v1',
    modelProfileId: 'profile-gpt',
    modelId: 'gpt-4.1',
    timeoutMs: 120_000,
    maxRetries: 2,
    maxConcurrency: 4,
    apiKey: 'sk-secret'
  }
}

function knowledgeManifest(): KnowledgeRuntimeManifest {
  return {
    kind: 'knowledge-runtime',
    enabled: true,
    scope: {
      kind: 'workspace',
      workspaceId: 'workspace-1'
    },
    snapshotId: 'knowledge-snapshot-1',
    workspaceIds: ['workspace-1'],
    generationIds: ['generation-1'],
    sourceKinds: ['note'],
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
      maxQueries: 8,
      topKPerQuery: 8,
      maxReturnedChunks: 12,
      maxContextCharacters: 24_000
    }
  }
}
