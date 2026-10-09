import type { ConnectorDto, ModelPoolDto } from '../../../shared/business'
import type { WorkflowReasoningPolicy } from '../../../domain/workflow'
import { useLocalization } from '../../localization/LocalizationProvider'

export function WorkflowFixedModelSelector({
  profileId,
  models,
  onChange
}: {
  profileId: string
  models?: ModelPoolDto
  onChange: (profileId: string) => void
}): JSX.Element {
  const { t } = useLocalization()
  const profiles = models?.profiles ?? []
  return (
    <label>
      <span>{t('workflowConfig.profileId')}</span>
      <select name="workflow-configuration-catalog-fields-profile-id" autoComplete="off"
        required
        value={profileId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('workflowConfig.model.select')}</option>
        {profiles.map((profile) => (
          <option
            key={profile.id}
            value={profile.id}
            disabled={!profile.enabled}
          >
            {profile.displayName}
          </option>
        ))}
        {profileId && !profiles.some(({ id }) => id === profileId) ? (
          <option value={profileId} disabled>
            {profileId}
          </option>
        ) : null}
      </select>
    </label>
  )
}

export function WorkflowConnectorSelector({
  connectors,
  selectedIds,
  onChange
}: {
  connectors?: ConnectorDto[]
  selectedIds: string[]
  onChange: (connectorIds: string[]) => void
}): JSX.Element {
  const { t } = useLocalization()
  const records = connectors ?? []
  const knownIds = new Set(records.map(({ connector }) => connector.id))

  return (
    <div className="workflow-connector-selector">
      <span>{t('workflowConfig.connectors')}</span>
      {records.map(({ connector }) => (
        <label className="workflow-node-checkbox" key={connector.id}>
          <input name={`workflow-connector-${connector.id}`} autoComplete="off"
            type="checkbox"
            checked={selectedIds.includes(connector.id)}
            disabled={!connector.enabled}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selectedIds, connector.id]
                  : selectedIds.filter((id) => id !== connector.id)
              )
            }
          />
          <span>{connector.name}</span>
        </label>
      ))}
      {selectedIds
        .filter((id) => !knownIds.has(id))
        .map((id) => (
          <label className="workflow-node-checkbox" key={id}>
            <input name={`workflow-connector-${id}`} autoComplete="off" type="checkbox" checked disabled />
            <span>{id}</span>
          </label>
        ))}
      {records.length === 0 && selectedIds.length === 0 ? (
        <p>{t('workflowConfig.connectorsEmpty')}</p>
      ) : null}
    </div>
  )
}

export function WorkflowReasoningSelector({
  value,
  supported,
  onChange
}: {
  value: WorkflowReasoningPolicy
  supported: boolean
  onChange: (reasoning: WorkflowReasoningPolicy) => void
}): JSX.Element {
  const { t } = useLocalization()
  return (
    <label>
      <span>{t('workflowConfig.reasoning')}</span>
      <select name="workflow-configuration-catalog-fields-value" autoComplete="off"
        value={value}
        onChange={(event) =>
          onChange(event.target.value as WorkflowReasoningPolicy)
        }
      >
        {(['inherit', 'off', 'low', 'medium', 'high'] as const).map(
          (reasoning) => (
            <option
              key={reasoning}
              value={reasoning}
              disabled={reasoning !== 'inherit' && !supported}
            >
              {t(`workflowConfig.reasoning.${reasoning}`)}
              {reasoning !== 'inherit' && !supported
                ? ` · ${t('workflowConfig.reasoning.unsupported')}`
                : ''}
            </option>
          )
        )}
      </select>
    </label>
  )
}
