import type Database from 'better-sqlite3'
import {
  DEFAULT_WEB_PROVIDER_CONFIGURATION, type WebProviderConfiguration
} from '../../../../shared/web-provider'
import type {
  WebProviderSave, WebProviderStore
} from '../../application/web/web-provider-store'
import type { EncryptedCredential } from '../../models/credential-vault'

export class SqliteWebProviderRepository implements WebProviderStore {
  constructor(private readonly database: Database.Database) {}

  get(): WebProviderConfiguration {
    const row = this.database.prepare(
      'SELECT configuration_json FROM web_provider_settings WHERE id = 1'
    ).get() as { configuration_json: string } | undefined
    return row ? JSON.parse(row.configuration_json) : { ...DEFAULT_WEB_PROVIDER_CONFIGURATION }
  }

  getCredential(handle: string): EncryptedCredential | undefined {
    return this.database.prepare(`SELECT encrypted_value AS encryptedValue,
      nonce, auth_tag AS authTag, key_version AS keyVersion
      FROM web_provider_credentials WHERE handle = ?`).get(handle) as EncryptedCredential | undefined
  }

  readReplay(requestId: string, fingerprint: string): WebProviderConfiguration | undefined {
    const row = this.database.prepare(
      'SELECT fingerprint, configuration_json FROM web_provider_events WHERE request_id = ?'
    ).get(requestId) as { fingerprint: string; configuration_json: string } | undefined
    if (!row) return undefined
    if (row.fingerprint !== fingerprint) throw new Error('web_idempotency_conflict')
    return JSON.parse(row.configuration_json) as WebProviderConfiguration
  }

  save(input: WebProviderSave): WebProviderConfiguration {
    return this.database.transaction(() => {
      const replay = this.readReplay(input.requestId, input.fingerprint)
      if (replay) return replay
      if (this.get().revision !== input.expectedRevision ||
          input.configuration.revision !== input.expectedRevision + 1) {
        throw new Error('web_configuration_changed')
      }
      const handle = input.configuration.braveCredentialHandle
      if (input.credential === null) {
        this.database.prepare('DELETE FROM web_provider_credentials').run()
      } else if (input.credential) {
        if (!handle) throw new Error('web_credential_unavailable')
        const credential = input.credential
        this.database.prepare(`INSERT INTO web_provider_credentials
          (handle, encrypted_value, nonce, auth_tag, key_version) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(handle) DO UPDATE SET encrypted_value=excluded.encrypted_value,
          nonce=excluded.nonce, auth_tag=excluded.auth_tag, key_version=excluded.key_version`)
          .run(handle, Buffer.from(credential.encryptedValue), Buffer.from(credential.nonce),
            Buffer.from(credential.authTag), credential.keyVersion)
      }
      if (input.configuration.hasBraveCredential !== Boolean(handle) ||
          (handle && !this.getCredential(handle))) throw new Error('web_credential_unavailable')
      const json = JSON.stringify(input.configuration)
      this.database.prepare(`INSERT INTO web_provider_settings (id, revision, configuration_json)
        VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET
        revision=excluded.revision, configuration_json=excluded.configuration_json`)
        .run(input.configuration.revision, json)
      this.database.prepare(`INSERT INTO web_provider_events
        (request_id, revision, fingerprint, configuration_json, occurred_at) VALUES (?, ?, ?, ?, ?)`)
        .run(input.requestId, input.configuration.revision, input.fingerprint, json, input.at)
      return this.get()
    })()
  }
}
