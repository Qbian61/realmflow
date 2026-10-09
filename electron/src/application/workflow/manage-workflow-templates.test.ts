import { describe, expect, it, vi } from 'vitest'
import type { WorkflowNodeConfiguration } from '../../../../domain/workflow'
import type {
  Revisioned,
  SaveResult,
  WorkflowTemplateRecord,
  WorkflowTemplateVersionRecord
} from '../ports/business-repositories'
import {
  ManageWorkflowTemplatesUseCase,
  type WorkflowTemplateLifecycleRepository
} from './manage-workflow-templates'

describe('ManageWorkflowTemplatesUseCase', () => {
  it('creates an idempotent normalized draft with version one', async () => {
    const repository = new InMemoryWorkflowTemplateRepository()
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 100)

    const created = await useCase.create({
      id: 'template-1',
      name: '  Delivery  ',
      description: '  Standard flow  '
    })
    const repeated = await useCase.create({
      id: 'template-1',
      name: 'Delivery',
      description: 'Standard flow'
    })

    expect(created).toMatchObject({
      id: 'template-1',
      name: 'Delivery',
      description: 'Standard flow',
      status: 'draft',
      revision: 1,
      currentVersion: {
        id: 'template-1-v1',
        version: 1,
        status: 'draft',
        nodes: [],
        edges: []
      }
    })
    expect(repeated).toEqual(created)
    expect(repository.saveDraftCalls).toBe(1)
  })

  it('deep copies the source current version into an independent draft', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([
      publishedTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 200)

    const copied = await useCase.copy({
      id: 'template-copy',
      sourceTemplateId: 'source-template',
      name: 'Copied delivery'
    })

    expect(copied).toMatchObject({
      id: 'template-copy',
      name: 'Copied delivery',
      status: 'draft',
      currentVersion: {
        id: 'template-copy-v1',
        version: 1,
        status: 'draft',
        nodes: [
          {
            id: 'template-copy-v1-node-analysis',
            stableKey: 'analysis',
            name: 'Analysis',
            position: { x: 120, y: 80 }
          }
        ],
        edges: []
      }
    })
    expect(copied.currentVersion.nodes[0]).not.toBe(
      repository.records.get('source-template')?.currentVersion.nodes[0]
    )
  })

  it('copies the selected historical version instead of the current version', async () => {
    const source = publishedTemplate()
    source.currentVersion.version = 2
    source.currentVersion.id = 'source-template-v2'
    source.currentVersion.nodes[0].name = 'Current analysis'
    const historical = structuredClone(source.currentVersion)
    historical.id = 'source-template-v1'
    historical.version = 1
    historical.nodes[0].name = 'Historical analysis'
    const repository = new InMemoryWorkflowTemplateRepository([source])
    repository.versions.set(historical.id, historical)
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 200)

    const copied = await useCase.copy({
      id: 'template-copy',
      sourceTemplateId: 'source-template',
      sourceVersionId: historical.id,
      name: 'Copied history'
    })

    expect(copied.currentVersion.nodes[0].name).toBe('Historical analysis')
  })

  it('creates the next version number from selected historical content', async () => {
    const source = publishedTemplate()
    source.currentVersion.version = 2
    source.currentVersion.id = 'source-template-v2'
    source.currentVersion.nodes[0].name = 'Current analysis'
    const historical = structuredClone(source.currentVersion)
    historical.id = 'source-template-v1'
    historical.version = 1
    historical.nodes[0].name = 'Historical analysis'
    const repository = new InMemoryWorkflowTemplateRepository([source])
    repository.versions.set(historical.id, historical)
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 300)

    const created = await useCase.createNextVersion({
      id: source.id,
      sourceVersionId: historical.id,
      expectedRevision: source.revision
    })

    expect(created.currentVersion).toMatchObject({
      id: 'source-template-v3',
      version: 3,
      status: 'draft',
      nodes: [expect.objectContaining({ name: 'Historical analysis' })]
    })
  })

  it('updates draft metadata with compare-and-swap', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([draftTemplate()])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 300)

    await expect(
      useCase.update({
        id: 'template-1',
        expectedRevision: 1,
        name: '  Updated  ',
        description: '  Refined  '
      })
    ).resolves.toMatchObject({
      name: 'Updated',
      description: 'Refined',
      revision: 2,
      updatedAt: 300
    })
  })

  it('publishes and archives through the allowed lifecycle', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([
      publishableDraftTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 400)

    const published = await useCase.publish({
      id: 'template-1',
      expectedRevision: 1
    })
    const archived = await useCase.archive({
      id: 'template-1',
      expectedRevision: published.revision
    })

    expect(published).toMatchObject({
      status: 'published',
      revision: 2,
      currentVersion: {
        status: 'published',
        publishedAt: 400,
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    })
    expect(archived).toMatchObject({
      status: 'archived',
      revision: 3,
      currentVersion: { status: 'archived', publishedAt: 400 }
    })
  })

  it('synchronizes published and archived records through the catalog lifecycle port', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([
      publishableDraftTemplate()
    ])
    const catalog = {
      syncWorkflowTemplate: vi.fn(async () => undefined)
    }
    const useCase = new ManageWorkflowTemplatesUseCase(
      repository,
      () => 400,
      catalog
    )

    const published = await useCase.publish({
      id: 'template-1',
      expectedRevision: 1
    })
    const archived = await useCase.archive({
      id: 'template-1',
      expectedRevision: published.revision
    })

    expect(catalog.syncWorkflowTemplate).toHaveBeenNthCalledWith(
      1,
      published
    )
    expect(catalog.syncWorkflowTemplate).toHaveBeenNthCalledWith(
      2,
      archived
    )
  })

  it('rejects invalid publication with structured issues and no write', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([draftTemplate()])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(
      useCase.publish({ id: 'template-1', expectedRevision: 1 })
    ).rejects.toMatchObject({
      name: 'WorkflowTemplatePublicationValidationError',
      message: '模板发布校验失败',
      validation: {
        valid: false,
        issues: [
          {
            code: 'empty_graph',
            message: '流程模板至少需要一个节点',
            scope: 'graph'
          }
        ]
      }
    })
    expect(repository.setStatusCalls).toBe(0)
  })

  it('rejects empty names, illegal states and stale revisions without writes', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([
      draftTemplate(),
      archivedTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(useCase.create({ id: 'empty', name: '   ' })).rejects.toThrow(
      'Workflow template name is required'
    )
    await expect(
      useCase.update({
        id: 'archived-template',
        expectedRevision: 1,
        name: 'Changed'
      })
    ).rejects.toThrow('Only draft workflow templates can be edited')
    await expect(
      useCase.publish({ id: 'template-1', expectedRevision: 0 })
    ).rejects.toThrow('Workflow template revision conflict')
    await expect(
      useCase.archive({ id: 'template-1', expectedRevision: 1 })
    ).rejects.toThrow('Only published workflow templates can be archived')

    expect(repository.saveDraftCalls).toBe(0)
    expect(repository.setStatusCalls).toBe(0)
  })

  it('treats repeated state transitions as idempotent', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([
      publishedTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    const published = await useCase.publish({
      id: 'source-template',
      expectedRevision: 0
    })

    expect(published.status).toBe('published')
    expect(repository.setStatusCalls).toBe(0)
  })

  it('derives one idempotent next draft without changing the published version', async () => {
    const source = publishedTemplate()
    const repository = new InMemoryWorkflowTemplateRepository([source])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 500)

    const created = await useCase.createNextVersion({
      id: source.id,
      sourceVersionId: source.currentVersion.id,
      expectedRevision: source.revision
    })
    const repeated = await useCase.createNextVersion({
      id: source.id,
      sourceVersionId: source.currentVersion.id,
      expectedRevision: source.revision
    })

    expect(created).toMatchObject({
      id: source.id,
      status: 'draft',
      revision: 2,
      currentVersion: {
        id: 'source-template-v2',
        version: 2,
        status: 'draft',
        createdAt: 500,
        nodes: [
          {
            id: 'source-template-v2-node-analysis',
            stableKey: 'analysis',
            name: 'Analysis',
            position: { x: 120, y: 80 }
          }
        ]
      }
    })
    expect(repeated).toEqual(created)
    expect(await useCase.listVersions(source.id)).toEqual([
      created.currentVersion,
      source.currentVersion
    ])
    expect(await repository.getVersion(source.currentVersion.id)).toStrictEqual(
      source.currentVersion
    )
    expect(repository.saveDraftCalls).toBe(1)
  })

  it('rejects next-version creation from stale or non-published state', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([
      publishedTemplate(),
      draftTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(
      useCase.createNextVersion({
        id: 'source-template',
        sourceVersionId: 'different-version',
        expectedRevision: 1
      })
    ).rejects.toThrow('Workflow template source version changed')
    await expect(
      useCase.createNextVersion({
        id: 'source-template',
        sourceVersionId: 'source-template-v1',
        expectedRevision: 0
      })
    ).rejects.toThrow('Workflow template revision conflict')
    await expect(
      useCase.createNextVersion({
        id: 'template-1',
        sourceVersionId: 'template-1-v1',
        expectedRevision: 1
      })
    ).rejects.toThrow(
      'Only published workflow templates can create a new version'
    )

    expect(repository.saveDraftCalls).toBe(0)
  })

  it('adds, updates and idempotently copies nodes in a draft', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([draftTemplate()])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 600)

    const added = await useCase.addNode({
      id: 'template-1',
      expectedRevision: 1,
      node: {
        stableKey: ' analysis ',
        type: 'ai_generate',
        name: ' Analysis ',
        description: ' Discover scope ',
        allowSkip: false
      }
    })
    const updated = await useCase.updateNode({
      id: 'template-1',
      expectedRevision: 2,
      nodeId: 'template-1-v1-node-analysis',
      name: 'Product analysis',
      description: '',
      type: 'human_input',
      allowSkip: true
    })
    const copied = await useCase.copyNode({
      id: 'template-1',
      expectedRevision: 3,
      sourceNodeId: 'template-1-v1-node-analysis',
      stableKey: 'review',
      name: 'Review'
    })
    const repeated = await useCase.copyNode({
      id: 'template-1',
      expectedRevision: 3,
      sourceNodeId: 'template-1-v1-node-analysis',
      stableKey: 'review',
      name: 'Review'
    })

    expect(added.currentVersion.nodes).toEqual([
      expect.objectContaining({
        id: 'template-1-v1-node-analysis',
        stableKey: 'analysis',
        name: 'Analysis',
        description: 'Discover scope',
        order: 0
      })
    ])
    expect(updated.currentVersion.nodes[0]).toMatchObject({
      id: 'template-1-v1-node-analysis',
      stableKey: 'analysis',
      name: 'Product analysis',
      type: 'human_input',
      allowSkip: true
    })
    expect(copied.currentVersion.nodes).toEqual([
      expect.objectContaining({ stableKey: 'analysis', order: 0 }),
      expect.objectContaining({
        id: 'template-1-v1-node-review',
        stableKey: 'review',
        name: 'Review',
        order: 1
      })
    ])
    expect(repeated).toEqual(copied)
    expect(repository.saveDraftCalls).toBe(3)
  })

  it('updates node positions without changing execution order or checksum', async () => {
    const template = publishableDraftTemplate()
    template.currentVersion.nodes[0].position = { x: 0, y: 0 }
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 325)
    const updateNodePositions = (
      useCase as unknown as {
        updateNodePositions: (input: {
          id: string
          expectedRevision: number
          positions: Array<{
            nodeId: string
            position: { x: number; y: number }
          }>
        }) => Promise<Revisioned<WorkflowTemplateRecord>>
      }
    ).updateNodePositions.bind(useCase)

    const moved = await updateNodePositions({
      id: template.id,
      expectedRevision: template.revision,
      positions: [
        {
          nodeId: template.currentVersion.nodes[0].id,
          position: { x: 320, y: 180 }
        }
      ]
    })
    const repeated = await updateNodePositions({
      id: template.id,
      expectedRevision: template.revision,
      positions: [
        {
          nodeId: template.currentVersion.nodes[0].id,
          position: { x: 320, y: 180 }
        }
      ]
    })

    expect(moved).toMatchObject({
      revision: 2,
      updatedAt: 325,
      currentVersion: {
        checksum: template.currentVersion.checksum,
        nodes: [
          {
            id: template.currentVersion.nodes[0].id,
            order: 0,
            position: { x: 320, y: 180 }
          }
        ]
      }
    })
    expect(repeated).toEqual(moved)
    expect(repository.updateNodePositionsCalls).toBe(1)
  })

  it('rejects invalid, unknown, stale, and read-only node position updates', async () => {
    const draft = publishableDraftTemplate()
    draft.currentVersion.nodes[0].position = { x: 0, y: 0 }
    const repository = new InMemoryWorkflowTemplateRepository([
      draft,
      publishedTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(
      useCase.updateNodePositions({
        id: draft.id,
        expectedRevision: draft.revision,
        positions: [
          {
            nodeId: draft.currentVersion.nodes[0].id,
            position: { x: Number.NaN, y: 0 }
          }
        ]
      })
    ).rejects.toThrow('Workflow template node position is invalid')
    await expect(
      useCase.updateNodePositions({
        id: draft.id,
        expectedRevision: draft.revision,
        positions: [
          {
            nodeId: draft.currentVersion.nodes[0].id,
            position: { x: 0, y: 0 }
          },
          {
            nodeId: draft.currentVersion.nodes[0].id,
            position: { x: 20, y: 20 }
          }
        ]
      })
    ).rejects.toThrow('Workflow template node positions must be unique')
    await expect(
      useCase.updateNodePositions({
        id: draft.id,
        expectedRevision: draft.revision,
        positions: [
          {
            nodeId: 'missing-node',
            position: { x: 20, y: 20 }
          }
        ]
      })
    ).rejects.toThrow('Workflow template node not found: missing-node')
    await expect(
      useCase.updateNodePositions({
        id: draft.id,
        expectedRevision: 0,
        positions: [
          {
            nodeId: draft.currentVersion.nodes[0].id,
            position: { x: 20, y: 20 }
          }
        ]
      })
    ).rejects.toThrow('Workflow template revision conflict')
    await expect(
      useCase.updateNodePositions({
        id: 'source-template',
        expectedRevision: 1,
        positions: [
          {
            nodeId: 'source-analysis',
            position: { x: 20, y: 20 }
          }
        ]
      })
    ).rejects.toThrow('Only draft workflow templates can be edited')

    expect(repository.updateNodePositionsCalls).toBe(0)
  })

  it('removes a draft node with its edges and normalizes a complete reorder', async () => {
    const template = draftTemplate()
    template.currentVersion.nodes = [
      templateNode('analysis', 0),
      templateNode('design', 1),
      templateNode('testing', 2)
    ]
    template.currentVersion.edges = [
      {
        id: 'edge-analysis-design',
        sourceNodeId: template.currentVersion.nodes[0].id,
        targetNodeId: template.currentVersion.nodes[1].id
      },
      {
        id: 'edge-design-testing',
        sourceNodeId: template.currentVersion.nodes[1].id,
        targetNodeId: template.currentVersion.nodes[2].id
      }
    ]
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 700)

    const reordered = await useCase.reorderNodes({
      id: template.id,
      expectedRevision: 1,
      orderedNodeIds: [
        'template-1-v1-node-testing',
        'template-1-v1-node-analysis',
        'template-1-v1-node-design'
      ]
    })
    const removed = await useCase.removeNode({
      id: template.id,
      expectedRevision: 2,
      nodeId: 'template-1-v1-node-design'
    })

    expect(
      reordered.currentVersion.nodes.map((node) => [node.stableKey, node.order])
    ).toEqual([
      ['testing', 0],
      ['analysis', 1],
      ['design', 2]
    ])
    expect(removed.currentVersion.nodes.map((node) => node.stableKey)).toEqual([
      'testing',
      'analysis'
    ])
    expect(removed.currentVersion.edges).toEqual([])
  })

  it('atomically restores a removed node snapshot at its original order with related edges', async () => {
    const template = draftTemplate()
    const analysis = templateNode('analysis', 0)
    const review = {
      ...templateNode('review', 1),
      name: 'Review',
      description: 'Review the generated plan',
      allowSkip: true,
      position: { x: 420, y: 180 },
      configuration: completeNodeConfigurationSnapshot()
    }
    const delivery = templateNode('delivery', 2)
    template.currentVersion.nodes = [analysis, delivery]
    const edges = [
      {
        id: 'edge-analysis-review',
        sourceNodeId: analysis.id,
        targetNodeId: review.id
      },
      {
        id: 'edge-review-delivery',
        sourceNodeId: review.id,
        targetNodeId: delivery.id
      }
    ]
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 750)

    const restored = await useCase.restoreNode({
      id: template.id,
      expectedRevision: template.revision,
      node: review,
      edges
    })

    expect(restored).toMatchObject({
      revision: 2,
      updatedAt: 750,
      currentVersion: {
        nodes: [
          { stableKey: 'analysis', order: 0 },
          {
            id: review.id,
            stableKey: 'review',
            name: 'Review',
            description: 'Review the generated plan',
            order: 1,
            allowSkip: true,
            position: { x: 420, y: 180 },
            configuration: completeNodeConfigurationSnapshot()
          },
          { stableKey: 'delivery', order: 2 }
        ],
        edges
      }
    })
    expect(repository.saveDraftCalls).toBe(1)
  })

  it('rejects restoring a node with a stale revision without writing', async () => {
    const template = draftTemplate()
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(
      useCase.restoreNode({
        id: template.id,
        expectedRevision: 0,
        node: {
          ...templateNode('review', 0),
          position: { x: 420, y: 180 },
          configuration: completeNodeConfiguration()
        },
        edges: []
      })
    ).rejects.toThrow('Workflow template revision conflict')

    expect(repository.saveDraftCalls).toBe(0)
  })

  it('validates restored node identity and all related edges before writing', async () => {
    const expectRejected = async (
      nodePatch: Partial<ReturnType<typeof templateNode>>,
      edges: WorkflowTemplateVersionRecord['edges'],
      message: string,
      existingEdges: WorkflowTemplateVersionRecord['edges'] = []
    ) => {
      const template = draftTemplate()
      template.currentVersion.nodes = [
        templateNode('analysis', 0),
        templateNode('delivery', 1)
      ]
      template.currentVersion.edges = existingEdges
      const repository = new InMemoryWorkflowTemplateRepository([template])
      const useCase = new ManageWorkflowTemplatesUseCase(repository)

      await expect(
        useCase.restoreNode({
          id: template.id,
          expectedRevision: template.revision,
          node: {
            ...templateNode('review', 1),
            ...nodePatch
          },
          edges
        })
      ).rejects.toThrow(message)
      expect(repository.saveDraftCalls).toBe(0)
    }
    const analysisId = 'template-1-v1-node-analysis'
    const reviewId = 'template-1-v1-node-review'
    const deliveryId = 'template-1-v1-node-delivery'

    await expectRejected(
      { stableKey: 'bad key' },
      [],
      'Workflow template node stable key is invalid'
    )
    await expectRejected(
      { id: 'wrong-node-id' },
      [],
      'Workflow template node id does not match stable key'
    )
    await expectRejected(
      {},
      [
        {
          id: 'bad edge id',
          sourceNodeId: analysisId,
          targetNodeId: reviewId
        }
      ],
      'Workflow template edge id is invalid'
    )
    await expectRejected(
      {},
      [
        {
          id: 'edge-missing-review',
          sourceNodeId: 'missing-node',
          targetNodeId: reviewId
        }
      ],
      'Workflow template edge source node not found: missing-node'
    )
    await expectRejected(
      {},
      [
        {
          id: 'edge-analysis-review',
          sourceNodeId: analysisId,
          targetNodeId: reviewId
        },
        {
          id: 'edge-analysis-review-copy',
          sourceNodeId: analysisId,
          targetNodeId: reviewId
        }
      ],
      'Workflow template edge already exists'
    )
    await expectRejected(
      {},
      [
        {
          id: 'edge-analysis-review',
          sourceNodeId: analysisId,
          targetNodeId: reviewId
        },
        {
          id: 'edge-review-delivery',
          sourceNodeId: reviewId,
          targetNodeId: deliveryId
        }
      ],
      'Workflow template edge would create a cycle',
      [
        {
          id: 'edge-delivery-analysis',
          sourceNodeId: deliveryId,
          targetNodeId: analysisId
        }
      ]
    )
  })

  it('adds one deterministic edge and treats a lost-response retry as idempotent', async () => {
    const template = draftTemplate()
    template.currentVersion.nodes = [
      templateNode('analysis', 0),
      templateNode('design', 1)
    ]
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 800)

    const added = await useCase.addEdge({
      id: template.id,
      expectedRevision: 1,
      sourceNodeId: template.currentVersion.nodes[0].id,
      targetNodeId: template.currentVersion.nodes[1].id
    })
    const repeated = await useCase.addEdge({
      id: template.id,
      expectedRevision: 1,
      sourceNodeId: template.currentVersion.nodes[0].id,
      targetNodeId: template.currentVersion.nodes[1].id
    })

    expect(added.currentVersion.edges).toEqual([
      {
        id: expect.stringMatching(/^template-1-v1-edge-[a-f0-9]{16}$/),
        sourceNodeId: 'template-1-v1-node-analysis',
        targetNodeId: 'template-1-v1-node-design'
      }
    ])
    expect(added.updatedAt).toBe(800)
    expect(repeated).toEqual(added)
    expect(repository.saveDraftCalls).toBe(1)
  })

  it('rejects invalid, duplicate and cyclic edges without writes', async () => {
    const template = draftTemplate()
    template.currentVersion.nodes = [
      templateNode('analysis', 0),
      templateNode('design', 1),
      templateNode('testing', 2)
    ]
    template.currentVersion.edges = [
      {
        id: 'edge-analysis-design',
        sourceNodeId: template.currentVersion.nodes[0].id,
        targetNodeId: template.currentVersion.nodes[1].id
      },
      {
        id: 'edge-design-testing',
        sourceNodeId: template.currentVersion.nodes[1].id,
        targetNodeId: template.currentVersion.nodes[2].id
      }
    ]
    const repository = new InMemoryWorkflowTemplateRepository([
      template,
      publishedTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(
      useCase.addEdge({
        id: template.id,
        expectedRevision: 1,
        sourceNodeId: template.currentVersion.nodes[0].id,
        targetNodeId: template.currentVersion.nodes[0].id
      })
    ).rejects.toThrow('Workflow template edge cannot connect a node to itself')
    await expect(
      useCase.addEdge({
        id: template.id,
        expectedRevision: 1,
        sourceNodeId: 'missing',
        targetNodeId: template.currentVersion.nodes[1].id
      })
    ).rejects.toThrow('Workflow template edge source node not found: missing')
    await expect(
      useCase.addEdge({
        id: template.id,
        expectedRevision: 1,
        sourceNodeId: template.currentVersion.nodes[0].id,
        targetNodeId: template.currentVersion.nodes[1].id
      })
    ).rejects.toThrow('Workflow template edge already exists')
    await expect(
      useCase.addEdge({
        id: template.id,
        expectedRevision: 1,
        sourceNodeId: template.currentVersion.nodes[2].id,
        targetNodeId: template.currentVersion.nodes[0].id
      })
    ).rejects.toThrow('Workflow template edge would create a cycle')
    await expect(
      useCase.addEdge({
        id: 'source-template',
        expectedRevision: 1,
        sourceNodeId: 'source-analysis',
        targetNodeId: 'source-analysis'
      })
    ).rejects.toThrow('Only draft workflow templates can be edited')

    expect(repository.saveDraftCalls).toBe(0)
  })

  it('removes an edge idempotently and rejects an unknown current edge', async () => {
    const template = draftTemplate()
    template.currentVersion.nodes = [
      templateNode('analysis', 0),
      templateNode('design', 1)
    ]
    template.currentVersion.edges = [
      {
        id: 'edge-analysis-design',
        sourceNodeId: template.currentVersion.nodes[0].id,
        targetNodeId: template.currentVersion.nodes[1].id
      }
    ]
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 900)

    const removed = await useCase.removeEdge({
      id: template.id,
      expectedRevision: 1,
      edgeId: 'edge-analysis-design'
    })
    const repeated = await useCase.removeEdge({
      id: template.id,
      expectedRevision: 1,
      edgeId: 'edge-analysis-design'
    })

    expect(removed.currentVersion.edges).toEqual([])
    expect(repeated).toEqual(removed)
    await expect(
      useCase.removeEdge({
        id: template.id,
        expectedRevision: 2,
        edgeId: 'missing-edge'
      })
    ).rejects.toThrow('Workflow template edge not found: missing-edge')
    expect(repository.saveDraftCalls).toBe(1)
  })

  it('saves complete node configuration and derives runtime projections idempotently', async () => {
    const template = draftTemplate()
    template.currentVersion.nodes = [templateNode('analysis', 0)]
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 950)
    const configuration = completeNodeConfiguration()
    const normalized = completeNodeConfigurationSnapshot()

    const configured = await useCase.configureNode({
      id: template.id,
      expectedRevision: 1,
      nodeId: template.currentVersion.nodes[0].id,
      configuration
    })
    const repeated = await useCase.configureNode({
      id: template.id,
      expectedRevision: 1,
      nodeId: template.currentVersion.nodes[0].id,
      configuration
    })

    expect(configured).toMatchObject({
      revision: 2,
      updatedAt: 950,
      currentVersion: {
        nodes: [
          {
            allowSkip: true,
            configuration: {
              input: {
                includeRequirementBody: true,
                predecessorArtifacts: 'direct',
                includeSpaceKnowledge: true,
                attachments: ['attachments/brief.md']
              },
              prompt: 'Review the requirement.',
              model: { strategy: 'fixed', profileId: 'profile-1' },
              connectorIds: ['issue-tracker'],
              permissions: [
                { capability: 'filesystem.read', scope: 'requirement' }
              ],
              artifact: {
                required: true,
                relativePath: 'artifacts/analysis.md',
                kind: 'markdown'
              },
              todos: [{ title: 'Confirm scope', required: true }],
              completionGate: {
                requireApproval: true,
                customGateId: 'quality'
              },
              retry: { maxAttempts: 3, backoffMs: 1500 },
              skip: { allowed: true, requireReason: true }
            },
            executor: {
              kind: 'ai_generate',
              prompt: 'Review the requirement.',
              artifact: {
                relativePath: 'artifacts/analysis.md',
                kind: 'markdown'
              },
              context: { attachments: ['attachments/brief.md'] }
            },
            completionGate: {
              requireApproval: true,
              customGateId: 'quality'
            }
          }
        ]
      }
    })
    expect(repeated).toEqual(configured)
    expect(repository.saveDraftCalls).toBe(1)
  })

  it('normalizes a capability model strategy for deterministic routing', async () => {
    const template = draftTemplate()
    template.currentVersion.nodes = [templateNode('analysis', 0)]
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)
    const configuration = {
      ...completeNodeConfiguration(),
      model: {
        strategy: 'capability',
        requiredCapabilities: ['vision', 'text', 'structuredOutput'],
        minimumContextWindow: 32_000
      }
    } as unknown as WorkflowNodeConfiguration

    const configured = await useCase.configureNode({
      id: template.id,
      expectedRevision: 1,
      nodeId: template.currentVersion.nodes[0].id,
      configuration
    })

    expect(configured.currentVersion.nodes[0].configuration?.model).toEqual({
      strategy: 'capability',
      requiredCapabilities: ['text', 'vision', 'structuredOutput'],
      minimumContextWindow: 32_000
    })
  })

  it.each([
    ['empty AI prompt', { prompt: '   ' }, 'prompt is required'],
    [
      'missing fixed model',
      { model: { strategy: 'fixed', profileId: ' ' } },
      'fixed model profile is required'
    ],
    [
      'duplicate model capabilities',
      {
        model: {
          strategy: 'capability',
          requiredCapabilities: ['text', 'text'],
          minimumContextWindow: 32_000
        }
      },
      'model capabilities must be unique'
    ],
    [
      'invalid model context window',
      {
        model: {
          strategy: 'capability',
          requiredCapabilities: ['text'],
          minimumContextWindow: 0
        }
      },
      'model context window must be a positive integer'
    ],
    [
      'unsafe artifact path',
      {
        artifact: {
          required: true,
          relativePath: '../outside.md',
          kind: 'markdown'
        }
      },
      'artifact path is invalid'
    ],
    [
      'invalid permission',
      {
        permissions: [{ capability: 'network.admin', scope: 'requirement' }]
      },
      'permission capability is invalid'
    ],
    [
      'empty todo',
      { todos: [{ title: ' ', required: true }] },
      'todo title is required'
    ],
    [
      'invalid retry',
      { retry: { maxAttempts: 0, backoffMs: 0 } },
      'retry attempts must be between 1 and 10'
    ],
    [
      'inconsistent skip',
      { skip: { allowed: false, requireReason: true } },
      'skip reason cannot be required'
    ]
  ])('rejects %s without persisting', async (_name, patch, message) => {
    const template = draftTemplate()
    template.currentVersion.nodes = [templateNode('analysis', 0)]
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(
      useCase.configureNode({
        id: template.id,
        expectedRevision: 1,
        nodeId: template.currentVersion.nodes[0].id,
        configuration: {
          ...completeNodeConfiguration(),
          ...patch
        } as WorkflowNodeConfiguration
      })
    ).rejects.toThrow(message)
    expect(repository.saveDraftCalls).toBe(0)
  })

  it('saves a Tool node without selecting a fixed Tool or Skill', async () => {
    const template = draftTemplate()
    template.currentVersion.nodes = [
      { ...templateNode('tool', 0), type: 'tool' }
    ]
    const repository = new InMemoryWorkflowTemplateRepository([template])
    const useCase = new ManageWorkflowTemplatesUseCase(repository, () => 950)
    const configuration = completeNodeConfiguration()
    const normalized = completeNodeConfigurationSnapshot()

    const saved = await useCase.configureNode({
      id: template.id,
      expectedRevision: 1,
      nodeId: template.currentVersion.nodes[0].id,
      configuration
    })

    expect(saved.currentVersion.nodes[0]).toMatchObject({
      configuration: normalized,
      executor: {
        kind: 'ai_generate',
        prompt: normalized.prompt,
        artifact: {
          relativePath: normalized.artifact.relativePath,
          kind: normalized.artifact.kind
        }
      }
    })
    expect(repository.saveDraftCalls).toBe(1)
  })

  it('rejects stale and published node configuration updates', async () => {
    const draft = draftTemplate()
    draft.currentVersion.nodes = [templateNode('analysis', 0)]
    const repository = new InMemoryWorkflowTemplateRepository([
      draft,
      publishedTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(
      useCase.configureNode({
        id: draft.id,
        expectedRevision: 0,
        nodeId: draft.currentVersion.nodes[0].id,
        configuration: completeNodeConfiguration()
      })
    ).rejects.toThrow('Workflow template revision conflict')
    await expect(
      useCase.configureNode({
        id: 'source-template',
        expectedRevision: 1,
        nodeId: 'source-analysis',
        configuration: completeNodeConfiguration()
      })
    ).rejects.toThrow('Only draft workflow templates can be edited')
    expect(repository.saveDraftCalls).toBe(0)
  })

  it('rejects invalid, stale and published node edits without writes', async () => {
    const repository = new InMemoryWorkflowTemplateRepository([
      draftTemplate(),
      publishedTemplate()
    ])
    const useCase = new ManageWorkflowTemplatesUseCase(repository)

    await expect(
      useCase.addNode({
        id: 'template-1',
        expectedRevision: 1,
        node: {
          stableKey: 'bad key',
          type: 'tool',
          name: 'Tool',
          description: '',
          allowSkip: false
        }
      })
    ).rejects.toThrow('Workflow template node stable key is invalid')
    await expect(
      useCase.addNode({
        id: 'template-1',
        expectedRevision: 0,
        node: {
          stableKey: 'tool',
          type: 'tool',
          name: 'Tool',
          description: '',
          allowSkip: false
        }
      })
    ).rejects.toThrow('Workflow template revision conflict')
    await expect(
      useCase.removeNode({
        id: 'source-template',
        expectedRevision: 1,
        nodeId: 'source-analysis'
      })
    ).rejects.toThrow('Only draft workflow templates can be edited')
    await expect(
      useCase.reorderNodes({
        id: 'template-1',
        expectedRevision: 1,
        orderedNodeIds: ['missing']
      })
    ).rejects.toThrow('Workflow template node order must include every node')

    expect(repository.saveDraftCalls).toBe(0)
  })
})

