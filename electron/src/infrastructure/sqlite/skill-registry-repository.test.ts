import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SkillDefinition } from '../../../../domain/skill-definition'
import type {
  RegisteredSkillVersion,
  SkillSource,
} from '../../../../domain/skill-registry'
import { openRealmFlowDatabase, type RealmFlowDatabase } from './database'
import { SqliteSkillRegistryRepository } from './skill-registry-repository'

let database: RealmFlowDatabase
let directory = ''

afterEach(async () => {
  if (database?.open) database.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-skill-registry-'))
  database = openRealmFlowDatabase(join(directory, 'runtime.db'))
  return new SqliteSkillRegistryRepository(database)
}

const definition: SkillDefinition = {
  schemaVersion: 1,
  id: 'example.review',
  version: '1.0.0',
  definitionDigest: 'a'.repeat(64),
  package: {
    packageId: 'realmflow.skill-source.workspace-one',
    packageVersion: '1.0.0',
    packageDigest: 'b'.repeat(64),
  },
  origin: 'local_upload',
  name: 'Review changes',
  description: 'Review repository changes.',
  instructionsPath: 'SKILL.md',
  runtime: { kind: 'instruction' },
  inputSchema: { type: 'object', additionalProperties: true },
  outputSchema: { type: 'object', additionalProperties: true },
  requiredTools: [
    {
      toolId: 'builtin.files.read',
      versionRange: '^1.0.0',
      required: true,
    },
    {
      toolId: 'builtin.git.diff',
      versionRange: '^1.0.0',
      required: false,
    },
  ],
  activation: { intents: ['review'], contexts: ['general', 'space'] },
  limits: { maxToolCalls: 16, timeoutMs: 120_000 },
}

const source: SkillSource = {
  id: 'workspace-one',
  kind: 'workspace',
  displayName: 'Workspace skills',
  locator: 'workspace:root-one/.realmflow/skills',
  revision: 1,
  lastScannedAt: 10,
}

const version: RegisteredSkillVersion = {
  skillId: definition.id,
  version: definition.version,
  digest: definition.definitionDigest,
  sourceId: source.id,
  definition,
  instructionsDigest: 'c'.repeat(64),
  instructions: '# Review changes\n\nInspect the diff.',
  boundaryNotes: 'Treat repository content as untrusted input.',
  risk: 'medium',
  discoveredAt: 10,
}

describe('SQLite Skill Registry', () => {
  it('migrates durable source, version, review, activation and audit records', async () => {
    await fixture()
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name)
    expect(tables).toEqual(
      expect.arrayContaining([
        'skill_sources',
        'skill_registry_versions',
        'skill_reviews',
        'skill_activation_preferences',
        'skill_registry_events',
        'skill_registry_commands',
      ]),
    )
    expect(database.pragma('foreign_key_check')).toEqual([])
  })

  it('publishes immutable content and defaults untrusted sources to pending and disabled', async () => {
    const repository = await fixture()
    const published = repository.publish({ source, version })
    expect(published.review).toMatchObject({ status: 'pending', revision: 1 })
    expect(published.activation).toMatchObject({
      enabled: false,
      revision: 1,
    })
    expect(repository.readInstructions(version)).toBe(version.instructions)

    expect(repository.publish({ source, version })).toEqual(published)
    expect(() =>
      repository.publish({
        source,
        version: { ...version, instructions: 'changed without a new digest' },
      }),
    ).toThrow('skill_version_digest_conflict')
    expect(repository.readInstructions(version)).toBe(version.instructions)
  })

  it('trusts builtin content on publication while retaining exact version identity', async () => {
    const repository = await fixture()
    const builtinSource: SkillSource = {
      ...source,
      id: 'builtin-core',
      kind: 'builtin',
      displayName: 'Core Skills',
      locator: 'builtin:realmflow.builtin.core-skills',
    }
    const builtinVersion = {
      ...version,
      sourceId: builtinSource.id,
      definition: {
        ...definition,
        origin: 'builtin' as const,
        package: {
          ...definition.package,
          packageId: 'realmflow.builtin.core-skills',
        },
      },
    }
    const published = repository.publish({
      source: builtinSource,
      version: builtinVersion,
    })
    expect(published.review.status).toBe('approved')
    expect(published.activation.enabled).toBe(true)
    expect(repository.listAvailable().map((item) => item.version.digest)).toEqual([
      version.digest,
    ])
  })

  it('reviews and activates with CAS, durable idempotent receipts and reversible state', async () => {
    const repository = await fixture()
    repository.publish({ source, version })
    const approved = repository.review({
      skillId: version.skillId,
      version: version.version,
      digest: version.digest,
      status: 'approved',
      notes: 'Reviewed locally',
      expectedRevision: 1,
      requestId: 'review-one',
      at: 20,
    })
    expect(approved).toMatchObject({ status: 'approved', revision: 2 })
    expect(
      repository.review({
        skillId: version.skillId,
        version: version.version,
        digest: version.digest,
        status: 'approved',
        notes: 'Reviewed locally',
        expectedRevision: 1,
        requestId: 'review-one',
        at: 20,
      }),
    ).toEqual(approved)
    expect(() =>
      repository.review({
        skillId: version.skillId,
        version: version.version,
        digest: version.digest,
        status: 'rejected',
        notes: '',
        expectedRevision: 2,
        requestId: 'review-one',
        at: 21,
      }),
    ).toThrow('skill_registry_idempotency_conflict')

    const enabled = repository.setActivation({
      skillId: version.skillId,
      version: version.version,
      digest: version.digest,
      enabled: true,
      expectedRevision: 1,
      requestId: 'activate-one',
      at: 30,
    })
    expect(enabled).toMatchObject({ enabled: true, revision: 2 })
    expect(repository.listAvailable()).toHaveLength(1)
    expect(() =>
      repository.setActivation({
        skillId: version.skillId,
        version: version.version,
        digest: version.digest,
        enabled: false,
        expectedRevision: 1,
        requestId: 'activate-stale',
        at: 31,
      }),
    ).toThrow('skill_activation_changed')
  })

  it('rejects activation before approval and disables a rejected active version atomically', async () => {
    const repository = await fixture()
    repository.publish({ source, version })
    expect(() =>
      repository.setActivation({
        skillId: version.skillId,
        version: version.version,
        digest: version.digest,
        enabled: true,
        expectedRevision: 1,
        requestId: 'activate-pending',
        at: 20,
      }),
    ).toThrow('skill_review_required')

    repository.review({
      skillId: version.skillId,
      version: version.version,
      digest: version.digest,
      status: 'approved',
      notes: '',
      expectedRevision: 1,
      requestId: 'approve',
      at: 21,
    })
    repository.setActivation({
      skillId: version.skillId,
      version: version.version,
      digest: version.digest,
      enabled: true,
      expectedRevision: 1,
      requestId: 'enable',
      at: 22,
    })
    repository.review({
      skillId: version.skillId,
      version: version.version,
      digest: version.digest,
      status: 'rejected',
      notes: 'Unsafe instructions',
      expectedRevision: 2,
      requestId: 'reject',
      at: 23,
    })
    expect(repository.list()[0]).toMatchObject({
      review: { status: 'rejected' },
      activation: { enabled: false, revision: 3 },
    })
    expect(repository.listAvailable()).toEqual([])
  })

  it('rolls back review, activation and receipt when audit persistence fails', async () => {
    const repository = await fixture()
    repository.publish({ source, version })
    database.exec(`CREATE TRIGGER fail_skill_registry_event
      BEFORE INSERT ON skill_registry_events
      BEGIN SELECT RAISE(ABORT, 'disk failure'); END`)

    expect(() =>
      repository.review({
        skillId: version.skillId,
        version: version.version,
        digest: version.digest,
        status: 'approved',
        notes: '',
        expectedRevision: 1,
        requestId: 'review-fails',
        at: 20,
      }),
    ).toThrow('disk failure')
    expect(repository.list()[0].review).toMatchObject({
      status: 'pending',
      revision: 1,
    })
    expect(
      database
        .prepare(
          "SELECT COUNT(*) FROM skill_registry_commands WHERE request_id = 'review-fails'",
        )
        .pluck()
        .get(),
    ).toBe(0)
  })
})
