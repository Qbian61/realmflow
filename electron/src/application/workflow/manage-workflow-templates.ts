import { createHash } from 'node:crypto'
import type { WorkflowNodeConfiguration } from '../../../../domain/workflow'
import type {
  Revisioned,
  WorkflowTemplateRecord,
  WorkflowTemplateRepository,
  WorkflowTemplateVersionRecord
} from '../ports/business-repositories'
import {
  validateWorkflowTemplatePublication,
  WorkflowTemplatePublicationValidationError
} from './validate-workflow-template-publication'
import { normalizeNodeConfiguration } from './workflow-node-configuration'

export type WorkflowTemplateLifecycleRepository = Pick<
  WorkflowTemplateRepository,
  | 'getTemplate'
  | 'getVersion'
  | 'listTemplates'
  | 'listVersions'
  | 'saveDraft'
  | 'updateNodePositions'
  | 'setStatus'
>

type CreateWorkflowTemplateInput = {
  id: string
  name: string
  description?: string
}

type CopyWorkflowTemplateInput = CreateWorkflowTemplateInput & {
  sourceTemplateId: string
  sourceVersionId?: string
}

type UpdateWorkflowTemplateInput = {
  id: string
  expectedRevision: number
  name?: string
  description?: string
}

type TransitionWorkflowTemplateInput = {
  id: string
  expectedRevision: number
}

type CreateWorkflowTemplateVersionInput = TransitionWorkflowTemplateInput & {
  sourceVersionId: string
}

type WorkflowTemplateNode = WorkflowTemplateVersionRecord['nodes'][number]

type WorkflowTemplateNodeDraft = Omit<WorkflowTemplateNode, 'id' | 'order'>

type AddWorkflowTemplateNodeInput = TransitionWorkflowTemplateInput & {
  node: WorkflowTemplateNodeDraft
}

type CopyWorkflowTemplateNodeInput = TransitionWorkflowTemplateInput & {
  sourceNodeId: string
  stableKey: string
  name?: string
}

type UpdateWorkflowTemplateNodeInput = TransitionWorkflowTemplateInput & {
  nodeId: string
  name?: string
  description?: string
  type?: WorkflowTemplateNode['type']
  allowSkip?: boolean
}

type AddWorkflowTemplateEdgeInput = TransitionWorkflowTemplateInput & {
  sourceNodeId: string
  targetNodeId: string
}

type ConfigureWorkflowTemplateNodeInput = TransitionWorkflowTemplateInput & {
  nodeId: string
  configuration: WorkflowNodeConfiguration
}

type UpdateWorkflowTemplateNodePositionsInput =
  TransitionWorkflowTemplateInput & {
    positions: Array<{
      nodeId: string
      position: {
        x: number
        y: number
      }
    }>
  }

type RestoreWorkflowTemplateNodeInput = TransitionWorkflowTemplateInput & {
  node: WorkflowTemplateNode
  edges: WorkflowTemplateVersionRecord['edges']
}

export type WorkflowTemplateCatalogLifecyclePort = {
  syncWorkflowTemplate(
    template: Revisioned<WorkflowTemplateRecord>
  ): Promise<void>
}

export class ManageWorkflowTemplatesUseCase {
  constructor(
    private readonly templates: WorkflowTemplateLifecycleRepository,
    private readonly now: () => number = Date.now,
    private readonly catalog: WorkflowTemplateCatalogLifecyclePort = {
      syncWorkflowTemplate: async () => undefined
    }
  ) {}

  list(): Promise<Array<Revisioned<WorkflowTemplateRecord>>> {
    return this.templates.listTemplates()
  }

  async listVersions(id: string): Promise<WorkflowTemplateVersionRecord[]> {
    const template = await this.requireTemplate(id)
    return this.templates.listVersions(template.id)
  }

  async getDraft(id: string): Promise<Revisioned<WorkflowTemplateRecord>> {
    const template = await this.requireTemplate(id)
    if (template.status !== 'draft') {
      throw new Error('Only draft workflow templates can be edited')
    }
    return template
  }

  async getVersion(
    templateId: string,
    versionId: string
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const template = await this.requireTemplate(templateId)
    const version = await this.templates.getVersion(requireId(versionId))
    if (!version || version.templateId !== template.id) {
      throw new Error(`Workflow template version not found: ${versionId}`)
    }
    return {
      ...template,
      status: version.status,
      currentVersion: version
    }
  }

