import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  PersistenceChangedEvent,
  PersistenceDataset,
  PersistenceLoadResult,
  PersistenceSaveResult,
  PersistenceSnapshot
} from '../../../shared/persistence'
import { isRequirementStageId } from '../../../domain/requirement'

type WorkspaceNavigationPayload = {
  version: 1
  spaces: Array<{
    path: string
    label: string
    description: string
  }>
  requirementsBySpace: Record<
    string,
    Array<{
      id: string
      title: string
      stage?: string
      status?: string
      updatedAt?: number
    }>
  >
}

type ChatSessionsPayload = {
  version: 4
  sessions: Array<{
    id: string
    title: string
    spacePath: string
    messages: Array<{
      id: string
      role?: string
      content: string
      createdAt: number
      completedAt?: number
    }>
    createdAt: number
    updatedAt: number
  }>
}

export class SqlitePersistenceService {
  constructor(
    private readonly database: Database.Database,
    private readonly onChanged: (event: PersistenceChangedEvent) => void
  ) {}

  async load(dataset: PersistenceDataset): Promise<PersistenceLoadResult> {
    try {
      return { status: 'loaded', snapshot: this.loadSync(dataset) }
    } catch {
      return { status: 'unavailable' }
    }
  }

  async save(
    dataset: PersistenceDataset,
    value: unknown,
    expectedRevision: number
  ): Promise<PersistenceSaveResult> {
    const normalized = this.validate(dataset, value)
    try {
      const result = this.database.transaction(() => {
        const currentRevision = this.getRevision(dataset)
        if (currentRevision !== expectedRevision) {
          return {
            status: 'conflict' as const,
            snapshot: this.loadSync(dataset)
          }
        }
        this.saveDataset(dataset, normalized)
        const revision = expectedRevision + 1
        this.database
          .prepare(
            `INSERT INTO dataset_revisions (dataset, revision, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(dataset) DO UPDATE SET
               revision = excluded.revision,
               updated_at = excluded.updated_at`
          )
          .run(dataset, revision, Date.now())
        return {
          status: 'saved' as const,
          snapshot: { revision, value: normalized }
        }
      })()
      if (result.status === 'saved') {
        this.onChanged({
          dataset,
          revision: result.snapshot.revision
        })
      }
      return result
    } catch (error) {
      if (error instanceof TypeError) throw error
      return { status: 'unavailable' }
    }
  }

  private loadSync(dataset: PersistenceDataset): PersistenceSnapshot {
    const revision = this.getRevision(dataset)
    switch (dataset) {
      case 'workspaceNavigation':
        return { revision, value: this.loadWorkspaceNavigation() }
      case 'chatSessions':
        return { revision, value: this.loadChatSessions() }
    }
  }

  private getRevision(dataset: PersistenceDataset): number {
    return (
      (this.database
        .prepare('SELECT revision FROM dataset_revisions WHERE dataset = ?')
        .pluck()
        .get(dataset) as number | undefined) ?? 0
    )
  }

  private validate(dataset: PersistenceDataset, value: unknown): unknown {
    const valid =
      dataset === 'workspaceNavigation'
        ? isWorkspaceNavigationPayload(value)
        : isChatSessionsPayload(value)
    if (!valid) throw new TypeError(`Invalid ${dataset} payload`)
    return value
  }

  private saveDataset(dataset: PersistenceDataset, value: unknown): void {
    switch (dataset) {
      case 'workspaceNavigation':
        this.saveWorkspaceNavigation(value as WorkspaceNavigationPayload)
        return
      case 'chatSessions':
        this.saveChatSessions(value as ChatSessionsPayload)
        return
    }
  }

