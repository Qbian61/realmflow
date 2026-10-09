import { describe, expect, it } from 'vitest'
import {
  createCatalogKnowledgePoint,
  normalizeCatalogSearchQuery,
  projectSkillCatalogDocument,
  projectWorkflowTemplateCatalogDocument
} from './catalog-knowledge'
import { createIsolatedVectorIndexProfile } from './vector-index-profile'

describe('catalog knowledge', () => {
  it('projects a published workflow template deterministically', () => {
    const template = workflowTemplate()
    const first = projectWorkflowTemplateCatalogDocument(template)
    const second = projectWorkflowTemplateCatalogDocument({
      ...template,
      currentVersion: {
        ...template.currentVersion,
        nodes: [...template.currentVersion.nodes].reverse()
      }
    })

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      kind: 'workflow_template',
      catalogId: 'template-1',
      versionId: 'template-1-v2',
      sourceVersion: '2',
      title: 'Release delivery',
      content:
        '# Release delivery\n\n' +
        'Ship a validated release.\n\n' +
        '## Nodes\n\n' +
        '- Analyze [ai_generate]: Discover scope; ' +
        'permissions=filesystem.read:space; output=analysis.md (analysis)\n' +
        '- Approve [approval]: Confirm release; output=none\n\n' +
        '## Edges\n\n' +
        '- analyze -> approve',
      checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    })
  })

  it('excludes draft and archived workflow templates', () => {
    const template = workflowTemplate()

    expect(
      projectWorkflowTemplateCatalogDocument({
        ...template,
        status: 'draft'
      })
    ).toBeNull()
    expect(
      projectWorkflowTemplateCatalogDocument({
        ...template,
        status: 'archived'
      })
    ).toBeNull()
  })

  it('projects only the enabled verified current Skill version', () => {
    const record = skillRecord()

    expect(projectSkillCatalogDocument(record)).toMatchObject({
      kind: 'skill' as const,
      catalogId: 'com.example.planning',
      versionId: 'skill-v2',
      sourceVersion: '2.0.0',
      title: 'Planning',
      content:
        '# Planning\n\nGenerate a release plan.\n\n' +
        '## Input Schema\n\n{"properties":{"goal":{"type":"string"}},"type":"object"}\n\n' +
        '## Output Schema\n\n{"properties":{"plan":{"type":"string"}},"type":"object"}\n\n' +
        '## Permissions\n\nfilesystem.read, repository.modify\n\n' +
        '## Network\n\nnone'
    })
  })

  it('excludes disabled, corrupt, missing and non-current Skill versions', () => {
    const record = skillRecord()

    expect(
      projectSkillCatalogDocument({
        ...record,
        skill: { ...record.skill, enabled: false }
      })
    ).toBeNull()
    expect(
      projectSkillCatalogDocument({
        ...record,
        versions: record.versions.map((item) =>
          item.version.id === 'skill-v2'
            ? {
                ...item,
                integrity: {
                  ...item.integrity,
                  status: 'corrupted'
                }
              }
            : item
        )
      })
    ).toBeNull()
    expect(
      projectSkillCatalogDocument({
        ...record,
        skill: { ...record.skill, currentVersionId: 'missing' }
      })
    ).toBeNull()
  })

  it('creates a stable catalog point with Dense and BM25 vectors', () => {
    const document = projectWorkflowTemplateCatalogDocument(
      workflowTemplate()
    )!
    const profile = createIsolatedVectorIndexProfile('catalog-test')
    const point = createCatalogKnowledgePoint({
      document,
      profile,
      dense: [1, ...Array(767).fill(0)]
    })

    expect(point).toEqual({
      id: expect.stringMatching(
        /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
      ),
      vector: {
        dense: [1, ...Array(767).fill(0)],
        bm25: { text: document.content, model: 'qdrant/bm25' }
      },
      payload: {
        schemaVersion: 1,
        profileId: profile.id,
        catalogKind: 'workflow_template',
        catalogId: 'template-1',
        versionId: 'template-1-v2',
        sourceVersion: '2',
        title: document.title,
        content: document.content,
        checksum: document.checksum,
        updatedAt: 200
      }
    })
    expect(
      createCatalogKnowledgePoint({
        document,
        profile,
        dense: [1, ...Array(767).fill(0)]
      }).id
    ).toBe(point.id)
  })

  it('normalizes catalog search without accepting collection or filters', () => {
    expect(
      normalizeCatalogSearchQuery({
        query: '  release planning ',
        kind: 'skill' as const,
        topK: 5
      })
    ).toEqual({
      query: 'release planning',
      kind: 'skill' as const,
      topK: 5
    })
    expect(() =>
      normalizeCatalogSearchQuery({
        query: 'release',
        collection: 'realmflow_workspace_knowledge_v1'
      })
    ).toThrow('Catalog search query is invalid')
  })
})

function workflowTemplate() {
  return {
    id: 'template-1',
    name: 'Release delivery',
    description: 'Ship a validated release.',
    status: 'published' as const,
    updatedAt: 200,
    currentVersion: {
      id: 'template-1-v2',
      templateId: 'template-1',
      version: 2,
      status: 'published' as const,
      nodes: [
        {
          id: 'approve-id',
          stableKey: 'approve',
          type: 'approval' as const,
          name: 'Approve',
          description: 'Confirm release',
          order: 1,
          allowSkip: false
        },
        {
          id: 'analyze-id',
          stableKey: 'analyze',
          type: 'ai_generate' as const,
          name: 'Analyze',
          description: 'Discover scope',
          order: 0,
          allowSkip: false,
          configuration: {
            permissions: [
              { capability: 'filesystem.read' as const, scope: 'space' as const }
            ],
            artifact: {
              required: true,
              relativePath: 'analysis.md',
              kind: 'analysis'
            }
          }
        }
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'analyze-id',
          targetNodeId: 'approve-id'
        }
      ]
    }
  }
}

function skillRecord() {
  const version = (id: string, versionNumber: string) => ({
    version: {
      id,
      skillId: 'com.example.planning',
      version: versionNumber,
      name: 'Planning',
      description: 'Generate a release plan.',
      inputSchema: {
        type: 'object',
        properties: { goal: { type: 'string' } }
      },
      outputSchema: {
        properties: { plan: { type: 'string' } },
        type: 'object'
      },
      permissions: ['repository.modify', 'filesystem.read'],
      network: { required: false, services: [] }
    },
    integrity: {
      status: 'verified' as const,
      checkedAt: 200,
      message: 'verified'
    }
  })
  return {
    skill: {
      id: 'com.example.planning',
      enabled: true,
      currentVersionId: 'skill-v2',
      revision: 2,
      createdAt: 100,
      updatedAt: 200
    },
    versions: [version('skill-v1', '1.0.0'), version('skill-v2', '2.0.0')]
  }
}
