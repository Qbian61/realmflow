import { describe, expect, it } from 'vitest'
import {
  createOnlineDocumentSnapshot,
  createOnlineDocumentSource,
  normalizeOnlineDocumentPath
} from './online-document'

describe('online document domain', () => {
  it('normalizes a Connector-relative document path', () => {
    expect(normalizeOnlineDocumentPath('/documents/product%20brief')).toBe(
      '/documents/product%20brief'
    )
  })

  it.each([
    '',
    'documents/brief',
    '//example.com/brief',
    'https://example.com/brief',
    '/documents/brief#private'
  ])('rejects an unsafe Connector path: %s', (path) => {
    expect(() => normalizeOnlineDocumentPath(path)).toThrow(
      'Online document path is invalid'
    )
  })

  it('creates an immutable UTF-8 text snapshot with normalized metadata', () => {
    const snapshot = createOnlineDocumentSnapshot({
      id: 'snapshot-1',
      sourceId: 'source-1',
      version: 1,
      body: new TextEncoder().encode('# Brief'),
      mediaType: 'text/markdown; charset=utf-8',
      etag: '"revision-1"',
      lastModified: 'Sun, 20 Sep 2026 10:00:00 GMT',
      fetchedAt: 10
    })

    expect(snapshot).toEqual({
      id: 'snapshot-1',
      sourceId: 'source-1',
      version: 1,
      content: '# Brief',
      mediaType: 'text/markdown',
      contentChecksum:
        'sha256:fd55350669a978d5a8cde0218d92baa5d6f8e1c9102f40cc42301a56543cc99d',
      byteSize: 7,
      etag: '"revision-1"',
      lastModified: 'Sun, 20 Sep 2026 10:00:00 GMT',
      fetchedAt: 10
    })
  })

  it.each([
    {
      body: new Uint8Array(),
      mediaType: 'text/plain',
      error: 'Online document response is empty'
    },
    {
      body: Uint8Array.from([0xff]),
      mediaType: 'text/plain',
      error: 'Online document response is not valid UTF-8'
    },
    {
      body: new TextEncoder().encode('binary'),
      mediaType: 'application/octet-stream',
      error: 'Online document media type is unsupported'
    }
  ])('rejects an invalid response: $error', ({ body, mediaType, error }) => {
    expect(() =>
      createOnlineDocumentSnapshot({
        id: 'snapshot-1',
        sourceId: 'source-1',
        version: 1,
        body,
        mediaType,
        fetchedAt: 10
      })
    ).toThrow(error)
  })

  it('creates a source with a non-sensitive Connector locator', () => {
    expect(
      createOnlineDocumentSource({
        sourceId: 'source-1',
        workspaceId: 'workspace-1',
        connectorId: 'connector-docs',
        path: '/documents/brief',
        at: 10
      })
    ).toEqual({
      sourceId: 'source-1',
      workspaceId: 'workspace-1',
      connectorId: 'connector-docs',
      path: '/documents/brief',
      locator: 'connector:connector-docs/documents/brief',
      createdAt: 10,
      updatedAt: 10
    })
  })
})
