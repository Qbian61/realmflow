import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  KnowledgeDocument,
  KnowledgeSyncFailure
} from '../../application/knowledge/sync-requirement-artifacts'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteKnowledgeStore } from './knowledge-store'

let directory: string
let database: RealmFlowDatabase
let store: SqliteKnowledgeStore

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-knowledge-'))
  database = openRealmFlowDatabase(join(directory, 'realmflow.db'))
  seedWorkspaceRequirementAndArtifact()
  store = new SqliteKnowledgeStore(database)
})

afterEach(async () => {
  database.close()
  await rm(directory, { recursive: true, force: true })
})

describe('SqliteKnowledgeStore', () => {
  it('replaces a document and all of its chunks atomically', async () => {
    await store.replaceDocument(document(1, ['old one', 'old two']))
    await store.replaceDocument(document(2, ['new content']))

    await expect(
      store.getBySource('requirement-1', 'artifacts/analysis.md')
    ).resolves.toEqual(
      document(2, ['new content'])
    )
    expect(
      database
        .prepare(
          'SELECT content FROM knowledge_chunks WHERE document_id = ? ORDER BY chunk_index'
        )
        .all('document-1')
    ).toEqual([{ content: 'new content' }])
  })

  it('persists retryable sync failures', async () => {
    const failure: KnowledgeSyncFailure = {
      id: 'job-1',
      requirementId: 'requirement-1',
      artifactId: 'artifact-1',
      status: 'failed',
      retryable: true,
      error: 'index unavailable',
      createdAt: 200
    }

    await store.recordFailure(failure)

    expect(
      database
        .prepare(
          `SELECT status, retryable, error, attempt
           FROM knowledge_sync_jobs WHERE id = ?`
        )
        .get(failure.id)
    ).toEqual({
      status: 'failed',
      retryable: 1,
      error: 'index unavailable',
      attempt: 1
    })
  })
})

function document(
  version: number,
  chunks: string[]
): KnowledgeDocument {
  return {
    id: 'document-1',
    workspaceId: 'workspace-1',
    sourceRequirementId: 'requirement-1',
    sourceArtifactId: version === 1 ? 'artifact-1' : 'artifact-2',
    sourceVersion: version,
    sourcePath: 'artifacts/analysis.md',
    checksum: `sha256:v${version}`,
    content: chunks.join(''),
    chunks: chunks.map((content, index) => ({
      id: `chunk-${version}-${index}`,
      index,
      content,
      checksum: `sha256:chunk-${version}-${index}`
    })),
    updatedAt: 100 + version
  }
}

function seedWorkspaceRequirementAndArtifact(): void {
  database
    .prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('workspace-1', '/spaces/one', 'One', '', 0, 1, 1, 1)
  database
    .prepare(
      `INSERT INTO requirements (
        id, workspace_id, title, status, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('requirement-1', 'workspace-1', 'Requirement', 'completed', 0, 1, 1, 1)
  database
    .prepare(
      `INSERT INTO artifacts (
        id, requirement_id, stage_id, relative_path, kind, checksum, version,
        byte_size, is_primary, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'artifact-1',
      'requirement-1',
      'analysis',
      'artifacts/analysis.md',
      'markdown',
      'sha256:v1',
      1,
      10,
      0,
      1,
      1,
      1
    )
  database
    .prepare(
      `INSERT INTO artifacts (
        id, requirement_id, stage_id, relative_path, kind, checksum, version,
        byte_size, is_primary, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'artifact-2',
      'requirement-1',
      'analysis',
      'artifacts/analysis.md',
      'markdown',
      'sha256:v2',
      2,
      10,
      1,
      1,
      2,
      2
    )
}
