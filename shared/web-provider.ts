export type WebSearchProviderId = 'disabled' | 'searxng' | 'brave'

/** Safe readback only. Saved plaintext credentials never cross Main -> Renderer. */
export type WebProviderConfiguration = {
  revision: number
  searchProvider: WebSearchProviderId
  searxngBaseUrl: string
  browserContinuation: boolean
  hasBraveCredential: boolean
  braveCredentialHandle?: string
}

export type SaveWebProviderConfiguration = {
  searchProvider: WebSearchProviderId
  searxngBaseUrl: string
  browserContinuation: boolean
  /** Omitted: preserve; null: remove; string: replace. */
  braveApiKey?: string | null
  expectedRevision: number
  requestId: string
}

export type WebProviderApi = {
  get(): Promise<WebProviderConfiguration>
  save(command: SaveWebProviderConfiguration): Promise<WebProviderConfiguration>
}

export const DEFAULT_WEB_PROVIDER_CONFIGURATION: Readonly<WebProviderConfiguration> = {
  revision: 0,
  searchProvider: 'disabled',
  searxngBaseUrl: '',
  browserContinuation: false,
  hasBraveCredential: false
}
