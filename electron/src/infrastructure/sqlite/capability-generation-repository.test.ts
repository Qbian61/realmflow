import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCapabilityDefinition } from '../../../../domain/capability'
import {
  createCapabilityGenerationSession,
  createCapabilitySpec,
  type CapabilityGenerationSession
} from '../../../../domain/capability-builder'
import { SqliteCapabilityGenerationRepository } from './capability-generation-repository'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from './database'

let directory: string
let database: RealmFlowDatabase
let repository: SqliteCapabilityGenerationRepository

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-capability-generation-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  repository = new SqliteCapabilityGenerationRepository(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteCapabilityGenerationRepository', () => {
  it('persists and restores a generation session after restart', async () => {
    const session = draftSession()
    await repository.create(session)

    database.close()
    database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
    repository = new SqliteCapabilityGenerationRepository(database)

    await expect(repository.get(session.id)).resolves.toEqual(session)
  })

  it('updates only the expected revision', async () => {
    const session = draftSession()
    await repository.create(session)
    const validating = createCapabilityGenerationSession({
      ...session,
      status: 'validating',
      revision: 2,
      updatedAt: 120
    })

    await repository.save(validating, 1)

    await expect(repository.save({
      ...validating,
      status: 'draft',
      revision: 3,
      updatedAt: 130
    }, 1)).rejects.toThrow('Capability generation revision conflict')
    await expect(repository.get(session.id)).resolves.toEqual(validating)
  })

  it('rejects terminal state rollback', async () => {
    const cancelled = createCapabilityGenerationSession({
      ...draftSession(),
      status: 'cancelled',
      revision: 2,
      updatedAt: 120
    })
    await repository.create(cancelled)

    await expect(
      repository.save(
        {
          ...cancelled,
          status: 'draft',
          revision: 3,
          updatedAt: 130
        },
        2
      )
    ).rejects.toThrow(
      'Invalid Capability generation transition: cancelled -> draft'
    )
  })

  it('lists recoverable drafts and approvals without terminal sessions', async () => {
    const draft = draftSession()
    const approval = createCapabilityGenerationSession({
      ...draftSession(),
      id: 'generation-approval',
      status: 'awaiting_approval',
      proposal: {
        ...proposalMetadata(),
        id: 'proposal-1',
        packageDigest: 'a'.repeat(64),
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        validatedAt: 130
      },
      updatedAt: 130
    })
    const failed = createCapabilityGenerationSession({
      ...draftSession(),
      id: 'generation-failed',
      status: 'failed'
    })
    await repository.create(failed)
    await repository.create(approval)
    await repository.create(draft)

    await expect(repository.listRecoverable()).resolves.toEqual([
      draft,
      approval
    ])
  })
})

function draftSession(): CapabilityGenerationSession {
  return createCapabilityGenerationSession({
    id: 'generation-draft',
    conversationId: 'conversation-1',
    requestedBy: 'local-user',
    request: 'Create an issue lookup connector.',
    spec: createCapabilitySpec({
      schemaVersion: 1,
      id: 'com.example.issue-lookup',
      kind: 'connector',
      version: '1.0.0',
      name: 'Issue lookup',
      description: 'Reads issue details.',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      runtime: {
        kind: 'connector',
        connectorKind: 'http',
        baseUrl: 'https://api.example.com',
        method: 'GET',
        path: '/issues/{issueId}',
        credentialRefs: ['issue-api-key'],
        externalWrite: false
      },
      permissions: {
        capabilities: ['network.connect', 'credential.use'],
        maximumRisk: 'medium',
        pathPrefixes: [],
        networkTargets: ['api.example.com']
      },
      dependencies: [],
      compatibility: {
        realmflowVersionRange: '>=0.1.0',
        platforms: ['darwin']
      }
    }),
    status: 'draft',
    revision: 1,
    createdAt: 100,
    updatedAt: 100
  })
}

function proposalMetadata() {
  const definition = createCapabilityDefinition({
    id: 'com.example.issue-lookup',
    kind: 'connector',
    version: '1.0.0',
    source: 'generated',
    manifestDigest: 'a'.repeat(64),
    name: 'Issue lookup',
    description: 'Reads issue details.',
    runtime: {
      kind: 'connector',
      connectorKind: 'http',
      credentialRefs: [],
      configurationSchema: { type: 'object' },
      actions: []
    },
    permissions: draftSession().spec.permissions,
    dependencies: [],
    compatibility: draftSession().spec.compatibility,
    testPlan: [],
    publishedAt: 100
  })
  return {
    definitionDigest: definition.definitionDigest,
    draftRevision: 1,
    definition,
    validationReport: {
      compatible: true as const,
      dependencyStatus: 'resolved' as const,
      tests: []
    },
    fileNames: ['README.md', 'capability.yaml'],
    byteSize: 128,
    fileCount: 2
  }
}
