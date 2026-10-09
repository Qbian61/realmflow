import type { CapabilityCatalogSnapshotDto } from '../../../shared/capability-catalog'

type CapabilityFilters = {
  query: string
  source: string
  scope: string
  status: string
  risk: string
}

export function filterCapabilitySnapshot(
  snapshot: CapabilityCatalogSnapshotDto,
  filters: CapabilityFilters
): CapabilityCatalogSnapshotDto {
  const query = filters.query.trim().toLocaleLowerCase()
  const matchingIds = new Set(
    snapshot.installations.flatMap((installation) => {
      const definition = snapshot.definitions.find(
        (candidate) =>
          candidate.id === installation.capabilityId &&
          candidate.version === installation.capabilityVersion
      )
      if (!definition) return []
      const display =
        snapshot.displayByDefinitionKey?.[
          `${definition.id}@${definition.version}`
        ]
      const matches =
        (!query ||
          display?.name.toLocaleLowerCase().includes(query) ||
          display?.description.toLocaleLowerCase().includes(query) ||
          definition.name.toLocaleLowerCase().includes(query) ||
          definition.description.toLocaleLowerCase().includes(query) ||
          definition.id.toLocaleLowerCase().includes(query)) &&
        (filters.source === 'all' || definition.source === filters.source) &&
        (filters.scope === 'all' ||
          installation.scope.kind === filters.scope) &&
        (filters.status === 'all' ||
          (filters.status === 'enabled') === installation.enabled) &&
        (filters.risk === 'all' ||
          definition.permissions.maximumRisk === filters.risk)
      return matches ? [installation.capabilityId] : []
    })
  )
  return {
    definitions: snapshot.definitions.filter((definition) =>
      matchingIds.has(definition.id)
    ),
    installations: snapshot.installations.filter((installation) =>
      matchingIds.has(installation.capabilityId)
    ),
    displayByDefinitionKey: Object.fromEntries(
      Object.entries(snapshot.displayByDefinitionKey ?? {}).filter(([key]) =>
        snapshot.definitions.some(
          (definition) =>
            key === `${definition.id}@${definition.version}` &&
            matchingIds.has(definition.id)
        )
      )
    )
  }
}