  async create(
    input: CreateWorkflowTemplateInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const id = requireId(input.id)
    const name = requireName(input.name)
    const description = normalizeDescription(input.description)
    const existing = await this.templates.getTemplate(id)
    if (existing) {
      if (
        existing.status === 'draft' &&
        existing.name === name &&
        existing.description === description &&
        existing.currentVersion.nodes.length === 0 &&
        existing.currentVersion.edges.length === 0
      ) {
        return existing
      }
      throw new Error('Workflow template id already exists with different data')
    }

    const timestamp = this.now()
    return this.saveDraft(
      {
        id,
        name,
        description,
        status: 'draft',
        createdAt: timestamp,
        updatedAt: timestamp,
        currentVersion: {
          id: `${id}-v1`,
          templateId: id,
          version: 1,
          status: 'draft',
          checksum: checksumDefinition([], []),
          createdAt: timestamp,
          nodes: [],
          edges: []
        }
      },
      0
    )
  }

  async copy(
    input: CopyWorkflowTemplateInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const id = requireId(input.id)
    const sourceId = requireId(input.sourceTemplateId)
    const name = requireName(input.name)
    const description = normalizeDescription(input.description)
    const source = await this.templates.getTemplate(sourceId)
    if (!source) {
      throw new Error(`Workflow template not found: ${sourceId}`)
    }

    const sourceVersion = input.sourceVersionId
      ? await this.templates.getVersion(requireId(input.sourceVersionId))
      : source.currentVersion
    if (!sourceVersion || sourceVersion.templateId !== sourceId) {
      throw new Error('Workflow template source version not found')
    }
    if (input.sourceVersionId && sourceVersion.status === 'draft') {
      throw new Error('Draft workflow template versions cannot be copied')
    }
    const copiedVersion = copyVersion(sourceVersion, id, this.now())
    const existing = await this.templates.getTemplate(id)
    if (existing) {
      if (
        existing.status === 'draft' &&
        existing.name === name &&
        existing.description === description &&
        existing.currentVersion.checksum === copiedVersion.checksum
      ) {
        return existing
      }
      throw new Error('Workflow template id already exists with different data')
    }

    const timestamp = copiedVersion.createdAt ?? this.now()
    return this.saveDraft(
      {
        id,
        name,
        description,
        status: 'draft',
        createdAt: timestamp,
        updatedAt: timestamp,
        currentVersion: copiedVersion
      },
      0
    )
  }

  async update(
    input: UpdateWorkflowTemplateInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    if (current.status !== 'draft') {
      throw new Error('Only draft workflow templates can be edited')
    }
    const name =
      input.name === undefined ? current.name : requireName(input.name)
    const description =
      input.description === undefined
        ? current.description
        : normalizeDescription(input.description)
    if (name === current.name && description === current.description) {
      return current
    }
    if (current.revision !== input.expectedRevision) {
      throw new Error('Workflow template revision conflict')
    }
    return this.saveDraft(
      {
        ...current,
        name,
        description,
        updatedAt: this.now()
      },
      input.expectedRevision
    )
  }

  async createNextVersion(
    input: CreateWorkflowTemplateVersionInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const sourceVersionId = requireId(input.sourceVersionId)
    const current = await this.requireTemplate(input.id)
    const source = await this.templates.getVersion(sourceVersionId)
    if (!source || source.templateId !== current.id) {
      throw new Error('Workflow template source version changed')
    }
    if (
      current.status === 'draft' &&
      current.revision === input.expectedRevision + 1
    ) {
      if (
        current.currentVersion.checksum ===
          checksumDefinition(source.nodes, source.edges) &&
        current.currentVersion.version > source.version
      ) {
        return current
      }
    }
    if (current.revision !== input.expectedRevision) {
      throw new Error('Workflow template revision conflict')
    }
    if (current.status !== 'published') {
      throw new Error(
        'Only published workflow templates can create a new version'
      )
    }
    if (source.status === 'draft') {
      throw new Error('Draft workflow template versions cannot be derived')
    }
    const timestamp = this.now()
    return this.saveDraft(
      {
        ...current,
        status: 'draft',
        updatedAt: timestamp,
        currentVersion: createNextVersion(
          source,
          timestamp,
          current.currentVersion.version + 1
        )
      },
      input.expectedRevision
    )
  }

