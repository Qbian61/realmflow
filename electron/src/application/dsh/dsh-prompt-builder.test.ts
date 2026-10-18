import { describe, expect, it } from 'vitest'
import type { DshConversationInputEnvelope } from '../../../../shared/dsh-conversation-input-contract'
import { buildDshPromptBlocks } from './dsh-prompt-builder'

describe('buildDshPromptBlocks', () => {
  it('preserves ACP prompt block order for text, resource links, and supported images', () => {
    const blocks = buildDshPromptBlocks(envelope(), imageParts())

    expect(blocks).toEqual([
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
        data: 'aW1hZ2U=',
        mimeType: 'image/png'
      }
    ])
  })

  it('adds selected Skill instructions without exposing policy metadata', () => {
    const blocks = buildDshPromptBlocks(
      {
        ...envelope(),
        runtime: {
          ...envelope().runtime,
          systemPrompt: 'System policy should be configured outside turn text.',
          productPolicy: 'Use Product Commands for product mutation.',
          approvalMode: 'manual',
          customInstructions: 'Custom instructions stay structured.'
        }
      },
      imageParts()
    )

    const serializedPrompt = JSON.stringify(blocks)
    expect(serializedPrompt).not.toContain('System policy')
    expect(serializedPrompt).not.toContain('Product Commands')
    expect(serializedPrompt).not.toContain('manual')
    expect(serializedPrompt).not.toContain('credential-openai')
    expect(serializedPrompt).not.toContain('dsh-session')
    expect(blocks[0]).toEqual({
      type: 'text',
      text: [
        '## Selected Skill instructions',
        'Custom instructions stay structured.',
        '',
        '## User request',
        'Ship this feature'
      ].join('\n')
    })
  })

  it('rejects unsupported prompt block types instead of forwarding them to ACP', () => {
    expect(() =>
      buildDshPromptBlocks({
        ...envelope(),
        prompt: {
          blocks: [
            {
              type: 'audio',
              attachmentId: 'audio-1',
              mediaType: 'audio/wav'
            }
          ]
        }
      } as unknown as DshConversationInputEnvelope)
    ).toThrow(/unsupported prompt input.*audio/i)
  })
})

function imageParts() {
  return [
    {
      attachmentId: 'image-1',
      mimeType: 'image/png',
      dataBase64: 'aW1hZ2U='
    }
  ]
}

function envelope(): DshConversationInputEnvelope {
  return {
    schemaVersion: 1,
    conversationId: 'conversation-1',
    owner: {
      conversationId: 'conversation-1',
      workspaceId: 'workspace-1'
    },
    prompt: {
      blocks: [
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
      ]
    },
    route: {
      modelProfileId: 'profile-gpt',
      providerId: 'provider-openai',
      modelId: 'gpt-4.1',
      reasoningEffort: 'high'
    },
    runtime: {
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
      approvalMode: 'protected',
      budgetProfileId: 'budget-standard',
      goalObjective: 'Ship this feature'
    },
    knowledge: {
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
    },
    attachments: [
      {
        attachmentId: 'image-1',
        kind: 'image'
      }
    ]
  }
}
