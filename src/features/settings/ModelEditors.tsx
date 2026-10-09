import { Plus, Trash2, X } from 'lucide-react'
import type { FormEvent } from 'react'
import type {
  ModelAvailabilityCheck,
  ModelProfile,
  ModelProvider
} from '../../../domain/model'
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton
} from '../../components/ui'
import { useLocalization } from '../../localization/LocalizationProvider'
import type { Translator } from '../../localization/translate'

export type ProviderRecord = ModelProvider & {
  revision: number
  credentialConfigured?: boolean
  customHeaderNames?: string[]
}
export type ProfileRecord = ModelProfile & {
  revision: number
  availability?: ModelAvailabilityCheck
}

export type ProviderDraft = ModelProvider & {
  apiKey: string
  customHeaders?: Array<{
    name: string
    value: string
    configured: boolean
  }>
  expectedRevision: number
}

export type ProfileDraft = ModelProfile & {
  expectedRevision: number
}

type EditorProps<T> = {
  draft: T
  saving: boolean
  onChange: (draft: T) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ProviderEditor({
  draft,
  saving,
  onChange,
  onClose,
  onSubmit
}: EditorProps<ProviderDraft>): JSX.Element {
  const { t } = useLocalization()
  return (
    <Dialog
      open
      size="wide"
      locked={saving}
      aria-labelledby="provider-editor-title"
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        className="model-editor-form"
        onSubmit={onSubmit}
      >
        <DialogHeader>
          <h2 id="provider-editor-title">
            {draft.expectedRevision
              ? t('settings.editor.provider.edit')
              : t('settings.editor.provider.add')}
          </h2>
          <IconButton
            aria-label={t('common.close')}
            title={t('common.close')}
            variant="ghost"
            disabled={saving}
            onClick={onClose}
          >
            <X size={17} />
          </IconButton>
        </DialogHeader>
        <DialogBody className="model-form-grid">
          <Field name="settings-editor-provider-name" label={t('settings.editor.provider.name')}>
            <input
              required
              disabled={draft.source === 'builtin'}
              value={draft.name}
              onChange={(event) =>
                onChange({ ...draft, name: event.target.value })
              }
            />
          </Field>
          <Field name="settings-editor-provider-type" label={t('settings.editor.provider.type')}>
            <select
              disabled={draft.source === 'builtin'}
              value={draft.type}
              onChange={(event) =>
                onChange({
                  ...draft,
                  type: event.target.value as ModelProvider['type']
                })
              }
            >
              {draft.source === 'builtin' &&
              ![
                'openai_completions',
                'openai_responses',
                'anthropic_messages',
                'local'
              ].includes(draft.type) ? (
                <option value={draft.type}>
                  {builtinProtocolLabel(draft.type, t)}
                </option>
              ) : null}
              <option value="openai_completions">
                {t('settings.provider.openAiCompletions')}
              </option>
              <option value="openai_responses">
                {t('settings.provider.openAiResponses')}
              </option>
              <option value="anthropic_messages">
                {t('settings.provider.anthropicMessages')}
              </option>
              <option value="local">{t('settings.editor.provider.local')}</option>
            </select>
          </Field>
          <Field name="settings-editor-provider-base-url"
            className="model-form-wide"
            label={t('settings.editor.provider.baseUrl')}
            description={
              draft.type === 'anthropic_messages'
                ? t('settings.editor.provider.anthropicBaseUrlHint')
                : undefined
            }
          >
            <input inputMode="url"
              required
              type="url"
              value={draft.baseUrl}
              onChange={(event) =>
                onChange({ ...draft, baseUrl: event.target.value })
              }
            />
          </Field>
          <Field name="model-editors-api-key" className="model-form-wide" label="API Key">
            <input spellCheck={false}
              type="password"
              value={draft.apiKey}
              autoComplete="new-password"
              placeholder={
                draft.expectedRevision
                  ? t('settings.editor.provider.keepKey')
                  : t('settings.editor.provider.secureKey')
              }
              onChange={(event) =>
                onChange({ ...draft, apiKey: event.target.value })
              }
            />
          </Field>
          <fieldset className="model-provider-headers model-form-wide">
            <legend>{t('settings.editor.provider.customHeaders')}</legend>
            {(draft.customHeaders ?? []).map((header, index) => (
              <div className="model-provider-header-row" key={index}>
                <Field name={`provider-header-${index}-name`}
                  label={t('settings.editor.provider.headerName', {
                    index: index + 1
                  })}
                >
                  <input
                    required
                    value={header.name}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        customHeaders: (draft.customHeaders ?? []).map(
                          (candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, name: event.target.value }
                              : candidate
                        )
                      })
                    }
                  />
                </Field>
                <Field name={`provider-header-${index}-value`}
                  label={t('settings.editor.provider.headerValue', {
                    index: index + 1
                  })}
                >
                  <input
                    required={!header.configured}
                    type="password"
                    autoComplete="new-password"
                    value={header.value}
                    placeholder={
                      header.configured
                        ? t('settings.editor.provider.keepHeader')
                        : undefined
                    }
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        customHeaders: (draft.customHeaders ?? []).map(
                          (candidate, candidateIndex) =>
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  value: event.target.value
                                }
                              : candidate
                        )
                      })
                    }
                  />
                </Field>
                <IconButton
                  aria-label={t('settings.editor.provider.removeHeader', {
                    index: index + 1
                  })}
                  title={t("tooltip.delete")}
                  variant="ghost"
                  size="compact"
                  onClick={() =>
                    onChange({
                      ...draft,
                      customHeaders: (draft.customHeaders ?? []).filter(
                        (_, candidateIndex) => candidateIndex !== index
                      )
                    })
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="compact"
              leadingIcon={<Plus size={15} />}
              className="model-provider-header-add"
              onClick={() =>
                onChange({
                  ...draft,
                  customHeaders: [
                    ...(draft.customHeaders ?? []),
                    { name: '', value: '', configured: false }
                  ]
                })
              }
            >
              {t('settings.editor.provider.addHeader')}
            </Button>
          </fieldset>
          <label className="model-check">
            <input name="model-editors-draft-enabled" autoComplete="off"
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                onChange({ ...draft, enabled: event.target.checked })
              }
            />
            <span>{t('settings.editor.provider.enable')}</span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={saving}
          >
            {t('settings.editor.provider.save')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

export function ProfileEditor({
  draft,
  providers,
  saving,
  onChange,
  onClose,
  onSubmit
}: EditorProps<ProfileDraft> & {
  providers: ProviderRecord[]
}): JSX.Element {
  const { t } = useLocalization()
  const numberField = (
    key:
      | 'contextWindow'
      | 'maxOutputTokens'
      | 'timeoutMs'
      | 'maxRetries'
      | 'maxConcurrency'
      | 'inputCostPerMillionTokens'
      | 'outputCostPerMillionTokens',
    value: string
  ): void => {
    onChange({ ...draft, [key]: Number(value) })
  }

  return (
    <Dialog
      open
      size="wide"
      locked={saving}
      aria-labelledby="profile-editor-title"
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <form
        className="model-editor-form"
        onSubmit={onSubmit}
      >
        <DialogHeader>
          <h2 id="profile-editor-title">
            {draft.expectedRevision
              ? t('settings.editor.profile.edit')
              : t('settings.editor.profile.add')}
          </h2>
          <IconButton
            aria-label={t('common.close')}
            title={t('common.close')}
            variant="ghost"
            disabled={saving}
            onClick={onClose}
          >
            <X size={17} />
          </IconButton>
        </DialogHeader>
        <DialogBody className="model-editor-body">
        <div className="model-form-grid">
          <Field name="settings-editor-profile-provider" label={t('settings.editor.profile.provider')}>
            <select
              value={draft.providerId}
              disabled={draft.expectedRevision > 0}
              onChange={(event) => {
                const provider = providers.find(
                  (candidate) => candidate.id === event.target.value
                )
                onChange({
                  ...draft,
                  providerId: event.target.value,
                  apiType: provider?.type
                })
              }}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </Field>
          <Field name="settings-editor-profile-display-name" label={t('settings.editor.profile.displayName')}>
            <input
              required
              value={draft.displayName}
              onChange={(event) =>
                onChange({ ...draft, displayName: event.target.value })
              }
            />
          </Field>
          <Field name="settings-editor-profile-model-id" label={t('settings.editor.profile.modelId')}>
            <input spellCheck={false}
              required
              value={draft.modelId}
              onChange={(event) =>
                onChange({ ...draft, modelId: event.target.value })
              }
            />
          </Field>
          <Field name="settings-editor-profile-icon" label={t('settings.editor.profile.icon')}>
            <input
              value={draft.icon ?? ''}
              onChange={(event) =>
                onChange({ ...draft, icon: event.target.value })
              }
            />
          </Field>
          <Field name="settings-editor-profile-api-type" label={t('settings.editor.profile.apiType')}>
            <select value={draft.apiType ?? ''} disabled>
              {draft.apiType &&
              ![
                'openai_completions',
                'openai_responses',
                'anthropic_messages',
                'local'
              ].includes(draft.apiType) ? (
                <option value={draft.apiType}>
                  {builtinProtocolLabel(draft.apiType, t)}
                </option>
              ) : null}
              <option value="openai_completions">
                {t('settings.provider.openAiCompletions')}
              </option>
              <option value="openai_responses">
                {t('settings.provider.openAiResponses')}
              </option>
              <option value="anthropic_messages">
                {t('settings.provider.anthropicMessages')}
              </option>
              <option value="local">{t('settings.editor.provider.local')}</option>
            </select>
          </Field>
          <Field name="settings-editor-profile-context-window" label={t('settings.editor.profile.contextWindow')}>
            <input inputMode="numeric"
              required
              min="1"
              type="number"
              value={draft.contextWindow}
              onChange={(event) =>
                numberField('contextWindow', event.target.value)
              }
            />
          </Field>
          <Field name="settings-editor-profile-max-output-tokens" label={t('settings.editor.profile.maxOutputTokens')}>
            <input inputMode="numeric"
              required
              min="1"
              max={draft.contextWindow}
              type="number"
              value={draft.maxOutputTokens ?? 4_096}
              onChange={(event) =>
                numberField('maxOutputTokens', event.target.value)
              }
            />
          </Field>
          <Field name="settings-editor-profile-timeout" label={t('settings.editor.profile.timeout')}>
            <input inputMode="numeric"
              required
              min="1"
              max="600000"
              type="number"
              value={draft.timeoutMs}
              onChange={(event) => numberField('timeoutMs', event.target.value)}
            />
          </Field>
          <Field name="settings-editor-profile-max-retries" label={t('settings.editor.profile.maxRetries')}>
            <input inputMode="numeric"
              required
              min="0"
              max="10"
              type="number"
              value={draft.maxRetries}
              onChange={(event) => numberField('maxRetries', event.target.value)}
            />
          </Field>
          <Field name="settings-editor-profile-max-concurrency" label={t('settings.editor.profile.maxConcurrency')}>
            <input inputMode="numeric"
              required
              min="1"
              max="32"
              type="number"
              value={draft.maxConcurrency}
              onChange={(event) =>
                numberField('maxConcurrency', event.target.value)
              }
            />
          </Field>
          <Field name="settings-editor-profile-input-cost" label={t('settings.editor.profile.inputCost')}>
            <input inputMode="decimal"
              min="0"
              step="0.0001"
              type="number"
              value={draft.inputCostPerMillionTokens}
              onChange={(event) =>
                numberField('inputCostPerMillionTokens', event.target.value)
              }
            />
          </Field>
          <Field name="settings-editor-profile-output-cost" label={t('settings.editor.profile.outputCost')}>
            <input inputMode="decimal"
              min="0"
              step="0.0001"
              type="number"
              value={draft.outputCostPerMillionTokens}
              onChange={(event) =>
                numberField('outputCostPerMillionTokens', event.target.value)
              }
            />
          </Field>
        </div>
        <fieldset className="model-capabilities">
          <legend>{t('settings.editor.profile.capabilities')}</legend>
          {(
            [
              ['text', t('settings.editor.profile.capability.text')],
              ['vision', t('settings.editor.profile.capability.vision')],
              [
                'toolCalling',
                t('settings.editor.profile.capability.toolCalling')
              ],
              [
                'structuredOutput',
                t('settings.editor.profile.capability.structuredOutput')
              ]
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input name={`profile-capability-${key}`} autoComplete="off"
                type="checkbox"
                checked={draft.capabilities[key]}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    capabilities: {
                      ...draft.capabilities,
                      [key]: event.target.checked
                  },
                  ...(key === 'vision'
                    ? {
                        inputTypes: event.target.checked
                          ? ['text', 'image']
                          : ['text']
                      }
                    : {})
                  })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <div className="model-form-grid">
          <label className="model-check">
            <input name="model-editors-draft-reasoning" autoComplete="off"
              type="checkbox"
              checked={draft.reasoning ?? false}
              onChange={(event) =>
                onChange({ ...draft, reasoning: event.target.checked })
              }
            />
            <span>{t('settings.editor.profile.reasoning')}</span>
          </label>
          <label className="model-check">
            <input name="model-editors-draft-deep-seek-thinking" autoComplete="off"
              type="checkbox"
              checked={draft.deepSeekThinking ?? false}
              onChange={(event) =>
                onChange({
                  ...draft,
                  deepSeekThinking: event.target.checked
                })
              }
            />
            <span>{t('settings.editor.profile.deepSeekThinking')}</span>
          </label>
        </div>
        <label className="model-check">
          <input name="model-editors-draft-enabled" autoComplete="off"
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              onChange({ ...draft, enabled: event.target.checked })
            }
          />
          <span>{t('settings.editor.profile.enable')}</span>
        </label>
        </DialogBody>
        <DialogFooter>
          <Button type="button" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={saving}
          >
            {t('settings.editor.profile.save')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

function builtinProtocolLabel(
  type: ModelProvider['type'],
  t: Translator
): string {
  const labels = {
    azure_openai_responses: 'settings.provider.azureOpenAiResponses',
    bedrock_converse_stream: 'settings.provider.bedrockConverseStream',
    google_generative_ai: 'settings.provider.googleGenerativeAi',
    openai_codex_responses: 'settings.provider.openAiCodexResponses'
  } as const
  return type in labels
    ? t(labels[type as keyof typeof labels])
    : type
}

export {
  ProfileDeleteDialog,
  ProviderDeleteDialog
} from './ModelDeleteDialogs'
