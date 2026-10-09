export type QdrantFilterCondition = Readonly<{
  key: string
  match:
    | Readonly<{ value: string }>
    | Readonly<{ any: readonly string[] }>
}>

export type QdrantWorkspaceFilter = Readonly<{
  must: readonly QdrantFilterCondition[]
}>

export function buildWorkspaceTenantFilter(input: {
  workspaceIds: readonly string[]
  conditions?: readonly QdrantFilterCondition[]
  useAnyMatch?: boolean
}): QdrantWorkspaceFilter {
  const workspaceIds = [...new Set(input.workspaceIds)]
  if (
    workspaceIds.length === 0 ||
    workspaceIds.some((workspaceId) => workspaceId.trim().length === 0) ||
    input.conditions?.some((condition) => condition.key === 'workspaceId')
  ) {
    throw new Error('Workspace tenant filter is required')
  }
  return {
    must: [
      {
        key: 'workspaceId',
        match:
          workspaceIds.length === 1 && !input.useAnyMatch
            ? { value: workspaceIds[0]! }
            : { any: workspaceIds }
      },
      ...(input.conditions ?? [])
    ]
  }
}

export function rebuildWorkspaceTenantFilter(
  filter: QdrantWorkspaceFilter
): QdrantWorkspaceFilter {
  const workspaceConditions = filter.must.filter(
    (condition) => condition.key === 'workspaceId'
  )
  if (workspaceConditions.length !== 1) {
    throw new Error('Workspace tenant filter is required')
  }
  const match = workspaceConditions[0]!.match
  const workspaceIds =
    'value' in match ? [match.value] : [...match.any]
  return buildWorkspaceTenantFilter({
    workspaceIds,
    conditions: filter.must.filter(
      (condition) => condition.key !== 'workspaceId'
    )
  })
}