  async addNode(
    input: AddWorkflowTemplateNodeInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const node = normalizeNodeDraft(input.node)
    const current = await this.requireTemplate(input.id)
    const existing = current.currentVersion.nodes.find(
      (item) => item.stableKey === node.stableKey
    )
    if (
      existing &&
      current.status === 'draft' &&
      current.revision === input.expectedRevision + 1 &&
      nodeMatches(existing, node)
    ) {
      return current
    }
    this.assertDraftRevision(current, input.expectedRevision)
    if (existing) {
      throw new Error('Workflow template node stable key already exists')
    }
    return this.saveNodeDefinition(
      current,
      [
        ...current.currentVersion.nodes,
        {
          ...node,
          id: nodeId(current.currentVersion.id, node.stableKey),
          order: current.currentVersion.nodes.length
        }
      ],
      current.currentVersion.edges,
      input.expectedRevision
    )
  }

  async copyNode(
    input: CopyWorkflowTemplateNodeInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const stableKey = requireStableKey(input.stableKey)
    const current = await this.requireTemplate(input.id)
    const sourceNodeId = requireId(input.sourceNodeId)
    const source = current.currentVersion.nodes.find(
      (node) => node.id === sourceNodeId
    )
    if (!source) {
      throw new Error(`Workflow template node not found: ${sourceNodeId}`)
    }
    const copy = normalizeNodeDraft({
      ...source,
      stableKey,
      name: input.name === undefined ? `${source.name} copy` : input.name
    })
    const existing = current.currentVersion.nodes.find(
      (node) => node.stableKey === stableKey
    )
    if (
      existing &&
      current.status === 'draft' &&
      current.revision === input.expectedRevision + 1 &&
      nodeMatches(existing, copy)
    ) {
      return current
    }
    this.assertDraftRevision(current, input.expectedRevision)
    if (existing) {
      throw new Error('Workflow template node stable key already exists')
    }
    return this.saveNodeDefinition(
      current,
      [
        ...current.currentVersion.nodes,
        {
          ...copy,
          id: nodeId(current.currentVersion.id, stableKey),
          order: current.currentVersion.nodes.length
        }
      ],
      current.currentVersion.edges,
      input.expectedRevision
    )
  }

