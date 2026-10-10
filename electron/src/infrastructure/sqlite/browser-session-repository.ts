import type Database from 'better-sqlite3'
import type { BrowserSession, BrowserSessionRepository } from '../../application/browser/browser-runtime-port'

export class SqliteBrowserSessionRepository implements BrowserSessionRepository {
  constructor(private readonly database: Database.Database) {}

  get(id: string): BrowserSession | undefined {
    return this.database.prepare(`${SELECT} WHERE id = ?`).get(id) as BrowserSession | undefined
  }

  list(): BrowserSession[] {
    return this.database.prepare(`${SELECT} ORDER BY created_at, id`).all() as BrowserSession[]
  }

  insert(session: BrowserSession): void {
    this.database.transaction(() => {
      if (session.revision !== 1 || session.status !== 'active') throw new Error('Invalid initial browser state')
      const existing = this.database.prepare(
        'SELECT owner_key FROM browser_sessions WHERE profile_id = ? AND owner_key <> ? LIMIT 1'
      ).get(session.profileId, session.ownerKey)
      if (existing) throw new Error('Browser profile owner conflict')
      this.database.prepare(`INSERT INTO browser_sessions
        (id, profile_id, owner_key, status, revision, created_at, updated_at, execution_id)
        VALUES (@id, @profileId, @ownerKey, @status, @revision, @createdAt, @updatedAt, @executionId)`)
        .run(session)
      this.appendEvent(session)
    })()
  }

  update(session: BrowserSession, expectedRevision: number): void {
    this.database.transaction(() => {
      const current = this.get(session.id)
      if (!current || current.revision !== expectedRevision ||
          session.revision !== expectedRevision + 1 ||
          current.ownerKey !== session.ownerKey || current.profileId !== session.profileId ||
          current.createdAt !== session.createdAt || current.status === 'closed' ||
          session.status === 'active') {
        throw new Error('Browser session revision or identity conflict')
      }
      const result = this.database.prepare(`UPDATE browser_sessions
        SET status = @status, revision = @revision, updated_at = @updatedAt, execution_id = @executionId
        WHERE id = @id AND revision = @expectedRevision`).run({ ...session, expectedRevision })
      if (result.changes !== 1) throw new Error('Browser session revision conflict')
      this.appendEvent(session)
    })()
  }

  private appendEvent(session: BrowserSession): void {
    this.database.prepare(`INSERT INTO browser_session_events
      (session_id, revision, status, execution_id, occurred_at)
      VALUES (@id, @revision, @status, @executionId, @updatedAt)`).run(session)
  }
}

const SELECT = `SELECT id, profile_id AS profileId, owner_key AS ownerKey,
  status, revision, created_at AS createdAt, updated_at AS updatedAt,
  execution_id AS executionId FROM browser_sessions`