  private loadWorkspaceNavigation(): WorkspaceNavigationPayload {
    const spaces = this.database
      .prepare(
        `SELECT path, label, description FROM workspaces
         ORDER BY sort_order, id`
      )
      .all() as Array<{
      path: string
      label: string
      description: string
    }>
    const requirements = this.database
      .prepare(
        `SELECT w.path AS space_path, r.id, r.title, r.stage, r.status,
          r.updated_at
         FROM requirements r
         JOIN workspaces w ON w.id = r.workspace_id
         ORDER BY w.sort_order, r.sort_order, r.id`
      )
      .all() as Array<{
      space_path: string
      id: string
      title: string
      stage: string | null
      status: string
      updated_at: number
    }>
    const requirementsBySpace = Object.fromEntries(
      spaces.map((space) => [space.path, []])
    ) as WorkspaceNavigationPayload['requirementsBySpace']
    for (const requirement of requirements) {
      requirementsBySpace[requirement.space_path]!.push({
        id: requirement.id,
        title: requirement.title,
        ...(requirement.stage ? { stage: requirement.stage } : {}),
        status: requirement.status,
        updatedAt: requirement.updated_at
      })
    }
    return { version: 1, spaces, requirementsBySpace }
  }

  private loadChatSessions(): ChatSessionsPayload {
    const rows = this.database
      .prepare(
        `SELECT s.id, s.title, w.path AS space_path, s.created_at, s.updated_at
         FROM chat_sessions s
         JOIN workspaces w ON w.id = s.workspace_id
         ORDER BY s.sort_order, s.id`
      )
      .all() as Array<{
      id: string
      title: string
      space_path: string
      created_at: number
      updated_at: number
    }>
    const getMessages = this.database.prepare(
      `SELECT id, role, content, created_at, completed_at FROM chat_messages
       WHERE session_id = ? ORDER BY sort_order, id`
    )
    return {
      version: 4,
      sessions: rows.map((row) => ({
        id: row.id,
        title: row.title,
        spacePath: row.space_path,
        messages: (
          getMessages.all(row.id) as Array<{
            id: string
            role: string
            content: string
            created_at: number
            completed_at: number | null
          }>
        ).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
          ...(message.completed_at === null
            ? {}
            : { completedAt: message.completed_at })
        })),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }
  }

  private saveWorkspaceNavigation(value: WorkspaceNavigationPayload): void {
    const now = Date.now()
    const workspaceIds = new Map<string, string>()
    const upsertWorkspace = this.database.prepare(
      `INSERT INTO workspaces (
        id, path, label, description, sort_order, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        label = excluded.label,
        description = excluded.description,
        sort_order = excluded.sort_order,
        revision = workspaces.revision + 1,
        updated_at = excluded.updated_at`
    )
    value.spaces.forEach((space, index) => {
      const id = stableWorkspaceId(space.path)
      workspaceIds.set(space.path, id)
      upsertWorkspace.run(
        id,
        space.path,
        space.label,
        space.description,
        index,
        now,
        now
      )
    })

    const requirementIds: string[] = []
    const upsertRequirement = this.database.prepare(
      `INSERT INTO requirements (
        id, workspace_id, title, stage, status, sort_order, revision,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        title = excluded.title,
        stage = excluded.stage,
        status = excluded.status,
        sort_order = excluded.sort_order,
        revision = requirements.revision + 1,
        updated_at = excluded.updated_at`
    )
    for (const [spacePath, requirements] of Object.entries(
      value.requirementsBySpace
    )) {
      const workspaceId = workspaceIds.get(spacePath)
      if (!workspaceId) {
        throw new TypeError(
          `Invalid workspaceNavigation payload: unknown space ${spacePath}`
        )
      }
      requirements.forEach((requirement, index) => {
        requirementIds.push(requirement.id)
        const updatedAt = requirement.updatedAt ?? now
        upsertRequirement.run(
          requirement.id,
          workspaceId,
          requirement.title,
          requirement.stage ?? null,
          requirement.status ?? 'pending',
          index,
          updatedAt,
          updatedAt
        )
      })
    }
    deleteMissing(this.database, 'requirements', requirementIds)
    deleteMissing(this.database, 'workspaces', [...workspaceIds.values()])
  }