  async updateNode(
    input: UpdateWorkflowTemplateNodeInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    this.assertDraftRevision(current, input.expectedRevision)
    const nodeIdValue = requireId(input.nodeId)
    const index = current.currentVersion.nodes.findIndex(
      (node) => node.id === nodeIdValue
    )
    if (index < 0) {
      throw new Error(`Workflow template node not found: ${nodeIdValue}`)
    }
    const existing = current.currentVersion.nodes[index]
    const updated = normalizeNodeDraft({
      ...existing,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.allowSkip === undefined ? {} : { allowSkip: input.allowSkip })
    })
    if (nodeMatches(existing, updated)) return current
    const nodes = [...current.currentVersion.nodes]
    nodes[index] = { ...existing, ...updated }
    return this.saveNodeDefinition(
      current,
      nodes,
      current.currentVersion.edges,
      input.expectedRevision
    )
  }

  async configureNode(
    input: ConfigureWorkflowTemplateNodeInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    const nodeIdValue = requireId(input.nodeId)
    const index = current.currentVersion.nodes.findIndex(
      (node) => node.id === nodeIdValue
    )
    if (index < 0) {
      throw new Error(`Workflow template node not found: ${nodeIdValue}`)
    }
    const existing = current.currentVersion.nodes[index]
    const configuration = normalizeNodeConfiguration(
      input.configuration,
      existing.type
    )
    if (
      current.status === 'draft' &&
      current.revision === input.expectedRevision + 1 &&
      configurationsEqual(existing.configuration, configuration)
    ) {
      return current
    }
    this.assertDraftRevision(current, input.expectedRevision)
    const nodes = [...current.currentVersion.nodes]
    nodes[index] = applyNodeConfiguration(existing, configuration)
    return this.saveNodeDefinition(
      current,
      nodes,
      current.currentVersion.edges,
      input.expectedRevision
    )
  }

  async updateNodePositions(
    input: UpdateWorkflowTemplateNodePositionsInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    const positions = normalizeNodePositions(input.positions)
    const positionsByNodeId = new Map(
      positions.map(({ nodeId, position }) => [nodeId, position])
    )
    for (const nodeId of positionsByNodeId.keys()) {
      if (!current.currentVersion.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`Workflow template node not found: ${nodeId}`)
      }
    }
    const unchanged = positions.every(({ nodeId, position }) => {
      const node = current.currentVersion.nodes.find(
        (candidate) => candidate.id === nodeId
      )
      return node?.position?.x === position.x && node.position.y === position.y
    })
    if (
      unchanged &&
      (current.revision === input.expectedRevision ||
        current.revision === input.expectedRevision + 1)
    ) {
      return current
    }
    this.assertDraftRevision(current, input.expectedRevision)
    const result = await this.templates.updateNodePositions(
      current.id,
      input.expectedRevision,
      positions,
      this.now()
    )
    if (result.status === 'conflict') {
      throw new Error('Workflow template revision conflict')
    }
    return result.entity
  }

  async removeNode(
    input: TransitionWorkflowTemplateInput & { nodeId: string }
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    const nodeIdValue = requireId(input.nodeId)
    const exists = current.currentVersion.nodes.some(
      (node) => node.id === nodeIdValue
    )
    if (
      !exists &&
      current.status === 'draft' &&
      current.revision === input.expectedRevision + 1
    ) {
      return current
    }
    this.assertDraftRevision(current, input.expectedRevision)
    if (!exists) {
      throw new Error(`Workflow template node not found: ${nodeIdValue}`)
    }
    return this.saveNodeDefinition(
      current,
      current.currentVersion.nodes.filter((node) => node.id !== nodeIdValue),
      current.currentVersion.edges.filter(
        (edge) =>
          edge.sourceNodeId !== nodeIdValue && edge.targetNodeId !== nodeIdValue
      ),
      input.expectedRevision
    )
  }

  async restoreNode(
    input: RestoreWorkflowTemplateNodeInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    this.assertDraftRevision(current, input.expectedRevision)
    const stableKey = requireStableKey(input.node.stableKey)
    const expectedNodeId = nodeId(current.currentVersion.id, stableKey)
    if (
      requireDefinitionId(
        input.node.id,
        'Workflow template node id is invalid'
      ) !== expectedNodeId
    ) {
      throw new Error('Workflow template node id does not match stable key')
    }
    if (
      current.currentVersion.nodes.some(
        (node) => node.id === expectedNodeId || node.stableKey === stableKey
      )
    ) {
      throw new Error('Workflow template node already exists')
    }
    if (
      !Number.isInteger(input.node.order) ||
      input.node.order < 0 ||
      input.node.order > current.currentVersion.nodes.length
    ) {
      throw new Error('Workflow template node order is invalid')
    }
    if (input.node.position) {
      normalizeNodePositions([
        { nodeId: input.node.id, position: input.node.position }
      ])
    }
    const restoredNode = {
      ...normalizeNodeDraft(input.node),
      id: expectedNodeId,
      order: input.node.order,
      ...(input.node.position
        ? { position: structuredClone(input.node.position) }
        : {})
    }
    const nodes = current.currentVersion.nodes.slice().sort(compareNodes)
    nodes.splice(input.node.order, 0, restoredNode)
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edgeIds = new Set(current.currentVersion.edges.map((edge) => edge.id))
    const edgePairs = new Set(
      current.currentVersion.edges.map(
        (edge) => `${edge.sourceNodeId}\u0000${edge.targetNodeId}`
      )
    )
    const restoredEdges = input.edges.map((edge) => {
      const id = requireDefinitionId(
        edge.id,
        'Workflow template edge id is invalid'
      )
      const sourceNodeId = requireDefinitionId(
        edge.sourceNodeId,
        'Workflow template edge source node id is invalid'
      )
      const targetNodeId = requireDefinitionId(
        edge.targetNodeId,
        'Workflow template edge target node id is invalid'
      )
      if (sourceNodeId !== expectedNodeId && targetNodeId !== expectedNodeId) {
        throw new Error('Workflow template restored edge is not related to node')
      }
      if (sourceNodeId === targetNodeId) {
        throw new Error('Workflow template edge cannot connect a node to itself')
      }
      if (!nodeIds.has(sourceNodeId)) {
        throw new Error(
          `Workflow template edge source node not found: ${sourceNodeId}`
        )
      }
      if (!nodeIds.has(targetNodeId)) {
        throw new Error(
          `Workflow template edge target node not found: ${targetNodeId}`
        )
      }
      const pair = `${sourceNodeId}\u0000${targetNodeId}`
      if (edgeIds.has(id) || edgePairs.has(pair)) {
        throw new Error('Workflow template edge already exists')
      }
      edgeIds.add(id)
      edgePairs.add(pair)
      return { id, sourceNodeId, targetNodeId }
    })
    const edges = [...current.currentVersion.edges, ...restoredEdges]
    if (hasCycle(nodes, edges)) {
      throw new Error('Workflow template edge would create a cycle')
    }
    return this.saveNodeDefinition(
      current,
      nodes,
      edges,
      input.expectedRevision
    )
  }

  async reorderNodes(
    input: TransitionWorkflowTemplateInput & { orderedNodeIds: string[] }
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    const orderedNodeIds = input.orderedNodeIds.map(requireId)
    const currentIds = current.currentVersion.nodes
      .slice()
      .sort(compareNodes)
      .map((node) => node.id)
    if (
      current.status === 'draft' &&
      current.revision === input.expectedRevision + 1 &&
      arraysEqual(currentIds, orderedNodeIds)
    ) {
      return current
    }
    this.assertDraftRevision(current, input.expectedRevision)
    if (
      new Set(orderedNodeIds).size !== currentIds.length ||
      orderedNodeIds.length !== currentIds.length ||
      orderedNodeIds.some((id) => !currentIds.includes(id))
    ) {
      throw new Error('Workflow template node order must include every node')
    }
    if (arraysEqual(currentIds, orderedNodeIds)) return current
    const nodesById = new Map(
      current.currentVersion.nodes.map((node) => [node.id, node])
    )
    return this.saveNodeDefinition(
      current,
      orderedNodeIds.map((id, order) => ({ ...nodesById.get(id)!, order })),
      current.currentVersion.edges,
      input.expectedRevision
    )
  }

  async addEdge(
    input: AddWorkflowTemplateEdgeInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const sourceNodeId = requireId(input.sourceNodeId)
    const targetNodeId = requireId(input.targetNodeId)
    const current = await this.requireTemplate(input.id)
    const existing = current.currentVersion.edges.find(
      (edge) =>
        edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId
    )
    if (
      existing &&
      current.status === 'draft' &&
      current.revision === input.expectedRevision + 1
    ) {
      return current
    }
    this.assertDraftRevision(current, input.expectedRevision)
    if (sourceNodeId === targetNodeId) {
      throw new Error('Workflow template edge cannot connect a node to itself')
    }
    if (
      !current.currentVersion.nodes.some((node) => node.id === sourceNodeId)
    ) {
      throw new Error(
        `Workflow template edge source node not found: ${sourceNodeId}`
      )
    }
    if (
      !current.currentVersion.nodes.some((node) => node.id === targetNodeId)
    ) {
      throw new Error(
        `Workflow template edge target node not found: ${targetNodeId}`
      )
    }
    if (existing) {
      throw new Error('Workflow template edge already exists')
    }
    const edges = [
      ...current.currentVersion.edges,
      {
        id: edgeId(current.currentVersion.id, sourceNodeId, targetNodeId),
        sourceNodeId,
        targetNodeId
      }
    ]
    if (hasCycle(current.currentVersion.nodes, edges)) {
      throw new Error('Workflow template edge would create a cycle')
    }
    return this.saveNodeDefinition(
      current,
      current.currentVersion.nodes,
      edges,
      input.expectedRevision
    )
  }

  async removeEdge(
    input: TransitionWorkflowTemplateInput & { edgeId: string }
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const edgeIdValue = requireId(input.edgeId)
    const current = await this.requireTemplate(input.id)
    const exists = current.currentVersion.edges.some(
      (edge) => edge.id === edgeIdValue
    )
    if (
      !exists &&
      current.status === 'draft' &&
      current.revision === input.expectedRevision + 1
    ) {
      return current
    }
    this.assertDraftRevision(current, input.expectedRevision)
    if (!exists) {
      throw new Error(`Workflow template edge not found: ${edgeIdValue}`)
    }
    return this.saveNodeDefinition(
      current,
      current.currentVersion.nodes,
      current.currentVersion.edges.filter((edge) => edge.id !== edgeIdValue),
      input.expectedRevision
    )
  }

  async publish(
    input: TransitionWorkflowTemplateInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    if (current.status === 'published') {
      await this.catalog.syncWorkflowTemplate(current)
      return current
    }
    if (current.status !== 'draft') {
      throw new Error('Only draft workflow templates can be published')
    }
    if (current.revision !== input.expectedRevision) {
      throw new Error('Workflow template revision conflict')
    }
    const validation = validateWorkflowTemplatePublication(
      current.currentVersion
    )
    if (!validation.valid) {
      throw new WorkflowTemplatePublicationValidationError(validation)
    }
    return this.transition(
      current,
      input.expectedRevision,
      'published',
      checksumDefinition(
        current.currentVersion.nodes,
        current.currentVersion.edges
      )
    )
  }

  async archive(
    input: TransitionWorkflowTemplateInput
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const current = await this.requireTemplate(input.id)
    if (current.status === 'archived') {
      await this.catalog.syncWorkflowTemplate(current)
      return current
    }
    if (current.status !== 'published') {
      throw new Error('Only published workflow templates can be archived')
    }
    return this.transition(
      current,
      input.expectedRevision,
      'archived',
      current.currentVersion.checksum
    )
  }

  private async requireTemplate(
    id: string
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const normalizedId = requireId(id)
    const template = await this.templates.getTemplate(normalizedId)
    if (!template) {
      throw new Error(`Workflow template not found: ${normalizedId}`)
    }
    return template
  }

  private async saveDraft(
    template: WorkflowTemplateRecord,
    expectedRevision: number
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const result = await this.templates.saveDraft(template, expectedRevision)
    if (result.status === 'conflict') {
      throw new Error('Workflow template revision conflict')
    }
    return result.entity
  }

  private assertDraftRevision(
    current: Revisioned<WorkflowTemplateRecord>,
    expectedRevision: number
  ): void {
    if (current.status !== 'draft') {
      throw new Error('Only draft workflow templates can be edited')
    }
    if (current.revision !== expectedRevision) {
      throw new Error('Workflow template revision conflict')
    }
  }

  private saveNodeDefinition(
    current: Revisioned<WorkflowTemplateRecord>,
    nodes: WorkflowTemplateVersionRecord['nodes'],
    edges: WorkflowTemplateVersionRecord['edges'],
    expectedRevision: number
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    const normalizedNodes = nodes
      .slice()
      .sort(compareNodes)
      .map((node, order) => ({ ...node, order }))
    return this.saveDraft(
      {
        ...current,
        updatedAt: this.now(),
        currentVersion: {
          ...current.currentVersion,
          nodes: normalizedNodes,
          edges,
          checksum: checksumDefinition(normalizedNodes, edges)
        }
      },
      expectedRevision
    )
  }

  private async transition(
    current: Revisioned<WorkflowTemplateRecord>,
    expectedRevision: number,
    status: 'published' | 'archived',
    checksum: string
  ): Promise<Revisioned<WorkflowTemplateRecord>> {
    if (current.revision !== expectedRevision) {
      throw new Error('Workflow template revision conflict')
    }
    const result = await this.templates.setStatus(
      current.id,
      expectedRevision,
      status,
      this.now(),
      checksum
    )
    if (result.status === 'conflict') {
      throw new Error('Workflow template revision conflict')
    }
    await this.catalog.syncWorkflowTemplate(result.entity)
    return result.entity
  }
}