class InMemoryWorkflowTemplateRepository implements WorkflowTemplateLifecycleRepository {
  readonly records = new Map<string, Revisioned<WorkflowTemplateRecord>>()
  readonly versions = new Map<string, WorkflowTemplateVersionRecord>()
  saveDraftCalls = 0
  updateNodePositionsCalls = 0
  setStatusCalls = 0

  constructor(records: Array<Revisioned<WorkflowTemplateRecord>> = []) {
    for (const record of records) {
      this.records.set(record.id, structuredClone(record))
      this.versions.set(
        record.currentVersion.id,
        structuredClone(record.currentVersion)
      )
    }
  }

  async getTemplate(id: string) {
    const record = this.records.get(id)
    return record ? structuredClone(record) : undefined
  }

  async listTemplates() {
    return [...this.records.values()].map((record) => structuredClone(record))
  }

  async getVersion(id: string) {
    const version = this.versions.get(id)
    return version ? structuredClone(version) : undefined
  }

  async listVersions(templateId: string) {
    return [...this.versions.values()]
      .filter((version) => version.templateId === templateId)
      .sort((left, right) => right.version - left.version)
      .map((version) => structuredClone(version))
  }

  async saveDraft(
    record: WorkflowTemplateRecord,
    expectedRevision: number
  ): Promise<SaveResult<WorkflowTemplateRecord>> {
    this.saveDraftCalls += 1
    const current = this.records.get(record.id)
    if (current && current.revision !== expectedRevision) {
      return { status: 'conflict' as const, entity: structuredClone(current) }
    }
    const entity = structuredClone({
      ...record,
      revision: expectedRevision + 1
    })
    this.records.set(record.id, entity)
    this.versions.set(
      record.currentVersion.id,
      structuredClone(record.currentVersion)
    )
    return { status: 'saved' as const, entity }
  }