  private saveChatSessions(value: ChatSessionsPayload): void {
    const workspaceIds = new Map(
      (
        this.database
          .prepare('SELECT id, path FROM workspaces')
          .all() as Array<{ id: string; path: string }>
      ).map((workspace) => [workspace.path, workspace.id])
    )
    const upsertSession = this.database.prepare(
      `INSERT INTO chat_sessions (
        id, workspace_id, kind, knowledge_scope, title, sort_order, revision,
        created_at, updated_at
      ) VALUES (?, ?, 'space', ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        kind = excluded.kind,
        knowledge_scope = excluded.knowledge_scope,
        title = excluded.title,
        sort_order = excluded.sort_order,
        revision = chat_sessions.revision + 1,
        updated_at = excluded.updated_at`
    )
    const deleteMessages = this.database.prepare(
      'DELETE FROM chat_messages WHERE session_id = ?'
    )
    const insertMessage = this.database.prepare(
      `INSERT INTO chat_messages (
        id, session_id, role, content, sort_order, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    value.sessions.forEach((session, sessionIndex) => {
      const workspaceId = workspaceIds.get(session.spacePath)
      if (!workspaceId) {
        throw new TypeError(
          `Invalid chatSessions payload: unknown space ${session.spacePath}`
        )
      }
      upsertSession.run(
        session.id,
        workspaceId,
        JSON.stringify({ kind: 'workspace', workspaceId }),
        session.title,
        sessionIndex,
        session.createdAt,
        session.updatedAt
      )
      deleteMessages.run(session.id)
      session.messages.forEach((message, messageIndex) => {
        insertMessage.run(
          message.id,
          session.id,
          message.role ?? 'user',
          message.content,
          messageIndex,
          message.createdAt,
          message.completedAt ?? null
        )
      })
    })
    deleteMissing(
      this.database,
      'chat_sessions',
      value.sessions.map((session) => session.id)
    )
  }

}

function isWorkspaceNavigationPayload(
  value: unknown
): value is WorkspaceNavigationPayload {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.spaces)) {
    return false
  }
  const spaces = value.spaces
  if (
    !spaces.every(
      (space) =>
        isRecord(space) &&
        typeof space.path === 'string' &&
        space.path.startsWith('/spaces/') &&
        typeof space.label === 'string' &&
        typeof space.description === 'string'
    ) ||
    !isRecord(value.requirementsBySpace)
  ) {
    return false
  }
  return Object.entries(value.requirementsBySpace).every(
    ([spacePath, requirements]) =>
      spaces.some(
        (space) => isRecord(space) && space.path === spacePath
      ) &&
      Array.isArray(requirements) &&
      requirements.every(
        (requirement) =>
          isRecord(requirement) &&
          typeof requirement.id === 'string' &&
          typeof requirement.title === 'string' &&
          (requirement.stage === undefined ||
            isRequirementStageId(requirement.stage)) &&
          (requirement.status === undefined ||
            ['pending', 'active', 'completed'].includes(
              String(requirement.status)
            )) &&
          (requirement.updatedAt === undefined ||
            typeof requirement.updatedAt === 'number')
      )
  )
}

function isChatSessionsPayload(value: unknown): value is ChatSessionsPayload {
  return (
    isRecord(value) &&
    value.version === 4 &&
    Array.isArray(value.sessions) &&
    value.sessions.every(
      (session) =>
        isRecord(session) &&
        typeof session.id === 'string' &&
        typeof session.title === 'string' &&
        typeof session.spacePath === 'string' &&
        session.spacePath.startsWith('/spaces/') &&
        typeof session.createdAt === 'number' &&
        typeof session.updatedAt === 'number' &&
        Array.isArray(session.messages) &&
        session.messages.every(
          (message) =>
            isRecord(message) &&
            typeof message.id === 'string' &&
            typeof message.content === 'string' &&
            typeof message.createdAt === 'number' &&
            (message.completedAt === undefined ||
              typeof message.completedAt === 'number') &&
            (message.role === undefined ||
              message.role === 'user' ||
              message.role === 'assistant')
        )
    )
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableWorkspaceId(path: string): string {
  return `legacy-workspace-${createHash('sha256')
    .update(path)
    .digest('hex')
    .slice(0, 20)}`
}

function deleteMissing(
  database: Database.Database,
  table: 'workspaces' | 'requirements' | 'chat_sessions',
  ids: string[]
): void {
  if (ids.length === 0) {
    database.prepare(`DELETE FROM ${table}`).run()
    return
  }
  const placeholders = ids.map(() => '?').join(', ')
  database
    .prepare(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`)
    .run(...ids)
}
