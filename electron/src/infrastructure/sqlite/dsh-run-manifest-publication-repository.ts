import type Database from 'better-sqlite3'
import {
  validateDshRunManifest,
  type DshRunManifest
} from '../../../../domain/dsh-run-manifest'
import { dshRunOwnerKey } from '../../../../domain/dsh-session-binding'
import type { DshRunManifestPublication } from '../../application/dsh/dsh-run-manifest-publisher'

type DshRunManifestPublicationRow = {
  manifest_id: string
  run_id: string
  session_id: string
  owner_json: string
  digest: string
  runtime_json: string
  manifest_json: string
  published_at: number
}

export class SqliteDshRunManifestPublicationRepository {
  constructor(private readonly database: Database.Database) {}

  async save(publication: DshRunManifestPublication): Promise<void> {
    this.saveSync(publication)
  }

  async getByRunId(
    runId: string
  ): Promise<DshRunManifestPublication | undefined> {
    return this.getByRunIdSync(runId)
  }

  async getByManifestId(
    manifestId: string
  ): Promise<DshRunManifestPublication | undefined> {
    return this.getByManifestIdSync(manifestId)
  }

  private saveSync(publication: DshRunManifestPublication): void {
    const existingByManifest = this.getByManifestIdSync(publication.manifestId)
    const existingByRun = this.getByRunIdSync(publication.runId)
    for (const existing of [existingByManifest, existingByRun]) {
      if (!existing) continue
      if (samePublication(existing, publication)) return
      throw new Error('DSH run manifest publication conflicts with persisted fact')
    }

    const manifest = validateDshRunManifest(publication.manifest)
    if (
      publication.digest !== manifest.digest ||
      publication.runId !== manifest.runId ||
      publication.sessionId !== manifest.sessionId ||
      publication.manifestId !== manifest.manifestId
    ) {
      throw new Error('DSH run manifest publication identity is invalid')
    }

    this.database
      .prepare(
        `INSERT INTO dsh_run_manifest_publications (
          manifest_id, run_id, session_id, owner_key, owner_json, digest,
          runtime_json, manifest_json, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        publication.manifestId,
        publication.runId,
        publication.sessionId,
        dshRunOwnerKey(publication.owner),
        JSON.stringify(publication.owner),
        publication.digest,
        JSON.stringify(publication.runtime),
        JSON.stringify(manifest),
        publication.publishedAt
      )
  }

  private getByRunIdSync(
    runId: string
  ): DshRunManifestPublication | undefined {
    const row = this.database
      .prepare('SELECT * FROM dsh_run_manifest_publications WHERE run_id = ?')
      .get(runId) as DshRunManifestPublicationRow | undefined
    return row ? rowToPublication(row) : undefined
  }

  private getByManifestIdSync(
    manifestId: string
  ): DshRunManifestPublication | undefined {
    const row = this.database
      .prepare(
        'SELECT * FROM dsh_run_manifest_publications WHERE manifest_id = ?'
      )
      .get(manifestId) as DshRunManifestPublicationRow | undefined
    return row ? rowToPublication(row) : undefined
  }
}

function rowToPublication(
  row: DshRunManifestPublicationRow
): DshRunManifestPublication {
  const manifest = validateDshRunManifest(
    JSON.parse(row.manifest_json) as DshRunManifest
  )
  return {
    manifestId: row.manifest_id,
    digest: row.digest,
    runId: row.run_id,
    sessionId: row.session_id,
    owner: JSON.parse(row.owner_json) as DshRunManifest['owner'],
    runtime: JSON.parse(
      row.runtime_json
    ) as DshRunManifestPublication['runtime'],
    publishedAt: row.published_at,
    manifest
  }
}

function samePublication(
  left: DshRunManifestPublication,
  right: DshRunManifestPublication
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
