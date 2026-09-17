import { describe, expect, it, vi } from 'vitest'
import {
  formatResourceUpdatedAt,
  mapBusinessResource,
  mapLocalFileResource
} from './space-resource-mappers'

describe('space resource mappers', () => {
  it('maps selected local files to stable resource fields', () => {
    vi.setSystemTime(new Date('2026-09-17T10:00:00Z'))

    expect(
      mapLocalFileResource(
        {
          binding: { rootName: 'RealmFlow' },
          files: []
        } as never,
        { name: 'spec.md', path: '/workspace/spec.md' } as never,
        2
      )
    ).toEqual({
      id: 'file-1789639200000-2',
      name: 'spec.md',
      type: 'file',
      locator: '/workspace/spec.md',
      detail: 'RealmFlow',
      updatedAt: 1789639200000
    })
  })

  it('preserves revision metadata from Main-owned resources', () => {
    expect(
      mapBusinessResource({
        id: 'resource-1',
        workspaceId: 'workspace-1',
        name: 'Docs',
        type: 'document',
        locator: 'https://example.com/docs',
        detail: 'example.com',
        sortOrder: 3,
        revision: 4,
        createdAt: 1,
        updatedAt: 2
      })
    ).toMatchObject({
      id: 'resource-1',
      sortOrder: 3,
      revision: 4,
      createdAt: 1,
      updatedAt: 2
    })
  })

  it('formats recent and older resource timestamps', () => {
    vi.setSystemTime(new Date('2026-09-17T10:00:00Z'))

    expect(formatResourceUpdatedAt()).toBe('刚刚')
    expect(formatResourceUpdatedAt(Date.now() - 60_000)).toBe('今天')
    expect(formatResourceUpdatedAt(Date.now() - 2 * 86_400_000)).toBe(
      '2 天前'
    )
  })
})
