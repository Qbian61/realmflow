import type Database from 'better-sqlite3'
import type { DshRunOwner } from '../../../../domain/dsh-run-manifest'
import {
  advanceDshSessionProjection,
  assertDshSessionReusable,
  createDshSessionBinding,
  dshRunOwnerKey,
  transitionDshSessionBinding,
  type DshSessionBinding,
  type DshSessionBindingLifecycleStatus
} from '../../../../domain/dsh-session-binding'

type DshSessionBindingRow = {
  owner_key: string
  owner_json: string
  dsh_session_id: string
  run_manifest_digest: string
  runtime_build_digest: string
  last_projected_sequence: number
  lifecycle_status: DshSessionBindingLifecycleStatus
  created_at: number
  updated_at: number
}

export class SqliteDshSessionBindingRepository {
  constructor(private readonly database: Database.Database) {}

  save(binding: DshSessionBinding): void {
    this.database.transaction(() => {
      const existingBySession = this.getByDshSessionId(binding.dshSessionId)
      if (existingBySession !== undefined) {
        assertDshSessionReusable(existingBySession, binding.owner)
      }
      const existingByOwner = this.getByOwner(binding.owner)
      if (
        existingByOwner !== undefined
        && existingByOwner.dshSessionId !== binding.dshSessionId
      ) {
        throw new Error('DSH run owner is already bound to another session')
      }
      if (
        existingByOwner !== undefined
        && existingByOwner.runtimeBuildDigest !== binding.runtimeBuildDigest
      ) {
        throw new Error('DSH session binding runtime identity is immutable')
      }
      this.database
        .prepare(
          `INSERT INTO dsh_session_bindings (
            owner_key, owner_json, dsh_session_id, run_manifest_digest,
            runtime_build_digest, last_projected_sequence, lifecycle_status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_key) DO UPDATE SET
            dsh_session_id = excluded.dsh_session_id,
            run_manifest_digest = excluded.run_manifest_digest,
            runtime_build_digest = excluded.runtime_build_digest,
            last_projected_sequence = excluded.last_projected_sequence,
            lifecycle_status = excluded.lifecycle_status,
            updated_at = excluded.updated_at`
        )
        .run(
          binding.ownerKey,
          JSON.stringify(binding.owner),
          binding.dshSessionId,
          binding.runManifestDigest,
          binding.runtimeBuildDigest,
          binding.lastProjectedSequence,
          binding.lifecycleStatus,
          binding.createdAt,
          binding.updatedAt
        )
    })()
  }

  getByOwner(owner: DshRunOwner): DshSessionBinding | undefined {
    const row = this.database
      .prepare('SELECT * FROM dsh_session_bindings WHERE owner_key = ?')
      .get(dshRunOwnerKey(owner)) as DshSessionBindingRow | undefined
    return row === undefined ? undefined : rowToBinding(row)
  }

  getByDshSessionId(dshSessionId: string): DshSessionBinding | undefined {
    const row = this.database
      .prepare('SELECT * FROM dsh_session_bindings WHERE dsh_session_id = ?')
      .get(dshSessionId) as DshSessionBindingRow | undefined
    return row === undefined ? undefined : rowToBinding(row)
  }

  advanceProjection(
    dshSessionId: string,
    sequence: number,
    updatedAt: number
  ): DshSessionBinding {
    return this.database.transaction(() => {
      const current = this.requireBySessionId(dshSessionId)
      const next = advanceDshSessionProjection(current, sequence, updatedAt)
      this.updateRuntimeState(next)
      return next
    })()
  }

  transition(
    dshSessionId: string,
    lifecycleStatus: DshSessionBindingLifecycleStatus,
    updatedAt: number
  ): DshSessionBinding {
    return this.database.transaction(() => {
      const current = this.requireBySessionId(dshSessionId)
      const next = transitionDshSessionBinding(
        current,
        lifecycleStatus,
        updatedAt
      )
      this.updateRuntimeState(next)
      return next
    })()
  }

  resetByOwner(owner: DshRunOwner): void {
    this.database
      .prepare('DELETE FROM dsh_session_bindings WHERE owner_key = ?')
      .run(dshRunOwnerKey(owner))
  }

  private requireBySessionId(dshSessionId: string): DshSessionBinding {
    const binding = this.getByDshSessionId(dshSessionId)
    if (binding === undefined) {
      throw new Error('DSH session binding is missing')
    }
    return binding
  }

  private updateRuntimeState(binding: DshSessionBinding): void {
    this.database
      .prepare(
        `UPDATE dsh_session_bindings
         SET last_projected_sequence = ?,
             lifecycle_status = ?,
             updated_at = ?
         WHERE owner_key = ?`
      )
      .run(
        binding.lastProjectedSequence,
        binding.lifecycleStatus,
        binding.updatedAt,
        binding.ownerKey
      )
  }
}

function rowToBinding(row: DshSessionBindingRow): DshSessionBinding {
  return createDshSessionBinding({
    owner: JSON.parse(row.owner_json) as DshRunOwner,
    dshSessionId: row.dsh_session_id,
    runManifestDigest: row.run_manifest_digest,
    runtimeBuildDigest: row.runtime_build_digest,
    lastProjectedSequence: row.last_projected_sequence,
    lifecycleStatus: row.lifecycle_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })
}
