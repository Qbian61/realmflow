import { createHash } from 'node:crypto'

export type OnlineDocumentSource = {
  sourceId: string
  workspaceId: string
  connectorId: string
  path: string
  locator: string
  mediaType?: string
  etag?: string
  lastModified?: string
  lastFetchedAt?: number
  createdAt: number
  updatedAt: number
}

export type OnlineDocumentSnapshot = {
  id: string
  sourceId: string
  version: number
  content: string
  mediaType: string
  contentChecksum: string
  byteSize: number
  etag?: string
  lastModified?: string
  fetchedAt: number
}

export function normalizeOnlineDocumentPath(value: string): string {
  const path = value.trim()
  if (
    !path ||
    path.length > 2048 ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('#') ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(path)
  ) {
    throw new Error('Online document path is invalid')
  }
  return path
}

export function createOnlineDocumentSource(input: {
  sourceId: string
  workspaceId: string
  connectorId: string
  path: string
  at: number
}): OnlineDocumentSource {
  const path = normalizeOnlineDocumentPath(input.path)
  return {
    sourceId: input.sourceId,
    workspaceId: input.workspaceId,
    connectorId: input.connectorId,
    path,
    locator: `connector:${input.connectorId}${path}`,
    createdAt: input.at,
    updatedAt: input.at
  }
}

export function createOnlineDocumentSnapshot(input: {
  id: string
  sourceId: string
  version: number
  body: Uint8Array
  mediaType: string
  etag?: string
  lastModified?: string
  fetchedAt: number
}): OnlineDocumentSnapshot {
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    throw new Error('Online document snapshot version is invalid')
  }
  if (input.body.byteLength === 0) {
    throw new Error('Online document response is empty')
  }
  const mediaType = normalizeMediaType(input.mediaType)
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(input.body)
  } catch {
    throw new Error('Online document response is not valid UTF-8')
  }
  if (!content.trim()) throw new Error('Online document response is empty')
  return {
    id: input.id,
    sourceId: input.sourceId,
    version: input.version,
    content,
    mediaType,
    contentChecksum: `sha256:${createHash('sha256')
      .update(input.body)
      .digest('hex')}`,
    byteSize: input.body.byteLength,
    ...(input.etag ? { etag: input.etag } : {}),
    ...(input.lastModified ? { lastModified: input.lastModified } : {}),
    fetchedAt: input.fetchedAt
  }
}

function normalizeMediaType(value: string): string {
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (
    !mediaType.startsWith('text/') &&
    mediaType !== 'application/json' &&
    !/^application\/[^/]+\+json$/.test(mediaType)
  ) {
    throw new Error('Online document media type is unsupported')
  }
  return mediaType
}
