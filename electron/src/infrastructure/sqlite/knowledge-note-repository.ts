import type Database from 'better-sqlite3'
import type {
  KnowledgeNote,
  KnowledgeNoteKind,
  KnowledgeNoteVersion
} from '../../../../domain/knowledge-note'

export type KnowledgeNoteAggregate = Readonly<{
  note: KnowledgeNote
  currentVersion: KnowledgeNoteVersion
}>

export type KnowledgeNoteWriteResult =
  | Readonly<{ status: 'applied'; value: KnowledgeNoteAggregate }>
  | Readonly<{ status: 'conflict'; current: KnowledgeNoteAggregate }>
  | Readonly<{ status: 'not_found' }>

type NoteRow = {
  id: string
  workspace_id: string
  kind: KnowledgeNoteKind
  requirement_id: string | null
  session_id: string | null
  current_version_id: string
  current_version: number
  status: KnowledgeNote['status']
  revision: number
  created_at: number
  updated_at: number
}

type VersionRow = {
  id: string
  note_id: string
  version: number
  title: string
  content: string
  source_message_ids_json: string
  checksum: string
  created_at: number
}

export class SqliteKnowledgeNoteRepository {
  constructor(private readonly database: Database.Database) {}

  async create(input: {
    note: KnowledgeNote
    version: KnowledgeNoteVersion
  }): Promise<KnowledgeNoteAggregate> {
    this.database.transaction(() => {
      this.insertNote(input.note)
      this.insertVersion(input.version)
    })()
    return { note: input.note, currentVersion: input.version }
  }

  async get(id: string): Promise<KnowledgeNoteAggregate | undefined> {
    return this.getSync(id)
  }

  async listActive(workspaceId: string): Promise<KnowledgeNoteAggregate[]> {
    const ids = this.database
      .prepare(
        `SELECT id FROM knowledge_notes
         WHERE workspace_id = ? AND status = 'active'
         ORDER BY updated_at DESC, id`
      )
      .pluck()
      .all(workspaceId) as string[]
    return ids.map((id) => this.getSync(id)!)
  }

  async listVersions(noteId: string): Promise<KnowledgeNoteVersion[]> {
    return (
      this.database
        .prepare(
          `SELECT * FROM knowledge_note_versions
           WHERE note_id = ? ORDER BY version`
        )
        .all(noteId) as VersionRow[]
    ).map(mapVersion)
  }

  async update(
    input: {
      note: KnowledgeNote
      version: KnowledgeNoteVersion
    },
    expectedRevision: number
  ): Promise<KnowledgeNoteWriteResult> {
    return this.database.transaction(() => {
      const current = this.getSync(input.note.id)
      if (!current) return { status: 'not_found' as const }
      if (current.note.revision !== expectedRevision) {
        return { status: 'conflict' as const, current }
      }
      this.insertVersion(input.version)
      const changed = this.database
        .prepare(
          `UPDATE knowledge_notes
           SET current_version_id = ?, current_version = ?, revision = ?,
               updated_at = ?
           WHERE id = ? AND revision = ? AND status = 'active'`
        )
        .run(
          input.note.currentVersionId,
          input.note.currentVersion,
          input.note.revision,
          input.note.updatedAt,
          input.note.id,
          expectedRevision
        ).changes
      if (changed !== 1) {
        throw new Error('Knowledge Note update lost its transaction lock')
      }
      return {
        status: 'applied' as const,
        value: {
          note: input.note,
          currentVersion: input.version
        }
      }
    })()
  }

  async archive(
    note: KnowledgeNote,
    expectedRevision: number
  ): Promise<KnowledgeNoteWriteResult> {
    return this.database.transaction(() => {
      const current = this.getSync(note.id)
      if (!current) return { status: 'not_found' as const }
      if (current.note.revision !== expectedRevision) {
        return { status: 'conflict' as const, current }
      }
      const changed = this.database
        .prepare(
          `UPDATE knowledge_notes
           SET status = 'archived', revision = ?, updated_at = ?
           WHERE id = ? AND revision = ? AND status = 'active'`
        )
        .run(note.revision, note.updatedAt, note.id, expectedRevision).changes
      if (changed !== 1) {
        throw new Error('Knowledge Note archive lost its transaction lock')
      }
      this.database
        .prepare(
          `UPDATE knowledge_index_jobs
           SET status = 'cancelled', error_code = 'source_archived',
               updated_at = ?, completed_at = ?
           WHERE source_kind = ? AND source_id = ? AND status = 'pending'`
        )
        .run(note.updatedAt, note.updatedAt, note.kind, note.id)
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'failed', error_code = 'source_archived'
           WHERE source_kind = ? AND source_id = ? AND status = 'staging'`
        )
        .run(note.kind, note.id)
      this.database
        .prepare(
          `UPDATE knowledge_index_generations
           SET status = 'retired', retired_at = ?, error_code = NULL
           WHERE source_kind = ? AND source_id = ? AND status = 'current'`
        )
        .run(note.updatedAt, note.kind, note.id)
      return {
        status: 'applied' as const,
        value: { note, currentVersion: current.currentVersion }
      }
    })()
  }

  private getSync(id: string): KnowledgeNoteAggregate | undefined {
    const noteRow = this.database
      .prepare('SELECT * FROM knowledge_notes WHERE id = ?')
      .get(id) as NoteRow | undefined
    if (!noteRow) return undefined
    const versionRow = this.database
      .prepare('SELECT * FROM knowledge_note_versions WHERE id = ?')
      .get(noteRow.current_version_id) as VersionRow | undefined
    if (!versionRow) {
      throw new Error(`Knowledge Note current version is missing: ${id}`)
    }
    return {
      note: mapNote(noteRow),
      currentVersion: mapVersion(versionRow)
    }
  }

  private insertNote(note: KnowledgeNote): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_notes (
          id, workspace_id, kind, requirement_id, session_id,
          current_version_id, current_version, status, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        note.id,
        note.workspaceId,
        note.kind,
        note.requirementId ?? null,
        note.sessionId ?? null,
        note.currentVersionId,
        note.currentVersion,
        note.status,
        note.revision,
        note.createdAt,
        note.updatedAt
      )
  }

  private insertVersion(version: KnowledgeNoteVersion): void {
    this.database
      .prepare(
        `INSERT INTO knowledge_note_versions (
          id, note_id, version, title, content, source_message_ids_json,
          checksum, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        version.id,
        version.noteId,
        version.version,
        version.title,
        version.content,
        JSON.stringify(version.sourceMessageIds),
        version.checksum,
        version.createdAt
      )
  }
}

function mapNote(row: NoteRow): KnowledgeNote {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    ...(row.requirement_id ? { requirementId: row.requirement_id } : {}),
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    currentVersionId: row.current_version_id,
    currentVersion: row.current_version,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapVersion(row: VersionRow): KnowledgeNoteVersion {
  const sourceMessageIds: unknown = JSON.parse(row.source_message_ids_json)
  if (
    !Array.isArray(sourceMessageIds) ||
    sourceMessageIds.some((id) => typeof id !== 'string')
  ) {
    throw new Error(`Knowledge Note source messages are invalid: ${row.id}`)
  }
  return {
    id: row.id,
    noteId: row.note_id,
    version: row.version,
    title: row.title,
    content: row.content,
    sourceMessageIds,
    checksum: row.checksum,
    createdAt: row.created_at
  }
}
