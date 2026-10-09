import { describe, expect, it } from 'vitest'
import type {
  ArtifactMetadataRecord,
  NodeRunRecord,
  RequirementRecord,
  Revisioned,
  WorkflowExecutionRecord,
  WorkflowTemplateRecord,
  WorkflowTemplateVersionRecord
} from '../ports/business-repositories'
import { StartedNodeProtection } from './started-node-protection'
import { TemplateMigrationService } from './template-migration-service'

type HarnessState = {
  requirement?: Revisioned<RequirementRecord>
  workflow?: ReturnType<typeof workflow>
  execution?: Revisioned<WorkflowExecutionRecord>
  template?: Revisioned<WorkflowTemplateRecord>
  versions: Map<string, WorkflowTemplateVersionRecord>
  runs: Array<Revisioned<NodeRunRecord>>
  artifacts: Array<Revisioned<ArtifactMetadataRecord>>
}

function createHarness(
  change: (state: HarnessState) => void = () => undefined
) {
  const source = version('template-v1', 'template-1', 1, 'published', [
    templateNode('analysis', 0, 'Analysis'),
    templateNode('delivery', 1, 'Delivery')
  ])
  const targetV2 = version('template-v2', 'template-1', 2, 'published', [
    templateNode('analysis', 0, 'Analysis updated'),
    templateNode('review', 1, 'Review')
  ])
  const targetV3 = version('template-v3', 'template-1', 3, 'published', [
    templateNode('analysis', 0, 'Analysis updated'),
    templateNode('delivery', 1, 'Delivery'),
    templateNode('review', 2, 'Review')
  ])
  const draftV4 = version('template-v4', 'template-1', 4, 'draft')
  const oldV0 = version('template-v0', 'template-1', 0, 'published')
  const archivedV5 = version('template-v5', 'template-1', 5, 'archived')
  const otherV9 = version('other-v9', 'template-2', 9, 'published')
  const state: HarnessState = {
    requirement: {
      id: 'requirement-1',
      workspaceId: 'workspace-1',
      title: 'Checkout',
      status: 'active',
      workflowTemplateVersionId: source.id,
      sortOrder: 0,
      revision: 3,
      createdAt: 10,
      updatedAt: 10
    },
    workflow: workflow(),
    execution: {
      id: 'execution-1',
      requirementId: 'requirement-1',
      status: 'created',
      currentNodeId: 'requirement-1:analysis',
      revision: 5,
      createdAt: 10,
      updatedAt: 10
    },
    template: {
      id: 'template-1',
      name: 'Delivery',
      description: '',
      status: 'draft',
      currentVersion: draftV4,
      revision: 4,
      createdAt: 1,
      updatedAt: 4
    },
    versions: new Map(
      [source, targetV2, targetV3, draftV4, oldV0, archivedV5, otherV9].map(
        (item) => [item.id, item]
      )
    ),
    runs: [],
    artifacts: []
  }
  change(state)

  const nodeProtection = new StartedNodeProtection({
    nodeRuns: {
      listByNode: async (nodeId) =>
        structuredClone(state.runs.filter((run) => run.nodeId === nodeId))
    },
    artifacts: {
      listByRequirement: async () => structuredClone(state.artifacts)
    }
  })
  const dependencies = {
    requirements: {
      get: async () => structuredClone(state.requirement)
    },
    workflows: {
      get: async () => structuredClone(state.workflow)
    },
    executions: {
      getActiveByRequirement: async () => structuredClone(state.execution)
    },
    templates: {
      getVersion: async (id: string) => structuredClone(state.versions.get(id)),
      listVersions: async (templateId: string) =>
        [...state.versions.values()]
          .filter((item) => item.templateId === templateId)
          .map((item) => structuredClone(item)),
      getTemplate: async () => structuredClone(state.template)
    },
    nodeProtection
  }
  const service = new TemplateMigrationService(dependencies)

  return { service, state, dependencies }
}

