import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { SqliteAgentProfileRepository } from '../../infrastructure/sqlite/agent-profile-repository'
import { ToolPolicyConfigurationService } from './tool-policy-configuration-service'
import { projectModelFacingToolCatalog } from './tool-model-facing-projection'
import type { ToolPolicyQuery } from '../../../../shared/tool-policy'

const query: ToolPolicyQuery = { source: 'user', scenarioId: 'general' }
const databases: RealmFlowDatabase[] = []
const directories: string[] = []
afterEach(async () => {
  databases.splice(0).forEach((db) => db.close())
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'tool-policy-ui-'))
  directories.push(directory)
  const db = openRealmFlowDatabase(join(directory, 'db.sqlite'))
  databases.push(db)
  const dependencies = {
    profiles: new SqliteAgentProfileRepository(db),
    catalog: { list: async () => projectModelFacingToolCatalog({ packages: [], tools: [], skills: [] }, 'facade') },
    workspaceExists: async (id: string) => id === 'workspace-1',
    sandbox: async () => ({ available: true, networkAllowed: true }),
    now: () => 100,
  }
  return { service: new ToolPolicyConfigurationService(dependencies), dependencies }
}

describe('Tool policy configuration', () => {
  it('persists explicit empty allowlists and reloads the publication', async () => {
    const { service, dependencies } = await setup()
    expect(await service.get(query)).toEqual({ revision: null, layers: [], modelFacingMode: 'auto' })
    const saved = await service.save({ ...query, expectedRevision: null, layers: [{ allow: [] }] })
    expect(saved.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(await new ToolPolicyConfigurationService(dependencies).get(query)).toEqual(saved)
    expect((await service.preview(query)).entries.every((entry) => entry.visibility === 'denied')).toBe(true)
    expect((await service.preview(query)).entries.some((entry) => entry.reason === 'empty_allowlist')).toBe(true)
  })

  it('intersects workspace and provider restrictions with the user ceiling', async () => {
    const { service } = await setup()
    await service.save({ ...query, expectedRevision: null, layers: [{ deny: ['ask_user'] }] })
    const workspace: ToolPolicyQuery = { ...query, source: 'workspace', workspaceId: 'workspace-1', providerId: 'remote' }
    await service.save({
      ...workspace, expectedRevision: null,
      layers: [{ profile: 'full', byProvider: { remote: { allow: [] } } }],
    })
    const preview = await service.preview(workspace)
    expect(preview.entries.find((entry) => entry.id === 'ask_user')).toMatchObject({
      visibility: 'denied', reason: 'explicit_deny',
    })
    expect(preview.entries.some((entry) => entry.reason === 'provider_restricted')).toBe(true)
    expect(preview.entries.every((entry) => entry.visibility === 'denied')).toBe(true)
  })

  it('persists presentation choice, honors workspace precedence and keeps user denials', async () => {
    const { service, dependencies } = await setup()
    const saved = await service.save({
      ...query, expectedRevision: null, layers: [{ deny: ['ask_user'] }], modelFacingMode: 'direct',
    })
    expect(await new ToolPolicyConfigurationService(dependencies).get(query)).toEqual({
      ...saved, modelFacingMode: 'direct',
    })
    expect(await service.preview(query)).toMatchObject({ mode: 'direct', directoryByteLength: 0 })
    expect((await service.preview(query)).entries.find((entry) => entry.id === 'tool_search'))
      .toMatchObject({ visibility: 'denied', reason: 'presentation_hidden' })
    const workspace = { ...query, source: 'workspace' as const, workspaceId: 'workspace-1' }
    expect(await service.preview(workspace)).toMatchObject({ mode: 'direct' })
    await service.save({ ...workspace, expectedRevision: null, layers: [], modelFacingMode: 'directory' })
    const preview = await service.preview(workspace)
    expect(preview).toMatchObject({ mode: 'directory' })
    expect(preview.directoryByteLength).toBeGreaterThan(0)
    expect(preview.entries.find((entry) => entry.id === 'ask_user')).toMatchObject({ visibility: 'denied' })
    expect(preview.entries.find((entry) => entry.id === 'tool_search')).toMatchObject({ visibility: 'direct' })
    await expect(service.save({
      ...query, expectedRevision: null, layers: [], modelFacingMode: 'facade',
    })).rejects.toThrow(/conflict/i)
    expect((await service.get(query)).modelFacingMode).toBe('direct')
  })

  it('publishes only one of two concurrent edits and keeps monotonic revisions with an unchanged clock', async () => {
    const { service } = await setup()
    const first = await service.save({ ...query, expectedRevision: null, layers: [{ profile: 'minimal' }] })
    const results = await Promise.allSettled([
      service.save({ ...query, expectedRevision: first.revision, layers: [{ profile: 'coding' }] }),
      service.save({ ...query, expectedRevision: first.revision, layers: [{ profile: 'full' }] }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await service.get(query)).revision).not.toBe(first.revision)
  })

  it('rejects invalid policy fields, scopes and model-supplied environment without publishing', async () => {
    const { service } = await setup()
    await expect(service.save({ ...query, expectedRevision: null, layers: [{ profile: 'unknown' as never }] })).rejects.toThrow(/profile/)
    await expect(service.get({ ...query, source: 'workspace' })).rejects.toThrow(/workspace/i)
    await expect(service.get({ ...query, source: 'workspace', workspaceId: 'missing' })).rejects.toThrow(/workspace/i)
    await expect(service.get({ ...query, sandbox: { available: true } } as ToolPolicyQuery)).rejects.toThrow(/field/i)
    await expect(service.save({
      ...query, expectedRevision: null, layers: [], modelFacingMode: 'invalid' as never,
    })).rejects.toThrow(/mode/i)
    expect(await service.get(query)).toEqual({ revision: null, layers: [], modelFacingMode: 'auto' })
  })
})
