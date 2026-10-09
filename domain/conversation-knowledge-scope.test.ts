import { describe, expect, it } from 'vitest'
import {
  assertConversationKnowledgeScopeBindings,
  parseConversationKnowledgeScope,
  serializeConversationKnowledgeScope
} from './conversation-knowledge-scope'

describe('conversation knowledge scope', () => {
  it.each([
    [{ kind: 'none' } as const],
    [{ kind: 'all_workspaces' } as const],
    [{ kind: 'workspace', workspaceId: 'workspace-1' } as const],
    [{ kind: 'node_configuration' } as const]
  ])('round trips %j through persisted JSON', (scope) => {
    expect(parseConversationKnowledgeScope(serializeConversationKnowledgeScope(scope)))
      .toEqual(scope)
  })

  it.each([
    [
      {
        kind: 'general' as const,
        knowledgeScope: { kind: 'none' as const }
      }
    ],
    [
      {
        kind: 'general' as const,
        knowledgeScope: { kind: 'all_workspaces' as const }
      }
    ],
    [
      {
        kind: 'general' as const,
        folderPath: '/tmp/project',
        knowledgeScope: { kind: 'none' as const }
      }
    ],
    [
      {
        kind: 'space' as const,
        workspaceId: 'workspace-1',
        knowledgeScope: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1'
        }
      }
    ],
    [
      {
        kind: 'requirement_node' as const,
        workspaceId: 'workspace-1',
        requirementId: 'requirement-1',
        nodeRunId: 'node-run-1',
        knowledgeScope: { kind: 'node_configuration' as const }
      }
    ]
  ])('accepts a valid conversation binding %#', (binding) => {
    expect(() => assertConversationKnowledgeScopeBindings(binding)).not.toThrow()
  })

  it.each([
    {
      kind: 'general' as const,
      knowledgeScope: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1'
      }
    },
    {
      kind: 'general' as const,
      folderPath: '/tmp/project',
      knowledgeScope: { kind: 'all_workspaces' as const }
    },
    {
      kind: 'space' as const,
      workspaceId: 'workspace-1',
      knowledgeScope: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-2'
      }
    },
    {
      kind: 'requirement_node' as const,
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      nodeRunId: 'node-run-1',
      knowledgeScope: { kind: 'none' as const }
    }
  ])('rejects an invalid conversation binding %#', (binding) => {
    expect(() => assertConversationKnowledgeScopeBindings(binding)).toThrow(
      'Conversation knowledge scope does not match its bindings'
    )
  })

  it.each([
    '{}',
    '{"kind":"workspace"}',
    '{"kind":"workspace","workspaceId":" "}',
    '{"kind":"all_workspaces","workspaceIds":["workspace-1"]}',
    '{"kind":"node_configuration","workspaceId":"workspace-1"}',
    'not-json'
  ])('rejects invalid persisted scope %s', (value) => {
    expect(() => parseConversationKnowledgeScope(value)).toThrow(
      'Conversation knowledge scope is invalid'
    )
  })
})
