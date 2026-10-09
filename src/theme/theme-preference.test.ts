import { describe, expect, it, vi } from 'vitest'
import {
  THEME_PREFERENCE_KEY,
  loadThemePreference,
  saveThemePreference
} from './theme-preference'
import {
  DEFAULT_THEME,
  isThemePreference,
  resolveTheme
} from './themes'

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
    key: vi.fn(() => (value === null ? null : THEME_PREFERENCE_KEY)),
    removeItem: vi.fn(() => {
      value = null
    }),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue
    })
  }
}

describe('theme contract', () => {
  it('accepts only supported theme preferences', () => {
    expect(['light', 'dark', 'system'].map(isThemePreference)).toEqual([
      true,
      true,
      true
    ])
    expect(isThemePreference('auto')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })

  it('resolves fixed themes without consulting the system', () => {
    const mediaQuery = vi.fn()

    expect(resolveTheme('light', mediaQuery)).toBe('light')
    expect(resolveTheme('dark', mediaQuery)).toBe('dark')
    expect(mediaQuery).not.toHaveBeenCalled()
  })

  it('resolves system from the current dark color-scheme preference', () => {
    expect(
      resolveTheme('system', () => ({ matches: true }) as MediaQueryList)
    ).toBe('dark')
    expect(
      resolveTheme('system', () => ({ matches: false }) as MediaQueryList)
    ).toBe('light')
  })

  it('uses light when the system theme API is unavailable or throws', () => {
    expect(resolveTheme('system')).toBe('light')
    expect(
      resolveTheme('system', () => {
        throw new Error('media query unavailable')
      })
    ).toBe('light')
  })
})

describe('theme preference', () => {
  it('uses system when the preference is absent', () => {
    expect(loadThemePreference(createStorage())).toBe(DEFAULT_THEME)
  })

  it.each([
    '{broken',
    JSON.stringify({ version: 2, theme: 'dark' }),
    JSON.stringify({ version: 1, theme: 'sepia' }),
    JSON.stringify({ version: 1 }),
    JSON.stringify(['dark'])
  ])('uses system without overwriting invalid stored value %s', (storedValue) => {
    const storage = createStorage(storedValue)

    expect(loadThemePreference(storage)).toBe(DEFAULT_THEME)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('restores each supported theme preference', () => {
    for (const theme of ['light', 'dark', 'system'] as const) {
      expect(
        loadThemePreference(
          createStorage(JSON.stringify({ version: 1, theme }))
        )
      ).toBe(theme)
    }
  })

  it('uses system when storage cannot be read', () => {
    const storage = createStorage()
    vi.mocked(storage.getItem).mockImplementation(() => {
      throw new Error('storage unavailable')
    })

    expect(loadThemePreference(storage)).toBe(DEFAULT_THEME)
  })

  it('writes a supported theme with the exact versioned key and payload', () => {
    const storage = createStorage()

    expect(saveThemePreference('dark', storage)).toEqual({ outcome: 'saved' })
    expect(storage.setItem).toHaveBeenCalledWith(
      THEME_PREFERENCE_KEY,
      JSON.stringify({ version: 1, theme: 'dark' })
    )
    expect(JSON.parse(storage.getItem(THEME_PREFERENCE_KEY)!)).toEqual({
      version: 1,
      theme: 'dark'
    })
  })

  it('rejects an unsupported theme without writing', () => {
    const storage = createStorage()

    expect(saveThemePreference('sepia', storage)).toEqual({
      outcome: 'invalid',
      reason: 'unsupported_theme'
    })
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('returns a retryable failure when storage cannot be written', () => {
    const storage = createStorage()
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(saveThemePreference('light', storage)).toEqual({
      outcome: 'failed',
      reason: 'storage_unavailable'
    })
  })
})
