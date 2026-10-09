import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { replayToolExecution } from '../../../../domain/tool-execution'
import { ToolProjectionRunner } from '../../application/tools/tool-projection-runner'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteToolEventStore } from './tool-event-store'
import { SqliteToolProjectionStore } from './tool-projection-store'
import { SqliteToolSnapshotStore } from './tool-snapshot-store'

let directory: string
let database: RealmFlowDatabase
let events: SqliteToolEventStore
let projections: SqliteToolProjectionStore
let snapshots: SqliteToolSnapshotStore
let runner: ToolProjectionRunner

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-tool-projection-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  events = new SqliteToolEventStore(database)
  projections = new SqliteToolProjectionStore(database)
  snapshots = new SqliteToolSnapshotStore(database)
  runner = new ToolProjectionRunner(events, projections)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('Tool snapshots and projections', () => {
  it('loads valid snapshots and ignores corrupted snapshots', async () => {
    await snapshots.save({
      streamId: 'execution-1',
      streamType: 'tool_execution',
      sequence: 6,
      state: { executionId: 'execution-1', status: 'succeeded' },
      at: 200
    })

    await expect(snapshots.load('execution-1')).resolves.toMatchObject({
      streamId: 'execution-1',
      sequence: 6,
      state: { executionId: 'execution-1', status: 'succeeded' }
    })
    database
      .prepare(
        `UPDATE tool_snapshots
         SET state_json = '{"status":"corrupted"}'
         WHERE stream_id = 'execution-1'`
      )
      .run()

    await expect(snapshots.load('execution-1')).resolves.toBeUndefined()
  })

  it('rebuilds deleted execution projections from the event log', async () => {
    await appendSucceededExecution()
    const sourceEvents = await events.loadStream('execution-1')
    const expected = replayToolExecution(sourceEvents)

    await runner.rebuildExecutionProjection()
    await expect(
      projections.getExecution('execution-1')
    ).resolves.toEqual(expected)

    database.prepare('DELETE FROM tool_execution_projections').run()
    database.prepare('DELETE FROM tool_projection_checkpoints').run()
    database.prepare('DELETE FROM tool_snapshots').run()

    await runner.rebuildExecutionProjection()
    await expect(
      projections.getExecution('execution-1')
    ).resolves.toEqual(expected)
    await expect(
      projections.getCheckpoint('tool_execution')
    ).resolves.toMatchObject({ globalPosition: 6, generation: 1 })
  })

  it('advances incremental projection checkpoints with each committed batch', async () => {
    await appendSucceededExecution()

    await expect(runner.runExecutionBatch(3)).resolves.toBe(3)
    await expect(
      projections.getExecution('execution-1')
    ).resolves.toMatchObject({ status: 'queued', revision: 3 })
    await expect(
      projections.getCheckpoint('tool_execution')
    ).resolves.toMatchObject({ globalPosition: 3 })

    await expect(runner.runExecutionBatch(10)).resolves.toBe(3)
    await expect(
      projections.getExecution('execution-1')
    ).resolves.toMatchObject({ status: 'succeeded', revision: 6 })
    await expect(runner.runExecutionBatch(10)).resolves.toBe(0)
  })

  it('rebuilds Package, Tool, and Skill catalog projections from events', async () => {
    await appendCatalog()

    await runner.rebuildCatalogProjection()
    await expect(projections.getCatalog()).resolves.toMatchObject({
      packages: [{ packageId: 'realmflow.builtin.files', status: 'enabled' }],
      tools: [{ id: 'builtin.files.read', status: 'enabled' }],
      skills: [
        { id: 'builtin.skills.summarize-file', status: 'enabled' }
      ]
    })

    database.prepare('DELETE FROM extension_package_projections').run()
    database.prepare('DELETE FROM tool_definition_projections').run()
    database.prepare('DELETE FROM skill_definition_projections').run()
    database
      .prepare(
        `DELETE FROM tool_projection_checkpoints
         WHERE projection_name = 'tool_catalog'`
      )
      .run()

    await runner.rebuildCatalogProjection()
    await expect(projections.getCatalog()).resolves.toMatchObject({
      packages: [{ packageId: 'realmflow.builtin.files' }],
      tools: [{ id: 'builtin.files.read' }],
      skills: [{ id: 'builtin.skills.summarize-file' }]
    })
  })
})

async function appendSucceededExecution(): Promise<void> {
  await events.append({
    streamId: 'execution-1',
    streamType: 'tool_execution',
    expectedSequence: 0,
    command: {
      idempotencyKey: 'command-1',
      fingerprint: 'a'.repeat(64),
      result: { executionId: 'execution-1' }
    },
    events: [
      event('event-1', 'tool.invocation_requested', {
        executionId: 'execution-1',
        definition: {
          id: 'tool-1',
          version: '1.0.0',
          definitionDigest: 'd'.repeat(64)
        }
      }),
      event('event-2', 'tool.arguments_validated', {
        argumentsDigest: 'b'.repeat(64)
      }),
      event('event-3', 'tool.dispatch_enqueued', {
        dispatchId: 'dispatch-1'
      }),
      event('event-4', 'tool.attempt_started', {
        attempt: 1,
        startedAt: 104
      }),
      event('event-5', 'tool.attempt_succeeded', {
        attempt: 1,
        output: { answer: 42 },
        metrics: { durationMs: 10 },
        finishedAt: 105
      }),
      event('event-6', 'tool.completed', { completedAt: 106 })
    ],
    outbox: []
  })
}

