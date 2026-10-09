import {
  instantiateRequirementWorkflow,
  type RequirementNode,
  type RequirementWorkflow,
  type WorkflowTemplateSnapshot
} from './workflow'

export type TemplateMigrationChangedField =
  | 'name'
  | 'description'
  | 'type'
  | 'allowSkip'
  | 'configuration'
  | 'executor'
  | 'completionGate'

export type TemplateMigrationNodeSummary = {
  id: string
  name: string
}

export type TemplateMigrationUpdatedNode = {
  id: string
  sourceName: string
  targetName: string
  changedFields: TemplateMigrationChangedField[]
}

export type TemplateMigrationReorderedNode = {
  id: string
  from: number
  to: number
}

export type TemplateMigrationDiff = {
  addedNodes: TemplateMigrationNodeSummary[]
  removedNodes: TemplateMigrationNodeSummary[]
  updatedNodes: TemplateMigrationUpdatedNode[]
  reorderedNodes: TemplateMigrationReorderedNode[]
  addedEdges: string[]
  removedEdges: string[]
  targetWorkflow: RequirementWorkflow
}

const COMPARABLE_FIELDS: readonly TemplateMigrationChangedField[] = [
  'name',
  'description',
  'type',
  'allowSkip',
  'configuration',
  'executor',
  'completionGate'
]

export function createTemplateMigrationDiff(
  current: RequirementWorkflow,
  target: WorkflowTemplateSnapshot
): TemplateMigrationDiff {
  const instantiated = instantiateRequirementWorkflow(
    target,
    current.requirementId
  )
  const targetWorkflow = {
    ...instantiated,
    revision: current.revision
  }
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]))
  const targetNodes = new Map(
    targetWorkflow.nodes.map((node) => [node.id, node])
  )
  const currentEdgeIds = new Set(current.edges.map((edge) => edge.id))
  const targetEdgeIds = new Set(targetWorkflow.edges.map((edge) => edge.id))

  return {
    addedNodes: targetWorkflow.nodes
      .filter((node) => !currentNodes.has(node.id))
      .map(({ id, name }) => ({ id, name })),
    removedNodes: current.nodes
      .filter((node) => !targetNodes.has(node.id))
      .map(({ id, name }) => ({ id, name })),
    updatedNodes: targetWorkflow.nodes.flatMap((node) => {
      const source = currentNodes.get(node.id)
      if (!source) return []
      const changedFields = COMPARABLE_FIELDS.filter(
        (field) => !structurallyEqual(source[field], node[field])
      )
      return changedFields.length > 0
        ? [
            {
              id: node.id,
              sourceName: source.name,
              targetName: node.name,
              changedFields
            }
          ]
        : []
    }),
    reorderedNodes: targetWorkflow.nodes.flatMap((node) => {
      const source = currentNodes.get(node.id)
      return source && source.order !== node.order
        ? [{ id: node.id, from: source.order, to: node.order }]
        : []
    }),
    addedEdges: targetWorkflow.edges
      .filter((edge) => !currentEdgeIds.has(edge.id))
      .map((edge) => edge.id),
    removedEdges: current.edges
      .filter((edge) => !targetEdgeIds.has(edge.id))
      .map((edge) => edge.id),
    targetWorkflow
  }
}

function structurallyEqual(
  left: RequirementNode[TemplateMigrationChangedField],
  right: RequirementNode[TemplateMigrationChangedField]
): boolean {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalize(item)])
  )
}
