import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { REALMFLOW_SCHEMA_VERSION } from './migrations'

let directory: string
let database: RealmFlowDatabase

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-tool-runtime-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('Tool Runtime SQLite schema', () => {
  it('creates the event store, outbox, snapshots, and projections', () => {
    expect(REALMFLOW_SCHEMA_VERSION).toBe(99)
    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'tool_%'
         ORDER BY name`
      )
      .all() as Array<{ name: string }>

    expect(tables.map(({ name }) => name)).toEqual([
      'tool_adapter_health_projections',
      'tool_catalog_search_projections',
      'tool_commands',
      'tool_definition_projections',
      'tool_event_streams',
      'tool_events',
      'tool_execution_projections',
      'tool_outbox',
      'tool_permission_grant_projections',
      'tool_permission_request_projections',
      'tool_projection_checkpoints',
      'tool_snapshots',
      'tool_usage_daily_projections'
    ])
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name = 'extension_package_projections'`
        )
        .get()
    ).toEqual({ name: 'extension_package_projections' })
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name = 'skill_definition_projections'`
        )
        .get()
    ).toEqual({ name: 'skill_definition_projections' })
  })

  it('does not create legacy Skill, permission, or execution authority tables', () => {
    const legacyTables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN (
             'skills',
             'skill_versions',
             'skill_version_integrity',
             'skill_events',
             'skill_commands',
             'permission_grants',
             'permission_events',
             'permission_commands',
             'skill_executions',
             'skill_execution_events',
             'skill_execution_commands'
           )
         ORDER BY name`
      )
      .all() as Array<{ name: string }>

    expect(legacyTables).toEqual([])
  })

  it('stores immutable definition references for schedules', () => {
    const scheduleColumns = database
      .prepare("PRAGMA table_info('schedules')")
      .all() as Array<{ name: string; notnull: number }>
    const runColumns = database
      .prepare("PRAGMA table_info('schedule_runs')")
      .all() as Array<{ name: string; notnull: number }>

    expect(scheduleColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'target_kind', notnull: 1 }),
        expect.objectContaining({ name: 'target_definition_id', notnull: 1 }),
        expect.objectContaining({
          name: 'target_definition_version',
          notnull: 1
        }),
        expect.objectContaining({
          name: 'target_definition_digest',
          notnull: 1
        })
      ])
    )
    expect(scheduleColumns.map(({ name }) => name)).not.toContain(
      'skill_version_id'
    )
    expect(runColumns.map(({ name }) => name)).toContain('tool_execution_id')
    expect(runColumns.map(({ name }) => name)).not.toContain(
      'skill_execution_id'
    )
  })

  it('makes domain events immutable at the database boundary', () => {
    database
      .prepare(
        `INSERT INTO tool_event_streams (
          stream_id, stream_type, current_sequence, created_at, updated_at
        ) VALUES ('execution-1', 'tool_execution', 1, 100, 100)`
      )
      .run()
    database
      .prepare(
        `INSERT INTO tool_events (
          global_position, event_id, stream_id, stream_type, sequence,
          event_type, event_schema_version, payload_json, metadata_json,
          payload_checksum, occurred_at
        ) VALUES (
          1, 'event-1', 'execution-1', 'tool_execution', 1,
          'tool.invocation_requested', 1, '{}', '{}', ?, 100
        )`
      )
      .run('a'.repeat(64))

    expect(() =>
      database
        .prepare(
          `UPDATE tool_events SET occurred_at = 101
           WHERE event_id = 'event-1'`
        )
        .run()
    ).toThrow('Tool events are immutable')
    expect(() =>
      database
        .prepare(`DELETE FROM tool_events WHERE event_id = 'event-1'`)
        .run()
    ).toThrow('Tool events are immutable')
  })

  it('prevents published definition projections from in-place updates', () => {
    database
      .prepare(
        `INSERT INTO tool_definition_projections (
          definition_id, definition_version, projection_json, revision,
          updated_at
        ) VALUES ('tool-1', '1.0.0', '{}', 1, 100)`
      )
      .run()

    expect(() =>
      database
        .prepare(
          `UPDATE tool_definition_projections
           SET projection_json = '{"changed":true}'
           WHERE definition_id = 'tool-1'`
        )
        .run()
    ).toThrow('Published Tool definitions are immutable')
  })
})
