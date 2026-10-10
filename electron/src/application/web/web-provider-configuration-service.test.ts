import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { CredentialVault } from '../../models/credential-vault'
import { WebProviderConfigurationService } from './web-provider-configuration-service'
import { SqliteWebProviderRepository } from '../../infrastructure/sqlite/web-provider-repository'

let database: RealmFlowDatabase | undefined
let directory: string | undefined
afterEach(async () => {
  database?.close()
  database = undefined
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-web-test-'))
  database = openRealmFlowDatabase(join(directory, 'runtime.db'))
  const vault = await CredentialVault.open(join(directory, 'credentials.key'))
  const create = () => new WebProviderConfigurationService({
    store: new SqliteWebProviderRepository(database!), vault, now: () => 100
  })
  return { service: create(), create, vault }
}

const draft = {
  searchProvider: 'searxng' as const,
  searxngBaseUrl: 'http://127.0.0.1:18884',
  browserContinuation: false,
  expectedRevision: 0,
  requestId: 'web-save-1'
}

describe('Web provider configuration', () => {
  it('defaults to disabled search and browser continuation without credentials', async () => {
    const { service } = await fixture()
    expect(service.get()).toEqual({
      revision: 0, searchProvider: 'disabled', searxngBaseUrl: '',
      browserContinuation: false, hasBraveCredential: false
    })
  })

  it('persists an explicitly chosen local SearXNG endpoint across restart', async () => {
    const { service, create } = await fixture()
    const saved = service.save(draft)
    expect(saved).toMatchObject({ revision: 1, searchProvider: 'searxng', searxngBaseUrl: draft.searxngBaseUrl })
    database!.close()
    database = openRealmFlowDatabase(join(directory!, 'runtime.db'))
    expect(create().get()).toEqual(saved)
    expect(database.prepare('SELECT revision FROM web_provider_events').all()).toEqual([{ revision: 1 }])
  })

  it('encrypts a paid provider credential and resolves it only for the enabled revision', async () => {
    const { service } = await fixture()
    const saved = service.save({ ...draft, searchProvider: 'brave', braveApiKey: 'p4-test-private-key' })
    expect(saved).toMatchObject({ revision: 1, hasBraveCredential: true })
    expect(saved.braveCredentialHandle).toMatch(/^web-credential-/)
    expect(JSON.stringify(saved)).not.toContain('p4-test-private-key')
    expect(service.resolveCredential(saved.braveCredentialHandle!, 1)).toBe('p4-test-private-key')
    expect(() => service.resolveCredential(saved.braveCredentialHandle!, 0)).toThrow('web_configuration_changed')
    expect(() => service.resolveCredential('model-supplied-handle', 1)).toThrow('web_credential_unavailable')
    const contents = JSON.stringify(database!.prepare('SELECT * FROM web_provider_settings').all())
      + JSON.stringify(database!.prepare('SELECT * FROM web_provider_credentials').all())
      + JSON.stringify(database!.prepare('SELECT * FROM web_provider_events').all())
    expect(contents).not.toContain('p4-test-private-key')
    expect((await readFile(join(directory!, 'runtime.db'))).includes(Buffer.from('p4-test-private-key'))).toBe(false)
  })

  it('preserves omitted credentials, supports explicit removal and refuses disabled resolution', async () => {
    const { service } = await fixture()
    const first = service.save({ ...draft, searchProvider: 'brave', braveApiKey: 'first-key' })
    const second = service.save({ ...draft, searchProvider: 'disabled', expectedRevision: 1, requestId: 'save-2' })
    expect(second.hasBraveCredential).toBe(true)
    expect(() => service.resolveCredential(first.braveCredentialHandle!, 2)).toThrow('web_credential_unavailable')
    const third = service.save({
      ...draft, searchProvider: 'disabled', braveApiKey: null, expectedRevision: 2, requestId: 'save-3'
    })
    expect(third.hasBraveCredential).toBe(false)
    expect(third.braveCredentialHandle).toBeUndefined()
    expect(database!.prepare('SELECT * FROM web_provider_credentials').all()).toEqual([])
  })

  it('replays identical saves but rejects reused request IDs and stale revisions', async () => {
    const { service } = await fixture()
    const saved = service.save(draft)
    expect(service.save(draft)).toEqual(saved)
    expect(() => service.save({ ...draft, browserContinuation: true })).toThrow('web_idempotency_conflict')
    expect(() => service.save({ ...draft, requestId: 'stale-edit' })).toThrow('web_configuration_changed')
    expect(service.get()).toEqual(saved)
    expect(database!.prepare('SELECT * FROM web_provider_events').all()).toHaveLength(1)
  })

  it('rolls back configuration and credential replacement if the audit event fails', async () => {
    const { service } = await fixture()
    const saved = service.save({ ...draft, searchProvider: 'brave', braveApiKey: 'old-key' })
    database!.exec(`CREATE TRIGGER reject_web_event BEFORE INSERT ON web_provider_events
      BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END`)
    expect(() => service.save({
      ...draft, searchProvider: 'brave', braveApiKey: 'new-key', expectedRevision: 1, requestId: 'save-2'
    })).toThrow('web_configuration_save_failed')
    expect(service.get()).toEqual(saved)
    expect(service.resolveCredential(saved.braveCredentialHandle!, 1)).toBe('old-key')
  })

  it.each([
    { searchProvider: 'brave' },
    { searxngBaseUrl: '' },
    { searxngBaseUrl: 'file:///private/data' },
    { searxngBaseUrl: 'https://user:password@search.example' },
    { searxngBaseUrl: 'https://search.example/?api_key=inline' },
    { searxngBaseUrl: 'https://search.example/#secret' },
    { searchProvider: 'implicit-paid-fallback' },
    { browserContinuation: 'true' },
    { expectedRevision: -1 },
    { braveApiKey: '' },
    { unknown: 'ignored?' }
  ])('rejects invalid configuration atomically: %j', async (invalid) => {
    const { service } = await fixture()
    expect(() => service.save({ ...draft, ...invalid })).toThrow(/^web_/)
    expect(service.get().revision).toBe(0)
  })
})
