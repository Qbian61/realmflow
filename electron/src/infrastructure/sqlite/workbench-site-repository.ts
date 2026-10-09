import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  normalizeWorkbenchSiteUrl,
  type WorkbenchSite,
  type WorkbenchSiteGroup,
  type WorkbenchSiteOpenMode,
  type WorkbenchSitesSnapshot
} from '../../../../shared/workbench-sites'

export class WorkbenchSiteRevisionConflictError extends Error {
  readonly code = 'revision_conflict'

  constructor(readonly currentRevision: number) {
    super('Workbench site revision conflict')
    this.name = 'WorkbenchSiteRevisionConflictError'
  }
}

type GroupRow = {
  id: string
  name: string
  position: number
  system_key: string | null
  site_count: number
  revision: number
  created_at: number
  updated_at: number
}

type SiteRow = {
  id: string
  group_id: string
  name: string
  url: string
  open_mode: WorkbenchSiteOpenMode
  icon_attachment_id: string | null
  position: number
  revision: number
  created_at: number
  updated_at: number
}

export type WorkbenchSiteRepository = {
  getSnapshot(): Promise<WorkbenchSitesSnapshot>
  getSite(siteId: string): Promise<WorkbenchSite>
  createGroup(input: { name: string }): Promise<WorkbenchSiteGroup>
  updateGroup(input: {
    groupId: string
    expectedRevision: number
    name?: string
    position?: number
  }): Promise<WorkbenchSiteGroup>
  deleteGroup(input: {
    groupId: string
    expectedRevision: number
  }): Promise<void>
  createSite(input: {
    name: string
    url: string
    groupId: string
    openMode: WorkbenchSiteOpenMode
  }): Promise<WorkbenchSite>
  updateSite(input: {
    siteId: string
    expectedRevision: number
    name?: string
    url?: string
    groupId?: string
    openMode?: WorkbenchSiteOpenMode
    iconAttachmentId?: string | null
    position?: number
  }): Promise<WorkbenchSite>
  deleteSite(input: {
    siteId: string
    expectedRevision: number
  }): Promise<void>
}

