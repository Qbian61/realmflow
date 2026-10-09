import { describe, expect, it } from 'vitest'
import {
  createLocalFileSource,
  localFileLocator
} from './local-file-source'

const checksum = `sha256:${'a'.repeat(64)}`

describe('local file source', () => {
  it('builds a managed locator without exposing the original path', () => {
    const source = createLocalFileSource({
      sourceId: 'source-1',
      workspaceId: 'space-1',
      storageMode: 'managed_copy',
      originalPath: '/Users/example/private.md',
      managedRelativePath:
        '.realmflow/knowledge/files/source-1/private.md',
      contentChecksum: checksum,
      byteSize: 7,
      modifiedAt: 10,
      checkedAt: 11
    })

    expect(source.locator).toBe(
      'managed:.realmflow/knowledge/files/source-1/private.md'
    )
    expect(source.locator).not.toContain('/Users/example')
  })

  it('builds an opaque locator for an external reference', () => {
    expect(localFileLocator('external_reference', 'source-1')).toBe(
      'external:source-1'
    )
  })

  it('requires a managed relative path only for managed copies', () => {
    expect(() =>
      createLocalFileSource({
        sourceId: 'source-1',
        workspaceId: 'space-1',
        storageMode: 'managed_copy',
        originalPath: '/tmp/file.md',
        contentChecksum: checksum,
        byteSize: 1,
        modifiedAt: 1,
        checkedAt: 1
      })
    ).toThrow('Managed file path is required')

    expect(() =>
      createLocalFileSource({
        sourceId: 'source-1',
        workspaceId: 'space-1',
        storageMode: 'external_reference',
        originalPath: '/tmp/file.md',
        managedRelativePath: '.realmflow/knowledge/files/source-1/file.md',
        contentChecksum: checksum,
        byteSize: 1,
        modifiedAt: 1,
        checkedAt: 1
      })
    ).toThrow('External references cannot have a managed file path')
  })

  it('rejects invalid checksums and negative file metadata', () => {
    const input = {
      sourceId: 'source-1',
      workspaceId: 'space-1',
      storageMode: 'external_reference' as const,
      originalPath: '/tmp/file.md',
      contentChecksum: checksum,
      byteSize: 1,
      modifiedAt: 1,
      checkedAt: 1
    }

    expect(() =>
      createLocalFileSource({ ...input, contentChecksum: 'sha256:invalid' })
    ).toThrow('Local file checksum is invalid')
    expect(() => createLocalFileSource({ ...input, byteSize: -1 })).toThrow(
      'Local file size is invalid'
    )
  })
})
