import { FolderOpen } from 'lucide-react'
import type { WorkRootDto } from '../../../shared/business'
import type {
  ApplicationModelDefault,
  EffectiveModelSnapshot,
  RevisionedApplicationModelDefault
} from '../../../domain/model'
import { Button, Field } from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'

type GeneralSettingsProps = {
  currentWorkRoot?: WorkRootDto
  historicalWorkRoots: WorkRootDto[]
  effectiveModels: EffectiveModelSnapshot
  applicationModelDefault: RevisionedApplicationModelDefault
  loading: boolean
  savingModelDefault: boolean
  choosingWorkRoot: boolean
  onChooseWorkRoot: () => void
  onChangeModelDefault: (preference: ApplicationModelDefault) => void
}

export function GeneralSettings({
  currentWorkRoot,
  historicalWorkRoots,
  effectiveModels,
  applicationModelDefault,
  loading,
  savingModelDefault,
  choosingWorkRoot,
  onChooseWorkRoot,
  onChangeModelDefault
}: GeneralSettingsProps): JSX.Element {
  const { t } = useLocalization()
  const availableProfileIds = new Set(
    effectiveModels.groups.flatMap((group) =>
      group.models.map((model) => model.profileId)
    )
  )
  const selectedValue =
    applicationModelDefault.mode === 'profile' &&
    availableProfileIds.has(applicationModelDefault.profileId)
      ? applicationModelDefault.profileId
      : 'auto'

  return (
    <>
      <section
        className="model-section"
        aria-labelledby="default-model-heading"
      >
        <header>
          <div>
            <h3 id="default-model-heading">
              {t('settings.defaultModel.heading')}
            </h3>
            <p>{t('settings.defaultModel.description')}</p>
          </div>
        </header>
        <Field name="settings-default-model-label"
          className="settings-default-model-field"
          label={t('settings.defaultModel.label')}
          disabled={loading || savingModelDefault}
          description={
            effectiveModels.groups.every((group) => group.models.length === 0)
              ? t('settings.defaultModel.empty')
              : undefined
          }
        >
          <select
            name="application-default-model"
            autoComplete="off"
            value={selectedValue}
            onChange={(event) => {
              const profileId = event.target.value
              if (profileId === 'auto') {
                onChangeModelDefault({ mode: 'auto' })
                return
              }
              const group = effectiveModels.groups.find((candidate) =>
                candidate.models.some((model) => model.profileId === profileId)
              )
              if (group) {
                onChangeModelDefault({
                  mode: 'profile',
                  providerId: group.providerId,
                  profileId
                })
              }
            }}
          >
            <option value="auto">{t('settings.defaultModel.auto')}</option>
            {effectiveModels.groups.map((group) => (
              <optgroup key={group.providerId} label={group.providerName}>
                {group.models.map((model) => (
                  <option key={model.profileId} value={model.profileId}>
                    {model.displayName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </section>

      <section
        className="model-section"
        aria-labelledby="work-root-heading"
      >
        <header>
          <div>
            <h3 id="work-root-heading">{t('settings.workRoot.heading')}</h3>
            <p>{t('settings.workRoot.description')}</p>
          </div>
          <Button
            className="model-action"
            variant="primary"
            size="default"
            leadingIcon={<FolderOpen size={15} aria-hidden="true" />}
            disabled={loading || choosingWorkRoot}
            onClick={onChooseWorkRoot}
          >
            {choosingWorkRoot
              ? t('settings.workRoot.choosing')
              : currentWorkRoot
                ? t('settings.workRoot.change')
                : t('settings.workRoot.choose')}
          </Button>
        </header>
        <div className="model-list">
          <div className="model-list-row">
            <div>
              <strong>
                {currentWorkRoot
                  ? t('settings.workRoot.current')
                  : t('settings.workRoot.notConfigured')}
              </strong>
              <span className="work-root-path">
                {currentWorkRoot?.path ?? t('settings.workRoot.required')}
              </span>
            </div>
          </div>
        </div>
        {historicalWorkRoots.length > 0 ? (
          <div className="work-root-history">
            <h4>{t('settings.workRoot.history')}</h4>
            <div className="model-list">
              {historicalWorkRoots.map((historicalRoot) => (
                <div className="model-list-row" key={historicalRoot.id}>
                  <div>
                    <span className="work-root-path">
                      {historicalRoot.path}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  )
}
