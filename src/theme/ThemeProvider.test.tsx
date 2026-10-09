import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { THEME_PREFERENCE_KEY } from './theme-preference'
import {
  ThemeProvider,
  type ThemeChangeResult,
  useTheme
} from './ThemeProvider'

type MediaListener = (event: MediaQueryListEvent) => void

function createMediaQuery(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<MediaListener>()
  const mediaQuery = {
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    get matches() {
      return matches
    },
    addEventListener: vi.fn((_type: string, listener: EventListener) => {
      listeners.add(listener as MediaListener)
    }),
    removeEventListener: vi.fn((_type: string, listener: EventListener) => {
      listeners.delete(listener as MediaListener)
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    emit(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches: nextMatches } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
    listenerCount() {
      return listeners.size
    }
  } as unknown as MediaQueryList & {
    emit(nextMatches: boolean): void
    listenerCount(): number
  }
  return mediaQuery
}

function Probe(): JSX.Element {
  const { preference, resolvedTheme, setTheme } = useTheme()
  const [result, setResult] = useState<ThemeChangeResult>()
  return (
    <>
      <output aria-label="theme preference">{preference}</output>
      <output aria-label="resolved theme">{resolvedTheme}</output>
      <output aria-label="change result">
        {result?.outcome ?? 'none'}
      </output>
      {(['light', 'dark', 'system', 'sepia'] as const).map((theme) => (
        <button
          key={theme}
          type="button"
          onClick={() => setResult(setTheme(theme))}
        >
          {theme}
        </button>
      ))}
    </>
  )
}

describe('ThemeProvider', () => {
  it('applies a persisted fixed theme to consumers and the root element', () => {
    window.localStorage.setItem(
      THEME_PREFERENCE_KEY,
      JSON.stringify({ version: 1, theme: 'dark' })
    )

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    expect(screen.getByLabelText('theme preference')).toHaveTextContent('dark')
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveAttribute(
      'data-theme-preference',
      'dark'
    )
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ).toHaveAttribute('content', '#141516')
  })

  it('defaults to system and follows the current system theme', () => {
    const mediaQuery = createMediaQuery(true)

    render(
      <ThemeProvider matchMedia={() => mediaQuery}>
        <Probe />
      </ThemeProvider>
    )

    expect(screen.getByLabelText('theme preference')).toHaveTextContent(
      'system'
    )
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveAttribute(
      'data-theme-preference',
      'system'
    )
    expect(mediaQuery.listenerCount()).toBe(1)
  })

  it('saves before applying a new theme and leaves system mode', () => {
    const mediaQuery = createMediaQuery(false)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    render(
      <ThemeProvider matchMedia={() => mediaQuery}>
        <Probe />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'dark' }))

    expect(screen.getByLabelText('change result')).toHaveTextContent('changed')
    expect(screen.getByLabelText('theme preference')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(setItem).toHaveBeenCalledWith(
      THEME_PREFERENCE_KEY,
      JSON.stringify({ version: 1, theme: 'dark' })
    )
    expect(mediaQuery.listenerCount()).toBe(0)
  })

  it('keeps the current preference and theme when persistence fails', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'dark' }))

    expect(screen.getByLabelText('change result')).toHaveTextContent('failed')
    expect(screen.getByLabelText('theme preference')).toHaveTextContent(
      'system'
    )
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('rejects invalid and duplicate selections without writing or resubscribing', () => {
    const mediaQuery = createMediaQuery(false)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    render(
      <ThemeProvider matchMedia={() => mediaQuery}>
        <Probe />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(screen.getByLabelText('change result')).toHaveTextContent(
      'unchanged'
    )
    fireEvent.click(screen.getByRole('button', { name: 'sepia' }))
    expect(screen.getByLabelText('change result')).toHaveTextContent('invalid')
    expect(setItem).not.toHaveBeenCalled()
    expect(mediaQuery.addEventListener).toHaveBeenCalledTimes(1)
    expect(mediaQuery.listenerCount()).toBe(1)
  })

  it('updates system mode in place and removes its listener on unmount', () => {
    const mediaQuery = createMediaQuery(false)
    const { unmount } = render(
      <ThemeProvider matchMedia={() => mediaQuery}>
        <Probe />
      </ThemeProvider>
    )

    act(() => mediaQuery.emit(true))

    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ).toHaveAttribute('content', '#141516')

    act(() => mediaQuery.emit(false))

    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ).toHaveAttribute('content', '#f1f1f1')

    unmount()
    expect(mediaQuery.listenerCount()).toBe(0)
  })

  it('recreates a missing theme-color meta from the resolved theme', () => {
    document.head
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.remove()

    render(
      <ThemeProvider matchMedia={() => createMediaQuery(false)}>
        <Probe />
      </ThemeProvider>
    )

    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ).toHaveAttribute('content', '#f1f1f1')
  })

  it('synchronizes valid storage events without writing them back', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: THEME_PREFERENCE_KEY,
          newValue: JSON.stringify({ version: 1, theme: 'dark' }),
          storageArea: window.localStorage
        })
      )
    })

    expect(screen.getByLabelText('theme preference')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('ignores unrelated, invalid, and duplicate storage events', () => {
    const mediaQuery = createMediaQuery(false)
    render(
      <ThemeProvider matchMedia={() => mediaQuery}>
        <Probe />
      </ThemeProvider>
    )

    for (const [key, newValue] of [
      ['other:key', JSON.stringify({ version: 1, theme: 'dark' })],
      [THEME_PREFERENCE_KEY, '{broken'],
      [THEME_PREFERENCE_KEY, JSON.stringify({ version: 2, theme: 'dark' })],
      [THEME_PREFERENCE_KEY, JSON.stringify({ version: 1, theme: 'system' })]
    ]) {
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key,
            newValue,
            storageArea: window.localStorage
          })
        )
      })
    }

    expect(screen.getByLabelText('theme preference')).toHaveTextContent(
      'system'
    )
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('light')
    expect(mediaQuery.addEventListener).toHaveBeenCalledTimes(1)
  })
})
