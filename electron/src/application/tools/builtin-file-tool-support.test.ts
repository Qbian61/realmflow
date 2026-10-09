import { describe, expect, it } from 'vitest'
import { selectRoot } from './builtin-file-tool-support'

describe('selectRoot', () => {
  it('accepts an absolute scope root that normalizes to the authorized root', () => {
    expect(
      selectRoot(['/workspace/current'], {
        scopeRoot: '/workspace/other/../current',
        path: '.'
      })
    ).toBe('/workspace/current')
  })
})