async function appendCatalog(): Promise<void> {
  await events.append({
    streamId: 'extension-realmflow-builtin-files',
    streamType: 'extension',
    expectedSequence: 0,
    command: {
      idempotencyKey: 'catalog-package-command',
      fingerprint: '1'.repeat(64),
      result: { packageId: 'realmflow.builtin.files' }
    },
    events: [
      {
        ...event('event-7', 'extension.package_imported', {
          packageId: 'realmflow.builtin.files',
          packageVersion: '1.0.0',
          packageDigest: 'a'.repeat(64),
          origin: 'builtin',
          name: 'Files',
          description: 'Builtin file capabilities.'
        }),
        metadata: {
          ...event('event-7', 'extension.package_imported', {})
            .metadata,
          commandId: 'catalog-package-command',
          causationId: 'catalog-package-command'
        }
      }
    ],
    outbox: []
  })
  await events.append({
    streamId: 'definition-builtin-files-read',
    streamType: 'definition',
    expectedSequence: 0,
    command: {
      idempotencyKey: 'catalog-tool-command',
      fingerprint: '2'.repeat(64),
      result: { definitionId: 'builtin.files.read' }
    },
    events: [
      {
        ...event('event-8', 'tool.definition_published', {
          definition: catalogToolDefinition()
        }),
        metadata: {
          ...event('event-8', 'tool.definition_published', {}).metadata,
          commandId: 'catalog-tool-command',
          causationId: 'catalog-tool-command'
        }
      }
    ],
    outbox: []
  })
  await events.append({
    streamId: 'definition-builtin-skills-summarize-file',
    streamType: 'definition',
    expectedSequence: 0,
    command: {
      idempotencyKey: 'catalog-skill-command',
      fingerprint: '3'.repeat(64),
      result: { definitionId: 'builtin.skills.summarize-file' }
    },
    events: [
      {
        ...event('event-9', 'skill.definition_published', {
          definition: catalogSkillDefinition()
        }),
        metadata: {
          ...event('event-9', 'skill.definition_published', {}).metadata,
          commandId: 'catalog-skill-command',
          causationId: 'catalog-skill-command'
        }
      }
    ],
    outbox: []
  })
}

function catalogToolDefinition() {
  return {
    schemaVersion: 1,
    id: 'builtin.files.read',
    version: '1.0.0',
    definitionDigest: 'b'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.files',
      packageVersion: '1.0.0',
      packageDigest: 'a'.repeat(64)
    },
    origin: 'builtin',
    name: 'Read file',
    description: 'Read one file.',
    tags: ['file'],
    executor: {
      kind: 'builtin',
      handler: 'files.read',
      handlerVersion: '1.0.0'
    },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    capabilities: ['filesystem.read'],
    effects: ['local_data.read'],
    risk: 'low',
    invocation: {
      mode: 'unary',
      idempotency: 'required',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 30_000,
      maxOutputBytes: 1_024,
      maxAttempts: 1
    },
    discovery: {
      intents: ['read file'],
      contexts: ['workflow', 'schedule']
    }
  }
}

function catalogSkillDefinition() {
  return {
    schemaVersion: 1,
    id: 'builtin.skills.summarize-file',
    version: '1.0.0',
    definitionDigest: 'c'.repeat(64),
    package: {
      packageId: 'realmflow.builtin.files',
      packageVersion: '1.0.0',
      packageDigest: 'a'.repeat(64)
    },
    origin: 'builtin',
    name: 'Summarize file',
    description: 'Summarize one file.',
    instructionsPath: 'skills/summarize.md',
    runtime: { kind: 'instruction' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    requiredTools: [
      {
        toolId: 'builtin.files.read',
        versionRange: '^1.0.0',
        required: true
      }
    ],
    activation: {
      intents: ['summarize file'],
      contexts: ['workflow', 'schedule']
    },
    limits: {
      maxToolCalls: 4,
      timeoutMs: 60_000
    }
  }
}

function event(
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  const sequence = Number(eventId.slice('event-'.length))
  return {
    eventId,
    eventType,
    eventSchemaVersion: 1,
    payload,
    metadata: {
      correlationId: 'correlation-1',
      causationId: sequence === 1 ? 'command-1' : `event-${sequence - 1}`,
      commandId: 'command-1',
      actorType: 'system' as const,
      actorId: 'realmflow',
      occurredAt: 100 + sequence
    }
  }
}
