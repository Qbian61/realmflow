import { Pencil, Plus, X } from 'lucide-react'
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState
} from 'react'
import type { BusinessApi } from '../../shared/business'
import type {
  ModelCapabilities,
  ModelProfile,
  ModelProvider
} from '../../domain/model'

type ProviderRecord = ModelProvider & { revision: number }
type ProfileRecord = ModelProfile & { revision: number }

type ProviderDraft = ModelProvider & {
  apiKey: string
  expectedRevision: number
}

type ProfileDraft = ModelProfile & {
  expectedRevision: number
}

const defaultCapabilities: ModelCapabilities = {
  text: true,
  vision: false,
  toolCalling: true,
  structuredOutput: true
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function newProviderDraft(): ProviderDraft {
  return {
    id: createId('provider'),
    type: 'openai_compatible',
    name: '',
    baseUrl: '',
    enabled: true,
    apiKey: '',
    expectedRevision: 0
  }
}

function newProfileDraft(providerId: string): ProfileDraft {
  return {
    id: createId('profile'),
    providerId,
    modelId: '',
    displayName: '',
    enabled: true,
    capabilities: { ...defaultCapabilities },
    contextWindow: 128_000,
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
    expectedRevision: 0
  }
}

export default function SettingsPage(): JSX.Element {
  const business = window.realmflow?.business
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>()
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!business) {
      setError('模型服务当前不可用')
      setLoading(false)
      return
    }
    void business
      .listModels()
      .then((pool) => {
        setProviders(pool.providers)
        setProfiles(pool.profiles)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '模型设置加载失败')
      })
      .finally(() => setLoading(false))
  }, [business])

  const providerNames = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider.name])),
    [providers]
  )

  async function saveProvider(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!business || !providerDraft) return
    setSaving(true)
    setError('')
    const { apiKey, expectedRevision } = providerDraft
    const provider: ModelProvider = {
      id: providerDraft.id,
      type: providerDraft.type,
      name: providerDraft.name,
      baseUrl: providerDraft.baseUrl,
      enabled: providerDraft.enabled
    }
    try {
      const saved = await business.saveModelProvider({
        ...provider,
        expectedRevision
      })
      if (apiKey) {
        await business.setModelCredential({
          providerId: saved.id,
          value: apiKey
        })
      }
      setProviders((current) => [
        ...current.filter((item) => item.id !== saved.id),
        saved
      ])
      setProviderDraft(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '供应商保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!business || !profileDraft) return
    setSaving(true)
    setError('')
    const { expectedRevision } = profileDraft
    const profile: ModelProfile = {
      id: profileDraft.id,
      providerId: profileDraft.providerId,
      modelId: profileDraft.modelId,
      displayName: profileDraft.displayName,
      enabled: profileDraft.enabled,
      capabilities: profileDraft.capabilities,
      contextWindow: profileDraft.contextWindow,
      inputCostPerMillionTokens: profileDraft.inputCostPerMillionTokens,
      outputCostPerMillionTokens: profileDraft.outputCostPerMillionTokens
    }
    try {
      const saved = await business.saveModelProfile({
        ...profile,
        expectedRevision
      })
      setProfiles((current) => [
        ...current.filter((item) => item.id !== saved.id),
        saved
      ])
      setProfileDraft(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模型保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="model-page">
      <header className="model-page-heading">
        <div>
          <span>SETTINGS / MODELS</span>
          <h1>设置</h1>
          <p>调整应用与模型偏好</p>
        </div>
      </header>

      {error ? <p className="model-page-error" role="alert">{error}</p> : null}

      <section className="model-section" aria-labelledby="provider-heading">
        <header>
          <div>
            <h2 id="provider-heading">供应商</h2>
            <p>连接 OpenAI 兼容服务或本地推理服务。</p>
          </div>
          <button
            className="model-action"
            type="button"
            onClick={() => setProviderDraft(newProviderDraft())}
          >
            <Plus size={15} />
            添加供应商
          </button>
        </header>
        <div className="model-list">
          {loading ? <p className="model-empty">正在加载...</p> : null}
          {!loading && providers.length === 0 ? (
            <p className="model-empty">尚未配置供应商</p>
          ) : null}
          {providers.map((provider) => (
            <div className="model-list-row" key={provider.id}>
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.baseUrl}</span>
              </div>
              <div className="model-row-meta">
                <span>{provider.type === 'local' ? '本地' : 'OpenAI 兼容'}</span>
                <span>{provider.enabled ? '已启用' : '已停用'}</span>
                <button
                  type="button"
                  aria-label={`编辑供应商 ${provider.name}`}
                  onClick={() =>
                    setProviderDraft({
                      ...provider,
                      apiKey: '',
                      expectedRevision: provider.revision
                    })
                  }
                >
                  <Pencil size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="model-section" aria-labelledby="profile-heading">
        <header>
          <div>
            <h2 id="profile-heading">模型</h2>
            <p>配置模型标识、能力、上下文窗口与成本。</p>
          </div>
          <button
            className="model-action"
            type="button"
            disabled={providers.length === 0}
            onClick={() => setProfileDraft(newProfileDraft(providers[0].id))}
          >
            <Plus size={15} />
            添加模型
          </button>
        </header>
        <div className="model-list">
          {!loading && profiles.length === 0 ? (
            <p className="model-empty">尚未配置模型</p>
          ) : null}
          {profiles.map((profile) => (
            <div className="model-list-row" key={profile.id}>
              <div>
                <strong>{profile.displayName}</strong>
                <span>
                  {providerNames.get(profile.providerId) ?? '未知供应商'} ·{' '}
                  {profile.modelId}
                </span>
              </div>
              <div className="model-row-meta">
                <span>{profile.contextWindow.toLocaleString()} tokens</span>
                <span>{profile.enabled ? '已启用' : '已停用'}</span>
                <button
                  type="button"
                  aria-label={`编辑模型 ${profile.displayName}`}
                  onClick={() =>
                    setProfileDraft({
                      ...profile,
                      capabilities: { ...profile.capabilities },
                      expectedRevision: profile.revision
                    })
                  }
                >
                  <Pencil size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {providerDraft ? (
        <ProviderEditor
          draft={providerDraft}
          saving={saving}
          onChange={setProviderDraft}
          onClose={() => setProviderDraft(undefined)}
          onSubmit={saveProvider}
        />
      ) : null}
      {profileDraft ? (
        <ProfileEditor
          draft={profileDraft}
          providers={providers}
          saving={saving}
          onChange={setProfileDraft}
          onClose={() => setProfileDraft(undefined)}
          onSubmit={saveProfile}
        />
      ) : null}
    </main>
  )
}

function ProviderEditor({
  draft,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  draft: ProviderDraft
  saving: boolean
  onChange: (draft: ProviderDraft) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}): JSX.Element {
  return (
    <div className="model-editor-backdrop">
      <form
        className="model-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-editor-title"
        onSubmit={onSubmit}
      >
        <header>
          <h2 id="provider-editor-title">
            {draft.expectedRevision ? '编辑供应商' : '添加供应商'}
          </h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="model-form-grid">
          <label>
            <span>供应商名称</span>
            <input
              required
              value={draft.name}
              onChange={(event) =>
                onChange({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label>
            <span>服务类型</span>
            <select
              value={draft.type}
              onChange={(event) =>
                onChange({
                  ...draft,
                  type: event.target.value as ModelProvider['type']
                })
              }
            >
              <option value="openai_compatible">OpenAI 兼容</option>
              <option value="local">本地服务</option>
            </select>
          </label>
          <label className="model-form-wide">
            <span>基础地址</span>
            <input
              required
              type="url"
              value={draft.baseUrl}
              onChange={(event) =>
                onChange({ ...draft, baseUrl: event.target.value })
              }
            />
          </label>
          <label className="model-form-wide">
            <span>API Key</span>
            <input
              type="password"
              value={draft.apiKey}
              autoComplete="new-password"
              placeholder={
                draft.expectedRevision
                  ? '留空以保留现有密钥'
                  : '仅保存在系统安全存储中'
              }
              onChange={(event) =>
                onChange({ ...draft, apiKey: event.target.value })
              }
            />
          </label>
          <label className="model-check">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                onChange({ ...draft, enabled: event.target.checked })
              }
            />
            <span>启用供应商</span>
          </label>
        </div>
        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <button className="primary" type="submit" disabled={saving}>
            保存供应商
          </button>
        </footer>
      </form>
    </div>
  )
}

function ProfileEditor({
  draft,
  providers,
  saving,
  onChange,
  onClose,
  onSubmit
}: {
  draft: ProfileDraft
  providers: ProviderRecord[]
  saving: boolean
  onChange: (draft: ProfileDraft) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}): JSX.Element {
  const numberField = (
    key:
      | 'contextWindow'
      | 'inputCostPerMillionTokens'
      | 'outputCostPerMillionTokens',
    value: string
  ): void => {
    onChange({ ...draft, [key]: Number(value) })
  }

  return (
    <div className="model-editor-backdrop">
      <form
        className="model-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-editor-title"
        onSubmit={onSubmit}
      >
        <header>
          <h2 id="profile-editor-title">
            {draft.expectedRevision ? '编辑模型' : '添加模型'}
          </h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="model-form-grid">
          <label>
            <span>供应商</span>
            <select
              value={draft.providerId}
              onChange={(event) =>
                onChange({ ...draft, providerId: event.target.value })
              }
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>显示名称</span>
            <input
              required
              value={draft.displayName}
              onChange={(event) =>
                onChange({ ...draft, displayName: event.target.value })
              }
            />
          </label>
          <label>
            <span>模型 ID</span>
            <input
              required
              value={draft.modelId}
              onChange={(event) =>
                onChange({ ...draft, modelId: event.target.value })
              }
            />
          </label>
          <label>
            <span>上下文窗口</span>
            <input
              required
              min="1"
              type="number"
              value={draft.contextWindow}
              onChange={(event) => numberField('contextWindow', event.target.value)}
            />
          </label>
          <label>
            <span>输入成本 / 百万 Token</span>
            <input
              min="0"
              step="0.0001"
              type="number"
              value={draft.inputCostPerMillionTokens}
              onChange={(event) =>
                numberField('inputCostPerMillionTokens', event.target.value)
              }
            />
          </label>
          <label>
            <span>输出成本 / 百万 Token</span>
            <input
              min="0"
              step="0.0001"
              type="number"
              value={draft.outputCostPerMillionTokens}
              onChange={(event) =>
                numberField('outputCostPerMillionTokens', event.target.value)
              }
            />
          </label>
        </div>
        <fieldset className="model-capabilities">
          <legend>能力</legend>
          {(
            [
              ['text', '文本'],
              ['vision', '视觉'],
              ['toolCalling', '工具调用'],
              ['structuredOutput', '结构化输出']
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={draft.capabilities[key]}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    capabilities: {
                      ...draft.capabilities,
                      [key]: event.target.checked
                    }
                  })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <label className="model-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              onChange({ ...draft, enabled: event.target.checked })
            }
          />
          <span>启用模型</span>
        </label>
        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <button className="primary" type="submit" disabled={saving}>
            保存模型
          </button>
        </footer>
      </form>
    </div>
  )
}