function requireId(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error('Workflow template id is required')
  return normalized
}

function requireDefinitionId(value: string, message: string): string {
  const normalized = value.trim()
  if (!normalized || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error(message)
  }
  return normalized
}

function requireName(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error('Workflow template name is required')
  return normalized
}

function normalizeDescription(value: string | undefined): string {
  return value?.trim() ?? ''
}

function copyVersion(
  source: WorkflowTemplateVersionRecord,
  templateId: string,
  createdAt: number
): WorkflowTemplateVersionRecord {
  const versionId = `${templateId}-v1`
  const nodeIds = new Map(
    source.nodes.map((node) => [
      node.id,
      `${versionId}-node-${normalizeStableKey(node.stableKey)}`
    ])
  )
  const nodes = source.nodes.map((node) => ({
    ...structuredClone(node),
    id: nodeIds.get(node.id)!
  }))
  const edges = source.edges.map((edge, index) => ({
    id: `${versionId}-edge-${index + 1}`,
    sourceNodeId: nodeIds.get(edge.sourceNodeId)!,
    targetNodeId: nodeIds.get(edge.targetNodeId)!
  }))
  return {
    id: versionId,
    templateId,
    version: 1,
    status: 'draft',
    checksum: checksumDefinition(nodes, edges),
    createdAt,
    nodes,
    edges
  }
}

