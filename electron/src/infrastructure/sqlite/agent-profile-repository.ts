import type Database from 'better-sqlite3'
import type { AgentProfile } from '../../../../domain/agent-profile'
import type { AgentRunScenarioId } from '../../../../domain/agent-runtime'

type ProfileRow = {
  source: AgentProfile['source']
  scenario_id: AgentRunScenarioId
  workspace_id: string | null
  profile_digest: string
  profile_json: string
}

export type AgentProfilePublication = {
  scenarioId: AgentRunScenarioId
  workspaceId?: string
  profile: AgentProfile
  expectedDigest?: string | null
}

export interface AgentProfileLayerRepository {
  listLayers(input: {
    scenarioId: AgentRunScenarioId
    workspaceId?: string
  }): Promise<AgentProfile[]>
}

export class SqliteAgentProfileRepository
  implements AgentProfileLayerRepository
{
  constructor(private readonly database: Database.Database) {}

  async publish(value: AgentProfilePublication): Promise<boolean> {
    assertPublication(value)
    return this.database.transaction(() => this.publishInTransaction(value))()
  }

  private publishInTransaction(value: AgentProfilePublication): boolean {
    if (value.expectedDigest !== undefined) {
      const current = this.database.prepare(
        `SELECT profile_digest FROM agent_profile_publications
         WHERE scenario_id = ? AND source = ? AND workspace_id IS ?
         ORDER BY published_at DESC, profile_version DESC, profile_id LIMIT 1`,
      ).get(value.scenarioId, value.profile.source, value.workspaceId ?? null) as
        { profile_digest: string } | undefined
      if ((current?.profile_digest ?? null) !== value.expectedDigest) {
        throw new Error('Agent Profile revision conflict')
      }
    }
    const existing = this.database
      .prepare(
        `SELECT source, scenario_id, workspace_id, profile_digest, profile_json
         FROM agent_profile_publications
         WHERE profile_id = ? AND profile_version = ?`
      )
      .get(value.profile.id, value.profile.version) as ProfileRow | undefined
    if (existing) {
      if (
        existing.profile_digest === value.profile.profileDigest &&
        existing.source === value.profile.source &&
        existing.scenario_id === value.scenarioId &&
        existing.workspace_id === (value.workspaceId ?? null)
      ) {
        return false
      }
      throw new Error('Agent Profile version is immutable')
    }
    this.database
      .prepare(
        `INSERT INTO agent_profile_publications (
          profile_id, profile_version, source, scenario_id, workspace_id,
          profile_digest, profile_json, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        value.profile.id,
        value.profile.version,
        value.profile.source,
        value.scenarioId,
        value.workspaceId ?? null,
        value.profile.profileDigest,
        JSON.stringify(value.profile),
        value.profile.publishedAt
      )
    return true
  }

  async listLayers(input: {
    scenarioId: AgentRunScenarioId
    workspaceId?: string
  }): Promise<AgentProfile[]> {
    const rows = this.database
      .prepare(
        `SELECT source, scenario_id, workspace_id, profile_digest, profile_json
         FROM agent_profile_publications
         WHERE scenario_id = ?
           AND (
             source = 'user' OR
             (source = 'workspace' AND workspace_id = ?)
           )
         ORDER BY
           CASE source WHEN 'user' THEN 0 ELSE 1 END,
           published_at DESC,
           profile_version DESC,
           profile_id`
      )
      .all(input.scenarioId, input.workspaceId ?? null) as ProfileRow[]
    const layers: AgentProfile[] = []
    for (const source of ['user', 'workspace'] as const) {
      const row = rows.find((candidate) => candidate.source === source)
      if (!row) continue
      const profile = JSON.parse(row.profile_json) as AgentProfile
      if (
        profile.source !== row.source ||
        profile.profileDigest !== row.profile_digest
      ) {
        throw new Error('Stored Agent Profile publication is invalid')
      }
      layers.push(profile)
    }
    return layers
  }
}

function assertPublication(value: AgentProfilePublication): void {
  if (value.profile.source === 'system') {
    throw new Error('System Agent Profiles are built in')
  }
  if (
    value.profile.source === 'workspace' &&
    !value.workspaceId?.trim()
  ) {
    throw new Error('Workspace Agent Profile requires a workspace')
  }
  if (value.profile.source === 'user' && value.workspaceId !== undefined) {
    throw new Error('User Agent Profile cannot bind a workspace')
  }
}