describe('TemplateMigrationService queries', () => {
  it('lists only newer published versions from the active template, newest first', async () => {
    const { service } = createHarness()

    await expect(
      service.listCandidates('requirement-1')
    ).resolves.toMatchObject({
      currentVersion: {
        id: 'template-v1',
        version: 1,
        checksum: 'checksum-template-v1',
        nodeCount: 2,
        edgeCount: 1
      },
      candidates: [
        { id: 'template-v3', version: 3 },
        { id: 'template-v2', version: 2 }
      ]
    })
  })

  it.each([
    [
      'requirement_not_found',
      (state: HarnessState) => {
        state.requirement = undefined
      }
    ],
    [
      'workflow_not_found',
      (state: HarnessState) => {
        state.workflow = undefined
      }
    ],
    [
      'execution_not_found',
      (state: HarnessState) => {
        state.execution = undefined
      }
    ],
    [
      'source_not_found',
      (state: HarnessState) => {
        state.versions.delete('template-v1')
      }
    ],
    [
      'template_not_found',
      (state: HarnessState) => {
        state.template = undefined
      }
    ]
  ] as const)('returns %s when a current dependency is missing', async (code, mutate) => {
    const { service } = createHarness(mutate)

    await expect(service.listCandidates('requirement-1')).rejects.toMatchObject({
      code
    })
  })

  it.each([
    ['template-v1', 'not_newer'],
    ['template-v0', 'not_newer'],
    ['template-v4', 'target_unavailable'],
    ['template-v5', 'target_unavailable'],
    ['other-v9', 'different_template'],
    ['missing', 'target_not_found']
  ] as const)('rejects invalid target %s with %s', async (targetId, code) => {
    const { service } = createHarness()

    await expect(
      service.preview('requirement-1', targetId)
    ).rejects.toMatchObject({ code })
  })

  it('rejects migration when the template aggregate is archived', async () => {
    const { service } = createHarness((state) => {
      if (state.template) state.template.status = 'archived'
    })

    await expect(
      service.preview('requirement-1', 'template-v2')
    ).rejects.toMatchObject({ code: 'target_unavailable' })
  })

  it('rejects migration when the active execution has already started', async () => {
    const { service } = createHarness((state) => {
      if (state.execution) state.execution.status = 'running'
    })

    await expect(
      service.preview('requirement-1', 'template-v2')
    ).rejects.toMatchObject({ code: 'workflow_started' })
  })

  it.each([
    { status: 'running' },
    { status: 'waiting_user' },
    { status: 'paused' },
    { status: 'blocked' },
    { status: 'completed' },
    { status: 'failed' },
    { status: 'skipped' },
    { status: 'cancelled' },
    { status: 'interrupted' },
    { status: 'pending', attempt: 2 },
    { status: 'pending', aiRunId: 'ai-run-1' },
    { status: 'pending', checkpoint: { cursor: 1 } },
    { status: 'pending', error: 'failed' },
    { status: 'pending', completedAt: 20 }
  ] satisfies Array<Partial<Revisioned<NodeRunRecord>>>)(
    'maps started node evidence to workflow_started: %o',
    async (evidence) => {
      const { service } = createHarness((state) => {
        state.runs.push(nodeRun(evidence))
      })

      await expect(
        service.preview('requirement-1', 'template-v2')
      ).rejects.toMatchObject({ code: 'workflow_started' })
    }
  )

  it('maps a formal artifact to workflow_started', async () => {
    const { service } = createHarness((state) => {
      state.artifacts.push({
        id: 'artifact-1',
        requirementId: 'requirement-1',
        stageId: 'analysis',
        nodeId: 'requirement-1:analysis',
        relativePath: 'analysis.md',
        kind: 'markdown',
        checksum: 'artifact-checksum',
        version: 1,
        byteSize: 10,
        isPrimary: true,
        revision: 1,
        createdAt: 10,
        updatedAt: 10
      })
    })

    await expect(
      service.preview('requirement-1', 'template-v2')
    ).rejects.toMatchObject({ code: 'workflow_started' })
  })

  it('previews current-instance differences with all three revisions', async () => {
    const { service } = createHarness()

    const result = await service.preview('requirement-1', 'template-v2')

    expect(result).toMatchObject({
      requirementId: 'requirement-1',
      sourceVersion: { id: 'template-v1', version: 1 },
      targetVersion: { id: 'template-v2', version: 2 },
      requirementRevision: 3,
      workflowRevision: 4,
      executionRevision: 5,
      diff: {
        addedNodes: [{ id: 'requirement-1:review', name: 'Review' }],
        removedNodes: [
          { id: 'requirement-1:delivery', name: 'Custom delivery' }
        ],
        updatedNodes: [
          {
            id: 'requirement-1:analysis',
            sourceName: 'Custom analysis',
            targetName: 'Analysis updated',
            changedFields: ['name']
          }
        ]
      }
    })
  })
})

