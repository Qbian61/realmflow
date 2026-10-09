import type { ModelCapabilities, ModelProvider } from '../../domain/model'
import type { Translator } from '../localization/translate'
import type {
  ProfileDraft,
  ProviderDraft
} from '../features/settings/ModelEditors'

export type ActiveSettingsSection =
  | 'general'
  | 'models'
  | 'backup'

export function resolveSettingsSection(search: string): ActiveSettingsSection {
  const section = new URLSearchParams(search).get('section')
  return section === 'models' ||
    section === 'backup'
    ? section
    : 'general'
}

export function getSettingsSectionLabel(
  t: Translator,
  section: ActiveSettingsSection
): string {
  if (section === 'models') return t('userMenu.modelConfiguration')
  return t(`settings.section.${section}.label`)
}

const defaultCapabilities: ModelCapabilities = {
  text: true,
  vision: false,
  toolCalling: true,
  structuredOutput: true
}

export function newProviderDraft(): ProviderDraft {
  return {
    id: createId('provider'),
    type: 'openai_completions',
    name: '',
    baseUrl: '',
    enabled: true,
    apiKey: '',
    customHeaders: [],
    expectedRevision: 0
  }
}

export function newProfileDraft(
  providerId: string,
  apiType: ModelProvider['type'] = 'openai_completions'
): ProfileDraft {
  return {
    id: createId('profile'),
    providerId,
    modelId: '',
    displayName: '',
    source: 'custom',
    apiType,
    icon: '',
    deepSeekThinking: false,
    enabled: true,
    capabilities: { ...defaultCapabilities },
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    inputTypes: ['text'],
    reasoning: false,
    timeoutMs: 120_000,
    maxRetries: 2,
    maxConcurrency: 1,
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
    expectedRevision: 0
  }
}

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