  async setStatus(
    id: string,
    expectedRevision: number,
    status: 'published' | 'archived',
    timestamp: number,
    checksum: string
  ): Promise<SaveResult<WorkflowTemplateRecord>> {
    this.setStatusCalls += 1
    const current = this.records.get(id)
    if (!current) throw new Error(`Workflow template not found: ${id}`)
    if (current.revision !== expectedRevision) {
      return { status: 'conflict' as const, entity: structuredClone(current) }
    }
    const entity = structuredClone({
      ...current,
      status,
      revision: current.revision + 1,
      updatedAt: timestamp,
      currentVersion: {
        ...current.currentVersion,
        status,
        checksum,
        ...(status === 'published' ? { publishedAt: timestamp } : {})
      }
    })
    this.records.set(id, entity)
    this.versions.set(
      entity.currentVersion.id,
      structuredClone(entity.currentVersion)
    )
    return { status: 'saved' as const, entity }
  }

  async updateNodePositions(
    id: string,
    expectedRevision: number,
    positions: Array<{
      nodeId: string
      position: { x: number; y: number }
    }>,
    timestamp: number
  ): Promise<SaveResult<WorkflowTemplateRecord>> {
    this.updateNodePositionsCalls += 1
    const current = this.records.get(id)
    if (!current) throw new Error(`Workflow template not found: ${id}`)
    const unchanged = positions.every(({ nodeId, position }) => {
      const existing = current.currentVersion.nodes.find(
        (node) => node.id === nodeId
      )?.position
      return existing?.x === position.x && existing.y === position.y
    })
    if (current.revision !== expectedRevision) {
      if (current.revision === expectedRevision + 1 && unchanged) {
        return { status: 'saved', entity: structuredClone(current) }
      }
      return { status: 'conflict', entity: structuredClone(current) }
    }
    if (unchanged) {
      return { status: 'saved', entity: structuredClone(current) }
    }
    const positionsByNodeId = new Map(
      positions.map(({ nodeId, position }) => [nodeId, position])
    )
    const entity = structuredClone({
      ...current,
      revision: current.revision + 1,
      updatedAt: timestamp,
      currentVersion: {
        ...current.currentVersion,
        nodes: current.currentVersion.nodes.map((node) => ({
          ...node,
          ...(positionsByNodeId.has(node.id)
            ? { position: positionsByNodeId.get(node.id)! }
            : {})
        }))
      }
    })
    this.records.set(id, entity)
    this.versions.set(
      entity.currentVersion.id,
      structuredClone(entity.currentVersion)
    )
    return { status: 'saved', entity }
  }
}