describe('TemplateMigrationService commands', () => {
  it('atomically migrates requirement, workflow, execution, runs, todos, revision and record', async () => {
    const harness = createCommandHarness()
    const preview = await harness.service.preview(
      'requirement-1',
      'template-v2'
    )

    const result = await harness.service.apply({
      requestId: 'migration-request-1',
      requirementId: 'requirement-1',
      targetTemplateVersionId: 'template-v2',
      expectedRequirementRevision: preview.requirementRevision,
      expectedWorkflowRevision: preview.workflowRevision,
      expectedExecutionRevision: preview.executionRevision
    })

    expect(result).toMatchObject({
      outcome: 'applied',
      migrationRecordId: 'migration-1',
      requirementRevision: 4,
      executionRevision: 6,
      targetVersion: { id: 'template-v2', version: 2 },
      workflow: {
        templateVersionId: 'template-v2',
        revision: 5
      }
    })
    expect(harness.state.requirement?.workflowTemplateVersionId).toBe(
      'template-v2'
    )
    expect(harness.state.execution).toMatchObject({
      revision: 6,
      status: 'created',
      currentNodeId: 'requirement-1:analysis'
    })
    expect(harness.runs.map((run) => [run.nodeId, run.status])).toEqual([
      ['requirement-1:analysis', 'ready'],
      ['requirement-1:review', 'pending']
    ])
    expect(harness.todos).toEqual([
      expect.objectContaining({
        id: 'node-run-1:todo:1',
        nodeRunId: 'node-run-1',
        title: 'Approve analysis',
        status: 'pending'
      })
    ])
    expect(harness.workflowMetadata).toEqual([
      { reason: 'template_migrated', triggerSource: 'user' }
    ])
    expect(harness.migrationRecords).toHaveLength(1)
  })

  it.each([
    'requirement',
    'workflow',
    'execution'
  ] as const)('rejects a stale %s revision with all current revisions', async (kind) => {
    const harness = createCommandHarness()
    const preview = await harness.service.preview(
      'requirement-1',
      'template-v2'
    )
    const target = harness.state[kind]
    if (target) target.revision += 1

    await expect(
      harness.service.apply(commandFromPreview(preview))
    ).rejects.toMatchObject({
      code: 'revision_conflict',
      currentRevisions: {
        requirementRevision: harness.state.requirement?.revision,
        workflowRevision: harness.state.workflow?.revision,
        executionRevision: harness.state.execution?.revision
      }
    })
    expect(harness.migrationRecords).toHaveLength(0)
  })

  it('replays the exact persisted request without creating new state', async () => {
    const harness = createCommandHarness()
    const preview = await harness.service.preview(
      'requirement-1',
      'template-v2'
    )
    const command = commandFromPreview(preview)
    const applied = await harness.service.apply(command)
    const runsAfterApply = structuredClone(harness.runs)
    const todosAfterApply = structuredClone(harness.todos)

    const replayed = await harness.service.apply(command)

    expect(replayed).toEqual({ ...applied, outcome: 'idempotent' })
    expect(harness.migrationRecords).toHaveLength(1)
    expect(harness.workflowMetadata).toHaveLength(1)
    expect(harness.runs).toEqual(runsAfterApply)
    expect(harness.todos).toEqual(todosAfterApply)
  })

  it('rejects reuse of a request id with different normalized input', async () => {
    const harness = createCommandHarness()
    const preview = await harness.service.preview(
      'requirement-1',
      'template-v2'
    )
    const command = commandFromPreview(preview)
    await harness.service.apply(command)

    await expect(
      harness.service.apply({
        ...command,
        targetTemplateVersionId: 'template-v3'
      })
    ).rejects.toMatchObject({ code: 'request_conflict' })
    expect(harness.migrationRecords).toHaveLength(1)
    expect(harness.workflowMetadata).toHaveLength(1)
  })

  it('rechecks started evidence after preview before applying', async () => {
    const harness = createCommandHarness()
    const preview = await harness.service.preview(
      'requirement-1',
      'template-v2'
    )
    harness.state.runs.push(nodeRun({ status: 'running' }))

    await expect(
      harness.service.apply(commandFromPreview(preview))
    ).rejects.toMatchObject({ code: 'workflow_started' })
    expect(harness.migrationRecords).toHaveLength(0)
    expect(harness.workflowMetadata).toHaveLength(0)
  })

  it.each([
    'delete_runs',
    'workflow',
    'requirement',
    'execution',
    'node_run',
    'todo',
    'record'
  ] as const)('rolls back every write when %s persistence fails', async (failureAt) => {
    const harness = createCommandHarness(failureAt)
    const preview = await harness.service.preview(
      'requirement-1',
      'template-v2'
    )
    const before = harness.snapshot()

    await expect(
      harness.service.apply(commandFromPreview(preview))
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(harness.snapshot()).toEqual(before)
  })
})

function workflow() {
  return {
    requirementId: 'requirement-1',
    templateVersionId: 'template-v1',
    revision: 4,
    maxParallelism: 1,
    nodes: [
      {
        id: 'requirement-1:analysis',
        type: 'ai_generate' as const,
        name: 'Custom analysis',
        description: '',
        order: 0,
        status: 'ready' as const,
        allowSkip: false
      },
      {
        id: 'requirement-1:delivery',
        type: 'ai_generate' as const,
        name: 'Custom delivery',
        description: '',
        order: 1,
        status: 'pending' as const,
        allowSkip: false
      }
    ],
    edges: [
      {
        id: 'requirement-1:analysis-delivery',
        sourceNodeId: 'requirement-1:analysis',
        targetNodeId: 'requirement-1:delivery'
      }
    ]
  }
}

function version(
  id: string,
  templateId: string,
  number: number,
  status: WorkflowTemplateVersionRecord['status'],
  nodes: WorkflowTemplateVersionRecord['nodes'] = [
    templateNode('analysis', 0, 'Analysis')
  ]
): WorkflowTemplateVersionRecord {
  return {
    id,
    templateId,
    version: number,
    status,
    checksum: `checksum-${id}`,
    publishedAt: status === 'published' ? number * 100 : undefined,
    nodes,
    edges:
      nodes.length < 2
        ? []
        : [
            {
              id: `${id}-edge`,
              sourceNodeId: nodes[0].id,
              targetNodeId: nodes[1].id
            }
          ]
  }
}

function templateNode(
  stableKey: string,
  order: number,
  name: string
): WorkflowTemplateVersionRecord['nodes'][number] {
  return {
    id: `template-node-${stableKey}`,
    stableKey,
    type: stableKey === 'review' ? 'approval' : 'ai_generate',
    name,
    description: '',
    order,
    allowSkip: false
  }
}

function nodeRun(
  evidence: Partial<Revisioned<NodeRunRecord>>
): Revisioned<NodeRunRecord> {
  return {
    id: 'node-run-1',
    executionId: 'execution-1',
    nodeId: 'requirement-1:analysis',
    status: 'pending',
    attempt: 1,
    revision: 1,
    createdAt: 10,
    updatedAt: 10,
    ...evidence
  }
}

function createCommandHarness(
  failureAt?:
    | 'delete_runs'
    | 'workflow'
    | 'requirement'
    | 'execution'
    | 'node_run'
    | 'todo'
    | 'record'
) {
  const base = createHarness((state) => {
    const target = state.versions.get('template-v2')
    if (target) {
      target.nodes[0].configuration = {
        input: {
          includeRequirementBody: true,
          predecessorArtifacts: 'none',
          includeSpaceKnowledge: false,
          attachments: []
        },
        prompt: 'Analyze',
        model: { strategy: 'inherit' },
        connectorIds: [],
        permissions: [],
        artifact: {
          required: false,
          relativePath: '',
          kind: ''
        },
        todos: [{ title: 'Approve analysis', required: true }],
        completionGate: { requireApproval: false },
        retry: { maxAttempts: 1, backoffMs: 0 },
        skip: { allowed: false, requireReason: false }
      }
    }
  })
  const runs: Array<Revisioned<NodeRunRecord>> = [
    nodeRun({ id: 'old-analysis-run', status: 'ready' }),
    nodeRun({
      id: 'old-delivery-run',
      nodeId: 'requirement-1:delivery',
      status: 'pending'
    })
  ]
  const todos: Array<Record<string, unknown>> = [
    {
      id: 'old-analysis-run:todo:1',
      nodeRunId: 'old-analysis-run',
      title: 'Old todo',
      required: true,
      status: 'pending',
      revision: 1,
      createdAt: 10,
      updatedAt: 10
    }
  ]
  const migrationRecords: Array<Record<string, unknown>> = []
  const workflowMetadata: Array<Record<string, unknown>> = []
  let nodeRunSequence = 0
  const failAfterWrite = (step: typeof failureAt) => {
    if (failureAt === step) throw new Error(`Injected ${step} failure`)
  }

  const service = new TemplateMigrationService({
    ...base.dependencies,
    requirements: {
      ...base.dependencies.requirements,
      save: async (entity: RequirementRecord, expectedRevision: number) => {
        if (base.state.requirement?.revision !== expectedRevision) {
          return {
            status: 'conflict' as const,
            entity: structuredClone(base.state.requirement!)
          }
        }
        base.state.requirement = {
          ...structuredClone(entity),
          revision: expectedRevision + 1
        }
        failAfterWrite('requirement')
        return {
          status: 'saved' as const,
          entity: structuredClone(base.state.requirement)
        }
      }
    },
    workflows: {
      ...base.dependencies.workflows,
      save: async (
        entity: ReturnType<typeof workflow>,
        expectedRevision: number,
        metadata: Record<string, unknown>
      ) => {
        if (base.state.workflow?.revision !== expectedRevision) {
          return {
            status: 'conflict' as const,
            entity: structuredClone(base.state.workflow!)
          }
        }
        workflowMetadata.push(structuredClone(metadata))
        base.state.workflow = {
          ...structuredClone(entity),
          revision: expectedRevision + 1
        }
        failAfterWrite('workflow')
        return {
          status: 'saved' as const,
          entity: structuredClone(base.state.workflow)
        }
      }
    },
    executions: {
      ...base.dependencies.executions,
      save: async (
        entity: WorkflowExecutionRecord,
        expectedRevision: number
      ) => {
        if (base.state.execution?.revision !== expectedRevision) {
          return {
            status: 'conflict' as const,
            entity: structuredClone(base.state.execution!)
          }
        }
        base.state.execution = {
          ...structuredClone(entity),
          revision: expectedRevision + 1
        }
        failAfterWrite('execution')
        return {
          status: 'saved' as const,
          entity: structuredClone(base.state.execution)
        }
      }
    },
    nodeRuns: {
      deleteByNode: async (executionId: string, nodeId: string) => {
        const before = runs.length
        const deletedIds = runs
          .filter(
            (run) => run.executionId === executionId && run.nodeId === nodeId
          )
          .map((run) => run.id)
        for (let index = runs.length - 1; index >= 0; index -= 1) {
          if (deletedIds.includes(runs[index].id)) runs.splice(index, 1)
        }
        for (let index = todos.length - 1; index >= 0; index -= 1) {
          if (deletedIds.includes(String(todos[index].nodeRunId))) {
            todos.splice(index, 1)
          }
        }
        failAfterWrite('delete_runs')
        return before - runs.length
      },
      save: async (entity: NodeRunRecord, expectedRevision: number) => {
        const saved = {
          ...structuredClone(entity),
          revision: expectedRevision + 1
        }
        runs.push(saved)
        failAfterWrite('node_run')
        return { status: 'saved' as const, entity: structuredClone(saved) }
      }
    },
    todos: {
      save: async (entity: Record<string, unknown>, expectedRevision: number) => {
        const saved = {
          ...structuredClone(entity),
          revision: expectedRevision + 1
        }
        todos.push(saved)
        failAfterWrite('todo')
        return { status: 'saved' as const, entity: structuredClone(saved) }
      }
    },
    migrationRecords: {
      getByRequestId: async (requestId: string) =>
        structuredClone(
          migrationRecords.find((record) => record.requestId === requestId)
        ),
      append: async (record: Record<string, unknown>) => {
        migrationRecords.push(structuredClone(record))
        failAfterWrite('record')
      }
    },
    unitOfWork: {
      execute: async <T>(operation: () => T | Promise<T>) => {
        const stateSnapshot = structuredClone(base.state)
        const runsSnapshot = structuredClone(runs)
        const todosSnapshot = structuredClone(todos)
        const recordsSnapshot = structuredClone(migrationRecords)
        const metadataSnapshot = structuredClone(workflowMetadata)
        try {
          return await operation()
        } catch (error) {
          Object.assign(base.state, stateSnapshot)
          runs.splice(0, runs.length, ...runsSnapshot)
          todos.splice(0, todos.length, ...todosSnapshot)
          migrationRecords.splice(
            0,
            migrationRecords.length,
            ...recordsSnapshot
          )
          workflowMetadata.splice(
            0,
            workflowMetadata.length,
            ...metadataSnapshot
          )
          throw error
        }
      }
    },
    now: () => 20,
    createId: (kind: 'migration' | 'node_run') =>
      kind === 'migration'
        ? 'migration-1'
        : `node-run-${++nodeRunSequence}`
  } as never)

  return {
    service,
    state: base.state,
    runs,
    todos,
    migrationRecords,
    workflowMetadata,
    snapshot: () => ({
      requirement: structuredClone(base.state.requirement),
      workflow: structuredClone(base.state.workflow),
      execution: structuredClone(base.state.execution),
      runs: structuredClone(runs),
      todos: structuredClone(todos),
      migrationRecords: structuredClone(migrationRecords),
      workflowMetadata: structuredClone(workflowMetadata)
    })
  }
}

function commandFromPreview(
  preview: Awaited<ReturnType<TemplateMigrationService['preview']>>
) {
  return {
    requestId: 'migration-request-1',
    requirementId: preview.requirementId,
    targetTemplateVersionId: preview.targetVersion.id,
    expectedRequirementRevision: preview.requirementRevision,
    expectedWorkflowRevision: preview.workflowRevision,
    expectedExecutionRevision: preview.executionRevision
  }
}