function createNextVersion(
  source: WorkflowTemplateVersionRecord,
  createdAt: number,
  version = source.version + 1
): WorkflowTemplateVersionRecord {
  const versionId = `${source.templateId}-v${version}`
  const nodeIds = new Map(
    source.nodes.map((node) => [
      node.id,
      `${versionId}-node-${normalizeStableKey(node.stableKey)}`
    ])
  )
  const nodes = source.nodes.map((node) => ({
    ...structuredClone(node),
    id: nodeIds.get(node.id)!
  }))
  const edges = source.edges.map((edge, index) => ({
    id: `${versionId}-edge-${index + 1}`,
    sourceNodeId: nodeIds.get(edge.sourceNodeId)!,
    targetNodeId: nodeIds.get(edge.targetNodeId)!
  }))
  return {
    id: versionId,
    templateId: source.templateId,
    version,
    status: 'draft',
    checksum: checksumDefinition(nodes, edges),
    createdAt,
    nodes,
    edges
  }
}

function checksumDefinition(
  nodes: WorkflowTemplateVersionRecord['nodes'],
  edges: WorkflowTemplateVersionRecord['edges']
): string {
  const definition = {
    nodes: nodes.map(({ id: _id, position: _position, ...node }) => node),
    edges: edges.map(({ id: _id, sourceNodeId, targetNodeId }) => ({
      sourceNodeId,
      targetNodeId
    }))
  }
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex')
}

function normalizeStableKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function requireStableKey(value: string): string {
  const normalized = value.trim()
  if (!normalized || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error('Workflow template node stable key is invalid')
  }
  return normalized
}

function normalizeNodePositions(
  positions: UpdateWorkflowTemplateNodePositionsInput['positions']
): UpdateWorkflowTemplateNodePositionsInput['positions'] {
  if (positions.length === 0) {
    throw new Error('Workflow template node positions are required')
  }
  const nodeIds = new Set<string>()
  return positions.map(({ nodeId, position }) => {
    const normalizedNodeId = requireId(nodeId)
    if (nodeIds.has(normalizedNodeId)) {
      throw new Error('Workflow template node positions must be unique')
    }
    nodeIds.add(normalizedNodeId)
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      Math.abs(position.x) > 1_000_000 ||
      Math.abs(position.y) > 1_000_000
    ) {
      throw new Error('Workflow template node position is invalid')
    }
    return {
      nodeId: normalizedNodeId,
      position: {
        x: position.x,
        y: position.y
      }
    }
  })
}

function normalizeNodeDraft(
  node: WorkflowTemplateNodeDraft
): WorkflowTemplateNodeDraft {
  if (!['ai_generate', 'human_input', 'tool', 'approval'].includes(node.type)) {
    throw new Error('Workflow template node type is invalid')
  }
  const configuration =
    node.configuration === undefined
      ? undefined
      : normalizeNodeConfiguration(node.configuration, node.type)
  return {
    stableKey: requireStableKey(node.stableKey),
    type: node.type,
    name: requireNodeName(node.name),
    description: node.description.trim(),
    allowSkip: configuration?.skip.allowed ?? node.allowSkip,
    ...(configuration
      ? {
          configuration,
          ...projectNodeConfiguration(
            configuration,
            node.type,
            node.stableKey,
            node.executor
          )
        }
      : {
          ...(node.executor === undefined
            ? {}
            : { executor: structuredClone(node.executor) }),
          ...(node.completionGate === undefined
            ? {}
            : { completionGate: structuredClone(node.completionGate) })
        })
  }
}

