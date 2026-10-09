import { describe, expect, it, vi } from 'vitest'
import {
  LOCALE_PREFERENCE_KEY,
  loadLocalePreference,
  saveLocalePreference
} from './locale-preference'

function createStorage(initialValue: string | null = null): Storage {
  let value = initialValue
  return {
    get length() {
      return value === null ? 0 : 1
    },
    clear: vi.fn(() => {
      value = null
    }),
    getItem: vi.fn(() => value),
    key: vi.fn(() => (value === null ? null : LOCALE_PREFERENCE_KEY)),
    removeItem: vi.fn(() => {
      value = null
    }),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue
    })
  }
}

describe('locale preference', () => {
  it('uses Simplified Chinese when the preference is absent', () => {
    expect(loadLocalePreference(createStorage())).toBe('zh-CN')
  })

  it.each([
    '{broken',
    JSON.stringify({ version: 2, locale: 'en' }),
    JSON.stringify({ version: 1, locale: 'fr' }),
    JSON.stringify({ version: 1 }),
    JSON.stringify(['en'])
  ])('uses Simplified Chinese for invalid stored value %s', (storedValue) => {
    const storage = createStorage(storedValue)

    expect(loadLocalePreference(storage)).toBe('zh-CN')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('restores each supported locale', () => {
    for (const locale of ['zh-CN', 'en', 'ja'] as const) {
      expect(
        loadLocalePreference(
          createStorage(JSON.stringify({ version: 1, locale }))
        )
      ).toBe(locale)
    }
  })

  it('uses Simplified Chinese when storage cannot be read', () => {
    const storage = createStorage()
    vi.mocked(storage.getItem).mockImplementation(() => {
      throw new Error('storage unavailable')
    })

    expect(loadLocalePreference(storage)).toBe('zh-CN')
  })

  it('writes a supported locale with an explicit schema version', () => {
    const storage = createStorage()

    expect(saveLocalePreference('ja', storage)).toEqual({ outcome: 'saved' })
    expect(storage.setItem).toHaveBeenCalledWith(
      LOCALE_PREFERENCE_KEY,
      JSON.stringify({ version: 1, locale: 'ja' })
    )
  })

  it('rejects an unsupported locale without writing', () => {
    const storage = createStorage()

    expect(saveLocalePreference('fr', storage)).toEqual({
      outcome: 'invalid',
      reason: 'unsupported_locale'
    })
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('returns a retryable failure when storage cannot be written', () => {
    const storage = createStorage()
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(saveLocalePreference('en', storage)).toEqual({
      outcome: 'failed',
      reason: 'storage_unavailable'
    })
  })
})
