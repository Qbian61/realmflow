import {
  FileText,
  FlaskConical,
  KeyRound,
  ShieldCheck,
  WandSparkles,
  X
} from 'lucide-react'
import { useState } from 'react'
import type { CapabilityScope } from '../../../domain/capability'
import type {
  CapabilityGenerationSession,
  CapabilitySpecSource
} from '../../../domain/capability-builder'
import type {
  CapabilityBuilderApi,
  InstalledCapabilityDto
} from '../../../shared/capability-catalog'
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

type BuilderKind = 'connector' | 'skill' | 'agent'
type BuilderPlatform = 'darwin' | 'win32' | 'linux'

export function CapabilityBuilderDialog({
  api,
  platform,
  onClose,
  onInstalled
}: {
  api: CapabilityBuilderApi
  platform: BuilderPlatform
  onClose: () => void
  onInstalled: (result: InstalledCapabilityDto) => void
}): JSX.Element {
  const { t } = useLocalization()
  const [kind, setKind] = useState<BuilderKind>('connector')
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [request, setRequest] = useState('')
  const [scopeKind, setScopeKind] =
    useState<CapabilityScope['kind']>('global')
  const [workspaceId, setWorkspaceId] = useState('')
  const [requirementId, setRequirementId] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [path, setPath] = useState('/')
  const [method, setMethod] = useState<
    'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  >('GET')
  const [credentialRefs, setCredentialRefs] = useState('')
  const [session, setSession] = useState<CapabilityGenerationSession>()
  const [editing, setEditing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function generate(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const spec = buildSpec()
      const next = session
        ? await api.reviseDraft({
            sessionId: session.id,
            expectedRevision: session.revision,
            request,
            spec
          })
        : await api.createDraft({
            request,
            spec
          })
      setSession(next)
      setEditing(false)
    } catch {
      setError(t('capabilities.builder.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function confirm(enable: boolean): Promise<void> {
    if (!session?.proposal) return
    setBusy(true)
    setError('')
    try {
      const result = await api.confirmInstall({
        sessionId: session.id,
        proposalId: session.proposal.id,
        revision: session.revision,
        packageDigest: session.proposal.packageDigest,
        scope: session.proposal.scope,
        enable
      })
      onInstalled(result)
      onClose()
    } catch {
      setError(t('capabilities.builder.installFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function cancel(): Promise<void> {
    if (!session) {
      onClose()
      return
    }
    setBusy(true)
    try {
      await api.cancel({
        sessionId: session.id,
        expectedRevision: session.revision
      })
      onClose()
    } catch {
      setError(t('capabilities.builder.cancelFailed'))
      setBusy(false)
    }
  }

  function buildSpec(): CapabilitySpecSource {
    const scope = buildScope(
      scopeKind,
      workspaceId.trim(),
      requirementId.trim()
    )
    const description = request.trim()
    if (!description || !name.trim() || !id.trim()) {
      throw new Error('required')
    }
    if (kind === 'skill') {
      return {
        schemaVersion: 1,
        id: id.trim(),
        kind,
        version: '1.0.0',
        name: name.trim(),
        description,
        scope,
        runtime: {
          kind,
          instructions: description,
          executable: false
        },
        permissions: emptyPermissions(),
        dependencies: [],
        compatibility: compatibility(platform)
      }
    }
    if (kind === 'agent') {
      return {
        schemaVersion: 1,
        id: id.trim(),
        kind,
        version: '1.0.0',
        name: name.trim(),
        description,
        scope,
        runtime: {
          kind,
          prompt: description,
          modelCapabilities: ['tool_calling'],
          reasoningModes: ['medium'],
          delegation: { allowed: false, maximumDepth: 0 }
        },
        permissions: emptyPermissions(),
        dependencies: [],
        compatibility: compatibility(platform)
      }
    }
    const url = new URL(baseUrl)
    const references = credentialRefs
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const externalWrite = method !== 'GET' && method !== 'HEAD'
    return {
      schemaVersion: 1,
      id: id.trim(),
      kind,
      version: '1.0.0',
      name: name.trim(),
      description,
      scope,
      runtime: {
        kind,
        connectorKind: 'http',
        baseUrl: url.origin,
        method,
        path: path.trim(),
        credentialRefs: references,
        externalWrite
      },
      permissions: {
        capabilities: [
          'network.connect',
          ...(references.length > 0 ? ['credential.use' as const] : [])
        ],
        maximumRisk: externalWrite ? 'high' : 'medium',
        pathPrefixes: [],
        networkTargets: [url.hostname]
      },
      dependencies: [],
      compatibility: compatibility(platform)
    }
  }

  const proposal = session?.proposal
  const highRisk =
    session?.spec.permissions.maximumRisk === 'high' ||
    session?.spec.permissions.maximumRisk === 'critical' ||
    (session?.spec.runtime.kind === 'connector' &&
      session.spec.runtime.externalWrite)

  return (
    <Dialog
      open
      size="workspace"
      locked={busy}
      aria-labelledby="capability-builder-title"
      onOpenChange={(open) => {
        if (!open) void cancel()
      }}
    >
      <div className="capability-builder-dialog">
        <DialogHeader>
          <div>
            <span>{t('capabilities.builder.kicker')}</span>
            <h2 id="capability-builder-title">
              {t('capabilities.builder.title')}
            </h2>
          </div>
          <IconButton
            aria-label={t('common.close')}
            title={t('common.close')}
            variant="ghost"
            disabled={busy}
            onClick={() => void cancel()}
          >
            <X size={16} aria-hidden="true" />
          </IconButton>
        </DialogHeader>

        {editing ? (
          <form
            className="capability-builder-form"
            onSubmit={(event) => {
              event.preventDefault()
              void generate()
            }}
          >
            <DialogBody className="capability-builder-grid">
            <div className="capability-builder-kind" role="group">
              {(['connector', 'skill', 'agent'] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="compact"
                  variant={kind === value ? 'primary' : 'neutral'}
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                >
                  {t(`capabilities.builder.kind.${value}`)}
                </Button>
              ))}
            </div>
              <Field name="capabilities-builder-name" label={t('capabilities.builder.name')}>
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field name="capabilities-builder-id" label={t('capabilities.builder.id')}>
                <input
                  required
                  value={id}
                  onChange={(event) => setId(event.target.value)}
                />
              </Field>
              <Field name="capabilities-builder-request"
                className="capability-builder-request"
                label={t('capabilities.builder.request')}
              >
                <textarea
                  required
                  rows={4}
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                />
              </Field>
              {kind === 'connector' ? (
                <>
                  <Field name="capabilities-builder-base-url" label={t('capabilities.builder.baseUrl')}>
                    <input inputMode="url"
                      required
                      type="url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                    />
                  </Field>
                  <Field name="capabilities-builder-path" label={t('capabilities.builder.path')}>
                    <input spellCheck={false}
                      required
                      value={path}
                      onChange={(event) => setPath(event.target.value)}
                    />
                  </Field>
                  <Field name="capabilities-builder-method" label={t('capabilities.builder.method')}>
                    <select
                      value={method}
                      onChange={(event) =>
                        setMethod(event.target.value as typeof method)
                      }
                    >
                      {['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].map(
                        (value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        )
                      )}
                    </select>
                  </Field>
                  <Field name="capabilities-builder-credentials" label={t('capabilities.builder.credentials')}>
                    <input
                      value={credentialRefs}
                      onChange={(event) =>
                        setCredentialRefs(event.target.value)
                      }
                    />
                  </Field>
                </>
              ) : null}
              <Field name="capabilities-builder-scope" label={t('capabilities.builder.scope')}>
                <select
                  value={scopeKind}
                  onChange={(event) =>
                    setScopeKind(
                      event.target.value as CapabilityScope['kind']
                    )
                  }
                >
                  <option value="global">
                    {t('capabilities.scope.global')}
                  </option>
                  <option value="workspace">
                    {t('capabilities.scope.workspace')}
                  </option>
                  <option value="requirement">
                    {t('capabilities.scope.requirement')}
                  </option>
                </select>
              </Field>
              {scopeKind === 'workspace' || scopeKind === 'requirement' ? (
                <Field name="capabilities-builder-workspace-id" label={t('capabilities.builder.workspaceId')}>
                  <input spellCheck={false}
                    required
                    value={workspaceId}
                    onChange={(event) =>
                      setWorkspaceId(event.target.value)
                    }
                  />
                </Field>
              ) : null}
              {scopeKind === 'requirement' ? (
                <Field name="capabilities-builder-requirement-id" label={t('capabilities.builder.requirementId')}>
                  <input spellCheck={false}
                    required
                    value={requirementId}
                    onChange={(event) =>
                      setRequirementId(event.target.value)
                    }
                  />
                </Field>
              ) : null}
              {error ? <p role="alert">{error}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" disabled={busy} onClick={() => void cancel()}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={busy}
                disabled={busy}
                leadingIcon={<WandSparkles size={15} aria-hidden="true" />}
              >
                {t('capabilities.builder.generate')}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
          <DialogBody className="capability-builder-review">
            <div className="capability-builder-review-heading">
              <div>
                <span>{session?.spec.kind}</span>
                <strong>{session?.spec.name}</strong>
              </div>
              <code>v{session?.spec.version}</code>
            </div>
            {session?.diagnostics?.length ? (
              <div className="capability-builder-diagnostics" role="alert">
                {session.diagnostics.map((diagnostic) => (
                  <p key={diagnostic}>{diagnostic}</p>
                ))}
              </div>
            ) : null}
            {proposal ? (
              <>
                <h3>{t('capabilities.builder.review')}</h3>
                <dl className="capability-builder-review-list">
                  <div>
                    <ShieldCheck size={15} aria-hidden="true" />
                    <dt>{t('capabilities.builder.permissions')}</dt>
                    <dd>{session.spec.permissions.maximumRisk}</dd>
                  </div>
                  <div>
                    <FileText size={15} aria-hidden="true" />
                    <dt>{t('capabilities.builder.files')}</dt>
                    <dd>
                      {t('capabilities.builder.fileCount', {
                        count: proposal.fileCount
                      })}
                    </dd>
                  </div>
                  <div>
                    <FlaskConical size={15} aria-hidden="true" />
                    <dt>{t('capabilities.builder.tests')}</dt>
                    <dd>
                      {t('capabilities.builder.testCount', {
                        count: proposal.validationReport.tests.length
                      })}
                    </dd>
                  </div>
                  <div>
                    <KeyRound size={15} aria-hidden="true" />
                    <dt>{t('capabilities.builder.credentials')}</dt>
                    <dd>{credentialSummary(session)}</dd>
                  </div>
                </dl>
                <div className="capability-builder-digest">
                  <span>{t('capabilities.builder.digest')}</span>
                  <code>{proposal.packageDigest}</code>
                </div>
              </>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
          </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                {t('capabilities.builder.modify')}
              </Button>
              {proposal ? (
                <>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void confirm(false)}
                  >
                    {t('capabilities.builder.installOnly')}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    loading={busy}
                    disabled={busy || highRisk}
                    onClick={() => void confirm(true)}
                  >
                    {t('capabilities.builder.installEnable')}
                  </Button>
                </>
              ) : null}
            </DialogFooter>
          </>
        )}
      </div>
    </Dialog>
  )
}

function buildScope(
  kind: CapabilityScope['kind'],
  workspaceId: string,
  requirementId: string
): CapabilityScope {
  if (kind === 'workspace') return { kind, workspaceId }
  if (kind === 'requirement') {
    return { kind, workspaceId, requirementId }
  }
  return { kind: 'global' }
}

function emptyPermissions() {
  return {
    capabilities: [],
    maximumRisk: 'low' as const,
    pathPrefixes: [],
    networkTargets: []
  }
}

function compatibility(platform: BuilderPlatform) {
  return {
    realmflowVersionRange: '>=0.1.0',
    platforms: [platform]
  }
}

function credentialSummary(session: CapabilityGenerationSession): string {
  return session.spec.runtime.kind === 'connector' &&
    session.spec.runtime.credentialRefs.length > 0
    ? session.spec.runtime.credentialRefs.join(', ')
    : '-'
}