function draftTemplate(): Revisioned<WorkflowTemplateRecord> {
  return {
    id: 'template-1',
    name: 'Delivery',
    description: '',
    status: 'draft' as const,
    revision: 1,
    createdAt: 10,
    updatedAt: 10,
    currentVersion: {
      id: 'template-1-v1',
      templateId: 'template-1',
      version: 1,
      status: 'draft' as const,
      checksum: '',
      createdAt: 10,
      nodes: [],
      edges: []
    }
  }
}

function publishableDraftTemplate(): Revisioned<WorkflowTemplateRecord> {
  const template = draftTemplate()
  template.currentVersion.nodes = [
    {
      ...templateNode('analysis', 0),
      configuration: completeNodeConfiguration()
    }
  ]
  return template
}

function templateNode(stableKey: string, order: number) {
  return {
    id: `template-1-v1-node-${stableKey}`,
    stableKey,
    type: 'ai_generate' as const,
    name: stableKey,
    description: '',
    order,
    allowSkip: false
  }
}

function publishedTemplate() {
  return {
    id: 'source-template',
    name: 'Source',
    description: 'Source description',
    status: 'published' as const,
    revision: 1,
    createdAt: 10,
    updatedAt: 20,
    currentVersion: {
      id: 'source-template-v1',
      templateId: 'source-template',
      version: 1,
      status: 'published' as const,
      checksum: 'published',
      createdAt: 10,
      publishedAt: 20,
      nodes: [
        {
          id: 'source-analysis',
          stableKey: 'analysis',
          type: 'ai_generate' as const,
          name: 'Analysis',
          description: '',
          order: 0,
          allowSkip: false,
          position: { x: 120, y: 80 }
        }
      ],
      edges: []
    }
  }
}

