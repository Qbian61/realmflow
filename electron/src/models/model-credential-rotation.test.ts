import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ModelProvider } from '../../../domain/model'
import type { ModelCredentialKeyRotationRepository } from '../application/ports/business-repositories'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../infrastructure/sqlite/database'
import { createSqliteRepositories } from '../infrastructure/sqlite/repositories'
import { CredentialVault } from './credential-vault'
import { ModelService } from './model-service'

let directory: string
let database: RealmFlowDatabase

const providers: ModelProvider[] = [
  {
    id: 'provider-1',
    type: 'openai_completions',
    name: 'First',
    baseUrl: 'https://first.example.com/v1',
    enabled: true
  },
  {
    id: 'provider-2',
    type: 'openai_completions',
    name: 'Second',
    baseUrl: 'https://second.example.com/v1',
    enabled: true
  }
]

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-model-rotation-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ModelService credential key rotation', () => {
  it('re-encrypts every credential with one new key version', async () => {
    const harness = await createHarness()
    await harness.service.saveProvider(providers[0], 0, 'first-secret')
    await harness.service.saveProvider(providers[1], 0, 'second-secret')

    await expect(
      harness.service.rotateCredentialKey(' rotation-request-1 ')
    ).resolves.toEqual({
      outcome: 'rotated',
      requestId: 'rotation-request-1',
      fromKeyVersion: 1,
      toKeyVersion: 2,
      credentialCount: 2,
      rotatedAt: 500
    })

    const credentials = await harness.repositories.modelCredentials.list()
    expect(credentials.map(({ keyVersion }) => keyVersion)).toEqual([2, 2])
    expect(
      credentials.map((record) => harness.vault.decrypt(record))
    ).toEqual([
      expect.stringContaining('"apiKey":"first-secret"'),
      expect.stringContaining('"apiKey":"second-secret"')
    ])
    expect(JSON.stringify(credentials)).not.toContain('first-secret')
    expect(JSON.stringify(credentials)).not.toContain('second-secret')
  })

  it('rotates an empty credential store and uses the version for later saves', async () => {
    const harness = await createHarness()

    await expect(
      harness.service.rotateCredentialKey('empty-rotation')
    ).resolves.toMatchObject({
      outcome: 'rotated',
      fromKeyVersion: 1,
      toKeyVersion: 2,
      credentialCount: 0
    })
    await harness.service.saveProvider(providers[0], 0, 'later-secret')

    await expect(harness.repositories.modelCredentials.list()).resolves.toEqual([
      expect.objectContaining({ providerId: 'provider-1', keyVersion: 2 })
    ])
  })

  it('returns the committed result when the same request is replayed', async () => {
    const harness = await createHarness()
    await harness.service.saveProvider(providers[0], 0, 'stable-secret')
    const first = await harness.service.rotateCredentialKey('stable-request')
    const recordsAfterFirst =
      await harness.repositories.modelCredentials.list()

    await expect(
      harness.service.rotateCredentialKey('stable-request')
    ).resolves.toEqual(first)
    await expect(harness.repositories.modelCredentials.list()).resolves.toEqual(
      recordsAfterFirst
    )
    expect(harness.vault.activeKeyVersion).toBe(2)
  })

  it('serializes concurrent rotation requests into distinct recoverable versions', async () => {
    const harness = await createHarness()
    await harness.service.saveProvider(providers[0], 0, 'concurrent-secret')

    const [first, second] = await Promise.all([
      harness.service.rotateCredentialKey('concurrent-request-1'),
      harness.service.rotateCredentialKey('concurrent-request-2')
    ])

    expect([first.toKeyVersion, second.toKeyVersion]).toEqual([2, 3])
    const [credential] = await harness.repositories.modelCredentials.list()
    expect(credential.keyVersion).toBe(3)
    expect(harness.vault.decrypt(credential)).toContain(
      '"apiKey":"concurrent-secret"'
    )
  })

  it('rolls back credentials and safely retries after event persistence fails', async () => {
    let failAppend = true
    const harness = await createHarness((rotations) => ({
      getByRequestId: rotations.getByRequestId,
      append: async (rotation) => {
        if (failAppend) throw new Error('rotation audit unavailable')
        await rotations.append(rotation)
      }
    }))
    await harness.service.saveProvider(providers[0], 0, 'retry-secret')
    const before = await harness.repositories.modelCredentials.list()

    await expect(
      harness.service.rotateCredentialKey('retry-request')
    ).rejects.toThrow('rotation audit unavailable')
    await expect(harness.repositories.modelCredentials.list()).resolves.toEqual(
      before
    )
    expect(harness.vault.decrypt(before[0])).toContain(
      '"apiKey":"retry-secret"'
    )

    failAppend = false
    await expect(
      harness.service.rotateCredentialKey('retry-request')
    ).resolves.toMatchObject({
      outcome: 'rotated',
      fromKeyVersion: 1,
      toKeyVersion: 2,
      credentialCount: 1
    })
    await expect(harness.repositories.modelCredentials.list()).resolves.toEqual([
      expect.objectContaining({ keyVersion: 2 })
    ])
  })

  it('rejects tampered ciphertext without partially rotating other records', async () => {
    const harness = await createHarness()
    await harness.service.saveProvider(providers[0], 0, 'first-secret')
    await harness.service.saveProvider(providers[1], 0, 'second-secret')
    const before = await harness.repositories.modelCredentials.list()
    const tampered = structuredClone(before[1])
    tampered.authTag[0] ^= 0xff
    await harness.repositories.modelCredentials.save(tampered)
    const persistedBefore = await harness.repositories.modelCredentials.list()

    await expect(
      harness.service.rotateCredentialKey('tampered-request')
    ).rejects.toThrow('Credential cannot be decrypted')

    await expect(harness.repositories.modelCredentials.list()).resolves.toEqual(
      persistedBefore
    )
    await expect(
      harness.repositories.modelCredentialKeyRotations.getByRequestId(
        'tampered-request'
      )
    ).resolves.toBeUndefined()
  })
})

async function createHarness(
  decorateRotations: (
    rotations: ModelCredentialKeyRotationRepository
  ) => ModelCredentialKeyRotationRepository = (rotations) => rotations
) {
  const repositories = createSqliteRepositories(database)
  const vault = await CredentialVault.open(join(directory, 'credentials.key'))
  let id = 0
  const service = new ModelService({
    modelPool: repositories.modelPool,
    credentials: repositories.modelCredentials,
    credentialKeyRotations: decorateRotations(
      repositories.modelCredentialKeyRotations
    ),
    metrics: repositories.modelMetrics,
    providerEvents: repositories.modelProviderEvents,
    profileEvents: repositories.modelProfileEvents,
    unitOfWork: repositories.unitOfWork,
    vault,
    createId: () => `rotation-test-${++id}`,
    now: () => 500
  })
  return { repositories, service, vault }
}
