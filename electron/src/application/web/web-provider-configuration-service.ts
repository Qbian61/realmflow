import { createHash } from 'node:crypto'
import {
  requireBoolean, requireEnum, requireExactKeys, requireIdentifier,
  requireInteger, requireObject, requireText
} from '../../../../domain/tool-protocol-validation'
import type {
  SaveWebProviderConfiguration, WebProviderConfiguration
} from '../../../../shared/web-provider'
import type { CredentialVault } from '../../models/credential-vault'
import type { WebProviderStore } from './web-provider-store'

const BRAVE_HANDLE = 'web-credential-brave'

export class WebProviderConfigurationService {
  constructor(private readonly dependencies: {
    store: WebProviderStore
    vault: Pick<CredentialVault, 'encrypt' | 'decrypt'>
    now?: () => number
  }) {}

  get(): WebProviderConfiguration {
    return this.dependencies.store.get()
  }

  save(value: unknown): WebProviderConfiguration {
    const command = normalizeCommand(value)
    const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex')
    const replay = this.dependencies.store.readReplay(command.requestId, fingerprint)
    if (replay) return replay
    const current = this.get()
    if (current.revision !== command.expectedRevision) throw new Error('web_configuration_changed')
    const hasBraveCredential = command.braveApiKey === null
      ? false
      : command.braveApiKey !== undefined || current.hasBraveCredential
    if (command.searchProvider === 'brave' && !hasBraveCredential) {
      throw new Error('web_credential_required')
    }
    const configuration: WebProviderConfiguration = {
      revision: current.revision + 1,
      searchProvider: command.searchProvider,
      searxngBaseUrl: command.searxngBaseUrl,
      browserContinuation: command.browserContinuation,
      hasBraveCredential,
      ...(hasBraveCredential ? { braveCredentialHandle: BRAVE_HANDLE } : {})
    }
    try {
      return this.dependencies.store.save({
        configuration,
        expectedRevision: command.expectedRevision,
        requestId: command.requestId,
        fingerprint,
        at: (this.dependencies.now ?? Date.now)(),
        ...(command.braveApiKey === undefined ? {} : {
          credential: command.braveApiKey === null
            ? null
            : this.dependencies.vault.encrypt(command.braveApiKey)
        })
      })
    } catch (error) {
      if (error instanceof Error && [
        'web_configuration_changed', 'web_idempotency_conflict'
      ].includes(error.message)) throw error
      throw new Error('web_configuration_save_failed')
    }
  }

  /** Main-only: handle and revision must come from the authorized provider binding. */
  resolveCredential(handle: string, revision: number): string {
    const current = this.get()
    if (revision !== current.revision) throw new Error('web_configuration_changed')
    if (
      current.searchProvider !== 'brave' ||
      !current.hasBraveCredential ||
      handle !== current.braveCredentialHandle
    ) throw new Error('web_credential_unavailable')
    const credential = this.dependencies.store.getCredential(handle)
    if (!credential) throw new Error('web_credential_unavailable')
    try {
      return this.dependencies.vault.decrypt(credential)
    } catch {
      throw new Error('web_credential_unavailable')
    }
  }
}

function normalizeCommand(value: unknown): SaveWebProviderConfiguration {
  try {
    const input = requireObject(value, 'configuration')
    requireExactKeys(input, new Set([
      'searchProvider', 'searxngBaseUrl', 'browserContinuation',
      'braveApiKey', 'expectedRevision', 'requestId'
    ]), 'configuration', new Set(['braveApiKey']))
    const searchProvider = requireEnum(input.searchProvider,
      new Set(['disabled', 'searxng', 'brave'] as const), 'provider')
    const searxngBaseUrl = normalizeEndpoint(requireText(input.searxngBaseUrl, 'endpoint', true))
    if (searchProvider === 'searxng' && !searxngBaseUrl) throw new Error()
    const braveApiKey = input.braveApiKey === undefined || input.braveApiKey === null
      ? input.braveApiKey : requireText(input.braveApiKey, 'credential')
    if (typeof braveApiKey === 'string' && (braveApiKey.length > 4096 || /[\r\n]/.test(braveApiKey))) {
      throw new Error()
    }
    return {
      searchProvider,
      searxngBaseUrl,
      browserContinuation: requireBoolean(input.browserContinuation, 'browser continuation'),
      expectedRevision: requireInteger(input.expectedRevision, 'revision', 0, Number.MAX_SAFE_INTEGER - 1),
      requestId: requireIdentifier(input.requestId, 'request'),
      ...(braveApiKey === undefined ? {} : { braveApiKey })
    }
  } catch {
    throw new Error('web_configuration_invalid')
  }
}

function normalizeEndpoint(value: string): string {
  if (!value) return ''
  if (value.length > 2048) throw new Error()
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash) throw new Error()
  return url.href.replace(/\/+$/, '')
}