export class SqliteWorkbenchSiteRepository
  implements WorkbenchSiteRepository
{
  constructor(private readonly database: Database.Database) {}

  async getSnapshot(): Promise<WorkbenchSitesSnapshot> {
    return this.getSnapshotSync()
  }

  async getSite(siteId: string): Promise<WorkbenchSite> {
    return toSite(this.getSiteRow(siteId))
  }

  async createGroup(input: { name: string }): Promise<WorkbenchSiteGroup> {
    return this.database.transaction(() => {
      const id = randomUUID()
      const now = Date.now()
      this.database
        .prepare(
          `INSERT INTO workbench_site_groups (
            id, name, position, revision, created_at, updated_at
          ) VALUES (?, ?, ?, 0, ?, ?)`
        )
        .run(id, parseName(input.name), this.nextGroupPosition(), now, now)
      return this.getGroup(id)
    })()
  }

  async updateGroup(input: {
    groupId: string
    expectedRevision: number
    name?: string
    position?: number
  }): Promise<WorkbenchSiteGroup> {
    return this.database.transaction(() => {
      const current = this.getGroupRow(input.groupId)
      assertRevision(current.revision, input.expectedRevision)
      const now = Date.now()
      const position =
        input.position === undefined
          ? current.position
          : this.moveGroupSync(
              input.groupId,
              parsePosition(input.position),
              now
            )
      this.database
        .prepare(
          `UPDATE workbench_site_groups
           SET name = ?, position = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(
          input.name === undefined ? current.name : parseName(input.name),
          position,
          now,
          input.groupId
        )
      return this.getGroup(input.groupId)
    })()
  }

  async deleteGroup(input: {
    groupId: string
    expectedRevision: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getGroupRow(input.groupId)
      assertRevision(current.revision, input.expectedRevision)
      const now = Date.now()
      this.database
        .prepare(
          `UPDATE workbench_attachments
           SET deleted_at = ?
           WHERE owner_type = 'site_icon'
             AND owner_id IN (
               SELECT id FROM workbench_sites
               WHERE group_id = ? AND deleted_at IS NULL
             )
             AND deleted_at IS NULL`
        )
        .run(now, input.groupId)
      this.database
        .prepare(
          `UPDATE workbench_sites
           SET deleted_at = ?, revision = revision + 1, updated_at = ?
           WHERE group_id = ? AND deleted_at IS NULL`
        )
        .run(now, now, input.groupId)
      this.database
        .prepare(
          `UPDATE workbench_site_groups
           SET deleted_at = ?, updated_at = ?, revision = revision + 1
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(now, now, input.groupId)
      this.normalizeGroupPositionsSync(now)
    })()
  }

  async createSite(input: {
    name: string
    url: string
    groupId: string
    openMode: WorkbenchSiteOpenMode
  }): Promise<WorkbenchSite> {
    return this.database.transaction(() => {
      this.getGroupRow(input.groupId)
      const id = randomUUID()
      const now = Date.now()
      this.database
        .prepare(
          `INSERT INTO workbench_sites (
            id, group_id, name, url, open_mode, position, revision,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          id,
          input.groupId,
          parseName(input.name),
          normalizeWorkbenchSiteUrl(input.url),
          parseOpenMode(input.openMode),
          this.nextSitePosition(input.groupId),
          now,
          now
        )
      return toSite(this.getSiteRow(id))
    })()
  }

  async updateSite(input: {
    siteId: string
    expectedRevision: number
    name?: string
    url?: string
    groupId?: string
    openMode?: WorkbenchSiteOpenMode
    iconAttachmentId?: string | null
    position?: number
  }): Promise<WorkbenchSite> {
    return this.database.transaction(() => {
      const current = this.getSiteRow(input.siteId)
      assertRevision(current.revision, input.expectedRevision)
      const groupId = input.groupId ?? current.group_id
      this.getGroupRow(groupId)
      if (input.iconAttachmentId) {
        this.assertIconAttachment(input.iconAttachmentId, input.siteId)
      }
      this.database
        .prepare(
          `UPDATE workbench_sites
           SET group_id = ?, name = ?, url = ?, open_mode = ?,
               icon_attachment_id = ?, position = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(
          groupId,
          input.name === undefined ? current.name : parseName(input.name),
          input.url === undefined
            ? current.url
            : normalizeWorkbenchSiteUrl(input.url),
          input.openMode === undefined
            ? current.open_mode
            : parseOpenMode(input.openMode),
          input.iconAttachmentId === undefined
            ? current.icon_attachment_id
            : input.iconAttachmentId,
          input.position === undefined
            ? current.position
            : parsePosition(input.position),
          Date.now(),
          input.siteId
        )
      return toSite(this.getSiteRow(input.siteId))
    })()
  }

  async deleteSite(input: {
    siteId: string
    expectedRevision: number
  }): Promise<void> {
    this.database.transaction(() => {
      const current = this.getSiteRow(input.siteId)
      assertRevision(current.revision, input.expectedRevision)
      const now = Date.now()
      this.database
        .prepare(
          `UPDATE workbench_sites
           SET deleted_at = ?, updated_at = ?, revision = revision + 1
           WHERE id = ? AND deleted_at IS NULL`
        )
        .run(now, now, input.siteId)
      this.database
        .prepare(
          `UPDATE workbench_attachments
           SET deleted_at = ?
           WHERE owner_type = 'site_icon' AND owner_id = ?
             AND deleted_at IS NULL`
        )
        .run(now, input.siteId)
    })()
  }

  private getSnapshotSync(): WorkbenchSitesSnapshot {
    const groups = this.database
      .prepare(
        `SELECT workbench_site_groups.*,
           COUNT(workbench_sites.id) AS site_count
         FROM workbench_site_groups
         LEFT JOIN workbench_sites
           ON workbench_sites.group_id = workbench_site_groups.id
          AND workbench_sites.deleted_at IS NULL
         WHERE workbench_site_groups.deleted_at IS NULL
         GROUP BY workbench_site_groups.id
         ORDER BY workbench_site_groups.position, workbench_site_groups.id`
      )
      .all() as GroupRow[]
    const sites = this.database
      .prepare(
        `SELECT *
         FROM workbench_sites
         WHERE deleted_at IS NULL
         ORDER BY group_id, position, id`
      )
      .all() as SiteRow[]
    return {
      groups: groups.map(toGroup),
      sites: sites.map(toSite)
    }
  }

  private getGroup(groupId: string): WorkbenchSiteGroup {
    return toGroup(this.getGroupRow(groupId))
  }

  private normalizeGroupPositionsSync(updatedAt: number): void {
    const groups = this.getSnapshotSync().groups
    const update = this.database.prepare(
      `UPDATE workbench_site_groups
       SET position = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    for (const [index, group] of groups.entries()) {
      const position = index * 10
      if (group.position !== position) {
        update.run(position, updatedAt, group.id)
      }
    }
  }

  private moveGroupSync(
    groupId: string,
    targetIndex: number,
    updatedAt: number
  ): number {
    const groups = this.getSnapshotSync().groups
    const sourceIndex = groups.findIndex(({ id }) => id === groupId)
    if (sourceIndex < 0) {
      throw new Error(`Workbench site group not found: ${groupId}`)
    }
    const [moved] = groups.splice(sourceIndex, 1)
    const clampedTarget = Math.max(
      0,
      Math.min(targetIndex, groups.length)
    )
    groups.splice(clampedTarget, 0, moved)
    const update = this.database.prepare(
      `UPDATE workbench_site_groups
       SET position = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`
    )
    for (const [index, group] of groups.entries()) {
      const position = index * 10
      if (group.id !== groupId && group.position !== position) {
        update.run(position, updatedAt, group.id)
      }
    }
    return clampedTarget * 10
  }

  private getGroupRow(groupId: string): GroupRow {
    const row = this.database
      .prepare(
        `SELECT workbench_site_groups.*,
           (SELECT COUNT(*)
            FROM workbench_sites
            WHERE group_id = workbench_site_groups.id
              AND deleted_at IS NULL) AS site_count
         FROM workbench_site_groups
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(groupId) as GroupRow | undefined
    if (!row) throw new Error(`Workbench site group not found: ${groupId}`)
    return row
  }

  private getSiteRow(siteId: string): SiteRow {
    const row = this.database
      .prepare(
        `SELECT *
         FROM workbench_sites
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(siteId) as SiteRow | undefined
    if (!row) throw new Error(`Workbench site not found: ${siteId}`)
    return row
  }

  private assertIconAttachment(attachmentId: string, siteId: string): void {
    const found = this.database
      .prepare(
        `SELECT 1
         FROM workbench_attachments
         WHERE id = ? AND owner_type = 'site_icon' AND owner_id = ?
           AND deleted_at IS NULL AND mime_type LIKE 'image/%'`
      )
      .get(attachmentId, siteId)
    if (!found) throw new Error('Invalid workbench site icon attachment')
  }

  private nextGroupPosition(): number {
    return (
      (this.database
        .prepare(
          `SELECT COALESCE(MAX(position) + 10, 0)
           FROM workbench_site_groups
           WHERE deleted_at IS NULL`
        )
        .pluck()
        .get() as number) ?? 0
    )
  }

  private nextSitePosition(groupId: string): number {
    return (
      (this.database
        .prepare(
          `SELECT COALESCE(MAX(position), -10) + 10
           FROM workbench_sites
           WHERE group_id = ? AND deleted_at IS NULL`
        )
        .pluck()
        .get(groupId) as number) ?? 0
    )
  }
}

function toGroup(row: GroupRow): WorkbenchSiteGroup {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    siteCount: row.site_count,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toSite(row: SiteRow): WorkbenchSite {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    url: row.url,
    openMode: row.open_mode,
    ...(row.icon_attachment_id
      ? { iconAttachmentId: row.icon_attachment_id }
      : {}),
    position: row.position,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function assertRevision(current: number, expected: number): void {
  if (current !== expected) {
    throw new WorkbenchSiteRevisionConflictError(current)
  }
}

function parseName(value: string): string {
  const result = value.trim()
  if (!result || result.length > 120) {
    throw new Error('Invalid workbench site name')
  }
  return result
}

function parsePosition(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid workbench site position')
  }
  return value
}

function parseOpenMode(value: string): WorkbenchSiteOpenMode {
  if (value !== 'embedded' && value !== 'external') {
    throw new Error('Invalid workbench site open mode')
  }
  return value
}
