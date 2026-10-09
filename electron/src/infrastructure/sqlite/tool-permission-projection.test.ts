import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToolProjectionRunner } from '../../application/tools/tool-projection-runner'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteToolEventStore } from './tool-event-store'
import { SqliteToolProjectionStore } from './tool-projection-store'

let directory: string
let database: RealmFlowDatabase
let events: SqliteToolEventStore
let projections: SqliteToolProjectionStore
let runner: ToolProjectionRunner

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-permission-view-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  events = new SqliteToolEventStore(database)
  projections = new SqliteToolProjectionStore(database)
  runner = new ToolProjectionRunner(events, projections, () => 500)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('Tool permission projection', () => {
  it('projects a redacted pending request in deterministic order', async () => {
    await appendRequested(events, 'execution-2', 'request-2', 200)
    await appendRequested(events, 'execution-1', 'request-1', 100)

    await runner.runPermissionBatch(100)

    await expect(projections.listPendingPermissions()).resolves.toEqual([
      expect.objectContaining({
        id: 'request-1',
        executionId: 'execution-1',
        status: 'requested',
        reason: 'out_of_scope',
        resources: [
          { kind: 'path', label: 'private-result.txt' }
        ]
      }),
      expect.objectContaining({
        id: 'request-2',
        executionId: 'execution-2'
      })
    ])
    expect(
      JSON.stringify(await projections.listPendingPermissions())
    ).not.toContain('/Users/private')
  })

  it('updates decisions and rebuilds from the authoritative event order', async () => {
    await appendRequested(events, 'execution-1', 'request-1', 100)
    await runner.runPermissionBatch(100)
    await events.append({
      streamId: 'execution-1',
      streamType: 'tool_execution',
      expectedSequence: 5,
      command: {
        idempotencyKey: 'decision-1',
        fingerprint: 'd'.repeat(64),
        result: { requestId: 'request-1' }
      },
      events: [
        event('decision-event', 'tool.permission_decided', 200, {
          requestId: 'request-1',
          requestRevision: 2,
          outcome: 'authorized',
          decision: 'allow_once',
          grantIds: [],
          resolvedAt: 200
        })
      ],
      outbox: []
    })

    await runner.runPermissionBatch(100)
    await expect(projections.listPendingPermissions()).resolves.toEqual([])
    await expect(projections.getPermission('request-1')).resolves.toMatchObject({
      status: 'approved',
      requestRevision: 2,
      decision: 'allow_once',
      resolvedAt: 200
    })

    await runner.rebuildPermissionProjection()
    await expect(projections.getPermission('request-1')).resolves.toMatchObject({
      status: 'approved',
      requestRevision: 2
    })
    await expect(
      projections.getCheckpoint('tool_permission_request')
    ).resolves.toMatchObject({
      globalPosition: 6,
      generation: 2
    })
  })
})

async function appendRequested(
  store: SqliteToolEventStore,
  executionId: string,
  requestId: string,
  at: number
): Promise<void> {
  const metadata = {
    correlationId: `correlation-${executionId}`,
    causationId: `command-${executionId}`,
    commandId: `command-${executionId}`,
    actorType: 'model' as const,
    actorId: 'conversation-1',
    occurredAt: at
  }
  await store.append({
    streamId: executionId,
    streamType: 'tool_execution',
    expectedSequence: 0,
    command: {
      idempotencyKey: `invoke-${executionId}`,
      fingerprint: 'a'.repeat(64),
      result: { executionId }
    },
    events: [
      event(`${executionId}-1`, 'tool.invocation_requested', at, {
        executionId,
        definition: {
          id: 'builtin.files.write',
          version: '1.0.0',
          definitionDigest: 'a'.repeat(64)
        }
      }),
      event(`${executionId}-2`, 'tool.arguments_validated', at, {
        argumentsDigest: 'b'.repeat(64)
      }),
      event(`${executionId}-3`, 'tool.binding_resolved', at, {
        adapterKind: 'builtin',
        bindingId: 'binding-1'
      }),
      event(`${executionId}-4`, 'tool.effects_planned', at, {
        effectsDigest: 'c'.repeat(64),
        effectCount: 1
      }),
      {
        ...event(`${executionId}-5`, 'tool.permission_requested', at, {
          requestIds: [requestId],
          requestId,
          executionId,
          runId: 'run-1',
          callId: 'call-1',
          toolId: 'builtin.files.write',
          toolName: 'Write file',
          status: 'requested',
          reason: 'out_of_scope',
          risk: 'low',
          effectsDigest: 'c'.repeat(64),
          argumentsDigest: 'b'.repeat(64),
          bindingRevision: 1,
          requestRevision: 1,
          requestedAt: at,
          expiresAt: at + 60_000,
          requests: [
            {
              capability: 'filesystem.write',
              resource: {
                kind: 'path',
                canonicalPath: '/Users/private/private-result.txt',
                access: 'file'
              },
              context: { sessionId: 'conversation-1' },
              risk: 'low'
            }
          ]
        }),
        metadata
      }
    ],
    outbox: []
  })
}

function event(
  eventId: string,
  eventType: string,
  occurredAt: number,
  payload: Record<string, unknown>
) {
  return {
    eventId,
    eventType,
    eventSchemaVersion: 1,
    payload,
    metadata: {
      correlationId: 'correlation-1',
      causationId: 'command-1',
      commandId: 'command-1',
      actorType: 'system' as const,
      actorId: 'realmflow',
      occurredAt
    }
  }
}
