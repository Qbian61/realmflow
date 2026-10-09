import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OutboundCallAuditService } from '../application/network/outbound-call-audit'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../infrastructure/sqlite/database'
import { SqliteOutboundCallRepository } from '../infrastructure/sqlite/outbound-call-repository'
import { NetworkGateway } from './network-gateway'

let database: RealmFlowDatabase | undefined
let directory: string | undefined

afterEach(async () => {
  database?.close()
  database = undefined
  if (directory) {
    await rm(directory, { recursive: true, force: true })
    directory = undefined
  }
})

describe('NetworkGateway SQLite outbound audit', () => {
  it('persists a sanitized lifecycle before and after a real loopback call', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-gateway-audit-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const repository = new SqliteOutboundCallRepository(database)
    const audit = new OutboundCallAuditService({
      repository,
      createId: () => 'audit-call-1',
      now: () => 100
    })
    const outbound = vi.fn(async () => {
      await expect(repository.getById('audit-call-1')).resolves.toMatchObject({
        status: 'started',
        aiRunId: 'run-1'
      })
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'private provider response' } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })
    const gateway = new NetworkGateway({
      request: outbound,
      audit,
      createToken: () => 'secret-grant',
      createAuditKey: () => 'logical-call-1',
      now: () => 100
    })
    await gateway.start()

    try {
      const model = gateway.authorize(
        {
          providerType: 'openai_completions',
          providerId: 'provider-1',
          modelProfileId: 'profile-1',
          baseUrl: 'https://private.example/v1',
          modelId: 'model-1',
          timeoutMs: 1_000,
          maxRetries: 0,
          maxConcurrency: 1,
          apiKey: 'sk-private'
        },
        {
          owner: { type: 'node_run', id: 'node-run-1' },
          workspaceId: 'workspace-1',
          requirementId: 'requirement-1',
          nodeId: 'node-1',
          nodeRunId: 'node-run-1'
        }
      )
      gateway.bindRun(model, 'run-1')
      const response = await fetch(model.gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.gateway.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'private user prompt' }]
        })
      })

      expect(response.status).toBe(200)
      await expect(repository.getById('audit-call-1')).resolves.toMatchObject({
        callType: 'model_completion',
        target: { type: 'model_provider', id: 'provider-1' },
        owner: { type: 'ai_run', id: 'run-1' },
        status: 'succeeded',
        durationMs: 0,
        retryCount: 0
      })
      const rawRows = database
        .prepare('SELECT * FROM outbound_calls')
        .all()
      const persisted = JSON.stringify(rawRows)
      for (const secret of [
        'sk-private',
        'secret-grant',
        'private.example',
        'private user prompt',
        'private provider response'
      ]) {
        expect(persisted).not.toContain(secret)
      }
    } finally {
      await gateway.stop()
    }
  })

  it('persists one sanitized connector audit across a retry', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-connector-audit-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const repository = new SqliteOutboundCallRepository(database)
    const audit = new OutboundCallAuditService({
      repository,
      createId: () => 'connector-audit-1',
      now: () => 200
    })
    const outbound = vi
      .fn()
      .mockImplementationOnce(async () => {
        await expect(
          repository.getById('connector-audit-1')
        ).resolves.toMatchObject({
          callType: 'online_document',
          target: { type: 'connector', id: 'connector-docs' },
          status: 'started'
        })
        return new Response('retry with bearer-secret', { status: 503 })
      })
      .mockResolvedValueOnce(
        new Response('private connector response', { status: 200 })
      )
    const gateway = new NetworkGateway({
      request: outbound,
      audit,
      sleep: async () => undefined
    })

    const response = await gateway.requestConnector({
      connectorId: 'connector-docs',
      url: 'https://private.example/documents/1',
      method: 'GET',
      authentication: { type: 'bearer', credential: 'bearer-secret' },
      timeoutMs: 1_000,
      maxRetries: 1,
      idempotencyKey: 'connector-invoke-1',
      owner: { type: 'knowledge_source', id: 'source-1' },
      callType: 'online_document',
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1'
    })

    expect(response.retryCount).toBe(1)
    await expect(
      repository.getById('connector-audit-1')
    ).resolves.toMatchObject({
      callType: 'online_document',
      target: { type: 'connector', id: 'connector-docs' },
      owner: { type: 'knowledge_source', id: 'source-1' },
      workspaceId: 'workspace-1',
      requirementId: 'requirement-1',
      status: 'succeeded',
      retryCount: 1
    })
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM outbound_calls').get()
    ).toEqual({ count: 1 })
    const persisted = JSON.stringify(
      database.prepare('SELECT * FROM outbound_calls').all()
    )
    expect(persisted).not.toMatch(
      /bearer-secret|private\.example|private connector response/
    )
  })

  it('persists connector authentication failures with a stable error code', async () => {
    directory = await mkdtemp(join(tmpdir(), 'realmflow-connector-audit-'))
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    const repository = new SqliteOutboundCallRepository(database)
    const audit = new OutboundCallAuditService({
      repository,
      createId: () => 'connector-audit-auth',
      now: () => 300
    })
    const gateway = new NetworkGateway({
      request: vi.fn().mockResolvedValue(
        new Response('private authentication response', { status: 401 })
      ),
      audit
    })

    await expect(
      gateway.requestConnector({
        connectorId: 'connector-private',
        url: 'https://private.example/documents/1',
        method: 'GET',
        authentication: { type: 'bearer', credential: 'bearer-secret' },
        timeoutMs: 1_000,
        maxRetries: 0,
        idempotencyKey: 'connector-auth-failure',
        owner: { type: 'connector', id: 'connector-private' },
        callType: 'connector'
      })
    ).rejects.toMatchObject({ code: 'authentication_error' })

    await expect(
      repository.getById('connector-audit-auth')
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'authentication_error',
      errorSummary: 'Target service authentication failed',
      retryCount: 0
    })
    const persisted = JSON.stringify(
      database.prepare('SELECT * FROM outbound_calls').all()
    )
    expect(persisted).not.toMatch(
      /bearer-secret|private\.example|private authentication response/
    )
  })
})
