export type WorkbenchSiteOpenMode = 'embedded' | 'external'

export type WorkbenchSiteGroup = {
  id: string
  name: string
  position: number
  siteCount: number
  revision: number
  createdAt: number
  updatedAt: number
}

export type WorkbenchSite = {
  id: string
  groupId: string
  name: string
  url: string
  openMode: WorkbenchSiteOpenMode
  iconAttachmentId?: string
  position: number
  revision: number
  createdAt: number
  updatedAt: number
}

export type WorkbenchSitesSnapshot = {
  groups: WorkbenchSiteGroup[]
  sites: WorkbenchSite[]
}

type SiteRequest = { requestId: string }
type SiteRevisionRequest = SiteRequest & { expectedRevision: number }

export type CreateWorkbenchSiteGroupCommand = SiteRequest & {
  name: string
}

export type UpdateWorkbenchSiteGroupCommand = SiteRevisionRequest & {
  groupId: string
  name?: string
  position?: number
}

export type DeleteWorkbenchSiteGroupCommand = SiteRevisionRequest & {
  groupId: string
}

export type CreateWorkbenchSiteCommand = SiteRequest & {
  name: string
  url: string
  groupId: string
  openMode: WorkbenchSiteOpenMode
}

export type UpdateWorkbenchSiteCommand = SiteRevisionRequest & {
  siteId: string
  name?: string
  url?: string
  groupId?: string
  openMode?: WorkbenchSiteOpenMode
  iconAttachmentId?: string | null
  position?: number
}

export type DeleteWorkbenchSiteCommand = SiteRevisionRequest & {
  siteId: string
}

export type WorkbenchSiteMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'revision_conflict'; currentRevision: number }

export interface WorkbenchSiteApi {
  getSnapshot(): Promise<WorkbenchSitesSnapshot>
  createGroup(
    command: CreateWorkbenchSiteGroupCommand
  ): Promise<WorkbenchSiteGroup>
  updateGroup(
    command: UpdateWorkbenchSiteGroupCommand
  ): Promise<WorkbenchSiteMutationResult<WorkbenchSiteGroup>>
  deleteGroup(
    command: DeleteWorkbenchSiteGroupCommand
  ): Promise<WorkbenchSiteMutationResult<{ groupId: string }>>
  createSite(command: CreateWorkbenchSiteCommand): Promise<WorkbenchSite>
  updateSite(
    command: UpdateWorkbenchSiteCommand
  ): Promise<WorkbenchSiteMutationResult<WorkbenchSite>>
  deleteSite(
    command: DeleteWorkbenchSiteCommand
  ): Promise<WorkbenchSiteMutationResult<{ siteId: string }>>
}

export function normalizeWorkbenchSiteUrl(value: unknown): string {
  const raw = text(value, 'url', 2_048)
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)
    ? raw
    : `https://${raw}`
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new Error('Invalid workbench site URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid workbench site URL protocol')
  }
  if (url.username || url.password) {
    throw new Error('Invalid workbench site URL credentials')
  }
  return url.toString()
}

export function parseCreateWorkbenchSiteGroupCommand(
  value: unknown
): CreateWorkbenchSiteGroupCommand {
  const input = record(value)
  return {
    requestId: identifier(input.requestId, 'requestId'),
    name: name(input.name)
  }
}

export function parseUpdateWorkbenchSiteGroupCommand(
  value: unknown
): UpdateWorkbenchSiteGroupCommand {
  const input = revisionCommand(value)
  return {
    ...input,
    groupId: identifier(input.groupId, 'groupId'),
    ...(input.name === undefined ? {} : { name: name(input.name) }),
    ...(input.position === undefined
      ? {}
      : { position: position(input.position) })
  }
}

export function parseDeleteWorkbenchSiteGroupCommand(
  value: unknown
): DeleteWorkbenchSiteGroupCommand {
  const input = revisionCommand(value)
  return {
    requestId: input.requestId,
    expectedRevision: input.expectedRevision,
    groupId: identifier(input.groupId, 'groupId')
  }
}

export function parseCreateWorkbenchSiteCommand(
  value: unknown
): CreateWorkbenchSiteCommand {
  const input = record(value)
  return {
    requestId: identifier(input.requestId, 'requestId'),
    name: name(input.name),
    url: normalizeWorkbenchSiteUrl(input.url),
    groupId: identifier(input.groupId, 'groupId'),
    openMode: openMode(input.openMode)
  }
}

export function parseUpdateWorkbenchSiteCommand(
  value: unknown
): UpdateWorkbenchSiteCommand {
  const input = revisionCommand(value)
  return {
    requestId: input.requestId,
    expectedRevision: input.expectedRevision,
    siteId: identifier(input.siteId, 'siteId'),
    ...(input.name === undefined ? {} : { name: name(input.name) }),
    ...(input.url === undefined
      ? {}
      : { url: normalizeWorkbenchSiteUrl(input.url) }),
    ...(input.groupId === undefined
      ? {}
      : { groupId: identifier(input.groupId, 'groupId') }),
    ...(input.openMode === undefined
      ? {}
      : { openMode: openMode(input.openMode) }),
    ...(input.iconAttachmentId === undefined
      ? {}
      : {
          iconAttachmentId:
            input.iconAttachmentId === null
              ? null
              : identifier(input.iconAttachmentId, 'iconAttachmentId')
        }),
    ...(input.position === undefined
      ? {}
      : { position: position(input.position) })
  }
}

export function parseDeleteWorkbenchSiteCommand(
  value: unknown
): DeleteWorkbenchSiteCommand {
  const input = revisionCommand(value)
  return {
    requestId: input.requestId,
    expectedRevision: input.expectedRevision,
    siteId: identifier(input.siteId, 'siteId')
  }
}

function revisionCommand(value: unknown): Record<string, unknown> & {
  requestId: string
  expectedRevision: number
} {
  const input = record(value)
  return {
    ...input,
    requestId: identifier(input.requestId, 'requestId'),
    expectedRevision: revision(input.expectedRevision)
  }
}

function openMode(value: unknown): WorkbenchSiteOpenMode {
  if (value !== 'embedded' && value !== 'external') {
    throw new Error('Invalid workbench site command: openMode')
  }
  return value
}

function name(value: unknown): string {
  return text(value, 'name', 120)
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid workbench site command: ${field}`)
  }
  const result = value.trim()
  if (result.length > maxLength) {
    throw new Error(`Invalid workbench site command: ${field}`)
  }
  return result
}

function identifier(value: unknown, field: string): string {
  return text(value, field, 200)
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('Invalid workbench site command: expectedRevision')
  }
  return value as number
}

function position(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('Invalid workbench site command: position')
  }
  return value as number
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid workbench site command')
  }
  return value as Record<string, unknown>
}
