import type {
  CapabilityDefinition,
  CapabilityInstallation,
  ConnectorKind
} from '../../../domain/capability'
import { useLocalization } from '../../localization/LocalizationProvider'
import { InstalledCapabilityList } from './InstalledCapabilityList'
import type { LocalizedCapabilityDisplay } from '../../../shared/capability-localization'

type ConnectorCapabilityListProps = {
  filter: 'all' | ConnectorKind
  definitions: CapabilityDefinition[]
  installations: CapabilityInstallation[]
  displayByDefinitionKey?: Record<string, LocalizedCapabilityDisplay>
  busyInstallationId?: string
  onSetEnabled: (
    installation: CapabilityInstallation,
    enabled: boolean
  ) => void
  onChangeVersion: (
    installation: CapabilityInstallation,
    targetVersion: string,
    operation: 'upgrade' | 'rollback'
  ) => void
  onDelete: (installation: CapabilityInstallation) => void
}

export function ConnectorCapabilityList({
  filter,
  definitions,
  installations,
  displayByDefinitionKey,
  busyInstallationId,
  onSetEnabled,
  onChangeVersion,
  onDelete
}: ConnectorCapabilityListProps): JSX.Element | null {
  const { t } = useLocalization()
  const visibleDefinitions = definitions.filter(
    (definition) =>
      definition.kind === 'connector' &&
      definition.runtime.kind === 'connector' &&
      (filter === 'all' || definition.runtime.connectorKind === filter)
  )
  const visibleIds = new Set(
    visibleDefinitions.map(
      (definition) => `${definition.id}@${definition.version}`
    )
  )
  const visibleInstallations = installations.filter((installation) =>
    visibleIds.has(
      `${installation.capabilityId}@${installation.capabilityVersion}`
    )
  )

  return (
    <InstalledCapabilityList
      kind="connector"
      definitions={visibleDefinitions}
      installations={visibleInstallations}
      displayByDefinitionKey={displayByDefinitionKey}
      busyInstallationId={busyInstallationId}
      onSetEnabled={onSetEnabled}
      onChangeVersion={onChangeVersion}
      onDelete={onDelete}
      getDetail={(definition, installation) => {
        if (definition.runtime.kind !== 'connector') {
          return definition.description
        }
        const status =
          installation.status === 'quarantined'
            ? t('capabilities.connectors.reviewRequired')
            : installation.status === 'enabled'
              ? t('capabilities.connectors.available')
              : t('capabilities.status.disabled')
        return `${connectorKindLabel(definition.runtime.connectorKind)} · ${t(
          'capabilities.connectors.actions',
          { count: definition.runtime.actions.length }
        )} · ${status}`
      }}
    />
  )
}

function connectorKindLabel(kind: ConnectorKind): string {
  if (kind === 'mcp') return 'MCP'
  if (kind === 'http') return 'HTTP'
  if (kind === 'database') return 'Database'
  return 'CLI'
}
