import { createHash } from 'node:crypto'
import type { ExtractedContentUnit } from './content-extraction'

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
  mediaType: string
  contentChecksum: string
  byteSize: number
  documents: OnlineDocumentSnapshotDocument[]
  etag?: string
  lastModified?: string
  fetchedAt: number
}

export type OnlineDocumentSnapshotDocument = {
  unitKey: string
  title: string
  content: string
  checksum: string
  byteSize: number
  metadata?: ExtractedContentUnit['metadata']
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
  documents: OnlineDocumentSnapshotDocument[]
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
  if (input.documents.length === 0) {
    throw new Error('Online document snapshot documents are empty')
  }
  const unitKeys = new Set<string>()
  const documents = input.documents.map((document) => {
    if (
      !document.unitKey.trim() ||
      !document.title.trim() ||
      !document.content.trim() ||
      !document.checksum.trim() ||
      !Number.isSafeInteger(document.byteSize) ||
      document.byteSize < 0 ||
      unitKeys.has(document.unitKey)
    ) {
      throw new Error('Online document snapshot document is invalid')
    }
    unitKeys.add(document.unitKey)
    return {
      ...document,
      ...(document.metadata ? { metadata: { ...document.metadata } } : {})
    }
  })
  return {
    id: input.id,
    sourceId: input.sourceId,
    version: input.version,
    mediaType,
    contentChecksum: `sha256:${createHash('sha256')
      .update(input.body)
      .digest('hex')}`,
    byteSize: input.body.byteLength,
    documents,
    ...(input.etag ? { etag: input.etag } : {}),
    ...(input.lastModified ? { lastModified: input.lastModified } : {}),
    fetchedAt: input.fetchedAt
  }
}

function normalizeMediaType(value: string): string {
  const mediaType =
    value.split(';', 1)[0]?.trim().toLowerCase() ||
    'application/octet-stream'
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)) {
    throw new Error('Online document media type is invalid')
  }
  return mediaType
}
