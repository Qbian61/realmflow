import { describe, expect, it } from 'vitest'
import { diffRepositoryIndexManifest } from './repository-index-manifest'

describe('repository index manifest diff', () => {
  it('classifies added, changed, unchanged, and deleted files deterministically', () => {
    const result = diffRepositoryIndexManifest({
      previous: [
        { documentKey: 'src/removed.ts', checksum: 'sha256:removed' },
        { documentKey: 'src/stable.ts', checksum: 'sha256:stable' },
        { documentKey: 'src/changed.ts', checksum: 'sha256:before' }
      ],
      current: [
        { documentKey: 'src/new.ts', checksum: 'sha256:new' },
        { documentKey: 'src/changed.ts', checksum: 'sha256:after' },
        { documentKey: 'src/stable.ts', checksum: 'sha256:stable' }
      ]
    })

    expect(result).toEqual({
      added: [{ documentKey: 'src/new.ts', checksum: 'sha256:new' }],
      changed: [
        {
          current: {
            documentKey: 'src/changed.ts',
            checksum: 'sha256:after'
          },
          previous: {
            documentKey: 'src/changed.ts',
            checksum: 'sha256:before'
          }
        }
      ],
      unchanged: [
        { documentKey: 'src/stable.ts', checksum: 'sha256:stable' }
      ],
      deleted: [
        { documentKey: 'src/removed.ts', checksum: 'sha256:removed' }
      ]
    })
  })

  it('rejects duplicate document keys in either manifest', () => {
    expect(() =>
      diffRepositoryIndexManifest({
        previous: [],
        current: [
          { documentKey: 'src/a.ts', checksum: 'one' },
          { documentKey: 'src/a.ts', checksum: 'two' }
        ]
      })
    ).toThrow('Repository index manifest contains duplicate document keys')
  })
})
