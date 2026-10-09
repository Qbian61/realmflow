import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ToolEventStreamType } from '../../../../domain/tool-domain-event'
import {
  cloneJsonObject,
  requireIdentifier,
  requireInteger,
  type JsonObject
} from '../../../../domain/tool-protocol-validation'
import type {
  ToolSnapshot,
  ToolSnapshotStore
} from '../../application/tools/tool-snapshot-store'

type SnapshotRow = {
  stream_id: string
  stream_type: ToolEventStreamType
  sequence: number
  state_json: string
  state_checksum: string
  created_at: number
}

export class SqliteToolSnapshotStore implements ToolSnapshotStore {
  constructor(private readonly database: Database.Database) {}

  async save(input: {
    streamId: string
    streamType: ToolEventStreamType
    sequence: number
    state: JsonObject
    at: number
  }): Promise<void> {
    const streamId = requireIdentifier(input.streamId, 'snapshot stream ID')
    const sequence = requireInteger(
      input.sequence,
      'snapshot sequence',
      1,
      Number.MAX_SAFE_INTEGER
    )
    const state = cloneJsonObject(input.state, 'snapshot state')
    const stateJson = canonicalJson(state)
    this.database
      .prepare(
        `INSERT INTO tool_snapshots (
          stream_id, stream_type, sequence, state_json, state_checksum,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(stream_id) DO UPDATE SET
          stream_type = excluded.stream_type,
          sequence = excluded.sequence,
          state_json = excluded.state_json,
          state_checksum = excluded.state_checksum,
          created_at = excluded.created_at
        WHERE excluded.sequence >= tool_snapshots.sequence`
      )
      .run(
        streamId,
        input.streamType,
        sequence,
        stateJson,
        checksum(stateJson),
        requireInteger(
          input.at,
          'snapshot timestamp',
          0,
          Number.MAX_SAFE_INTEGER
        )
      )
  }

  async load(streamId: string): Promise<ToolSnapshot | undefined> {
    const row = this.database
      .prepare('SELECT * FROM tool_snapshots WHERE stream_id = ?')
      .get(requireIdentifier(streamId, 'snapshot stream ID')) as
      | SnapshotRow
      | undefined
    if (!row || checksum(row.state_json) !== row.state_checksum) {
      return undefined
    }
    try {
      return {
        streamId: row.stream_id,
        streamType: row.stream_type,
        sequence: row.sequence,
        state: cloneJsonObject(
          JSON.parse(row.state_json),
          'snapshot state'
        ),
        createdAt: row.created_at
      }
    } catch {
      return undefined
    }
  }

  async delete(streamId: string): Promise<void> {
    this.database
      .prepare('DELETE FROM tool_snapshots WHERE stream_id = ?')
      .run(requireIdentifier(streamId, 'snapshot stream ID'))
  }
}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Record<string, unknown>)[key]
          )}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}