function archivedTemplate() {
  return {
    ...publishedTemplate(),
    id: 'archived-template',
    status: 'archived' as const,
    currentVersion: {
      ...publishedTemplate().currentVersion,
      id: 'archived-template-v1',
      templateId: 'archived-template',
      status: 'archived' as const
    }
  }
}

function completeNodeConfiguration(): WorkflowNodeConfiguration {
  return {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: 'direct',
      includeSpaceKnowledge: true,
      attachments: [' attachments/brief.md ']
    },
    prompt: ' Review the requirement. ',
    model: { strategy: 'fixed', profileId: ' profile-1 ' },
    connectorIds: [' issue-tracker '],
    permissions: [{ capability: 'filesystem.read', scope: 'requirement' }],
    artifact: {
      required: true,
      relativePath: ' artifacts/analysis.md ',
      kind: ' markdown '
    },
    todos: [{ title: ' Confirm scope ', required: true }],
    completionGate: {
      requireApproval: true,
      customGateId: ' quality '
    },
    retry: { maxAttempts: 3, backoffMs: 1500 },
    skip: { allowed: true, requireReason: true }
  }
}

function completeNodeConfigurationSnapshot(): WorkflowNodeConfiguration {
  return {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: 'direct',
      includeSpaceKnowledge: true,
      attachments: ['attachments/brief.md']
    },
    prompt: 'Review the requirement.',
    model: { strategy: 'fixed', profileId: 'profile-1' },
    connectorIds: ['issue-tracker'],
    permissions: [{ capability: 'filesystem.read', scope: 'requirement' }],
    artifact: {
      required: true,
      relativePath: 'artifacts/analysis.md',
      kind: 'markdown'
    },
    todos: [{ title: 'Confirm scope', required: true }],
    completionGate: {
      requireApproval: true,
      customGateId: 'quality'
    },
    retry: { maxAttempts: 3, backoffMs: 1500 },
    skip: { allowed: true, requireReason: true }
  }
}