function projectNodeConfiguration(
  configuration: WorkflowNodeConfiguration,
  nodeType: WorkflowTemplateNode['type'],
  stableKey: string,
  existingExecutor?: WorkflowTemplateNode['executor']
): Pick<WorkflowTemplateNode, 'executor' | 'completionGate'> {
  const completionGate =
    configuration.completionGate.requireApproval ||
    configuration.completionGate.customGateId
      ? { ...configuration.completionGate }
      : undefined
  const executor =
    nodeType === 'ai_generate' || nodeType === 'tool'
      ? {
          kind: 'ai_generate' as const,
          prompt: configuration.prompt,
          reasoning: configuration.reasoning ?? 'inherit',
          artifact: {
            relativePath:
              configuration.artifact.required &&
              configuration.artifact.relativePath
                ? configuration.artifact.relativePath
                : `artifacts/${stableKey}.md`,
            kind:
              configuration.artifact.required && configuration.artifact.kind
                ? configuration.artifact.kind
                : 'markdown'
          },
          ...(configuration.input.attachments.length > 0
            ? {
                context: {
                  attachments: [...configuration.input.attachments]
                }
              }
            : {}),
          ...(existingExecutor?.legacyStageId
            ? { legacyStageId: existingExecutor.legacyStageId }
            : {})
        }
      : undefined
  return {
    ...(executor ? { executor } : {}),
    ...(completionGate ? { completionGate } : {})
  }
}

function applyNodeConfiguration(
  node: WorkflowTemplateNode,
  configuration: WorkflowNodeConfiguration
): WorkflowTemplateNode {
  const {
    executor: _executor,
    completionGate: _completionGate,
    configuration: _configuration,
    ...base
  } = node
  return {
    ...base,
    allowSkip: configuration.skip.allowed,
    configuration,
    ...projectNodeConfiguration(
      configuration,
      node.type,
      node.stableKey,
      node.executor
    )
  }
}

function configurationsEqual(
  left: WorkflowNodeConfiguration | undefined,
  right: WorkflowNodeConfiguration
): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right)
}

function requireNodeName(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error('Workflow template node name is required')
  return normalized
}

function nodeId(versionId: string, stableKey: string): string {
  return `${versionId}-node-${normalizeStableKey(stableKey)}`
}

function edgeId(
  versionId: string,
  sourceNodeId: string,
  targetNodeId: string
): string {
  const digest = createHash('sha256')
    .update(`${sourceNodeId}\u0000${targetNodeId}`)
    .digest('hex')
    .slice(0, 16)
  return `${versionId}-edge-${digest}`
}

function hasCycle(
  nodes: WorkflowTemplateVersionRecord['nodes'],
  edges: WorkflowTemplateVersionRecord['edges']
): boolean {
  const targetsBySource = new Map<string, string[]>()
  for (const node of nodes) targetsBySource.set(node.id, [])
  for (const edge of edges) {
    targetsBySource.get(edge.sourceNodeId)?.push(edge.targetNodeId)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()

  function visit(nodeIdValue: string): boolean {
    if (visiting.has(nodeIdValue)) return true
    if (visited.has(nodeIdValue)) return false
    visiting.add(nodeIdValue)
    for (const target of targetsBySource.get(nodeIdValue) ?? []) {
      if (visit(target)) return true
    }
    visiting.delete(nodeIdValue)
    visited.add(nodeIdValue)
    return false
  }

  return nodes.some((node) => visit(node.id))
}

function nodeMatches(
  node: WorkflowTemplateNode,
  draft: WorkflowTemplateNodeDraft
): boolean {
  return (
    node.stableKey === draft.stableKey &&
    node.type === draft.type &&
    node.name === draft.name &&
    node.description === draft.description &&
    node.allowSkip === draft.allowSkip &&
    JSON.stringify(node.configuration) ===
      JSON.stringify(draft.configuration) &&
    JSON.stringify(node.executor) === JSON.stringify(draft.executor) &&
    JSON.stringify(node.completionGate) === JSON.stringify(draft.completionGate)
  )
}

function compareNodes(
  left: WorkflowTemplateNode,
  right: WorkflowTemplateNode
): number {
  return left.order - right.order || left.id.localeCompare(right.id)
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}
