import type { WebProviderConfiguration } from '../../../../shared/web-provider'
import type { EncryptedCredential } from '../../models/credential-vault'

export type WebProviderSave = {
  configuration: WebProviderConfiguration
  expectedRevision: number
  credential?: EncryptedCredential | null
  requestId: string
  fingerprint: string
  at: number
}

export interface WebProviderStore {
  get(): WebProviderConfiguration
  getCredential(handle: string): EncryptedCredential | undefined
  readReplay(requestId: string, fingerprint: string): WebProviderConfiguration | undefined
  save(input: WebProviderSave): WebProviderConfiguration
}
