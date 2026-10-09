import { describe, expect, it } from 'vitest'
import { translate, type TranslationKey } from '../../localization/translate'

const workspaceToastKeys = [
  'toast.workspace.createFailed',
  'toast.workspace.renameFailed',
  'toast.workspace.relocateFailed',
  'toast.workspace.deleteFailed',
  'toast.workspace.moveFailed',
  'toast.requirement.createFailed',
  'toast.requirement.renameFailed',
  'toast.requirement.deleteFailed',
  'toast.requirement.moveFailed'
] as const satisfies readonly TranslationKey[]

describe('workspace toast localization', () => {
  it('provides safe actionable messages in every supported locale', () => {
    for (const locale of ['zh-CN', 'en', 'ja'] as const) {
      for (const key of workspaceToastKeys) {
        const message = translate(locale, key)
        expect(message).not.toBe(key)
        expect(message.length).toBeGreaterThan(12)
      }
    }
  })
})
