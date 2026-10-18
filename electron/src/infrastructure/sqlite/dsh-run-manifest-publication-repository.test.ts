import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDshRunManifest } from '../../../../dsh-plugins/realmflow-runtime/src/test-manifest-fixture'
import {
  ACP_SDK_VERSION,
  DSH_RUNTIME_PACKAGE,
  DSH_RUNTIME_VERSION
} from '../../../../domain/dsh-run-manifest'
import type { DshRunManifestPublication } from '../../application/dsh/dsh-run-manifest-publisher'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteDshRunManifestPublicationRepository } from './dsh-run-manifest-publication-repository'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteDshRunManifestPublicationRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-manifest-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteDshRunManifestPublicationRepository(database)
})

afterEach(async () => {
  if (database.open) database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteDshRunManifestPublicationRepository', () => {
  it('persists a published manifest so DSH recovery can restore it by run ID after restart', async () => {
    const publication = manifestPublication()

    await repository.save(publication)

    expect(await repository.getByRunId(publication.runId)).toEqual(publication)
    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteDshRunManifestPublicationRepository(database)
    expect(await repository.getByRunId(publication.runId)).toEqual(publication)
  })

  it('treats identical saves as idempotent and rejects manifest identity conflicts', async () => {
    const publication = manifestPublication()

    await repository.save(publication)
    await expect(repository.save(publication)).resolves.toBeUndefined()
    await expect(
      repository.save({
        ...publication,
        digest: 'c'.repeat(64),
        manifest: {
          ...publication.manifest,
          digest: 'c'.repeat(64)
        }
      })
    ).rejects.toThrow(/conflict/i)
  })
})

function manifestPublication(): DshRunManifestPublication {
  const manifest = createDshRunManifest({
    manifestId: 'manifest-1',
    runId: 'run-1',
    sessionId: 'session-1',
    owner: { conversationId: 'conversation-1' }
  })
  return {
    manifestId: manifest.manifestId,
    digest: manifest.digest,
    runId: manifest.runId,
    sessionId: manifest.sessionId,
    owner: manifest.owner,
    runtime: {
      dshPackage: DSH_RUNTIME_PACKAGE,
      dshVersion: DSH_RUNTIME_VERSION,
      acpSdkVersion: ACP_SDK_VERSION
    },
    publishedAt: 100,
    manifest
  }
}
