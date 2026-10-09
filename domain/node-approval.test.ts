import { describe, expect, it } from 'vitest'
import { normalizeNodeApprovalNote } from './node-approval'

describe('normalizeNodeApprovalNote', () => {
  it('trims meaningful notes and removes blank notes', () => {
    expect(normalizeNodeApprovalNote('  Ready to release  ')).toBe(
      'Ready to release'
    )
    expect(normalizeNodeApprovalNote('   ')).toBeUndefined()
  })

  it('rejects notes longer than 2000 characters', () => {
    expect(() => normalizeNodeApprovalNote('x'.repeat(2_001))).toThrow(
      'Approval note must be at most 2000 characters'
    )
  })
})
